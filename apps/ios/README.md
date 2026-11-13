# NEXUS SHIELD AI — iOS Foundation

Initial native SwiftUI scaffold for iOS 17+: onboarding and dashboard preview, with a reusable Design System.

## Shared UI components
- `NexusTheme`: centralized palette, spacing, and corner-radius tokens.
- `NexusPrimaryButton`: primary action with loading and disabled states.
- `NexusCard`: shared bordered surface for grouped dashboard content.
- `NexusLoadingState`: accessible progress placeholder for future API requests.
- `NexusNotice`: inline informational or warning notice.

The Dashboard is composed from the shared card and notice components. It stays explicitly disconnected until authentication and data APIs are implemented; it does not invent alerts, scan results, or security scores. Apple sign-in is not connected yet: the server has an Apple identity-token verifier, but the native exchange and refresh endpoints are not currently implemented on `main`.

## Generate and test
Requires macOS, Xcode, and XcodeGen:
```sh
cd apps/ios
xcodegen generate --spec project.yml
xcodebuild -project NexusShield.xcodeproj -scheme NexusShield -destination 'platform=iOS Simulator,name=iPhone 16' test
```
GitHub Actions runs project generation and XCTest on a hosted macOS runner, selecting an available iPhone Simulator dynamically.
