package ai.nexusshield.mobile;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.net.VpnService;
import android.os.Bundle;
import android.os.Build;
import android.provider.OpenableColumns;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final int PICK_FILE_REQUEST = 1201;
    private static final int VPN_PERMISSION_REQUEST = 1202;
    private static final String VPN_PREFS = "nexus_dns_protection";
    private static final long MAX_FILE_BYTES = 100L * 1024L * 1024L;

    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private EditText apiUrlInput;
    private EditText webUrlInput;
    private EditText emailInput;
    private EditText passwordInput;
    private Button loginButton;
    private Button logoutButton;
    private Button chooseButton;
    private Button scanButton;
    private Button historyButton;
    private TextView selectedFileText;
    private TextView statusText;
    private TextView historyText;
    private TextView dnsProtectionStatus;
    private CheckBox dnsDisclosureCheck;
    private Button startDnsButton;
    private Button stopDnsButton;

    // Short-lived API JWT is deliberately kept in memory only in this first build.
    private String accessToken;
    private String apiBaseUrl;
    private String webBaseUrl;
    private Uri selectedFileUri;
    private String selectedFileName;
    private long selectedFileSize = -1L;
    private boolean busy;
    private boolean accountCanScan;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildInterface();
    }

    private void buildInterface() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Color.rgb(5, 13, 24));

        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(22), dp(28), dp(22), dp(36));
        scroll.addView(page);

        TextView brand = text("◈  NEXUS SHIELD AI", 19, Color.rgb(90, 222, 239), true);
        page.addView(brand);
        TextView subtitle = text("MOBILE SECURITY COMPANION · ANDROID", 10, Color.rgb(121, 151, 180), true);
        subtitle.setLetterSpacing(0.12f);
        addGap(page, 24);

        TextView title = text("File security scan", 27, Color.rgb(239, 246, 255), true);
        page.addView(title);
        TextView intro = text(
            "Choose a file from your device and submit it to your configured NEXUS SHIELD AI scanner.",
            13, Color.rgb(157, 178, 201), false);
        intro.setLineSpacing(dp(4), 1.0f);
        page.addView(intro);
        addGap(page, 22);

        LinearLayout connectionCard = card(page);
        addSectionTitle(connectionCard, "SERVER CONNECTION");
        apiUrlInput = input("API base URL (HTTPS)", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        webUrlInput = input("Web app base URL (HTTPS)", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        emailInput = input("Account email", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        passwordInput = input("Password", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        connectionCard.addView(apiUrlInput);
        connectionCard.addView(webUrlInput);
        connectionCard.addView(emailInput);
        connectionCard.addView(passwordInput);
        loginButton = button("Sign in securely");
        connectionCard.addView(loginButton);
        loginButton.setOnClickListener(view -> signIn());

        addGap(page, 14);
        LinearLayout scanCard = card(page);
        addSectionTitle(scanCard, "ON-DEMAND FILE INSPECTION");
        selectedFileText = text("No file selected", 12, Color.rgb(160, 180, 202), false);
        scanCard.addView(selectedFileText);
        chooseButton = button("Choose a file");
        scanCard.addView(chooseButton);
        chooseButton.setOnClickListener(view -> chooseFile());
        scanButton = button("Scan selected file");
        scanCard.addView(scanButton);
        scanButton.setEnabled(false);
        scanButton.setAlpha(0.45f);
        scanButton.setOnClickListener(view -> scanSelectedFile());

        addGap(page, 14);
        LinearLayout statusCard = card(page);
        addSectionTitle(statusCard, "SECURITY STATUS");
        statusText = text("Sign in to connect this app to your NEXUS SHIELD AI server.", 12, Color.rgb(186, 204, 224), false);
        statusText.setLineSpacing(dp(4), 1.0f);
        statusCard.addView(statusText);
        logoutButton = button("Sign out and revoke session");
        statusCard.addView(logoutButton);
        logoutButton.setEnabled(false);
        logoutButton.setAlpha(0.45f);
        logoutButton.setOnClickListener(view -> signOut());

        addGap(page, 14);
        LinearLayout dnsCard = card(page);
        addSectionTitle(dnsCard, "CONTINUOUS DNS THREAT FILTERING");
        TextView dnsDescription = text(
            "When enabled, Android sends DNS lookups addressed to the NEXUS local resolver through a user-approved VPN interface. NEXUS forwards those requests using encrypted DNS-over-TLS to Quad9 Secure DNS (9.9.9.9), which provides threat-domain blocking and DNSSEC validation.",
            12, Color.rgb(186, 204, 224), false);
        dnsDescription.setLineSpacing(dp(4), 1.0f);
        dnsCard.addView(dnsDescription);
        addGap(dnsCard, 8);
        TextView dnsDisclosure = text(
            "PRIVACY AND COVERAGE: Domain names in DNS requests are sent to Quad9 for resolution. NEXUS does not save domain names. This first version routes IPv4 DNS over UDP to its local resolver only. It does not inspect HTTPS content, other app-private files, non-DNS traffic, or traffic using custom DNS-over-HTTPS/private resolvers. Some apps or DNS modes may bypass this coverage. If the secure resolver is unavailable, requests receive SERVFAIL; there is no plaintext DNS fallback.",
            11, Color.rgb(255, 199, 124), false);
        dnsDisclosure.setPadding(dp(12), dp(12), dp(12), dp(12));
        dnsDisclosure.setBackground(roundRect(Color.rgb(37, 31, 24), dp(10)));
        dnsCard.addView(dnsDisclosure);
        dnsDisclosureCheck = new CheckBox(this);
        dnsDisclosureCheck.setText("I understand and agree to send DNS requests to Quad9 Secure DNS.");
        dnsDisclosureCheck.setTextColor(Color.rgb(225, 235, 247));
        dnsDisclosureCheck.setTextSize(12);
        dnsDisclosureCheck.setButtonTintList(android.content.res.ColorStateList.valueOf(Color.rgb(90, 222, 239)));
        dnsDisclosureCheck.setOnCheckedChangeListener((button, checked) -> {
            if (startDnsButton != null) startDnsButton.setEnabled(checked && !isDnsProtectionActive());
        });
        dnsCard.addView(dnsDisclosureCheck);
        startDnsButton = button("Start DNS threat protection");
        dnsCard.addView(startDnsButton);
        startDnsButton.setEnabled(false);
        startDnsButton.setAlpha(0.45f);
        startDnsButton.setOnClickListener(view -> requestDnsProtection());
        stopDnsButton = button("Stop DNS protection");
        stopDnsButton.setBackground(roundRect(Color.rgb(255, 183, 115), dp(9)));
        dnsCard.addView(stopDnsButton);
        stopDnsButton.setOnClickListener(view -> stopDnsProtection());
        dnsProtectionStatus = text("DNS protection is off. No network traffic is being routed through NEXUS.", 12, Color.rgb(186, 204, 224), false);
        dnsProtectionStatus.setPadding(0, dp(10), 0, 0);
        dnsProtectionStatus.setLineSpacing(dp(4), 1.0f);
        dnsCard.addView(dnsProtectionStatus);
        refreshDnsProtectionStatus();

        addGap(page, 14);
        LinearLayout historyCard = card(page);
        addSectionTitle(historyCard, "YOUR RECENT SCANS");
        historyText = text("Your account's saved scan history will appear here after sign-in.", 11, Color.rgb(157, 178, 201), false);
        historyText.setLineSpacing(dp(5), 1.0f);
        historyCard.addView(historyText);
        historyButton = button("Refresh scan history");
        historyCard.addView(historyButton);
        historyButton.setOnClickListener(view -> loadHistory());

        addGap(page, 18);
        TextView limitation = text(
            "IMPORTANT: File scanning is on-demand. DNS threat filtering is a separate, optional VPN feature with limited IPv4 UDP DNS coverage. It does not provide full-packet VPN tunneling, HTTPS inspection, app-private file scanning, or guaranteed protection for every app. iOS protection is not implemented.",
            11, Color.rgb(255, 199, 124), false);
        limitation.setPadding(dp(14), dp(14), dp(14), dp(14));
        limitation.setBackground(roundRect(Color.rgb(37, 31, 24), dp(12)));
        page.addView(limitation);

        loginButton.setAllCaps(false);
        setContentView(scroll);
    }

    private void signIn() {
        if (busy) return;
        String api = normalizeBase(apiUrlInput.getText().toString().trim());
        String web = normalizeBase(webUrlInput.getText().toString().trim());
        String email = emailInput.getText().toString().trim();
        String password = passwordInput.getText().toString();

        if (!isHttpsBase(api) || !isHttpsBase(web) || email.isEmpty() || password.isEmpty()) {
            setStatus("Enter valid HTTPS API and web addresses, your email, and password.");
            return;
        }

        setBusy(true, "Verifying your account…");
        worker.execute(() -> {
            HttpURLConnection connection = null;
            try {
                JSONObject body = new JSONObject();
                body.put("email", email);
                body.put("password", password);
                connection = open(new URL(api + "/api/auth/login"), "POST");
                connection.setRequestProperty("Content-Type", "application/json");
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(bytes);
                }
                int status = connection.getResponseCode();
                JSONObject result = new JSONObject(readBody(connection, status));
                if (status < 200 || status >= 300 || !result.has("access_token")) {
                    throw new IllegalStateException("Sign-in failed. Check your email, password, and API address.");
                }
                String token = result.getString("access_token");
                JSONObject user = result.optJSONObject("user");
                String role = user == null ? "unknown" : user.optString("role", "unknown");
                apiBaseUrl = api;
                webBaseUrl = web;
                accessToken = token;
                runOnUiThread(() -> {
                    passwordInput.setText("");
                    accountCanScan = "admin".equals(role) || "analyst".equals(role);
                    logoutButton.setEnabled(true);
                    logoutButton.setAlpha(1.0f);
                    scanButton.setEnabled(accountCanScan && selectedFileUri != null);
                    scanButton.setAlpha(scanButton.isEnabled() ? 1.0f : 0.45f);
                    setStatus("Signed in as " + role + ". Your short-lived token is held in memory and is not saved to disk.");
                    setBusy(false, null);
                    loadHistory();
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    setStatus(message(error));
                    setBusy(false, null);
                });
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private void signOut() {
        if (busy || accessToken == null || apiBaseUrl == null) return;

        final String token = accessToken;
        final String api = apiBaseUrl;
        setBusy(true, "Revoking this server session…");

        worker.execute(() -> {
            boolean serverSessionInvalidated = false;
            HttpURLConnection connection = null;
            try {
                connection = open(new URL(api + "/api/auth/logout"), "POST");
                connection.setRequestProperty("Authorization", "Bearer " + token);
                int status = connection.getResponseCode();
                serverSessionInvalidated = status >= 200 && status < 300 || status == 401;
            } catch (Exception ignored) {
                // Local sign-out still proceeds. The UI must not claim that the
                // server-side session was revoked when the API was unreachable.
                serverSessionInvalidated = false;
            } finally {
                if (connection != null) connection.disconnect();
            }

            final boolean revoked = serverSessionInvalidated;
            runOnUiThread(() -> {
                accessToken = null;
                accountCanScan = false;
                scanButton.setEnabled(false);
                scanButton.setAlpha(0.45f);
                logoutButton.setEnabled(false);
                logoutButton.setAlpha(0.45f);
                historyText.setText("Sign in to view your saved scan history.");
                setStatus(revoked
                    ? "Signed out. The server session is no longer active."
                    : "Signed out locally. The server could not confirm revocation; the old token may remain valid until its 15-minute expiry.");
                setBusy(false, null);
            });
        });
    }

    private void chooseFile() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        startActivityForResult(intent, PICK_FILE_REQUEST);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == VPN_PERMISSION_REQUEST) {
            if (resultCode == RESULT_OK && dnsDisclosureCheck != null && dnsDisclosureCheck.isChecked()) {
                startDnsProtectionService();
            } else {
                setDnsProtectionStatus("VPN permission was not granted. DNS protection remains off.");
            }
            return;
        }
        if (requestCode != PICK_FILE_REQUEST || resultCode != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        long size = getFileSize(uri);
        if (size <= 0 || size > MAX_FILE_BYTES) {
            selectedFileUri = null;
            selectedFileSize = -1L;
            selectedFileText.setText("File size unavailable or exceeds the 100 MiB limit. Choose a regular file with a known size.");
            return;
        }
        selectedFileUri = uri;
        selectedFileSize = size;
        selectedFileName = getDisplayName(uri);
        selectedFileText.setText(selectedFileName + " · " + formatBytes(size));
        chooseButton.setEnabled(true);
        scanButton.setEnabled(accountCanScan && accessToken != null);
        scanButton.setAlpha(scanButton.isEnabled() ? 1.0f : 0.45f);
    }

    private void scanSelectedFile() {
        if (busy || accessToken == null || selectedFileUri == null || !scanButton.isEnabled()) {
            setStatus("Sign in with an Admin or Analyst account and choose one file first.");
            return;
        }
        setBusy(true, "Uploading to private quarantine and requesting a ClamAV scan…");
        worker.execute(() -> {
            HttpURLConnection connection = null;
            try {
                String boundary = "NEXUS-" + Long.toHexString(System.nanoTime());
                byte[] prefix = ("--" + boundary + "\r\n"
                    + "Content-Disposition: form-data; name=\"file\"; filename=\"sample.bin\"\r\n"
                    + "Content-Type: application/octet-stream\r\n\r\n").getBytes(StandardCharsets.UTF_8);
                byte[] suffix = ("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8);
                long requestLength = prefix.length + selectedFileSize + suffix.length;

                connection = open(new URL(webBaseUrl + "/api/security/scan"), "POST");
                connection.setRequestProperty("Authorization", "Bearer " + accessToken);
                connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
                connection.setFixedLengthStreamingMode(requestLength);
                try (OutputStream output = connection.getOutputStream();
                     InputStream input = getContentResolver().openInputStream(selectedFileUri)) {
                    if (input == null) throw new IllegalStateException("The selected file could not be opened.");
                    output.write(prefix);
                    byte[] buffer = new byte[64 * 1024];
                    long copied = 0;
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        copied += count;
                        if (copied > MAX_FILE_BYTES || copied > selectedFileSize) {
                            throw new IllegalStateException("File content changed or exceeded the scan limit.");
                        }
                        output.write(buffer, 0, count);
                    }
                    if (copied != selectedFileSize) throw new IllegalStateException("File size changed while uploading.");
                    output.write(suffix);
                }
                int status = connection.getResponseCode();
                JSONObject result = new JSONObject(readBody(connection, status));
                if (status < 200 || status >= 300) {
                    String errorMessage = result.optString("message", result.optString("error", "The scan could not be completed."));
                    throw new IllegalStateException(errorMessage);
                }
                JSONObject scan = result.optJSONObject("scan");
                if (scan == null) throw new IllegalStateException("The scanner returned no scan result.");
                String verdict = scan.optString("verdict", "unknown");
                String hash = scan.optString("sha256", "not returned");
                boolean historySaved = result.optBoolean("history_persisted", false);
                runOnUiThread(() -> {
                    String label = "clean".equals(verdict)
                        ? "NO KNOWN SIGNATURE DETECTED"
                        : "detected".equals(verdict) ? "THREAT DETECTED" : "SCAN RESULT UNKNOWN";
                    setStatus(label + "\nSHA-256: " + hash + "\n" + (historySaved
                        ? "Audit record saved to your account."
                        : "Warning: the scan finished but its history could not be saved."));
                    setBusy(false, null);
                    loadHistory();
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    setStatus(message(error) + "\nA failed or unavailable scan is never treated as clean.");
                    setBusy(false, null);
                    loadHistory();
                });
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private void loadHistory() {
        if (accessToken == null || apiBaseUrl == null || busy) return;
        historyButton.setEnabled(false);
        worker.execute(() -> {
            HttpURLConnection connection = null;
            try {
                connection = open(new URL(apiBaseUrl + "/api/malware-scans?limit=10"), "GET");
                connection.setRequestProperty("Authorization", "Bearer " + accessToken);
                int status = connection.getResponseCode();
                JSONObject payload = new JSONObject(readBody(connection, status));
                if (status < 200 || status >= 300) throw new IllegalStateException("Scan history could not be loaded.");
                JSONArray scans = payload.optJSONArray("scans");
                StringBuilder lines = new StringBuilder();
                if (scans == null || scans.length() == 0) {
                    lines.append("No saved scans yet.");
                } else {
                    for (int i = 0; i < scans.length(); i++) {
                        JSONObject item = scans.getJSONObject(i);
                        lines.append(item.optString("verdict", "unknown").toUpperCase())
                            .append(" · ")
                            .append(item.optString("sampleId", "").substring(0, Math.min(12, item.optString("sampleId", "").length())))
                            .append("… · ")
                            .append(formatBytes(item.optLong("sizeBytes", 0)))
                            .append("\n")
                            .append(item.optString("createdAt", ""))
                            .append("\n\n");
                    }
                }
                final String history = lines.toString();
                runOnUiThread(() -> historyText.setText(history));
            } catch (Exception error) {
                runOnUiThread(() -> historyText.setText(message(error)));
            } finally {
                if (connection != null) connection.disconnect();
                runOnUiThread(() -> historyButton.setEnabled(true));
            }
        });
    }

    private HttpURLConnection open(URL url, String method) throws Exception {
        if (!"https".equalsIgnoreCase(url.getProtocol())) {
            throw new IllegalArgumentException("Only HTTPS server connections are allowed.");
        }
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(150000);
        connection.setUseCaches(false);
        connection.setDoInput(true);
        if ("POST".equals(method) || "PUT".equals(method)) connection.setDoOutput(true);
        connection.setRequestProperty("Accept", "application/json");
        return connection;
    }

    private String readBody(HttpURLConnection connection, int status) throws Exception {
        InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
        if (stream == null) return "{}";
        try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) {
                output.write(buffer, 0, count);
                if (output.size() > 1024 * 1024) throw new IllegalStateException("Server response is unexpectedly large.");
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private long getFileSize(Uri uri) {
        try (Cursor cursor = getContentResolver().query(uri, new String[]{OpenableColumns.SIZE}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (index >= 0 && !cursor.isNull(index)) return cursor.getLong(index);
            }
        } catch (Exception ignored) { }
        return -1L;
    }

    private String getDisplayName(Uri uri) {
        try (Cursor cursor = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) return cursor.getString(index);
            }
        } catch (Exception ignored) { }
        return "Selected file";
    }

    private String normalizeBase(String value) {
        while (value.endsWith("/")) value = value.substring(0, value.length() - 1);
        return value;
    }

    private boolean isHttpsBase(String value) {
        return value.startsWith("https://") && value.length() > "https://".length();
    }

    private void setBusy(boolean value, String status) {
        busy = value;
        loginButton.setEnabled(!value);
        chooseButton.setEnabled(!value);
        scanButton.setEnabled(!value && accountCanScan && accessToken != null && selectedFileUri != null);
        scanButton.setAlpha(scanButton.isEnabled() ? 1.0f : 0.45f);
        historyButton.setEnabled(!value);
        if (status != null) setStatus(status);
    }

    private void setStatus(String value) {
        statusText.setText(value);
    }

    private String message(Exception error) {
        String text = error.getMessage();
        return text == null || text.trim().isEmpty() ? "The request could not be completed." : text;
    }

    private LinearLayout card(LinearLayout parent) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(16), dp(16), dp(16), dp(16));
        box.setBackground(roundRect(Color.rgb(13, 26, 42), dp(14)));
        parent.addView(box, new LinearLayout.LayoutParams(-1, -2));
        return box;
    }

    private void addSectionTitle(LinearLayout parent, String value) {
        TextView view = text(value, 10, Color.rgb(95, 217, 235), true);
        view.setLetterSpacing(0.12f);
        view.setPadding(0, 0, 0, dp(12));
        parent.addView(view);
    }

    private EditText input(String hint, int inputType) {
        EditText view = new EditText(this);
        view.setSingleLine(true);
        view.setHint(hint);
        view.setHintTextColor(Color.rgb(104, 129, 154));
        view.setTextColor(Color.rgb(232, 241, 252));
        view.setTextSize(13);
        view.setInputType(inputType);
        view.setPadding(dp(12), dp(10), dp(12), dp(10));
        view.setBackground(roundRect(Color.rgb(6, 17, 30), dp(8)));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(48));
        params.bottomMargin = dp(9);
        returnInput(view, params);
        return view;
    }

    private void returnInput(EditText view, LinearLayout.LayoutParams params) {
        // Inputs are added by the caller after creation.
    }

    private Button button(String label) {
        Button view = new Button(this);
        view.setText(label);
        view.setTextColor(Color.rgb(5, 18, 29));
        view.setTextSize(12);
        view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        view.setAllCaps(false);
        view.setPadding(dp(12), dp(5), dp(12), dp(5));
        view.setBackground(roundRect(Color.rgb(80, 211, 230), dp(9)));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(48));
        params.topMargin = dp(5);
        returnButton(view, params);
        return view;
    }

    private void returnButton(Button view, LinearLayout.LayoutParams params) {
        // Buttons are added by the caller.
    }

    private TextView text(String value, float size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private GradientDrawable roundRect(int color, int radius) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color);
        shape.setCornerRadius(radius);
        return shape;
    }

    private void addGap(LinearLayout parent, int heightDp) {
        View gap = new View(this);
        parent.addView(gap, new LinearLayout.LayoutParams(1, dp(heightDp)));
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private String formatBytes(long bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return String.format(java.util.Locale.US, "%.1f KB", bytes / 1024.0);
        return String.format(java.util.Locale.US, "%.1f MB", bytes / (1024.0 * 1024.0));
    }

    private boolean isDnsProtectionActive() {
        return getSharedPreferences(VPN_PREFS, MODE_PRIVATE).getBoolean("active", false);
    }

    private void requestDnsProtection() {
        if (dnsDisclosureCheck == null || !dnsDisclosureCheck.isChecked()) {
            setDnsProtectionStatus("Review and accept the DNS privacy disclosure before enabling protection.");
            return;
        }
        Intent permissionIntent = VpnService.prepare(this);
        if (permissionIntent != null) {
            startActivityForResult(permissionIntent, VPN_PERMISSION_REQUEST);
        } else {
            startDnsProtectionService();
        }
    }

    private void startDnsProtectionService() {
        Intent intent = new Intent(this, DnsProtectionService.class).setAction(DnsProtectionService.ACTION_START);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent);
            else startService(intent);
            setDnsProtectionStatus("Starting the DNS-only VPN interface and secure resolver…");
        } catch (Exception error) {
            setDnsProtectionStatus("Could not start DNS protection: " + message(error));
        }
    }

    private void stopDnsProtection() {
        Intent intent = new Intent(this, DnsProtectionService.class).setAction(DnsProtectionService.ACTION_STOP);
        try {
            startService(intent);
            setDnsProtectionStatus("Stopping DNS protection…");
        } catch (Exception error) {
            setDnsProtectionStatus("Could not stop DNS protection: " + message(error));
        }
    }

    private void refreshDnsProtectionStatus() {
        if (dnsProtectionStatus == null || startDnsButton == null || stopDnsButton == null) return;
        android.content.SharedPreferences prefs = getSharedPreferences(VPN_PREFS, MODE_PRIVATE);
        boolean active = prefs.getBoolean("active", false);
        long queries = prefs.getLong("query_count", 0L);
        String error = prefs.getString("last_error", "");
        if (active) {
            setDnsProtectionStatus("DNS-only VPN active. " + queries + " DNS requests handled through encrypted Quad9 DNS-over-TLS. No domain names are stored by NEXUS.");
        } else if (error != null && !error.isEmpty()) {
            setDnsProtectionStatus("DNS protection is off. Last service status: " + error);
        } else {
            setDnsProtectionStatus("DNS protection is off. No network traffic is being routed through NEXUS.");
        }
        startDnsButton.setEnabled(!active && dnsDisclosureCheck != null && dnsDisclosureCheck.isChecked());
        startDnsButton.setAlpha(startDnsButton.isEnabled() ? 1.0f : 0.45f);
        stopDnsButton.setEnabled(active);
        stopDnsButton.setAlpha(active ? 1.0f : 0.45f);
    }

    private void setDnsProtectionStatus(String status) {
        if (dnsProtectionStatus != null) dnsProtectionStatus.setText(status);
        refreshDnsProtectionButtons();
    }

    private void refreshDnsProtectionButtons() {
        if (startDnsButton == null || stopDnsButton == null) return;
        boolean active = isDnsProtectionActive();
        startDnsButton.setEnabled(!active && dnsDisclosureCheck != null && dnsDisclosureCheck.isChecked());
        startDnsButton.setAlpha(startDnsButton.isEnabled() ? 1.0f : 0.45f);
        stopDnsButton.setEnabled(active);
        stopDnsButton.setAlpha(active ? 1.0f : 0.45f);
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshDnsProtectionStatus();
    }

    @Override
    protected void onDestroy() {
        worker.shutdownNow();
        super.onDestroy();
    }
}
