import asyncio
import json
import os
from uuid import uuid4

import asyncpg
import httpx
import nats


async def main() -> None:
    tenant_a = str(uuid4())
    tenant_b = str(uuid4())
    task_id = "ci-triage-00000001"
    gateway_url = os.getenv("AGENT_GATEWAY_URL", "http://127.0.0.1:8090")
    service_token = os.environ["NEXUS_AGENT_PLATFORM_TOKEN"]

    async with httpx.AsyncClient(timeout=100) as client:
        response = await client.post(
            f"{gateway_url.rstrip('/')}/v1/triage",
            headers={"Authorization": f"Bearer {service_token}"},
            json={
                "tenant_id": tenant_a,
                "task_id": task_id,
                "event_type": "security.alert",
                "source": "ci-sensor",
                "target": "ci-asset",
                "details": "Possible data exfiltration detected",
                "observed_at": "2026-11-10T12:00:00Z",
            },
        )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["tenant_id"] == tenant_a, result
    assert result["task_id"] == task_id, result
    assert result["classification"] == "critical", result
    assert result["risk_score"] == 95 and result["read_only"] is True

    pool = await asyncpg.create_pool(os.environ["DATABASE_URL"])
    try:
        async with pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute("SELECT set_config('nexus.tenant_id', $1, true)", tenant_a)
                own_rows = await conn.fetchval("SELECT count(*) FROM nexus_agent_runs WHERE tenant_id=$1::uuid", tenant_a)
            async with conn.transaction():
                await conn.execute("SELECT set_config('nexus.tenant_id', $1, true)", tenant_b)
                foreign_rows = await conn.fetchval("SELECT count(*) FROM nexus_agent_runs WHERE tenant_id=$1::uuid", tenant_a)
            assert own_rows == 1, own_rows
            assert foreign_rows == 0, foreign_rows
            try:
                async with conn.transaction():
                    await conn.execute("SELECT set_config('nexus.tenant_id', $1, true)", tenant_b)
                    await conn.execute(
                        """INSERT INTO nexus_agent_runs
                           (tenant_id, task_id, agent_id, request_json, result_json, status)
                           VALUES ($1::uuid, 'cross-tenant-write', 'test', '{}'::jsonb, '{}'::jsonb, 'completed')""",
                        tenant_a,
                    )
            except asyncpg.InsufficientPrivilegeError:
                pass
            else:
                raise AssertionError("RLS accepted a cross-tenant write")
    finally:
        await pool.close()

    nc = await nats.connect(os.environ["NATS_URL"])
    try:
        js = nc.jetstream()
        sub = await js.pull_subscribe("nexus.agent.events.*", durable="nexus-agent-ci-smoke", stream="NEXUS_AGENT_EVENTS")
        messages = await sub.fetch(1, timeout=10)
        event = json.loads(messages[0].data.decode("utf-8"))
        assert event["tenant_id"] == tenant_a
        assert event["task_id"] == task_id
        await messages[0].ack()
    finally:
        await nc.drain()

    print("PASS: authenticated HTTP gateway, Temporal workflow, deterministic agent, PostgreSQL persistence/RLS, and NATS JetStream delivery")


if __name__ == "__main__":
    asyncio.run(main())
