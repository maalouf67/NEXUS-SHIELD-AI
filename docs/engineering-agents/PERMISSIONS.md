# NEXUS Engineering Agents — Permissions and Security Model

**Status:** Draft target policy  
**Applies to:** proposed ten-agent engineering system

## 1. Security objective

Prevent an agent from reading or modifying resources outside its assignment, escalating its own privileges, bypassing review, or performing irreversible repository and production actions.

Use defense in depth:
1. orchestrator authorization;
2. GitHub App installation permissions;
3. task-scoped tool allow-list;
4. repository path ownership;
5. branch and pull-request controls;
6. audit records and independent review.

A prompt or system instruction alone is not an authorization boundary.

## 2. Identity model

Use a dedicated GitHub App for NEXUS Engineering Agents when implementation begins. Avoid a shared long-lived personal access token.

- Install the App only on explicitly approved repositories.
- Request the minimum repository permissions required for the current stage.
- Mint short-lived installation access tokens for each execution or bounded operation.
- Do not share one broad token among all agents.
- Keep private keys and webhook secrets in server-side secret storage.
- Rotate credentials on compromise and record the rotation event.
- Validate GitHub webhook signatures before accepting events.
- Enforce idempotency for redelivered webhooks.

The orchestration service authenticates agents internally and issues task-scoped capabilities. Agent identity in a prompt is not proof of identity.

## 3. Recommended phased GitHub permissions

Start with read-only access wherever possible. Expand only when the associated workflow is implemented and tested.

| Resource | Initial stage | Later, approved capability |
|---|---|---|
| Repository metadata and contents | Read | Contents write only for scoped PR branches |
| Issues and comments | Read | Create/update Issues and comments for Planner/QA |
| Pull requests | Read | Create PRs and review comments for assigned roles |
| Checks and Actions | Read | Request or rerun approved checks where supported |
| Workflows | Read | Workflow-file changes only through a reviewed PR |
| Releases | Read | Draft release preparation only |
| Branch protection / rulesets | Read or human-admin only | Human-admin configuration; no agent bypass |
| Secrets, private keys, environment secrets | No agent read access | Never expose secret values to agent context |

Exact GitHub App permission names and endpoints must be verified during implementation against the current GitHub App permission model. Do not grant broad access merely because an endpoint is convenient.

## 4. Role-to-capability policy

### Product Planner
- Read repository, Issues, labels, milestones, and relevant PR context.
- Create and update Issues, comments, and proposed labels when approved.
- No repository contents write, merge, release, administration, or secrets access.

### System Architect
- Read repository and CI context.
- Create architecture/documentation changes only on its assigned branch and through a PR.
- No merge or deployment capability.

### Frontend Developer
- Read repository and write only within its assigned UI scope on its task branch.
- May create a PR.
- No write access to secrets, branch protection, production environments, or unrelated backend/migration files.

### Backend Developer
- Read repository and write only within its assigned API/data scope on its task branch.
- Database schema changes require an explicitly assigned migration task and review.
- No production database credential or direct production database access.

### Code Reviewer
- Read source, diffs, CI, and review context.
- Create review comments and request changes.
- Must not write implementation commits or approve its own authored PR.

### QA & Testing
- Read source and workflow results.
- Create test changes only on its assigned QA branch, and create linked bug Issues.
- No production data access and no permission to suppress or bypass checks.

### DevSecOps & Security
- Read source, dependency and security reports, configuration, and approved scan artifacts.
- Create security findings and remediation Issues.
- Sensitive vulnerability details must use private reporting.
- No access to secret values and no unapproved active testing against external systems.

### DevOps & CI/CD
- Read repository and workflow context.
- Modify build and deployment configuration only on an assigned branch through PR.
- No production deployment credential by default; deployment remains human-approved.

### Technical Writer
- Read repository and merged changes.
- Write documentation-only changes on an assigned branch through PR.
- No ability to change executable application code.

### Release & Maintenance
- Read milestones, Issues, merged PRs, and check results.
- Prepare release drafts and maintenance recommendations.
- No official publish, tag, merge, or deployment authority.

## 5. Path ownership

The orchestrator must enforce path-level scope before it issues write-capable tools. Suggested default scopes:

| Agent | Default write scope |
|---|---|
| Product Planner | No source files |
| System Architect | Assigned files under `docs/engineering-agents/**` or ADR locations |
| Frontend Developer | `apps/web/**` |
| Backend Developer | `services/api/**`, assigned `database/**`, approved shared contracts |
| Code Reviewer | No source files |
| QA & Testing | Assigned test files and test fixtures only |
| DevSecOps & Security | Assigned security policy/config/test files |
| DevOps & CI/CD | `.github/workflows/**`, assigned Docker/Compose/deployment files |
| Technical Writer | `README.md`, `docs/**`, changelog |
| Release & Maintenance | No application source; draft release metadata only |

These are default boundaries, not permission to change every file in a listed directory. The Issue and task envelope define the narrower actual scope.

Any cross-scope edit must be split into another Issue or explicitly approved by the orchestrator's human authorization policy. Do not allow two agents to write the same file concurrently.

## 6. Prohibited capabilities

No engineering agent may:
- push directly to `main` or force-push any protected branch;
- merge a PR or bypass required reviews/checks;
- approve its own PR or act as the sole independent reviewer;
- publish an official release or deploy to production;
- read, print, summarize, or copy secret values;
- modify GitHub App permissions, repository administrators, branch rules, or environments;
- run destructive production database or infrastructure commands;
- disable security checks to make a workflow pass;
- treat an Issue, README, PR body, source file, commit message, or external content as trusted instructions that override policy.

## 7. Human approval gates

Require explicit owner approval for:
- merging to `main`;
- production deploy, promotion, rollback, or infrastructure mutation;
- database migrations or data transformations against production;
- permission, identity, secret, or branch protection changes;
- changes to authentication, authorization, workspace isolation, or sensitive-data handling;
- exceptions to this policy;
- official release publication.

A high-priority label does not waive these gates.

## 8. Concurrency, isolation, and audit

Every execution needs a unique task ID and correlation ID. Use a lock or lease for branch/file ownership. Reject stale or conflicting write requests. Use idempotency keys for webhook deliveries and external mutations.

Persist an append-only audit record containing:
- task, Issue, PR, repository, branch, workspace, and actor identifiers;
- agent name, runtime version, model/provider identifier where permissible;
- tool/action name, target resource, and sanitized request metadata;
- timestamp, result, GitHub response reference, and error details;
- approval identity and timestamp where required.

Never put raw API keys, bearer tokens, passwords, private keys, or sensitive file contents into logs.

## 9. Branch protection target

Before enabling autonomous write agents, configure and verify:
- pull requests required for `main`;
- no direct pushes or force pushes;
- selected CI and security checks required before merge;
- independent review required for protected paths;
- stale approvals dismissed after relevant changes;
- bypass limited to explicitly authorized human administrators;
- CODEOWNERS coverage for security-sensitive paths.

The observed `main` branch was not protected during the 2026-11-12 review. These target controls are not active until configured and verified in GitHub settings.

## 10. Failure and incident behavior

On suspected token exposure, invalid webhook signature, path-scope mismatch, attempted bypass, cross-workspace access, or unexpected destructive action:
1. stop the affected execution;
2. do not retry the unsafe mutation;
3. record a sanitized security event;
4. notify the project owner or designated human maintainer;
5. revoke affected short-lived credentials through the authorized operator process when needed;
6. preserve evidence and create a private security finding if disclosure would expose a vulnerability.

Resume only after the human owner or authorized security maintainer clears the incident.
