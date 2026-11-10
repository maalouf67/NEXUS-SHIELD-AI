from uuid import uuid4

import pytest

from nexus_agents.agent import analyze
from nexus_agents.contracts import TriageRequest
from nexus_agents.messaging import DUPLICATE_WINDOW_SECONDS, build_stream_config


def request(details: str) -> TriageRequest:
    return TriageRequest(str(uuid4()), "task-00000001", "security.alert", "sensor-a", "asset-1", details, "2026-11-10T12:00:00Z")


def test_critical_indicator_is_evidence_linked_and_read_only():
    result = analyze(request("Possible data exfiltration detected"))
    assert result.classification == "critical"
    assert result.risk_score == 95
    assert any("data exfiltration" in item for item in result.evidence)
    assert result.read_only is True


def test_unknown_event_is_low_and_does_not_invent_evidence():
    result = analyze(request("Routine service heartbeat"))
    assert result.classification == "low"
    assert result.risk_score == 15
    assert "No configured high-risk indicator" in result.evidence[0]


def test_invalid_tenant_is_rejected():
    req = TriageRequest("not-a-uuid", "task-00000001", "alert", "src", "dst", "test", "2026-11-10T12:00:00Z")
    with pytest.raises(ValueError, match="tenant_id"):
        analyze(req)


def test_task_id_reuse_shape_is_bounded():
    req = TriageRequest(str(uuid4()), "bad", "alert", "src", "dst", "test", "2026-11-10T12:00:00Z")
    with pytest.raises(ValueError, match="task_id"):
        analyze(req)


def test_jetstream_duplicate_window_uses_numeric_seconds():
    config = build_stream_config()
    assert config.duplicate_window == DUPLICATE_WINDOW_SECONDS
    assert isinstance(config.duplicate_window, (int, float))
    assert config.duplicate_window == 600
