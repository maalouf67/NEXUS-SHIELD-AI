package ai.nexusshield.mobile.security;

import java.nio.charset.StandardCharsets;
import java.util.Locale;

/** Minimal IPv4/UDP DNS packet codec for the DNS-only Android VPN interface. */
public final class Ipv4DnsPacketCodec {
    private static final int IPV4_HEADER_BYTES = 20;
    private static final int UDP_HEADER_BYTES = 8;

    private Ipv4DnsPacketCodec() { }

    public static final class Query {
        public final byte[] sourceAddress;
        public final byte[] destinationAddress;
        public final int sourcePort;
        public final int destinationPort;
        public final int identification;
        public final int dnsFlags;
        public final String queriedDomain;
        public final byte[] dnsPayload;

        private Query(byte[] sourceAddress, byte[] destinationAddress, int sourcePort,
                      int destinationPort, int identification, int dnsFlags,
                      String queriedDomain, byte[] dnsPayload) {
            this.sourceAddress = sourceAddress;
            this.destinationAddress = destinationAddress;
            this.sourcePort = sourcePort;
            this.destinationPort = destinationPort;
            this.identification = identification;
            this.dnsFlags = dnsFlags;
            this.queriedDomain = queriedDomain;
            this.dnsPayload = dnsPayload;
        }
    }

    /**
     * Returns null for non-IPv4, non-UDP, fragmented, non-DNS, malformed, or
     * response packets. Domain names are parsed for validation only; callers
     * should not persist them.
     */
    public static Query parseQuery(byte[] packet, int packetLength) {
        if (packet == null || packetLength < IPV4_HEADER_BYTES || packetLength > packet.length) return null;
        if (((packet[0] & 0xff) >>> 4) != 4) return null;

        int ipHeaderLength = (packet[0] & 0x0f) * 4;
        if (ipHeaderLength < IPV4_HEADER_BYTES || packetLength < ipHeaderLength + UDP_HEADER_BYTES) return null;
        int totalLength = u16(packet, 2);
        if (totalLength < ipHeaderLength + UDP_HEADER_BYTES || totalLength > packetLength) return null;
        if ((packet[9] & 0xff) != 17) return null; // UDP only.

        int fragmentation = u16(packet, 6);
        if ((fragmentation & 0x3fff) != 0) return null; // No fragment offset or MF flag.

        int udpOffset = ipHeaderLength;
        int sourcePort = u16(packet, udpOffset);
        int destinationPort = u16(packet, udpOffset + 2);
        int udpLength = u16(packet, udpOffset + 4);
        if (destinationPort != 53 || udpLength < UDP_HEADER_BYTES + 12) return null;
        if (udpOffset + udpLength > totalLength) return null;

        int dnsOffset = udpOffset + UDP_HEADER_BYTES;
        int dnsLength = udpLength - UDP_HEADER_BYTES;
        byte[] dns = new byte[dnsLength];
        System.arraycopy(packet, dnsOffset, dns, 0, dnsLength);
        int flags = u16(dns, 2);
        if ((flags & 0x8000) != 0 || u16(dns, 4) != 1) return null;

        String domain = parseQuestionName(dns);
        if (domain == null) return null;

        byte[] source = new byte[4];
        byte[] destination = new byte[4];
        System.arraycopy(packet, 12, source, 0, 4);
        System.arraycopy(packet, 16, destination, 0, 4);
        return new Query(source, destination, sourcePort, destinationPort,
                u16(packet, 4), flags, domain, dns);
    }

    public static byte[] buildResponse(Query query, byte[] dnsResponse) {
        if (query == null || dnsResponse == null || dnsResponse.length < 12) {
            throw new IllegalArgumentException("A valid DNS query and response are required.");
        }
        int udpLength = UDP_HEADER_BYTES + dnsResponse.length;
        int totalLength = IPV4_HEADER_BYTES + udpLength;
        if (totalLength > 65535) throw new IllegalArgumentException("DNS response is too large.");

        byte[] packet = new byte[totalLength];
        packet[0] = 0x45;
        packet[1] = 0;
        put16(packet, 2, totalLength);
        put16(packet, 4, query.identification);
        put16(packet, 6, 0x4000); // Don't fragment.
        packet[8] = 64;
        packet[9] = 17;
        System.arraycopy(query.destinationAddress, 0, packet, 12, 4);
        System.arraycopy(query.sourceAddress, 0, packet, 16, 4);

        int udpOffset = IPV4_HEADER_BYTES;
        put16(packet, udpOffset, query.destinationPort);
        put16(packet, udpOffset + 2, query.sourcePort);
        put16(packet, udpOffset + 4, udpLength);
        put16(packet, udpOffset + 6, 0);
        System.arraycopy(dnsResponse, 0, packet, udpOffset + UDP_HEADER_BYTES, dnsResponse.length);

        put16(packet, 10, checksum(packet, 0, IPV4_HEADER_BYTES));
        int udpChecksum = udpChecksum(packet, udpOffset, udpLength,
                query.destinationAddress, query.sourceAddress);
        put16(packet, udpOffset + 6, udpChecksum == 0 ? 0xffff : udpChecksum);
        return packet;
    }

    public static byte[] buildServFail(Query query) {
        if (query == null) throw new IllegalArgumentException("A DNS query is required.");
        byte[] dns = query.dnsPayload.clone();
        int flags = 0x8082 | (query.dnsFlags & 0x0100); // QR, RA, SERVFAIL, preserve RD.
        put16(dns, 2, flags);
        put16(dns, 6, 0);
        put16(dns, 8, 0);
        put16(dns, 10, 0);
        return buildResponse(query, dns);
    }

    private static String parseQuestionName(byte[] dns) {
        int position = 12;
        StringBuilder domain = new StringBuilder();
        int wireLength = 0;
        while (position < dns.length) {
            int labelLength = dns[position++] & 0xff;
            if (labelLength == 0) {
                if (position + 4 > dns.length || domain.length() == 0) return null;
                return domain.toString().toLowerCase(Locale.ROOT);
            }
            if ((labelLength & 0xc0) != 0 || labelLength > 63 || position + labelLength > dns.length) return null;
            if (wireLength + labelLength + 1 > 255) return null;
            if (domain.length() > 0) domain.append('.');
            for (int i = 0; i < labelLength; i++) {
                int value = dns[position + i] & 0xff;
                if (value < 0x21 || value > 0x7e) return null;
                domain.append((char) value);
            }
            position += labelLength;
            wireLength += labelLength + 1;
        }
        return null;
    }

    private static int udpChecksum(byte[] packet, int offset, int length, byte[] source, byte[] destination) {
        long sum = 0;
        sum += word(source, 0); sum += word(source, 2);
        sum += word(destination, 0); sum += word(destination, 2);
        sum += 17; // Protocol number.
        sum += length;
        sum = checksumSum(packet, offset, length, sum);
        return finishChecksum(sum);
    }

    private static int checksum(byte[] data, int offset, int length) {
        return finishChecksum(checksumSum(data, offset, length, 0));
    }

    private static long checksumSum(byte[] data, int offset, int length, long initial) {
        long sum = initial;
        int end = offset + length;
        int i = offset;
        while (i + 1 < end) {
            sum += ((data[i] & 0xff) << 8) | (data[i + 1] & 0xff);
            i += 2;
        }
        if (i < end) sum += (data[i] & 0xff) << 8;
        return sum;
    }

    private static int finishChecksum(long sum) {
        while ((sum >>> 16) != 0) sum = (sum & 0xffff) + (sum >>> 16);
        return (int) (~sum) & 0xffff;
    }

    private static int word(byte[] data, int offset) {
        return ((data[offset] & 0xff) << 8) | (data[offset + 1] & 0xff);
    }

    private static int u16(byte[] data, int offset) {
        return ((data[offset] & 0xff) << 8) | (data[offset + 1] & 0xff);
    }

    private static void put16(byte[] data, int offset, int value) {
        data[offset] = (byte) ((value >>> 8) & 0xff);
        data[offset + 1] = (byte) (value & 0xff);
    }
}
