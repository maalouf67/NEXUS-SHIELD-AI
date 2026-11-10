import asyncio
import json
import os

import asyncpg
import nats
from temporalio.client import Client
from temporalio.worker import Worker
from temporalio import activity

from nexus_agents.agent import analyze
from nexus_agents.contracts import TriageRequest, TriageResult
from nexus_agents.messaging import ensure_stream, publish_event
from nexus_agents.persistence import persist_result, load_outbox, mark_delivered
from nexus_agents.workflows import SecurityTriageWorkflow

TASK_QUEUE = "nexus-agent-foundation"
_pool = None
_js = None


@activity.defn(name="execute_security_triage")
async def execute_security_triage(request: TriageRequest) -> str:
    result = analyze(request)
    return await persist_result(_pool, request, result)


@activity.defn(name="publish_security_triage_event")
async def publish_security_triage_event(args: dict) -> str:
    row = await load_outbox(_pool, args["tenant_id"], args["run_id"])
    if row is None:
        raise RuntimeError("outbox record not found")
    if row["delivered_at"] is None:
        await publish_event(_js, args["tenant_id"], args["task_id"], row["subject"], row["payload"])
        await mark_delivered(_pool, args["tenant_id"], str(row["id"]))
    return "published"


@activity.defn(name="read_security_triage_result")
async def read_security_triage_result(args: dict) -> TriageResult:
    async with _pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT set_config('nexus.tenant_id', $1, true)", args["tenant_id"])
            row = await conn.fetchrow(
                "SELECT result_json::text AS result FROM nexus_agent_runs WHERE tenant_id=$1::uuid AND task_id=$2",
                args["tenant_id"], args["task_id"],
            )
    if row is None:
        raise RuntimeError("persisted triage result not found")
    data = json.loads(row["result"])
    data["evidence"] = tuple(data["evidence"])
    data["recommendations"] = tuple(data["recommendations"])
    return TriageResult(**data)


async def main() -> None:
    global _pool, _js
    database_url = os.environ["DATABASE_URL"]
    temporal_address = os.getenv("TEMPORAL_ADDRESS", "temporal:7233")
    nats_url = os.getenv("NATS_URL", "nats://nats:4222")
    _pool = await asyncpg.create_pool(database_url, min_size=1, max_size=5)
    nc = await nats.connect(nats_url)
    _js = nc.jetstream()
    await ensure_stream(_js)
    temporal = await Client.connect(temporal_address)
    worker = Worker(
        temporal,
        task_queue=TASK_QUEUE,
        workflows=[SecurityTriageWorkflow],
        activities=[execute_security_triage, publish_security_triage_event, read_security_triage_result],
    )
    try:
        await worker.run()
    finally:
        await nc.drain()
        await _pool.close()


if __name__ == "__main__":
    asyncio.run(main())
