# Vendored gosu source provenance

- Upstream project: https://github.com/tianon/gosu
- Upstream release/tag: 1.20
- Pinned commit: 29b939aa5bd4dc588af765b8248f6e39150d2565
- Source files in this directory are copied verbatim from that commit: main.go, setup-user.go, version.go, go.mod, go.sum, LICENSE.
- The PostgreSQL image builds this source with Go 1.27.3 instead of shipping the upstream release binary compiled with Go 1.24.6. The source's pinned dependency `github.com/moby/sys/user v0.4.1` fixes CVE-2026-61801; the newer Go compiler provides patched standard-library code.
- No source-code behavior changes are intended. The security workflow compares the vendored files with the pinned upstream checkout and runs govulncheck on that source.
