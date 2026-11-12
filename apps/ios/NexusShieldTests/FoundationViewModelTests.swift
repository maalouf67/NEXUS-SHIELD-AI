import XCTest
@testable import NexusShield

final class FoundationViewModelTests: XCTestCase {
    @MainActor
    func testAppleSignInTapShowsNoticeAndDoesNotPretendAuthenticationWorks() {
        let state = OnboardingState()
        state.tapAppleSignIn()
        XCTAssertTrue(state.showingAuthenticationNotice)
        XCTAssertFalse(state.appleAuthenticationReady)
        XCTAssertTrue(state.authenticationNotice.contains("not yet implemented"))
    }

    @MainActor
    func testDashboardIsDisconnectedAndDoesNotInventLiveSecurityData() {
        let state = DashboardState()
        XCTAssertFalse(state.accountConnected)
        XCTAssertTrue(state.statusMessage.contains("verified security information"))
        XCTAssertTrue(state.emptyStateMessage.contains("No live alerts"))
    }
}
