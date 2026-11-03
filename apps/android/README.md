# NEXUS SHIELD Mobile — Android foundation

This is the first native Android companion module for the NEXUS SHIELD AI project.

## Current scope

- Sign in against the configured NEXUS API over HTTPS.
- Keep the short-lived bearer token in memory only (no password/token is persisted).
- Pick one file through Android's Storage Access Framework; the app does not request broad storage access.
- Submit the chosen file to the authenticated web scanner route (100 MiB maximum).
- View the signed-in user's PostgreSQL-backed scan history.

## Important security boundaries

The Android companion provides two separate, user-controlled functions:

- **On-demand file scanning:** the user explicitly selects a file and submits it to the authenticated NEXUS scanner.
- **DNS-only protection preview:** after an in-app privacy disclosure and Android's VPN consent dialog, a foreground `VpnService` routes IPv4 UDP DNS requests addressed to its local resolver through a local TUN interface. It forwards those queries to Quad9 Secure DNS using DNS-over-TLS (`dns.quad9.net:853`). Quad9 documents its 9.9.9.9 service as threat-blocking and DNSSEC-validating.

The DNS VPN is deliberately narrow. It does **not** route all device traffic through NEXUS, inspect HTTPS contents, inspect other apps' private files, or guarantee coverage of apps that use custom DNS, DNS-over-HTTPS, Android Private DNS, IPv6 DNS, or DNS-over-TCP. The first implementation parses IPv4/UDP DNS packets only. When Quad9 cannot be reached, the service returns DNS SERVFAIL and does not fall back to plaintext DNS.

Before enabling it, the app tells the user that DNS query names are sent to Quad9. NEXUS stores only a request counter and service status, not the queried domain names. A persistent Android VPN notification remains visible while the service runs. The service is manually started/stopped and explicitly opts out of Android's Always-on VPN setting until device-level reliability and restart behavior have been validated.

This is not a complete device-wide antivirus or a full-packet VPN. An iOS companion requires a separate implementation using Apple's applicable Network Extension APIs and entitlements; it is not implemented yet.

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

The debug APK is a development artifact only. It is not signed for Play Store distribution and has not been installed on a physical phone as part of repository CI. CI runs local IPv4/UDP DNS packet-codec unit tests; it does not prove real-device VPN routing, Quad9 reachability, Private DNS interaction, battery use, or coverage on every Android version.
