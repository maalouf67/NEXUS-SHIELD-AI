# NEXUS SHIELD Mobile — Android foundation

This is the first native Android companion module for the NEXUS SHIELD AI project.

## Current scope

- Sign in against the configured NEXUS API over HTTPS.
- Keep the short-lived bearer token in memory only (no password/token is persisted).
- Pick one file through Android's Storage Access Framework; the app does not request broad storage access.
- Submit the chosen file to the authenticated web scanner route (100 MiB maximum).
- View the signed-in user's PostgreSQL-backed scan history.

## Important security boundaries

This is an **on-demand file-scanning companion**, not a continuously running device-wide antivirus. It scans only a file explicitly selected by the user. It does not inspect other apps' private storage, all device files, running processes, or network traffic. No VPN service, DNS filter, network blocklist, or always-on protection is enabled in this version.

A later Android network-protection phase may use Android's user-approved `VpnService` and a foreground notification, with an independently tested DNS/network filtering engine. It must not claim visibility into encrypted DNS, app-private content, or traffic outside its coverage. An iOS companion requires a separate implementation and Apple's applicable Network Extension entitlements.

## Server addresses

Set:
- **API base URL**: the HTTPS origin serving the Express API, e.g. `https://api.example.com`.
- **Web app base URL**: the HTTPS origin serving Next.js, e.g. `https://app.example.com`.

The API origin must expose `POST /api/auth/login` and `GET /api/malware-scans`. The web origin must expose `POST /api/security/scan` and allow native bearer-token requests without a browser Origin header.

Use only a server that the project owner controls. Do not enter production credentials into an untrusted preview.

## Build

Open `apps/android` in Android Studio with JDK 17 and Android SDK 36, or use Gradle 9.6.0:

```bash
gradle --no-daemon :app:assembleDebug
```

The debug APK is a development artifact only. It is not signed for Play Store distribution and has not been installed on a physical phone as part of repository CI.
