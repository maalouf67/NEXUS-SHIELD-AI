# NEXUS SHIELD AI — iOS Foundation

Initial native SwiftUI scaffold: onboarding and dashboard only.

Apple sign-in is not connected yet. The backend has an Apple identity-token verifier, but the native exchange and refresh endpoints are not currently implemented on main. The dashboard intentionally displays a disconnected state and no fabricated threat scores or scan results.

## Generate and test
Requires macOS, Xcode, and XcodeGen:
```sh
cd apps/ios
xcodegen generate --spec project.yml
xcodebuild -project NexusShield.xcodeproj -scheme NexusShield -destination 'platform=iOS Simulator,name=iPhone 16' test
```
GitHub Actions runs project generation and XCTest on a hosted macOS runner, selecting an available iPhone Simulator dynamically.
