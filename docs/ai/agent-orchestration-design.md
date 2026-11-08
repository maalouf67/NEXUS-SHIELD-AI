# NEXUS SHIELD AI — 6+1 Agent Orchestration Design

**Status:** architecture proposal only; no autonomous agent runtime is implemented by this document.  
**Base:** `main` at `94fa25ca51f1e1628987babed03896cd1304948b`.  
**Purpose:** evolve the current provider-based triage/classification orchestrator into bounded, auditable specialist workflows while preserving tenant isolation and human authority.

## 1. Verified implementation baseline

- `services/api/src/ai/orchestrator.ts` currently accepts only `triage` and `classification`, selects an available provider, and performs a bounded provider fallback chain.
- `provider-registry.ts` currently returns only the OpenAI provider when `OPENAI_API_KEY` is configured. Anthropic, Gemini and DeepSeek names exist in the type contract, but provider implementation/configuration is not proven by that registry.
- `AIRequest` has fields for `tenantId`, `userId`, `requireHumanApproval`, task, complexity/risk, context and tool names; those fields alone do not constitute tenant enforcement, approval workflow, tool sandboxing, or an agent runtime.
- AI service `services/ai` is a malware file scanning service with FastAPI/ClamAV boundaries, not the LLM multi-agent service.
- Existing SOC event API is workspace-bound using workspace integration credentials/permissions; any agent/SOC connector must preserve this contract.
- Current AI results are advisory. No evidence supports a claim that six independent specialist agents or a central 6+1 orchestrator are production-enabled.

## 2. Proposed agent roles (6 specialists + 1 orchestrator)

1. **Threat Intelligence Analyst** — normalize submitted indicators, annotate confidence/source freshness, identify likely known patterns. No live feed is assumed until a provider/source is configured and tested.
2. **Attack Path Analyst** — analyze workspace-scoped asset relationships/evidence and rank plausible paths. Must cite internal evidence IDs; do not assert exploitability from topology alone.
3. **Vulnerability Assessment Analyst** — summarize authorized scanner findings, prioritize by severity/exposure/evidence; it must not initiate scanning or exploit testing itself.
4. **Incident Investigation Analyst** — correlate workspace incidents, alerts and normalized events; propose timelines/hypotheses and distinguish observed facts from inference.
5. **Network Security Analyst** — interpret normalized flow/security-event telemetry and the safe Rust detector output. No packet capture, host firewall changes or nftables application in the agent runtime.
6. **Defense Recommendation Analyst** — produce mitigations, rollback considerations, risk/impact and verification steps. Recommendations are advisory unless separately approved.
7. **NEXUS Central Orchestrator** — validates task/schema/tenant scope, routes bounded specialist calls, deduplicates/correlates evidence, records lineage, applies policy gates, and returns an assembled report with unresolved uncertainty.

## 3. Orchestration flow

`authenticated request → tenant/workspace authorization → request minimization → task classification → specialist plan → bounded parallel/serial execution → evidence validation → cross-agent consistency checks → human approval gate for sensitive actions → audit/usage record → report`

The orchestrator must:
- Derive workspace/user identity from verified request middleware; never trust a tenant ID supplied solely in prompt/context.
- Load data through existing workspace-scoped repositories and approved read-only tool adapters; every query carries the authorized workspace scope.
- Give specialists only the minimum context needed. Avoid passing entire tenant datasets or secrets in prompts.
- Use typed JSON schemas per specialist output: observations, evidence references, confidence, assumptions, recommended next steps, and limitations.
- Set explicit limits: maximum agent count, depth, retries, timeout, token budget, parallelism, payload size and per-tenant rate/cost budget.
- Treat retrieved documents, event payloads, user prompts and tool outputs as untrusted data, never as instructions to bypass system policy.
- Block tool execution from generated text; tool calls must be allow-listed, schema-validated, authorized and auditable.
- Record agent/model/version, tenant/workspace, task, evidence IDs, timestamps, usage/cost, status and policy decision. Do not log raw credentials or unnecessary personal data.

## 4. Tool permissions and action policy

| Tool class | Default permission | Required controls |
|---|---|---|
| Read incident/alert/event/asset data | Allow only for authorized workspace role | Server-side scope, read-only queries, audit |
| Public or approved threat-intel lookup | Disabled until source is configured | Provider allowlist, data minimization, attribution, rate limit |
| Reputation lookup (IP/phone) | Explicit feature action only | User consent/notice, configured provider, redaction, scoped audit |
| Create/update SOC incident or alert | Human approval required | Preview diff, actor/tenant validation, idempotency, audit |
| Scan files or launch authorized assessment | Explicit user action and policy gate | Ownership, size/rate bounds, isolated service, consent/authorization |
| Firewall policy preview | Read-only preview allowed | Schema validation, display candidate rules and rollback plan |
| Apply firewall/containment, block IP, disable account, erase data | **Denied by default** | Separate privileged service, explicit approval, two-person approval for high-impact actions, expiry, rollback, verified post-action state |

AI never bypasses role authorization, workspace membership, legal hold, rate limits or human approval. High-risk/critical tasks require human review and cannot be automatically approved by another model.

## 5. Reliability, evidence and evaluation

- Require each factual claim to link to a source record, tool result, or external citation with source timestamp. Label model inference separately.
- If evidence is missing, stale, contradictory, or tenant-scope cannot be established, return an explicit unavailable/uncertain result instead of filling gaps.
- Provider fallback must preserve policy, region, data-retention and task capability requirements; do not silently route sensitive tenant data to a different provider.
- Use a versioned eval set with synthetic and redacted scenarios: cross-tenant leakage attempts, prompt injection in event descriptions, false-positive threat signals, incomplete evidence, conflicting specialists, malicious tool arguments, high-risk action refusal, provider outage, timeouts and budget exhaustion.
- Track precision/recall for validated classifications, evidence citation completeness, unsupported-claim rate, cross-tenant denial tests, latency, cost per task, fallback rate, policy refusal correctness and human override outcomes.
- Do not use real customer data for evaluations unless separately authorized and governed.

## 6. Implementation stages and release gates

1. **Contracts:** define typed specialist input/output, evidence model, workspace-scoped tool contract and policy decision types.
2. **Read-only prototype:** implement one specialist at a time over current scoped repositories; use synthetic fixtures and deterministic tests.
3. **Central orchestrator:** add bounded plan/execute/assemble flow, cancellation, timeouts, usage accounting and audit records.
4. **Security validation:** adversarial prompt-injection, cross-tenant tests, output schema fuzzing, tool authorization tests, provider failure handling and data minimization review.
5. **Human review UI:** expose evidence, confidence, assumptions, proposed changes and approval/rejection with authenticated reviewer identity.
6. **Provider expansion:** add each model adapter separately; verify capability, credentials, contractual retention and data region before activation.
7. **Production gate:** independent security review, tenant isolation CI, privacy/legal review, runtime observability and explicit deployment approval.

## 7. SOC and agent dependency

The Rust firewall PR #31 currently sends an older global ingestion header. Current main's workspace integration contract uses a workspace-bound integration credential with `events:write`. Adapt the connector and test revoked/no-permission/cross-workspace denial before any SOC ingestion is represented as connected. The Rust component remains detection and policy-preview only; it must not execute firewall rules in this agent phase.

**Non-goals:** no autonomous containment, exploitation, packet capture, firewall mutation, account erasure, or production deployment in this architecture phase.
