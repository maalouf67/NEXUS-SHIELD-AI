# NEXUS SHIELD AI — Software Supply-Chain Evidence

## Purpose

This control adds a repeatable software bill of materials (SBOM) and signed source-build evidence to the existing CI security controls. It complements, and does not replace, Trivy, Dependency Review, CodeQL, or Dependabot.

## Automated workflow

Workflow: `.github/workflows/supply-chain.yml`

On pushes to `main` and `feat/**`, pull requests targeting `main` or `feat/**`, and manual dispatch, the workflow:

1. Installs **Anchore Syft v1.55.0** from its upstream Linux x86_64 release archive and verifies the published SHA-256 checksum before execution.
2. Builds the repository's PostgreSQL image from `database/Dockerfile.railway` and AI image from `services/ai/Dockerfile`, then pulls the exact ClamAV image reference already used by the Compose security workflow (`clamav/clamav:1.5.4`).
3. Generates both **SPDX JSON** and **CycloneDX JSON** inventories for the repository source tree, PostgreSQL image, AI image, and ClamAV image.
4. Validates that the generated documents have the expected format fields and writes a SHA-256 manifest.
5. Uploads the SBOMs, source archive, and checksum manifest as the `nexus-supply-chain-evidence` workflow artifact with 30-day retention.

The Syft version is pinned to v1.55.0; the workflow checks the downloaded archive against the upstream release SHA-256:
`bb65249542db5fedeeb4d3f9b018b75e7264dbfbbb10486f044581a92f90490d`.

## Signed attestation

For trusted push and manual workflow runs (not pull-request event runs), GitHub Actions also uses `actions/attest@v4.2.2` to create a signed SBOM attestation for the exact Git source archive generated from `GITHUB_SHA`. The workflow grants only the permissions needed for this operation: `contents: read`, `id-token: write`, and `attestations: write`.

The attestation uses GitHub's OIDC identity and Sigstore-backed signing. It does not require a long-lived private signing key in repository secrets. The workflow immediately verifies the SPDX attestation with GitHub CLI before uploading the evidence.

Verification command after downloading `nexus-source.tar.gz` and its SBOM:

```bash
gh attestation verify nexus-source.tar.gz \
  --repo maalouf67/NEXUS-SHIELD-AI \
  --predicate-type https://spdx.dev/Document/v2.3
```

Verify the downloaded checksums from the artifact root:

```bash
sha256sum --check nexus-sbom/SHA256SUMS
```

## Deliberate boundaries

- The workflow **does not publish or deploy images** and does not modify production services.
- The PostgreSQL, AI, and ClamAV SBOMs describe the exact local image references inspected by this CI run. They are downloadable inventory artifacts, not attestations that those images are running in production.
- The signed SBOM attestation currently covers the Git source archive. Container-image signing with Cosign is deferred until NEXUS has a selected registry, immutable image-digest promotion flow, and explicit publication policy. Signing an unpushed local tag would not prove which image is deployed.
- A successful SBOM job is evidence that inventory generation completed for that commit and scan target. It is not proof that the inventory is vulnerability-free or that all runtime/cloud dependencies were discovered.
- The workflow does not change the existing HIGH/CRITICAL Trivy gate, npm audit, Dependency Review, CodeQL, or weekly Dependabot schedules.

## Local reproduction

Install the same Syft release, then run from the repository root:

```bash
syft dir:. -o spdx-json=nexus-source.spdx.json -o cyclonedx-json=nexus-source.cdx.json
docker build --pull -f database/Dockerfile.railway -t nexus-postgres:ci .
docker build --pull -f services/ai/Dockerfile -t nexus-ai:ci .
docker pull clamav/clamav:1.5.4
syft nexus-postgres:ci -o spdx-json=nexus-postgres.spdx.json -o cyclonedx-json=nexus-postgres.cdx.json
syft nexus-ai:ci -o spdx-json=nexus-ai.spdx.json -o cyclonedx-json=nexus-ai.cdx.json
syft clamav/clamav:1.5.4 -o spdx-json=clamav.spdx.json -o cyclonedx-json=clamav.cdx.json
```

Do not treat a prior run's SBOM as current evidence for a later commit or a newly built image.
