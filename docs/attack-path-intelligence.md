# Attack Path Intelligence

## Purpose

The attack path engine is a read-only graph traversal component for modeling possible asset-to-asset movement within NEXUS SHIELD AI. It is designed to identify plausible directed paths between assets using evidence-backed relationships, without inferring exploitability or probability of compromise.

The engine intentionally does not interpret a single network connection as proof that a path is exploitable. A directed edge represents a relationship in the graph, not an active exploit chain.

## Data contracts

The engine relies on strongly typed contracts defined in `services/api/src/attack-paths/contracts.ts`:

- `Asset`: describes a single asset with a stable identifier, type, name, description, and evidence references.
- `AssetRelationship`: describes a directed relationship between two assets, including a relationship type and evidence references.
- `EvidenceReference`: records the source, evidence status, and timestamp for each assertion.
- `AnalysisInput`: contains the graph inputs, traversal limits, and optional start/target constraints.
- `AnalysisOutput`: returns discovered paths and validation warnings.
- `ValidationWarning`: captures incomplete, stale, missing, or unverified data.

Each asset and relationship must carry traceable evidence references. Evidence can be `verified`, `unverified`, `stale`, or `missing`.

## Evidence requirements

Evidence is treated as untrusted and must be validated before it is used to support a path.

Required evidence characteristics:

- A stable `id`.
- A human-readable `source` name.
- A clear `status` such as `verified`, `unverified`, `stale`, or `missing`.
- A `recordedAt` timestamp for traceability.
- Optional notes to explain why the evidence matters.

If a relationship has no evidence, a path may still be explored but the engine will surface a warning. This keeps the graph explicit about incomplete or weakly supported relationships.

## Traversal limits

The engine enforces the following safety bounds:

- `maxDepth`: maximum number of directed edges allowed in a path.
- `maxPaths`: maximum number of returned paths.
- Cycle detection: revisiting an asset along the active path stops traversal.
- Duplicate relationship handling: repeated edges are collapsed to a single traversal candidate.
- Missing asset reference detection: dangling relationships are flagged and excluded from traversal.

The default depth and path caps are intentionally conservative to keep traversal deterministic and reviewable.

## Known limitations

- This is a foundation engine only; it does not compute risk scores or exploitability.
- It does not evaluate live connectivity, scanning results, or external telemetry.
- It does not execute code or modify remote systems.
- It is read-only and deterministic by design.
- It does not infer privilege, exploitability, or weaponization from a single connection or relationship.

## Why this is only a potential attack path

A discovered path is a plausible route through asset relationships, not proof that an attacker can execute a compromise.

The engine does not claim probability of compromise. It only surfaces a directed, evidence-aware graph traversal. Human analysts must still verify business context, controls, trust boundaries, and operational reality before treating a path as actionable.

This preserves a strict boundary between graph reasoning and real-world exploitation assessment.
