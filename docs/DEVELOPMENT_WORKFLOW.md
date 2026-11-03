# NEXUS SHIELD AI — Development Workflow

## Safe change process

1. Work on a dedicated feature branch; do not make routine development changes directly on `main`.
2. Inspect the existing files and project structure before editing. Prefer small, focused changes and avoid duplicate files or parallel implementations.
3. Check package scripts, runtime versions, and dependency compatibility before changing dependencies or CI configuration.
4. Never commit API keys, passwords, tokens, private keys, populated environment files, or generated audit output that may contain sensitive data.
5. Run the checks relevant to the files changed. Record checks that could not be run and why; do not report unrun checks as passing.
6. Review the diff for unrelated edits, generated files, secrets, excessive permissions, and claims that are not backed by implemented functionality.
7. Open a pull request for review before merging into `main`. Merging and deployment require separate explicit approval.

## Product-truth rule

NEXUS SHIELD AI is under active development. Documentation, dashboards, and release notes must distinguish implemented and verified functionality from prototypes, mock data, planned work, and unverified security capabilities. Never claim that a scan, detection, protection, integration, or test succeeded unless there is evidence from an actual run.

## Security defaults

- Bind local development services to loopback unless external access is deliberately required.
- Keep database and administration ports bound to localhost for local development.
- Require strong secrets and never use a sample password as a working credential.
- Keep service-to-service tokens and AI provider keys on server-side environments only.
- Validate and bound untrusted request payloads before analysis.
- Keep graph analysis read-only unless a future response-action workflow has explicit authorization, audit logging, and human approval.

## Release boundary

A feature branch is not a production release. Do not deploy, publish, promote, or merge a release without separate, direct approval from the project owner.
