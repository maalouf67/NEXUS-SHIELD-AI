from dataclasses import dataclass


@dataclass(frozen=True)
class TriageRequest:
    tenant_id: str
    task_id: str
    event_type: str
    source: str
    target: str
    details: str
    observed_at: str


@dataclass(frozen=True)
class TriageResult:
    tenant_id: str
    task_id: str
    agent_id: str
    classification: str
    risk_score: int
    evidence: tuple[str, ...]
    recommendations: tuple[str, ...]
    read_only: bool = True
