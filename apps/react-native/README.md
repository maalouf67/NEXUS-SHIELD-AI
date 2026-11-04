# NEXUS SHIELD AI — React Native and iOS native module

This folder contains the TypeScript React Native app and a local Swift Expo module.

## Shared mobile functions

- Authenticates against the existing Express API using the existing NEXUS account model.
- Stores the short-lived access token in iOS Keychain / Android Keystore through expo-secure-store.
- Calls POST /api/phone-reputation/check using the same API provider adapter as the web console.
- Does not store phone lookup history or provider credentials in the mobile app.

Set EXPO_PUBLIC_NEXUS_API_URL to the HTTPS origin of the NEXUS Express API at build time. This is a public server address, not a secret. Keep IPQS_API_KEY on the API server only.

## iOS DNS protection

The local module at modules/nexus-dns uses Apple's NetworkExtension NEDNSSettingsManager and NEDNSOverTLSSettings APIs. It configures the system DNS resolver to use Quad9 at 9.9.9.9 with TLS server-name validation for dns.quad9.net. The iOS app also declares Apple's `dns-settings` Network Extension entitlement; that entitlement must be enabled for the App ID and included in the signed provisioning profile.

The user must approve and enable the DNS configuration through the iOS system flow / Settings before it becomes active. NEXUS reports whether a configuration is saved and whether iOS reports it enabled. This is encrypted system DNS configuration, not a full-device packet tunnel and not HTTPS inspection. Apps that implement their own DNS-over-HTTPS, private resolvers, or encrypted application-level name resolution can use a different path.

The Android implementation remains the existing native companion at apps/android. This initial React Native build does not replace or duplicate the Android VpnService implementation.

## Development

Requirements: Node.js 22.13 or newer, Xcode 26 or newer for iOS simulator/device builds, CocoaPods, and the Android SDK/Android Studio for Android builds. The Expo SDK 58 app currently targets iOS 16.4 or newer, matching the minimum required by the installed native Expo modules.

From this folder:

    npm install
    npm run typecheck
    npx expo start

Because this app contains a native iOS module, Expo Go is not sufficient for testing DNS configuration. Generate a native iOS project and build a development client:

    npx expo prebuild --platform ios
    cd ios && pod install
    open *.xcworkspace

The simulator build validates compilation only. Real DNS profile approval and network behavior must be checked on a physical iPhone. Distribution requires the appropriate Apple Developer account and signing configuration.

## Tests

    swift test --package-path apps/react-native

The Swift tests validate DNS-over-TLS configuration parameters. They do not prove that an Apple device approved the profile, that all apps use the resolver, or that Quad9 blocks every threat domain.