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

                    accountStatusCard

                    NexusNotice(
                        title: "Protection is not active",
                        message: "This preview is not connected to your NEXUS account. No monitoring, scanning, or blocking is running from this screen.",
                        kind: .warning
                    )

                    sectionHeading("Security services", subtitle: "Available after account connection")

                    VStack(spacing: 12) {
                        serviceCard(
                            icon: "bell.badge",
                            title: "Threat monitoring",
                            detail: "Verified alerts and incident history"
                        )
                        serviceCard(
                            icon: "link",
                            title: "Link safety",
                            detail: "Analyze links before opening them"
                        )
                        serviceCard(
                            icon: "lock.shield",
                            title: "Privacy center",
                            detail: "Review account data and permissions"
                        )
                    }

                    activityEmptyState

                    NexusPrimaryButton(
                        title: "Return to sign in",
                        systemImage: "arrow.left",
                        action: onReturn
                    )
                }
                .padding(.horizontal, NexusTheme.padding)
                .padding(.top, 12)
                .padding(.bottom, 32)
            }
        }
    }

    private var header: some View {
        HStack(alignment: .center) {
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

            Image(systemName: "shield.lefthalf.filled")
                .font(.system(size: 22, weight: .medium))
                .foregroundStyle(NexusTheme.accent)
                .frame(width: 48, height: 48)
                .background(NexusTheme.surface, in: Circle())
                .accessibilityHidden(true)
        }
    }

    private var accountStatusCard: some View {
        NexusCard {
            HStack(spacing: 14) {
                Image(systemName: "person.crop.circle.badge.exclamationmark")
                    .font(.system(size: 28, weight: .medium))
                    .foregroundStyle(NexusTheme.accent)
                    .frame(width: 56, height: 56)
                    .background(
                        NexusTheme.accent.opacity(0.12),
                        in: RoundedRectangle(cornerRadius: NexusTheme.controlRadius)
                    )
                    .accessibilityHidden(true)

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
    }

    private func sectionHeading(_ title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title)
                .font(.system(size: 20, weight: .bold, design: .rounded))
                .foregroundStyle(.white)

            Text(subtitle)
                .font(.system(size: 12))
                .foregroundStyle(NexusTheme.secondaryText)
        }
    }

    private func serviceCard(icon: String, title: String, detail: String) -> some View {
        NexusCard {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.system(size: 19, weight: .medium))
                    .foregroundStyle(NexusTheme.accent)
                    .frame(width: 44, height: 44)
                    .background(
                        NexusTheme.accent.opacity(0.1),
                        in: RoundedRectangle(cornerRadius: 13)
                    )
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 5) {
                    Text(title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)

                    Text(detail)
                        .font(.system(size: 12))
                        .foregroundStyle(NexusTheme.secondaryText)
                }

                Spacer(minLength: 8)

                Text("Unavailable")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(NexusTheme.secondaryText)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 6)
                    .background(NexusTheme.border, in: Capsule())
            }
        }
    }

    private var activityEmptyState: some View {
        NexusCard {
            VStack(spacing: 10) {
                Image(systemName: "clock.arrow.circlepath")
                    .font(.system(size: 24))
                    .foregroundStyle(NexusTheme.secondaryText)

                Text("No activity loaded")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)

                Text("Connect your account to view verified security activity. This preview does not contain sample incidents or fabricated scan results.")
                    .font(.system(size: 12))
                    .lineSpacing(3)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(NexusTheme.secondaryText)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
        }
    }
}
