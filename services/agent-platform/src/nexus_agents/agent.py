import re
from uuid import UUID

from nexus_agents.contracts import TriageRequest, TriageResult


RULES = (
    ("critical", 95, ("ransomware", "credential dump", "remote code execution", "data exfiltration", "command and control")),
    ("high", 75, ("privilege escalation", "brute force", "malware", "unauthorized login", "persistence")),
    ("medium", 45, ("port scan", "network scan", "suspicious login", "enumeration")),
)

RECOMMENDATIONS = {
    "critical": ("Escalate to the SOC incident lead.", "Preserve relevant logs and evidence.", "Request human authorization before containment."),
    "high": ("Correlate the event with trusted threat intelligence.", "Review affected identity and asset activity.", "Request analyst validation before response."),
    "medium": ("Correlate with adjacent events and known asset inventory.", "Monitor for repeated or escalating activity."),
    "low": ("Retain the event for correlation.", "Reassess if additional evidence arrives."),
}


def analyze(request: TriageRequest) -> TriageResult:
    """Deterministic, evidence-linked triage; no scanning or external action occurs."""
    try:
        UUID(request.tenant_id)
    except (ValueError, TypeError) as exc:
        raise ValueError("tenant_id must be a UUID") from exc
    if not re.fullmatch(r"[A-Za-z0-9._:-]{8,128}", request.task_id):
        raise ValueError("task_id must be 8-128 safe characters")
    for field_name in ("event_type", "source", "target", "details", "observed_at"):
        value = getattr(request, field_name)
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{field_name} is required")
        if len(value) > (4000 if field_name == "details" else 256):
            raise ValueError(f"{field_name} exceeds its maximum length")

    text = " ".join((request.event_type, request.details)).casefold()
    classification, score, matches = "low", 15, ()
    for level, points, indicators in RULES:
        found = tuple(term for term in indicators if term in text)
        if found:
            classification, score, matches = level, points, found
            break

    evidence = tuple(f"Matched supplied indicator: {term}" for term in matches)
    if not evidence:
        evidence = ("No configured high-risk indicator matched the submitted event text.",)
    return TriageResult(
        tenant_id=request.tenant_id,
        task_id=request.task_id,
        agent_id="nexus.security-triage.v1",
        classification=classification,
        risk_score=score,
        evidence=evidence,
        recommendations=RECOMMENDATIONS[classification],
    )
