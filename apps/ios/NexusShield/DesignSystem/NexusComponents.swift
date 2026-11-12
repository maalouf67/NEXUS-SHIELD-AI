import SwiftUI

/// Reusable primary action with an explicit disabled/loading state.
struct NexusPrimaryButton: View {
    let title: String
    var systemImage: String? = nil
    var isLoading: Bool = false
    var isEnabled: Bool = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                if isLoading {
                    ProgressView().tint(.black)
                } else if let systemImage {
                    Image(systemName: systemImage)
                }
                Text(isLoading ? "Please wait…" : title)
                    .font(.system(size: 16, weight: .semibold))
            }
            .foregroundStyle(.black)
            .frame(maxWidth: .infinity)
            .frame(minHeight: 56)
            .background(Color.white, in: RoundedRectangle(cornerRadius: NexusTheme.controlRadius))
        }
        .disabled(!isEnabled || isLoading)
        .opacity((!isEnabled || isLoading) ? 0.65 : 1)
        .accessibilityLabel(title)
    }
}

/// Shared bordered surface used for dashboard sections and status summaries.
struct NexusCard<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(NexusTheme.surface, in: RoundedRectangle(cornerRadius: NexusTheme.radius))
            .overlay {
                RoundedRectangle(cornerRadius: NexusTheme.radius)
                    .stroke(NexusTheme.border, lineWidth: 1)
            }
    }
}

/// Centered loading placeholder for future authenticated API requests.
struct NexusLoadingState: View {
    let message: String

    var body: some View {
        VStack(spacing: 12) {
            ProgressView().tint(NexusTheme.accent)
            Text(message)
                .font(.system(size: 13))
                .foregroundStyle(NexusTheme.secondaryText)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, minHeight: 120)
        .accessibilityElement(children: .combine)
    }
}

/// Inline informational/warning notice. It communicates state without claiming a security verdict.
struct NexusNotice: View {
    enum Kind: Equatable {
        case information
        case warning
    }

    let title: String
    let message: String
    var kind: Kind = .information

    private var tint: Color {
        switch kind {
        case .information: NexusTheme.accent
        case .warning: Color.orange
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: kind == .information ? "info.circle.fill" : "exclamationmark.triangle.fill")
                .foregroundStyle(tint)
                .font(.system(size: 18))
            VStack(alignment: .leading, spacing: 5) {
                Text(title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                Text(message)
                    .font(.system(size: 12))
                    .lineSpacing(3)
                    .foregroundStyle(NexusTheme.secondaryText)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint.opacity(0.08), in: RoundedRectangle(cornerRadius: NexusTheme.controlRadius))
        .overlay {
            RoundedRectangle(cornerRadius: NexusTheme.controlRadius)
                .stroke(tint.opacity(0.2), lineWidth: 1)
        }
        .accessibilityElement(children: .combine)
    }
}
