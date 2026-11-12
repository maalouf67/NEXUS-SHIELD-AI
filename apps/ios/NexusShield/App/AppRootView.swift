import SwiftUI

enum NexusTheme {
    static let background = Color(red: 0.035, green: 0.055, blue: 0.095)
    static let surface = Color(red: 0.075, green: 0.105, blue: 0.16)
    static let accent = Color(red: 0.25, green: 0.62, blue: 0.98)
    static let secondaryText = Color(red: 0.68, green: 0.74, blue: 0.83)
    static let border = Color.white.opacity(0.09)
    static let padding: CGFloat = 24
    static let radius: CGFloat = 22
}

@MainActor
final class OnboardingState: ObservableObject {
    @Published var showingAuthenticationNotice = false
    let appleAuthenticationReady = false
    let authenticationNotice = "Sign in with Apple will be enabled after the NEXUS Apple-authentication API exchange is implemented and verified."

    func tapAppleSignIn() {
        // Apple authorization is intentionally not started before the backend exchange is available.
        showingAuthenticationNotice = true
    }
}

@MainActor
final class DashboardState: ObservableObject {
    let accountConnected = false
    let statusMessage = "Connect your NEXUS account to load verified security information."
    let emptyStateMessage = "No live alerts, scan results, or security scores are shown in this preview."
}

enum AppRoute {
    case onboarding
    case dashboardPreview
}

struct AppRootView: View {
    @State private var route: AppRoute = .onboarding

    var body: some View {
        Group {
            switch route {
            case .onboarding:
                OnboardingView(onPreviewDashboard: { route = .dashboardPreview })
            case .dashboardPreview:
                DashboardView(onReturn: { route = .onboarding })
            }
        }
    }
}
