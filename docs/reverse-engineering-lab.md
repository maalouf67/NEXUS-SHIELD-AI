# NEXUS mobile reverse-engineering and analysis lab

## Scope and authorization

The lab is for defensive assessment of NEXUS builds, incident-response samples and applications for which NEXUS has written authorization to test. It is not a public upload service and must not be used to inspect or modify third-party apps without permission.

Never run unknown APK/IPA samples on a production phone, workstation account or production network. Use disposable emulators/VMs with snapshots, no production credentials, and controlled or disabled outbound networking. Treat every uploaded package and analysis report as potentially sensitive.

## Isolated MobSF service

The repository provides an optional MobSF v4.6.4 Docker service in a separate Compose file. It is not part of the normal production stack and binds only to host loopback at `127.0.0.1:8002`.

1. Copy `.env.example` to the local `.env` file.
2. Set unique `MOBSF_USERNAME` and a strong `MOBSF_PASSWORD`.
3. Create the protected local API-key file referenced by `MOBSF_API_KEY_FILE`; do not commit it:

```bash
mkdir -p .secrets
openssl rand -hex 32 > .secrets/mobsf-api-key
chmod 600 .secrets/mobsf-api-key
```

4. Start only the analysis service:

```bash
docker compose -f docker-compose.yml -f docker-compose.reverse-engineering.yml --profile reverse-engineering up -d mobsf
```

5. Open `http://127.0.0.1:8002` from the same host. Use the configured MobSF administrator credentials. Keep the MobSF API key in the local secret file; the container reads it through Docker Secrets.
6. Stop the lab when not in use:

```bash
docker compose -f docker-compose.yml -f docker-compose.reverse-engineering.yml --profile reverse-engineering stop mobsf
```

The MobSF data volume persists analysis data. Delete that volume only after confirming that no investigation evidence must be retained.

## Toolchain

| Tool | Purpose | Pin / deployment decision |
|---|---|---|
| MobSF | Static and controlled dynamic Android/iOS application assessment | Docker image `opensecurity/mobile-security-framework-mobsf:v4.6.4`; isolated sidecar |
| JADX | Decompile Android DEX/bytecode to Java-like source for review | MobSF v4.6.4 release notes cite JADX 1.5.6 |
| Apktool | Decode APK resources and Smali for authorized package review | Standalone analyst workstation tool; v3.0.3 |
| Frida | Authorized runtime instrumentation on disposable test devices/emulators | Analyst-controlled tool; v17.25.2 |
| Ghidra | Native library and firmware disassembly/decompilation | Offline analyst workstation; Ghidra 12.2; requires JDK 25 or newer |

Ghidra is a large desktop tool and is not installed inside the NEXUS API container or Android app. MobSF is run as a separate service rather than bundled into the proprietary mobile binary. Review the upstream MobSF GPL-3.0-only license and obtain legal review before redistribution or any tighter integration.

## Static analysis workflow

1. Build a signed test artifact from a known NEXUS commit.
2. Record the artifact SHA-256 before upload.
3. Submit only that artifact to the isolated MobSF service.
4. Review manifest/entitlements, permissions, exported components, network policy, embedded SDKs, cryptographic use and hard-coded secrets.
5. Export the report to a restricted evidence folder, redact personal data, and link it to the corresponding MASVS/MASTG control register.
6. Triage each finding manually and record false positives; do not translate a scanner score into a claim of certification.

## Dynamic analysis workflow

Dynamic analysis is manual and opt-in. Use a disposable, resettable emulator or authorized test device. Do not enable automatic installation or runtime testing of arbitrary user uploads. Test only the signed build and test account created for that assessment. Capture network traffic only in a controlled test environment, and do not intercept unrelated user traffic.

## Reporting requirements

Every report must include the artifact hash, MobSF/tool version, test environment, test date, reviewer, MASTG test references, finding severity, reproduction evidence, remediation owner and retest result. Do not store production credentials or personal data in the MobSF workspace.
