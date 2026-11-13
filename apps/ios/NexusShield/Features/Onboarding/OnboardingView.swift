import SwiftUI

struct OnboardingView: View {
    let onPreviewDashboard: () -> Void
    @StateObject private var state = OnboardingState()

    var body: some View {
        ZStack {
            NexusTheme.background.ignoresSafeArea()
            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    Image(systemName: "shield.lefthalf.filled")
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(NexusTheme.accent)
                    Text("NEXUS")
                        .font(.system(size: 17, weight: .bold, design: .rounded))
                        .tracking(2.4)
                        .foregroundStyle(.white)
                    Spacer()
                    Text("SECURITY")
                        .font(.system(size: 10, weight: .bold))
                        .tracking(1.8)
                        .foregroundStyle(NexusTheme.secondaryText)
                }
                .padding(.top, 12)

                Spacer(minLength: 24)
                ZStack {
                    Circle().fill(NexusTheme.accent.opacity(0.08)).frame(width: 230, height: 230)
                    Circle().stroke(NexusTheme.accent.opacity(0.18), lineWidth: 1).frame(width: 190, height: 190)
                    Image(systemName: "shield.checkered")
                        .font(.system(size: 92, weight: .light))
                        .symbolRenderingMode(.hierarchical)
                        .foregroundStyle(NexusTheme.accent)
                        .shadow(color: NexusTheme.accent.opacity(0.28), radius: 24)
                }
                .accessibilityHidden(true)

                Spacer(minLength: 24)
                VStack(spacing: 14) {
                    Text("Your digital world.\nUnder your control.")
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                        .tracking(-0.8)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.white)
                    Text("A clearer view of your security and privacy—built around verified information, not guesswork.")
                        .font(.system(size: 16))
                        .lineSpacing(5)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(NexusTheme.secondaryText)
                        .padding(.horizontal, 8)
                }

                Spacer(minLength: 28)
                NexusPrimaryButton(
                    title: "Continue with Apple",
                    systemImage: "apple.logo",
                    action: state.tapAppleSignIn
                )
                .accessibilityHint("Apple authentication is not yet connected.")

                Button(action: onPreviewDashboard) {
                    Text("Preview the dashboard")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(NexusTheme.secondaryText)
                        .frame(maxWidth: .infinity, minHeight: 48)
                }
                .padding(.top, 8)

                Text("Preview contains no live account data.")
                    .font(.system(size: 11))
                    .foregroundStyle(NexusTheme.secondaryText.opacity(0.72))
                    .padding(.bottom, 12)
            }
            .padding(.horizontal, NexusTheme.padding)
        }
        .alert("Sign in is not ready yet", isPresented: $state.showingAuthenticationNotice) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(state.authenticationNotice)
        }
    }
}
