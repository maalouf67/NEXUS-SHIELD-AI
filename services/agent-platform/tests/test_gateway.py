from datetime import datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from nexus_agents.contracts import TriageResult
from nexus_agents.gateway import create_app


TOKEN = "nexus-agent-gateway-test-token-32-characters-min"


def payload(tenant_id: str | None = None) -> dict:
    return {
        "tenant_id": tenant_id or str(uuid4()),
        "task_id": "gateway-test-0001",
        "event_type": "security.alert",
        "source": "api-test",
        "target": "asset-01",
        "details": "Possible data exfiltration detected",
        "observed_at": datetime.now(timezone.utc).isoformat(),
    }


def test_gateway_rejects_missing_internal_token(monkeypatch):
    monkeypatch.setenv("NEXUS_AGENT_PLATFORM_TOKEN", TOKEN)
    client = TestClient(create_app(lambda _request: None))
    response = client.post("/v1/triage", json=payload())
    assert response.status_code == 401


def test_gateway_rejects_wrong_internal_token(monkeypatch):
    monkeypatch.setenv("NEXUS_AGENT_PLATFORM_TOKEN", TOKEN)
    client = TestClient(create_app(lambda _request: None))
    response = client.post(
        "/v1/triage",
        headers={"Authorization": "Bearer wrong-token"},
        json=payload(),
    )
    assert response.status_code == 401


def test_gateway_fails_closed_when_secret_is_not_configured(monkeypatch):
    monkeypatch.delenv("NEXUS_AGENT_PLATFORM_TOKEN", raising=False)
    client = TestClient(create_app(lambda _request: None))
    response = client.post(
        "/v1/triage",
        headers={"Authorization": f"Bearer {TOKEN}"},
        json=payload(),
    )
    assert response.status_code == 503


def test_gateway_passes_tenant_from_authenticated_internal_caller_to_workflow(monkeypatch):
    monkeypatch.setenv("NEXUS_AGENT_PLATFORM_TOKEN", TOKEN)
    expected_tenant = str(uuid4())
    captured = []

    async def submit(request):
        captured.append(request)
        return TriageResult(
            tenant_id=request.tenant_id,
            task_id=request.task_id,
            agent_id="nexus.security-triage.v1",
            classification="critical",
            risk_score=95,
            evidence=("Matched supplied indicator: data exfiltration",),
            recommendations=("Escalate to the SOC incident lead.",),
        )

    client = TestClient(create_app(submit))
    response = client.post(
        "/v1/triage",
        headers={"Authorization": f"Bearer {TOKEN}"},
        json=payload(expected_tenant),
    )

    assert response.status_code == 200, response.text
    assert response.json()["tenant_id"] == expected_tenant
    assert response.json()["classification"] == "critical"
    assert captured[0].tenant_id == expected_tenant
    assert captured[0].task_id == "gateway-test-0001"


def test_gateway_rejects_unknown_fields(monkeypatch):
    monkeypatch.setenv("NEXUS_AGENT_PLATFORM_TOKEN", TOKEN)
    request = payload()
    request["unexpected"] = "must-not-be-accepted"
    client = TestClient(create_app(lambda _request: None))
    response = client.post(
        "/v1/triage",
        headers={"Authorization": f"Bearer {TOKEN}"},
        json=request,
    )
    assert response.status_code == 422
