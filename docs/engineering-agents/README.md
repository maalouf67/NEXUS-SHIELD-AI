# NEXUS Engineering Agents — Policy Set

**Status:** Draft for review  
**System:** NEXUS Engineering Agents — 10-Agent Software Engineering System  
**Scope:** Software-engineering automation for the NEXUS SHIELD AI repository

This directory defines the governance and operating model for a future ten-agent software-engineering team. It supplements the repository's existing [Development Workflow](../DEVELOPMENT_WORKFLOW.md); it does not replace existing security, privacy, architecture, or release requirements.

## Documents

1. [Development Policy](DEVELOPMENT-POLICY.md) — current baseline, target controls, non-negotiable rules, and policy lifecycle.
2. [Agent Roles](AGENT-ROLES.md) — responsibilities, inputs, outputs, handoffs, and boundaries for the ten agents.
3. [Permissions and Security](PERMISSIONS.md) — least privilege, GitHub App access, path ownership, approval gates, and prohibited actions.
4. [GitHub Workflow](GITHUB-WORKFLOW.md) — Issues, labels, branches, pull requests, checks, review, and release flow.
5. [Implementation Roadmap](IMPLEMENTATION-ROADMAP.md) — staged rollout and acceptance criteria.

## Important status statement

These documents are a proposed policy baseline, not evidence that the ten agents, Temporal, NATS JetStream, new GitHub labels, branch protection rules, or automated approval gates have already been implemented. All such capabilities remain planned until the corresponding code, repository settings, and tests are reviewed and verified.

## Approval rule

The project owner retains final authority over policy adoption, changes to protected repository settings, merges to `main`, releases, and production deployments. This policy change is being prepared on a feature branch for review; it does not authorize merging or deployment.
