import SwiftUI

struct DashboardView: View {
    let onReturn: () -> Void
    @StateObject private var state = DashboardState()

    var body: some View {
        ZStack {
            NexusTheme.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    header

                    NexusCard {
                        HStack(spacing: 14) {
                            Image(systemName: "shield.lefthalf.filled")
                                .font(.system(size: 28, weight: .medium))
                                .foregroundStyle(NexusTheme.accent)
                                .frame(width: 56, height: 56)
                                .background(NexusTheme.accent.opacity(0.12), in: RoundedRectangle(cornerRadius: NexusTheme.controlRadius))
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Account not connected")
                                    .font(.system(size: 17, weight: .semibold))
                                    .foregroundStyle(.white)
                                Text(state.statusMessage)
                                    .font(.system(size: 13))
                                    .lineSpacing(3)
                                    .foregroundStyle(NexusTheme.secondaryText)
                            }
                            Spacer(minLength: 0)
                        }
                    }

                    Text("Your security")
                        .font(.system(size: 20, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)

                    NexusCard {
                        VStack(spacing: 0) {
                            featureRow(icon: "bell.badge", title: "Threat alerts", detail: "Unavailable until account connection")
                            Divider().overlay(NexusTheme.border).padding(.leading, 58)
                            featureRow(icon: "link", title: "Link checker", detail: "Connect to analyze submitted links")
                            Divider().overlay(NexusTheme.border).padding(.leading, 58)
                            featureRow(icon: "lock.shield", title: "Privacy center", detail: "Account data is not loaded")
                        }
                        .padding(-18)
                    }

                    NexusNotice(
                        title: "Preview mode",
                        message: state.emptyStateMessage,
                        kind: .information
                    )
                }
                .padding(.horizontal, NexusTheme.padding)
                .padding(.top, 12)
                .padding(.bottom, 28)
            }
        }
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 6) {
                Text("NEXUS SHIELD")
                    .font(.system(size: 11, weight: .bold))
                    .tracking(2)
                    .foregroundStyle(NexusTheme.accent)
                Text("Security overview")
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
            }
            Spacer()
            Button(action: onReturn) {
                Image(systemName: "person.crop.circle")
                    .font(.system(size: 25))
                    .foregroundStyle(NexusTheme.secondaryText)
                    .frame(width: 48, height: 48)
                    .background(NexusTheme.surface, in: Circle())
            }
            .accessibilityLabel("Return to onboarding")
        }
    }

    private func featureRow(icon: String, title: String, detail: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(NexusTheme.accent)
                .frame(width: 42, height: 42)
                .background(NexusTheme.accent.opacity(0.1), in: RoundedRectangle(cornerRadius: 13))
            VStack(alignment: .leading, spacing: 5) {
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                Text(detail)
                    .font(.system(size: 12))
                    .foregroundStyle(NexusTheme.secondaryText)
            }
            Spacer()
        }
        .padding(16)
    }
}
