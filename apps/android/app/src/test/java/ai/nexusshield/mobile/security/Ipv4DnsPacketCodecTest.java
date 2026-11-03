package ai.nexusshield.mobile.security;

import org.junit.Test;

import static org.junit.Assert.*;

public class Ipv4DnsPacketCodecTest {
    @Test
    public void parsesIpv4UdpDnsQuestion() {
        byte[] packet = queryPacket("Example.COM");
        Ipv4DnsPacketCodec.Query query = Ipv4DnsPacketCodec.parseQuery(packet, packet.length);
        assertNotNull(query);
        assertEquals("example.com", query.queriedDomain);
        assertEquals(53000, query.sourcePort);
        assertEquals(53, query.destinationPort);
        assertEquals(0x1234, query.identification);
    }

    @Test
    public void responseSwapsAddressesAndUdpPorts() {
        byte[] packet = queryPacket("example.com");
        Ipv4DnsPacketCodec.Query query = Ipv4DnsPacketCodec.parseQuery(packet, packet.length);
        byte[] dnsResponse = query.dnsPayload.clone();
        dnsResponse[2] = (byte) 0x81;
        dnsResponse[3] = (byte) 0x80;

        byte[] response = Ipv4DnsPacketCodec.buildResponse(query, dnsResponse);
        assertEquals(53, u16(response, 20));
        assertEquals(53000, u16(response, 22));
        assertArrayEquals(new byte[]{10, 89, 0, 2}, slice(response, 12, 4));
        assertArrayEquals(new byte[]{10, 89, 0, 1}, slice(response, 16, 4));
        assertEquals(0, checksum(response, 0, 20));
    }

    @Test
    public void buildsServFailWithoutInventingAnswerRecords() {
        byte[] packet = queryPacket("example.com");
        Ipv4DnsPacketCodec.Query query = Ipv4DnsPacketCodec.parseQuery(packet, packet.length);
        byte[] response = Ipv4DnsPacketCodec.buildServFail(query);
        int dnsOffset = 28;
        int flags = u16(response, dnsOffset + 2);
        assertTrue((flags & 0x8000) != 0);
        assertEquals(2, flags & 0x000f);
        assertEquals(0, u16(response, dnsOffset + 6));
        assertEquals(0, u16(response, dnsOffset + 8));
        assertEquals(0, u16(response, dnsOffset + 10));
    }

    @Test
    public void ignoresNonUdpPacketsAndOtherPorts() {
        byte[] tcp = queryPacket("example.com");
        tcp[9] = 6;
        assertNull(Ipv4DnsPacketCodec.parseQuery(tcp, tcp.length));

        byte[] otherPort = queryPacket("example.com");
        otherPort[22] = 0x01;
        otherPort[23] = (byte) 0xbb;
        assertNull(Ipv4DnsPacketCodec.parseQuery(otherPort, otherPort.length));
    }

    @Test
    public void rejectsFragmentedAndMalformedQuestionPackets() {
        byte[] fragmented = queryPacket("example.com");
        fragmented[6] = 0x20;
        assertNull(Ipv4DnsPacketCodec.parseQuery(fragmented, fragmented.length));

        byte[] malformed = queryPacket("example.com");
        malformed[40] = (byte) 0xc0;
        assertNull(Ipv4DnsPacketCodec.parseQuery(malformed, malformed.length));
    }

    private static byte[] queryPacket(String domain) {
        byte[] encodedName = encodeName(domain);
        byte[] dns = new byte[12 + encodedName.length + 4];
        dns[0] = 0x12; dns[1] = 0x34;
        dns[2] = 0x01; dns[3] = 0x00;
        dns[4] = 0x00; dns[5] = 0x01;
        System.arraycopy(encodedName, 0, dns, 12, encodedName.length);
        int qtypeOffset = 12 + encodedName.length;
        dns[qtypeOffset] = 0; dns[qtypeOffset + 1] = 1;
        dns[qtypeOffset + 2] = 0; dns[qtypeOffset + 3] = 1;

        int udpLength = 8 + dns.length;
        byte[] packet = new byte[20 + udpLength];
        packet[0] = 0x45;
        put16(packet, 2, packet.length);
        put16(packet, 4, 0x2345);
        put16(packet, 6, 0x4000);
        packet[8] = 64;
        packet[9] = 17;
        System.arraycopy(new byte[]{10, 89, 0, 1}, 0, packet, 12, 4);
        System.arraycopy(new byte[]{10, 89, 0, 2}, 0, packet, 16, 4);
        put16(packet, 20, 53000);
        put16(packet, 22, 53);
        put16(packet, 24, udpLength);
        System.arraycopy(dns, 0, packet, 28, dns.length);
        return packet;
    }

    private static byte[] encodeName(String value) {
        String[] labels = value.split("\\.");
        java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
        for (String label : labels) {
            byte[] bytes = label.getBytes(java.nio.charset.StandardCharsets.US_ASCII);
            output.write(bytes.length);
            output.write(bytes, 0, bytes.length);
        }
        output.write(0);
        return output.toByteArray();
    }

    private static int u16(byte[] data, int offset) {
        return ((data[offset] & 0xff) << 8) | (data[offset + 1] & 0xff);
    }

    private static void put16(byte[] data, int offset, int value) {
        data[offset] = (byte) ((value >>> 8) & 0xff);
        data[offset + 1] = (byte) (value & 0xff);
    }

    private static byte[] slice(byte[] data, int offset, int length) {
        byte[] result = new byte[length];
        System.arraycopy(data, offset, result, 0, length);
        return result;
    }

    private static int checksum(byte[] data, int offset, int length) {
        long sum = 0;
        for (int i = offset; i < offset + length; i += 2) {
            sum += ((data[i] & 0xff) << 8) | (data[i + 1] & 0xff);
        }
        while ((sum >>> 16) != 0) sum = (sum & 0xffff) + (sum >>> 16);
        return (int) (~sum) & 0xffff;
    }
}
