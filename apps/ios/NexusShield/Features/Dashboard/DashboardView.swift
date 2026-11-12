import SwiftUI

struct DashboardView: View {
    let onReturn: () -> Void
    @StateObject private var state = DashboardState()

    var body: some View {
        ZStack {
            NexusTheme.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
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
                    .padding(.top, 12)

                    HStack(spacing: 14) {
                        Image(systemName: "shield.lefthalf.filled")
                            .font(.system(size: 28, weight: .medium))
                            .foregroundStyle(NexusTheme.accent)
                            .frame(width: 56, height: 56)
                            .background(NexusTheme.accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 16))
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
                    .padding(18)
                    .background(NexusTheme.surface, in: RoundedRectangle(cornerRadius: NexusTheme.radius))
                    .overlay(RoundedRectangle(cornerRadius: NexusTheme.radius).stroke(NexusTheme.border, lineWidth: 1))

                    Text("Your security")
                        .font(.system(size: 20, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)

                    VStack(spacing: 0) {
                        row(icon: "bell.badge", title: "Threat alerts", detail: "Unavailable until account connection")
                        Divider().overlay(NexusTheme.border).padding(.leading, 58)
                        row(icon: "link", title: "Link checker", detail: "Connect to analyze submitted links")
                        Divider().overlay(NexusTheme.border).padding(.leading, 58)
                        row(icon: "lock.shield", title: "Privacy center", detail: "Account data is not loaded")
                    }
                    .background(NexusTheme.surface, in: RoundedRectangle(cornerRadius: NexusTheme.radius))
                    .overlay(RoundedRectangle(cornerRadius: NexusTheme.radius).stroke(NexusTheme.border, lineWidth: 1))

                    Text(state.emptyStateMessage)
                        .font(.system(size: 12))
                        .lineSpacing(3)
                        .foregroundStyle(NexusTheme.secondaryText)
                        .padding(.horizontal, 4)
                }
                .padding(.horizontal, NexusTheme.padding)
                .padding(.bottom, 28)
            }
        }
    }

    private func row(icon: String, title: String, detail: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(NexusTheme.accent)
                .frame(width: 42, height: 42)
                .background(NexusTheme.accent.opacity(0.1), in: RoundedRectangle(cornerRadius: 13))
            VStack(alignment: .leading, spacing: 5) {
                Text(title).font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
                Text(detail).font(.system(size: 12)).foregroundStyle(NexusTheme.secondaryText)
            }
            Spacer()
        }
        .padding(16)
    }
}
