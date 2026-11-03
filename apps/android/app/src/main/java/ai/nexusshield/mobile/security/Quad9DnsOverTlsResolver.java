package ai.nexusshield.mobile.security;

import android.net.VpnService;

import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.Collections;

import javax.net.ssl.SNIHostName;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/** DNS-over-TLS client for Quad9's threat-blocking resolver. */
public final class Quad9DnsOverTlsResolver {
    private static final String RESOLVER_IP = "9.9.9.9";
    private static final String TLS_HOSTNAME = "dns.quad9.net";
    private static final int TLS_PORT = 853;
    private static final int CONNECT_TIMEOUT_MS = 8000;
    private static final int READ_TIMEOUT_MS = 10000;
    private static final int MAX_DNS_MESSAGE_BYTES = 4096;

    private Quad9DnsOverTlsResolver() { }

    public static byte[] resolve(VpnService vpnService, byte[] dnsQuery) throws IOException {
        if (vpnService == null || dnsQuery == null || dnsQuery.length < 12 || dnsQuery.length > MAX_DNS_MESSAGE_BYTES) {
            throw new IOException("Invalid DNS query.");
        }

        Socket transport = new Socket();
        if (!vpnService.protect(transport)) {
            transport.close();
            throw new IOException("Could not protect the upstream DNS socket from the local VPN.");
        }

        try {
            transport.connect(new InetSocketAddress(RESOLVER_IP, TLS_PORT), CONNECT_TIMEOUT_MS);
            SSLSocketFactory factory = (SSLSocketFactory) SSLSocketFactory.getDefault();
            try (SSLSocket tls = (SSLSocket) factory.createSocket(transport, TLS_HOSTNAME, TLS_PORT, true)) {
            tls.setSoTimeout(READ_TIMEOUT_MS);
            SSLParameters parameters = tls.getSSLParameters();
            parameters.setEndpointIdentificationAlgorithm("HTTPS");
            parameters.setServerNames(Collections.singletonList(new SNIHostName(TLS_HOSTNAME)));
            tls.setSSLParameters(parameters);
            tls.startHandshake();

            OutputStream output = tls.getOutputStream();
            output.write((dnsQuery.length >>> 8) & 0xff);
            output.write(dnsQuery.length & 0xff);
            output.write(dnsQuery);
            output.flush();

            InputStream input = tls.getInputStream();
            int high = input.read();
            int low = input.read();
            if (high < 0 || low < 0) throw new EOFException("Quad9 closed the DNS-over-TLS connection.");

            int responseLength = (high << 8) | low;
            if (responseLength < 12 || responseLength > MAX_DNS_MESSAGE_BYTES) {
                throw new IOException("Quad9 returned an invalid DNS message length.");
            }

            byte[] response = readExactly(input, responseLength);
            int queryId = ((dnsQuery[0] & 0xff) << 8) | (dnsQuery[1] & 0xff);
            int responseId = ((response[0] & 0xff) << 8) | (response[1] & 0xff);
            int flags = ((response[2] & 0xff) << 8) | (response[3] & 0xff);
            if (queryId != responseId || (flags & 0x8000) == 0) {
                throw new IOException("Quad9 returned a mismatched DNS response.");
            }
            return response;
            }
        } catch (IOException error) {
            try { transport.close(); } catch (IOException ignored) { }
            throw error;
        }
    }

    private static byte[] readExactly(InputStream input, int length) throws IOException {
        byte[] result = new byte[length];
        int offset = 0;
        while (offset < length) {
            int count = input.read(result, offset, length - offset);
            if (count < 0) throw new EOFException("Incomplete DNS-over-TLS response.");
            offset += count;
        }
        return result;
    }
}
