import asyncio
import hmac
import os
from dataclasses import asdict
from datetime import datetime, timedelta
from typing import Awaitable, Callable
from uuid import UUID

from fastapi import FastAPI, Header, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from temporalio.client import Client

from nexus_agents.contracts import TriageRequest, TriageResult
from nexus_agents.workflows import SecurityTriageWorkflow
from nexus_agents.orchestrator import build_execution_plan
from nexus_agents.registry import SECURITY_TRIAGE_AGENT_ID, SECURITY_TRIAGE_CAPABILITY

TASK_QUEUE = "nexus-agent-foundation"


class GatewayTriageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    tenant_id: UUID
    task_id: str = Field(min_length=8, max_length=128, pattern=r"^[A-Za-z0-9._:-]+$")
    event_type: str = Field(min_length=1, max_length=256)
    source: str = Field(min_length=1, max_length=256)
    target: str = Field(min_length=1, max_length=256)
    details: str = Field(min_length=1, max_length=4000)
    observed_at: datetime


class TemporalSubmitter:
    """Lazily keep one Temporal client per gateway process."""

    def __init__(self) -> None:
        self._client: Client | None = None
        self._lock = asyncio.Lock()

    async def __call__(self, request: TriageRequest) -> TriageResult:
        plan = build_execution_plan(
            agent_id=SECURITY_TRIAGE_AGENT_ID,
            capability=SECURITY_TRIAGE_CAPABILITY,
            tenant_id=request.tenant_id,
            task_id=request.task_id,
        )
        async with self._lock:
            if self._client is None:
                address = os.getenv("TEMPORAL_ADDRESS", "temporal:7233")
                self._client = await Client.connect(address)
            client = self._client

        return await client.execute_workflow(
            SecurityTriageWorkflow.run,
            request,
            id=f"nexus-triage:{request.tenant_id}:{request.task_id}",
            task_queue=plan.task_queue,
            execution_timeout=timedelta(seconds=plan.workflow_execution_timeout_seconds),
        )


def verify_internal_token(authorization: str | None) -> None:
    expected = os.getenv("NEXUS_AGENT_PLATFORM_TOKEN", "")
    if len(expected) < 32:
        raise HTTPException(status_code=503, detail="AGENT_GATEWAY_NOT_CONFIGURED")

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")

    supplied = authorization.removeprefix("Bearer ").strip()
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")


def create_app(
    submitter: Callable[[TriageRequest], Awaitable[TriageResult]] | None = None,
) -> FastAPI:
    app = FastAPI(
        title="NEXUS Agent Internal Gateway",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    execute = submitter or TemporalSubmitter()

    @app.get("/healthz")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/v1/triage")
    async def submit_triage(
        payload: GatewayTriageRequest,
        response: Response,
        authorization: str | None = Header(default=None),
    ) -> dict:
        verify_internal_token(authorization)
        response.headers["Cache-Control"] = "no-store"
        request = TriageRequest(
            tenant_id=str(payload.tenant_id),
            task_id=payload.task_id,
            event_type=payload.event_type,
            source=payload.source,
            target=payload.target,
            details=payload.details,
            observed_at=payload.observed_at.isoformat(),
        )
        try:
            result = await execute(request)
        except Exception as exc:
            # Keep Temporal internals, tenant metadata and infrastructure details private.
            raise HTTPException(status_code=503, detail="AGENT_EXECUTION_UNAVAILABLE") from exc
        return asdict(result)

    return app


app = create_app()
