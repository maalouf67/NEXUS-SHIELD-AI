# Trivy security scanning baseline

Audit snapshot: 2026-11-05.

The CI security workflow is designed to fail on HIGH or CRITICAL findings. It does not silently suppress unfixed findings.

## Automated coverage

The workflow at `.github/workflows/security.yml` runs:

1. **Repository filesystem scan** with Trivy scanners `vuln,misconfig,secret`. This covers dependency manifests/lockfiles, supported infrastructure/configuration files (including Dockerfiles and Compose files), and detectable plaintext secrets in the checked-out workspace.
2. **PostgreSQL runtime image scan** after building `database/Dockerfile.railway`.
3. **AI runtime image scan** after building `services/ai/Dockerfile`.
4. **ClamAV runtime image scan** against the exact Compose image reference `clamav/clamav:1.5.4`.
5. **Dependency Review** on pull requests, plus the existing `npm audit --audit-level=high` check in the build workflow.

The Trivy binary is explicitly pinned to `v0.76.1` under the existing `aquasecurity/trivy-action@v0.36.0` action. Filesystem and image gates select HIGH and CRITICAL severity and do not ignore unfixed findings. JSON reports are uploaded as workflow artifacts for 30 days where a scan produces an output file. The PostgreSQL container job also verifies the exact upstream `gosu` binary, runs the upstream project's pinned `govulncheck` source review, and tests PostgreSQL startup on a root-owned local Docker volume with the container runtime UID overridden to root. This local test is a Railway-volume compatibility preflight, not a live Railway test.

## Local reproduction

Run from the repository root with Docker and Trivy installed:

```bash
trivy fs --scanners vuln,misconfig,secret --severity HIGH,CRITICAL .
docker build --pull -f database/Dockerfile.railway -t nexus-postgres:local .
docker build --pull -f services/ai/Dockerfile -t nexus-ai:local .
docker pull clamav/clamav:1.5.4
trivy image --scanners vuln,misconfig,secret --severity HIGH,CRITICAL nexus-postgres:local
trivy image --scanners vuln,misconfig,secret --severity HIGH,CRITICAL nexus-ai:local
trivy image --scanners vuln,misconfig,secret --severity HIGH,CRITICAL clamav/clamav:1.5.4
```

A non-zero exit status is a finding requiring triage, remediation, or an explicit, documented risk decision. Do not add broad ignore rules just to make CI green. The official `tianon/gosu` 1.19 release embeds Go 1.24.6; its own SECURITY.md instructs consumers to use `govulncheck` to determine whether standard-library CVEs are reachable before rebuilding or declaring impact. NEXUS CI pins that source commit and uses the upstream review wrapper. Until this reachability check succeeds, the CVEs reported by Trivy remain unresolved findings; no blanket ignore or VEX exception is used.

## Known limits

- The image scans cover the images built or pulled by this workflow. They do not attest that the same digests are running in a cloud deployment.
- Filesystem scanning is static; it does not exercise the deployed application, public endpoints, cloud firewall, secrets manager, IAM configuration or database backups.
- A clean scan is not a penetration test, threat-model review, malware verdict, mobile MASVS attestation or proof that no vulnerability exists.
- The optional reverse-engineering and observability Compose profiles are repository configuration inputs to filesystem misconfiguration scanning; their optional runtime images are not automatically deployed or scanned as part of the production image set.
- Provider API keys, production database credentials and cloud settings are not available to CI. A missing credential must be reported as not configured, not as a successful live connection.
- Trivy findings must be read against the exact commit and scan report. A scan from an older commit is not evidence for a newer image or source tree.
