package ai.nexusshield.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.net.VpnService;
import android.os.Build;
import android.os.ParcelFileDescriptor;

import org.json.JSONObject;

import ai.nexusshield.mobile.security.Ipv4DnsPacketCodec;
import ai.nexusshield.mobile.security.Quad9DnsOverTlsResolver;

import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public final class DnsProtectionService extends VpnService {
    public static final String ACTION_START = "ai.nexusshield.mobile.action.START_DNS_PROTECTION";
    public static final String ACTION_STOP = "ai.nexusshield.mobile.action.STOP_DNS_PROTECTION";
    public static final String EXTRA_API_BASE_URL = "ai.nexusshield.mobile.extra.API_BASE_URL";
    public static final String EXTRA_ACCESS_TOKEN = "ai.nexusshield.mobile.extra.ACCESS_TOKEN";
    private static final String CHANNEL_ID = "nexus_dns_protection";
    private static final int NOTIFICATION_ID = 5107;
    private static final String PREFS = "nexus_dns_protection";
    private static final String VIRTUAL_ADDRESS = "10.89.0.1";
    private static final String VIRTUAL_DNS = "10.89.0.2";
    private static final int DNS_WORKER_COUNT = 2;
    private static final int MAX_PENDING_DNS_REQUESTS = 64;

    private final AtomicBoolean running = new AtomicBoolean(false);
    private final AtomicBoolean resolverFailureReported = new AtomicBoolean(false);
    private final AtomicBoolean queueSaturationReported = new AtomicBoolean(false);
    // Short-lived user access token is memory-only and is never written to preferences.
    private volatile String apiBaseUrl;
    private volatile String accessToken;
    // A bounded queue prevents a burst of DNS traffic from growing memory without limit.
    // When the queue is full, the reader returns DNS SERVFAIL instead of silently dropping work.
    private final ExecutorService dnsWorkers = new ThreadPoolExecutor(
            DNS_WORKER_COUNT,
            DNS_WORKER_COUNT,
            0L,
            TimeUnit.MILLISECONDS,
            new ArrayBlockingQueue<>(MAX_PENDING_DNS_REQUESTS),
            runnable -> {
                Thread worker = new Thread(runnable, "nexus-dns-worker");
                worker.setDaemon(true);
                return worker;
            });
    private ParcelFileDescriptor tunnel;
    private FileInputStream tunnelInput;
    private FileOutputStream tunnelOutput;
    private Thread packetReader;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String suppliedApi = intent.getStringExtra(EXTRA_API_BASE_URL);
            String suppliedToken = intent.getStringExtra(EXTRA_ACCESS_TOKEN);
            if (suppliedApi != null && suppliedApi.startsWith("https://") &&
                    suppliedToken != null && !suppliedToken.trim().isEmpty()) {
                apiBaseUrl = suppliedApi;
                accessToken = suppliedToken;
            }
        }

        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopTunnel();
            reportStatusEvent("dns.protection.stopped");
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }
        startTunnel();
        return START_NOT_STICKY;
    }

    private void startTunnel() {
        if (running.get()) return;
        try {
            Notification notification = buildNotification();
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }

            Builder builder = new Builder()
                    .setSession("NEXUS SHIELD AI DNS Security")
                    .setMtu(1500)
                    .addAddress(VIRTUAL_ADDRESS, 32)
                    .addDnsServer(VIRTUAL_DNS)
                    // Only the synthetic DNS server address is routed into this TUN.
                    // Ordinary app traffic is not captured by this VPN interface.
                    .addRoute(VIRTUAL_DNS, 32)
                    .setBlocking(true);

            tunnel = builder.establish();
            if (tunnel == null) throw new IOException("Android did not grant the DNS VPN interface.");

            tunnelInput = new FileInputStream(tunnel.getFileDescriptor());
            tunnelOutput = new FileOutputStream(tunnel.getFileDescriptor());
            running.set(true);
            resolverFailureReported.set(false);
            queueSaturationReported.set(false);
            preferences().edit().putBoolean("active", true).putString("last_error", "").apply();
            startPacketReader();
            reportStatusEvent("dns.protection.started");
        } catch (Exception error) {
            preferences().edit().putBoolean("active", false)
                    .putString("last_error", safeMessage(error)).apply();
            closeTunnelDescriptor();
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
        }
    }

    private void startPacketReader() {
        packetReader = new Thread(() -> {
            byte[] buffer = new byte[32767];
            while (running.get()) {
                try {
                    int length = tunnelInput.read(buffer);
                    if (length < 0) {
                        stopAfterPacketReaderFailure("The local DNS tunnel closed unexpectedly.");
                        break;
                    }
                    if (length == 0) continue;

                    Ipv4DnsPacketCodec.Query query = Ipv4DnsPacketCodec.parseQuery(buffer, length);
                    if (query == null) continue;

                    SharedPreferences prefs = preferences();
                    long total = prefs.getLong("query_count", 0L) + 1L;
                    prefs.edit().putLong("query_count", total).apply();

                    try {
                        dnsWorkers.execute(() -> processQuery(query));
                    } catch (RejectedExecutionException overloaded) {
                        long rejected = prefs.getLong("queue_overflow_count", 0L) + 1L;
                        prefs.edit().putLong("queue_overflow_count", rejected).apply();
                        if (queueSaturationReported.compareAndSet(false, true)) {
                            reportStatusEvent("dns.queue.saturated");
                        }
                        // Fail closed under load: do not forward this query over plaintext DNS.
                        writeResponse(query, Ipv4DnsPacketCodec.buildServFail(query));
                    }
                } catch (IOException error) {
                    if (running.get()) {
                        stopAfterPacketReaderFailure("The local DNS tunnel stopped reading packets.");
                    }
                    break;
                } catch (RuntimeException error) {
                    if (running.get()) {
                        preferences().edit().putString("last_error", "The DNS packet processor could not continue.").apply();
                    }
                }
            }
        }, "nexus-dns-tun-reader");
        packetReader.setDaemon(true);
        packetReader.start();
    }

    private void stopAfterPacketReaderFailure(String message) {
        if (!running.get()) return;
        preferences().edit().putString("last_error", message).apply();
        stopTunnel();
        // Stop the foreground service as well; do not leave an active notification
        // claiming DNS protection after its packet reader has failed.
        stopSelf();
    }

    private void processQuery(Ipv4DnsPacketCodec.Query query) {
        if (!running.get()) return;

        byte[] response;
        try {
            response = Quad9DnsOverTlsResolver.resolve(this, query.dnsPayload);
        } catch (IOException error) {
            // Fail closed: do not retry over unencrypted DNS. Return SERVFAIL.
            response = Ipv4DnsPacketCodec.buildServFail(query);
            preferences().edit().putString("last_error", "Secure DNS resolver temporarily unavailable; no plaintext fallback was used.").apply();
            if (resolverFailureReported.compareAndSet(false, true)) {
                reportStatusEvent("dns.resolver.unavailable");
            }
        }

        writeResponse(query, response);
    }

    // Reports only bounded protection-state codes. No DNS payload, queried domain,
    // destination address, or packet metadata is transmitted to the API.
    private void reportStatusEvent(String eventType) {
        String base = apiBaseUrl;
        String token = accessToken;
        if (base == null || token == null) {
            preferences().edit().putString("last_telemetry_status", "not sent: sign in to NEXUS in the Android app").apply();
            return;
        }

        Thread reporter = new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                URL endpoint = new URL(base + "/api/security-events/mobile");
                if (!"https".equalsIgnoreCase(endpoint.getProtocol())) {
                    throw new IOException("Telemetry requires HTTPS.");
                }
                connection = (HttpURLConnection) endpoint.openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(10000);
                connection.setDoOutput(true);
                connection.setRequestProperty("Authorization", "Bearer " + token);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                connection.setRequestProperty("Accept", "application/json");

                JSONObject payload = new JSONObject();
                payload.put("eventId", UUID.randomUUID().toString());
                payload.put("eventType", eventType);
                byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(body.length);
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(body);
                }

                int status = connection.getResponseCode();
                String result = status == 202
                        ? "accepted by NEXUS API"
                        : "not accepted by NEXUS API (HTTP " + status + ")";
                preferences().edit().putString("last_telemetry_status", result).apply();
            } catch (Exception error) {
                preferences().edit().putString("last_telemetry_status", "unavailable: status event was not delivered").apply();
            } finally {
                if (connection != null) connection.disconnect();
            }
        }, "nexus-status-telemetry");
        reporter.setDaemon(true);
        reporter.start();
    }

    private void writeResponse(Ipv4DnsPacketCodec.Query query, byte[] dnsResponse) {
        try {
            byte[] packet = Ipv4DnsPacketCodec.buildResponse(query, dnsResponse);
            synchronized (this) {
                if (running.get() && tunnelOutput != null) {
                    tunnelOutput.write(packet);
                    tunnelOutput.flush();
                }
            }
        } catch (IOException | IllegalArgumentException error) {
            if (running.get()) {
                preferences().edit().putString("last_error", "A DNS response could not be returned to the device.").apply();
            }
        }
    }

    private void stopTunnel() {
        if (!running.getAndSet(false)) {
            closeTunnelDescriptor();
            preferences().edit().putBoolean("active", false).apply();
            return;
        }
        closeTunnelDescriptor();
        preferences().edit().putBoolean("active", false).apply();
    }

    private void closeTunnelDescriptor() {
        synchronized (this) {
            tunnelOutput = null;
            tunnelInput = null;
            if (tunnel != null) {
                try { tunnel.close(); } catch (IOException ignored) { }
                tunnel = null;
            }
        }
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent content = PendingIntent.getActivity(this, 1, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent stop = new Intent(this, DnsProtectionService.class).setAction(ACTION_STOP);
        PendingIntent stopAction = PendingIntent.getService(this, 2, stop,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder = new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_lock_lock)
                .setContentTitle("NEXUS SHIELD AI DNS security")
                .setContentText("DNS-only tunnel active · Quad9 Secure DNS over TLS")
                .setCategory(Notification.CATEGORY_SERVICE)
                .setOngoing(true)
                .setContentIntent(content)
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_pause, "Stop", stopAction).build());
        return builder.build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "NEXUS DNS protection", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Visible status notification while DNS security filtering is active.");
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private SharedPreferences preferences() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private String safeMessage(Exception error) {
        String message = error.getMessage();
        return message == null || message.trim().isEmpty() ? "The DNS protection service could not start." : message;
    }

    @Override
    public void onRevoke() {
        stopTunnel();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
        super.onRevoke();
    }

    @Override
    public void onDestroy() {
        stopTunnel();
        dnsWorkers.shutdownNow();
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }
}
