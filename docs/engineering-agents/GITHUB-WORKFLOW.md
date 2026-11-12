# NEXUS Engineering Agents — GitHub Workflow

**Status:** Draft target workflow

## 1. GitHub is the system of record

Use GitHub for durable, human-visible engineering artifacts:
- Issues for requests, user stories, bugs, and acceptance criteria;
- labels and milestones for routing and prioritization;
- branches and commits for implementation history;
- pull requests for review and decision records;
- checks and workflow runs for test evidence;
- releases for approved version history.

Use the orchestrator and, when implemented, the event bus for execution coordination. Do not use GitHub comments as a substitute for a reliable internal message queue.

## 2. Standard Issue body

Each implementation Issue should have these sections:

```markdown
## Problem
What is broken or missing?

## User story
As a [user], I want [capability], so that [outcome].

## Scope
- Included:
- Explicitly excluded:

## Acceptance criteria
- [ ] Verifiable criterion 1
- [ ] Verifiable criterion 2

## Technical context
- Affected services/files:
- API/data impact:
- Dependencies:

## Security and privacy
- Authentication/authorization:
- Tenant/data isolation:
- Secrets/logging:
- Threat/risk notes:

## Testing
- Unit:
- Integration:
- Regression/e2e:
- Security:

## Documentation and release
- Documentation to update:
- Migration/rollback:
```

The Planner must check for duplicate Issues before opening a new one. An Issue without measurable acceptance criteria is not Ready.

## 3. Proposed labels

These labels are a controlled vocabulary proposal. They must be checked against existing repository labels before creation to avoid duplicates or inconsistent spellings.

### Type
- `type:feature`
- `type:bug`
- `type:security`
- `type:docs`
- `type:refactor`
- `type:maintenance`

### Area
- `area:web`
- `area:api`
- `area:database`
- `area:ai`
- `area:android`
- `area:ci-cd`
- `area:architecture`

### Agent routing
- `agent:planner`
- `agent:architect`
- `agent:frontend`
- `agent:backend`
- `agent:reviewer`
- `agent:qa`
- `agent:security`
- `agent:devops`
- `agent:writer`
- `agent:release`

### Priority
- `priority:p0`
- `priority:p1`
- `priority:p2`
- `priority:p3`

### Workflow state
- `status:triage`
- `status:ready`
- `status:in-progress`
- `status:blocked`
- `status:in-review`
- `status:validating`

### Risk
- `risk:low`
- `risk:medium`
- `risk:high`
- `risk:critical`

Do not infer that a label creates authorization. Labels route and describe work; the policy engine independently validates permissions and approvals.

## 4. Issue state machine

Use the following logical states, mapped to GitHub Issue open/closed state and project fields:

`TRIAGE → READY → IN_PROGRESS → IN_REVIEW → VALIDATING → APPROVED → MERGED → RELEASED`

Additional paths:
- `BLOCKED`: waiting for an explicit dependency, decision, permission, or external service;
- `CHANGES_REQUESTED`: PR needs a new implementation iteration;
- `REJECTED`: request is declined with rationale;
- `CANCELLED`: work is stopped by an authorized owner.

GitHub's open/closed state alone is not sufficient to represent the entire lifecycle. Use Project fields or explicit status labels and retain links to the PR and workflow evidence.

## 5. Branch and commit conventions

Recommended branch pattern:

`agent/<agent-id>/issue-<number>-<short-slug>`

Examples:
- `agent/frontend/issue-123-account-settings`
- `agent/backend/issue-124-session-revocation`
- `agent/qa/issue-125-session-regression-tests`

If the branch already exists, the orchestrator must verify its owner, base commit, current head, and active task lock before reusing it.

Use focused commits with clear messages, for example:
- `feat(web): add account settings`
- `fix(api): reject cross-workspace access`
- `test(api): cover session revocation`
- `docs(agents): clarify review gates`

Do not force-push shared branches or overwrite another agent's unreviewed work.

## 6. Pull request requirements

A PR should include:
- linked Issue (`Closes #123` only when the PR fully satisfies it);
- concise summary and implementation rationale;
- files/components changed;
- API and database migration impact;
- test commands and exact outcomes;
- links to relevant CI and security runs;
- known limitations and checks not run;
- security/privacy review notes;
- rollback/recovery guidance for risky changes;
- documentation and screenshots where relevant.

Use draft PRs while implementation is incomplete. Mark ready for review only after acceptance criteria are met and the PR description is complete.

## 7. Review and validation gates

The orchestrator must select reviewers based on changed paths and risk.

Baseline gates:
1. Code Reviewer checks the diff and maintainability.
2. QA Agent verifies acceptance criteria and regression coverage.
3. Security Agent reviews sensitive changes and security findings.
4. GitHub Actions runs relevant build, tests, dependency and security workflows.
5. Documentation changes are checked for consistency with actual behavior.
6. Human owner approval is required for merge to `main`.

Not every PR needs a separate security review if policy and changed-path risk analysis show no security impact; authentication, authorization, workspace isolation, data handling, secrets, dependencies, workflows, and infrastructure changes do require it.

Failed or unavailable required checks block progression. Agents must not disable or weaken workflows to bypass a failure.

## 8. Parallel work and coordination

Parallel development is allowed only when:
- tasks have clear, non-overlapping file ownership;
- shared API/data contracts are agreed first;
- each agent has its own branch;
- dependencies are represented in linked Issues;
- the orchestrator prevents concurrent writes to the same file or resource.

When two tasks require the same file, serialize the work or assign one owner and ask other agents to provide review notes rather than competing commits.

## 9. Failure handling

On an implementation or test failure:
- attach the sanitized error and relevant workflow link to the Issue;
- classify whether the cause is code, test, infrastructure, credentials, or external dependency;
- route a fix to the responsible agent;
- preserve the failed run as evidence;
- re-run the required checks after the fix;
- do not close the Issue until its acceptance criteria are met.

Retries must be bounded and idempotent. Do not repeat non-idempotent GitHub writes without checking whether the prior request succeeded.

## 10. Release workflow

Release Agent may:
- collect merged PRs associated with a milestone;
- verify evidence and documentation;
- prepare release notes and a GitHub Release draft;
- report missing approvals or blockers.

Only the project owner may authorize publishing an official release, creating a production tag if protected by policy, or deploying to production.

The release note must not include unmerged work or claim unverified capabilities.
