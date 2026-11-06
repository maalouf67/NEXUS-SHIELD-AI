# Trivy security scanning baseline

Audit snapshot: 2026-11-06.

The CI security workflow is designed to fail on HIGH or CRITICAL findings. It does not silently suppress unfixed findings.

## Automated coverage

The workflow at `.github/workflows/security.yml` runs:

1. **Repository filesystem scan** with Trivy scanners `vuln,misconfig,secret`. This covers dependency manifests/lockfiles, supported infrastructure/configuration files (including Dockerfiles and Compose files), and detectable plaintext secrets in the checked-out workspace.
2. **PostgreSQL runtime image scan** after building `database/Dockerfile.railway`.
3. **AI runtime image scan** after building `services/ai/Dockerfile`.
4. **ClamAV runtime image scan** against the exact Compose image reference `clamav/clamav:1.5.4`.
5. **Dependency Review** on pull requests, plus the existing `npm audit --audit-level=high` check in the build workflow.

The Trivy binary is explicitly pinned to `v0.76.1` under the existing `aquasecurity/trivy-action@v0.36.0` action. Filesystem and image gates select HIGH and CRITICAL severity and do not ignore unfixed findings. JSON reports are uploaded as workflow artifacts for 30 days where a scan produces an output file. The PostgreSQL container job also verifies the exact upstream `gosu` binary, runs the upstream project's pinned `govulncheck` source review, and tests PostgreSQL startup on a root-owned local Docker volume with the container runtime UID overridden to root. This local test is a Railway-volume compatibility preflight, not a live Railway test.

## Latest verified scan evidence — 2026-11-06

On PR #26 code commit `80fd6792d8bbc5f3197749bd40c33441fe509f76`, Security Checks run #338 completed successfully with Trivy v0.76.1.

- Filesystem scan artifact: `trivy-filesystem-report`; Trivy inspected the repository manifests, lockfiles, supported Docker/Compose configuration and detectable secrets in scope. The two Dockerfiles each reported 20 successful misconfiguration checks and zero failed checks.
- Runtime image artifact: `trivy-container-image-reports`; the PostgreSQL, NEXUS AI and ClamAV image reports contained no findings in the configured HIGH/CRITICAL result scope.
- The workflow uses `ignore-unfixed: false` and fails on HIGH/CRITICAL findings. The downloaded reports are evidence for this commit and scan scope only.
- Dockerfile filesystem/misconfiguration reports are not a full configuration audit. A clean result is not a statement that there are no LOW/MEDIUM findings or no runtime/cloud vulnerabilities.
- The workflow also verified gosu 1.20 upstream source parity, the binary privilege drop, the pinned `govulncheck` source review and PostgreSQL startup on a root-owned local Docker volume.

The CI result is not a live Railway scan or deployment attestation. Re-run the checks for every subsequent code change and scan the exact immutable digests promoted to production.

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

A non-zero exit status is a finding requiring triage, remediation, or an explicit, documented risk decision. Do not add broad ignore rules just to make CI green. The Railway PostgreSQL image now builds the pinned upstream `tianon/gosu` 1.20 source commit `29b939aa5bd4dc588af765b8248f6e39150d2565` with Go 1.27.3 instead of inheriting the older base-image binary. CI compares the vendored files byte-for-byte with that upstream commit, verifies the resulting binary version and privilege drop, and runs the upstream `govulncheck` wrapper. The pinned source dependency `github.com/moby/sys/user` is v0.4.1, which fixes CVE-2026-61801; the upstream-source check passed in Security Checks run #338. This is an evidence-backed source/toolchain update, not a blanket CVE suppression. No broad ignore rule or blanket VEX exception is used.

## Known limits

- The image scans cover the images built or pulled by this workflow. They do not attest that the same digests are running in a cloud deployment.
- Filesystem scanning is static; it does not exercise the deployed application, public endpoints, cloud firewall, secrets manager, IAM configuration or database backups.
- A clean scan is not a penetration test, threat-model review, malware verdict, mobile MASVS attestation or proof that no vulnerability exists.
- The optional reverse-engineering and observability Compose profiles are repository configuration inputs to filesystem misconfiguration scanning; their optional runtime images are not automatically deployed or scanned as part of the production image set.
- Provider API keys, production database credentials and cloud settings are not available to CI. A missing credential must be reported as not configured, not as a successful live connection.
- Trivy findings must be read against the exact commit and scan report. A scan from an older commit is not evidence for a newer image or source tree.
