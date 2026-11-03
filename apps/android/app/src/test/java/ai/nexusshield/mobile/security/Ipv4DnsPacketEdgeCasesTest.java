package ai.nexusshield.mobile.security;

import org.junit.Test;

import static org.junit.Assert.*;

/** Edge-case and checksum regression tests for the DNS-only TUN packet codec. */
public final class Ipv4DnsPacketEdgeCasesTest {
    @Test
    public void rejectsDeclaredIpv4LengthBeyondReadBuffer() {
        byte[] packet = queryPacket();
        put16(packet, 2, packet.length + 1);
        assertNull(Ipv4DnsPacketCodec.parseQuery(packet, packet.length));
    }

    @Test
    public void rejectsUdpLengthThatExtendsPastIpv4Payload() {
        byte[] packet = queryPacket();
        put16(packet, 24, u16(packet, 24) + 10);
        assertNull(Ipv4DnsPacketCodec.parseQuery(packet, packet.length));
    }

    @Test
    public void rejectsDnsResponseInsteadOfTreatingItAsQuery() {
        byte[] packet = queryPacket();
        packet[30] = (byte) 0x81;
        assertNull(Ipv4DnsPacketCodec.parseQuery(packet, packet.length));
    }

    @Test
    public void generatedResponseHasValidIpv4AndUdpChecksums() {
        byte[] packet = queryPacket();
        Ipv4DnsPacketCodec.Query query = Ipv4DnsPacketCodec.parseQuery(packet, packet.length);
        assertNotNull(query);

        byte[] dnsResponse = query.dnsPayload.clone();
        dnsResponse[2] = (byte) 0x81;
        dnsResponse[3] = (byte) 0x80;
        byte[] response = Ipv4DnsPacketCodec.buildResponse(query, dnsResponse);

        assertEquals(0, checksum(response, 0, 20));
        assertEquals(0, udpChecksum(response));
        assertEquals(response.length, u16(response, 2));
        assertEquals(response.length - 20, u16(response, 24));
    }

    private static byte[] queryPacket() {
        byte[] dns = new byte[] {
            0x12, 0x34, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x07, 'e', 'x', 'a', 'm', 'p', 'l', 'e', 0x03, 'c', 'o', 'm', 0x00,
            0x00, 0x01, 0x00, 0x01
        };
        int udpLength = 8 + dns.length;
        byte[] packet = new byte[20 + udpLength];
        packet[0] = 0x45;
        put16(packet, 2, packet.length);
        put16(packet, 4, 0x2345);
        put16(packet, 6, 0x4000);
        packet[8] = 64;
        packet[9] = 17;
        System.arraycopy(new byte[] {10, 89, 0, 1}, 0, packet, 12, 4);
        System.arraycopy(new byte[] {10, 89, 0, 2}, 0, packet, 16, 4);
        put16(packet, 20, 53000);
        put16(packet, 22, 53);
        put16(packet, 24, udpLength);
        System.arraycopy(dns, 0, packet, 28, dns.length);
        return packet;
    }

    private static int udpChecksum(byte[] packet) {
        int udpOffset = 20;
        int udpLength = u16(packet, udpOffset + 4);
        int end = udpOffset + udpLength;
        long sum = 0;
        sum += word(packet, 12);
        sum += word(packet, 14);
        sum += word(packet, 16);
        sum += word(packet, 18);
        sum += 17;
        sum += udpLength;
        int i = udpOffset;
        while (i + 1 < end) {
            sum += ((packet[i] & 0xff) << 8) | (packet[i + 1] & 0xff);
            i += 2;
        }
        if (i < end) sum += (packet[i] & 0xff) << 8;
        while ((sum >>> 16) != 0) sum = (sum & 0xffff) + (sum >>> 16);
        return (int) (~sum) & 0xffff;
    }

    private static int checksum(byte[] data, int offset, int length) {
        long sum = 0;
        for (int i = offset; i < offset + length; i += 2) {
            sum += ((data[i] & 0xff) << 8) | (data[i + 1] & 0xff);
        }
        while ((sum >>> 16) != 0) sum = (sum & 0xffff) + (sum >>> 16);
        return (int) (~sum) & 0xffff;
    }

    private static int word(byte[] data, int offset) {
        return ((data[offset] & 0xff) << 8) | (data[offset + 1] & 0xff);
    }

    private static int u16(byte[] data, int offset) {
        return word(data, offset);
    }

    private static void put16(byte[] data, int offset, int value) {
        data[offset] = (byte) ((value >>> 8) & 0xff);
        data[offset + 1] = (byte) (value & 0xff);
    }
}
