import SwiftUI

/// Shared visual tokens for the native NEXUS SHIELD iOS experience.
/// Keep colors and layout primitives centralized so feature views stay consistent.
enum NexusTheme {
    static let background = Color(red: 0.035, green: 0.055, blue: 0.095)
    static let surface = Color(red: 0.075, green: 0.105, blue: 0.16)
    static let accent = Color(red: 0.25, green: 0.62, blue: 0.98)
    static let secondaryText = Color(red: 0.68, green: 0.74, blue: 0.83)
    static let border = Color.white.opacity(0.09)
    static let padding: CGFloat = 24
    static let radius: CGFloat = 22
    static let controlRadius: CGFloat = 16
}
