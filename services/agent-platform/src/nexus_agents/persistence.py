import json
from dataclasses import asdict
from asyncpg import Pool

from nexus_agents.contracts import TriageRequest, TriageResult


async def persist_result(pool: Pool, request: TriageRequest, result: TriageResult) -> str:
    request_json = json.dumps(asdict(request))
    result_json = json.dumps(asdict(result))
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT set_config('nexus.tenant_id', $1, true)", request.tenant_id)
            row = await conn.fetchrow(
                """INSERT INTO nexus_agent_runs
                   (tenant_id, task_id, agent_id, request_json, result_json, status)
                   VALUES ($1::uuid, $2, $3, $4::jsonb, $5::jsonb, 'completed')
                   ON CONFLICT (tenant_id, task_id) DO NOTHING
                   RETURNING id""",
                request.tenant_id, request.task_id, result.agent_id, request_json, result_json,
            )
            if row is None:
                existing = await conn.fetchrow(
                    "SELECT id, request_json FROM nexus_agent_runs WHERE tenant_id=$1::uuid AND task_id=$2",
                    request.tenant_id, request.task_id,
                )
                if existing is None or json.loads(existing["request_json"]) != json.loads(request_json):
                    raise ValueError("idempotency conflict: task_id was reused with different input")
                run_id = existing["id"]
            else:
                run_id = row["id"]
                await conn.execute(
                    """INSERT INTO nexus_agent_outbox (tenant_id, run_id, subject, payload)
                       VALUES ($1::uuid, $2, $3, $4::jsonb)
                       ON CONFLICT (tenant_id, run_id) DO NOTHING""",
                    request.tenant_id, run_id, f'nexus.agent.events.{request.tenant_id}', result_json,
                )
            return str(run_id)


async def load_outbox(pool: Pool, tenant_id: str, run_id: str):
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT set_config('nexus.tenant_id', $1, true)", tenant_id)
            return await conn.fetchrow(
                """SELECT id, subject, payload::text AS payload, delivered_at
                   FROM nexus_agent_outbox WHERE tenant_id=$1::uuid AND run_id=$2::uuid""",
                tenant_id, run_id,
            )


async def mark_delivered(pool: Pool, tenant_id: str, outbox_id: str) -> None:
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("SELECT set_config('nexus.tenant_id', $1, true)", tenant_id)
            await conn.execute(
                "UPDATE nexus_agent_outbox SET delivered_at=COALESCE(delivered_at, now()) WHERE tenant_id=$1::uuid AND id=$2::uuid",
                tenant_id, outbox_id,
            )
