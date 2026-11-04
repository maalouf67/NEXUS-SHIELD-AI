import ExpoModulesCore
import NetworkExtension

public final class NexusDNSModule: Module {
    private let manager = NEDNSSettingsManager.shared()

    public func definition() -> ModuleDefinition {
        Name("NexusDNS")

        AsyncFunction("enable") { () async throws -> [String: Any] in
            try await self.loadPreferences()
            self.manager.localizedDescription = NexusDNSConfiguration.localizedDescription
            self.manager.dnsSettings = NexusDNSConfiguration.makeSettings()
            try await self.savePreferences()

            return [
                "enabled": self.manager.isEnabled,
                "configured": true,
                "resolver": NexusDNSConfiguration.resolverAddress,
                "serverName": NexusDNSConfiguration.tlsServerName,
                "protocol": "DNS-over-TLS",
                "requiresUserApproval": !self.manager.isEnabled
            ]
        }

        AsyncFunction("disable") { () async throws -> [String: Any] in
            try await self.loadPreferences()
            try await self.removePreferences()
            return [
                "enabled": false,
                "removed": true
            ]
        }

        AsyncFunction("status") { () async throws -> [String: Any] in
            try await self.loadPreferences()
            let settings = self.manager.dnsSettings as? NEDNSOverTLSSettings
            return [
                "enabled": self.manager.isEnabled,
                "configured": settings != nil,
                "resolver": settings?.servers.first ?? NexusDNSConfiguration.resolverAddress,
                "serverName": settings?.serverName ?? NexusDNSConfiguration.tlsServerName,
                "protocol": "DNS-over-TLS",
                "requiresUserApproval": settings != nil && !self.manager.isEnabled
            ]
        }
    }

    private func loadPreferences() async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            manager.loadFromPreferences { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: ())
                }
            }
        }
    }

    private func savePreferences() async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            manager.saveToPreferences { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: ())
                }
            }
        }
    }

    private func removePreferences() async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            manager.removeFromPreferences { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: ())
                }
            }
        }
    }
}