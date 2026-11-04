import NetworkExtension
import XCTest
@testable import NexusDNSCore

final class NexusDNSConfigurationTests: XCTestCase {
    func testQuad9UsesEncryptedDnsOverTls() {
        let settings = NexusDNSConfiguration.makeSettings()
        XCTAssertEqual(settings.servers, ["9.9.9.9"])
        XCTAssertEqual(settings.serverName, "dns.quad9.net")
    }

    func testResolverDescriptionIsSpecificToNexus() {
        XCTAssertEqual(
            NexusDNSConfiguration.localizedDescription,
            "NEXUS SHIELD AI DNS Protection"
        )
    }
}