import NetworkExtension

enum NexusDNSConfiguration {
    static let resolverAddress = "9.9.9.9"
    static let tlsServerName = "dns.quad9.net"
    static let localizedDescription = "NEXUS SHIELD AI DNS Protection"

    static func makeSettings() -> NEDNSOverTLSSettings {
        let settings = NEDNSOverTLSSettings(servers: [resolverAddress])
        settings.serverName = tlsServerName
        settings.allowFailover = false
        return settings
    }
}