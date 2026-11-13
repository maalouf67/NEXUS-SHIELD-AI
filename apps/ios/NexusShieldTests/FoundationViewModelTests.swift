import XCTest
@testable import NexusShield

final class FoundationViewModelTests: XCTestCase {
    @MainActor
    func testAppleSignInTapShowsNoticeAndDoesNotPretendAuthenticationWorks() {
        let state = OnboardingState()
        state.tapAppleSignIn()
        XCTAssertTrue(state.showingAuthenticationNotice)
        XCTAssertFalse(state.appleAuthenticationReady)
        XCTAssertTrue(state.authenticationNotice.contains("will be enabled"))
    }

    @MainActor
    func testDashboardIsDisconnectedAndDoesNotInventLiveSecurityData() {
        let state = DashboardState()
        XCTAssertFalse(state.accountConnected)
        XCTAssertTrue(state.statusMessage.contains("verified security information"))
        XCTAssertTrue(state.emptyStateMessage.contains("No live alerts"))
        XCTAssertTrue(state.emptyStateMessage.contains("no security scores"))
    }

    func testNoticeSupportsInformationAndWarningVariants() {
        XCTAssertNotEqual(NexusNotice.Kind.information, NexusNotice.Kind.warning)
    }
}
