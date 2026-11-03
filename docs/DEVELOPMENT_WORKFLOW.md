# NEXUS SHIELD AI — Development Workflow

## Safe change process

1. Work on a dedicated feature branch; do not make routine development changes directly on `main`.
2. Inspect the existing files and project structure before editing. Prefer small, focused changes and avoid duplicate files or parallel implementations.
3. Check the relevant package scripts and runtime versions before changing dependencies or CI configuration.
4. Never commit API keys, passwords, tokens, private keys, or populated environment files. Use the documented environment-variable names and keep secret values in the deployment platform's secret manager.
5. Run the checks relevant to the files changed. Record any checks that could not be run and why; do not report unrun checks as passing.
6. Review the diff for unrelated edits, generated files, secrets, and claims that are not backed by implemented functionality.
7. Open a pull request for review before merging into `main`.

## Product-truth rule

NEXUS SHIELD AI is under active development. Documentation, dashboards, and release notes must distinguish implemented and verified functionality from prototypes, mock data, planned work, and unverified security capabilities. Never claim that a scan, detection, protection, integration, or test succeeded unless there is evidence from an actual run.
