# GitHub Copilot instructions for NEXUS SHIELD AI

Before planning, editing, reviewing, or running commands, read the root `AGENTS.md` file and follow it as the repository-wide source of engineering and security rules.

Key constraints:
- Work on the supplied feature branch; never commit directly to `main`, merge, force-push, or deploy without explicit owner authorization.
- Inspect existing code, tests, package scripts, and working-tree changes before editing. Make the smallest coherent diff.
- Preserve the monorepo structure and reuse existing services and adapters. Do not invent production data or claim unverified capabilities.
- Keep secrets and customer/security data out of source, prompts, logs, comments, browser/mobile bundles, and external tools.
- Enforce server-side authentication, authorization, and tenant ownership. Add failure-path and cross-tenant tests for security-sensitive changes.
- Keep AI tool access read-only by default and require human approval for containment, destructive actions, account/session changes, or production configuration.
- Do not replace the native Android security service with React Native without a tested migration plan. Treat the React Native work in Draft PR #14 as separate until it is reviewed and merged.
- Run relevant repository CI scripts and report actual results; do not claim unrun tests or production verification.
