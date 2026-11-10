import argparse
import asyncio
from temporalio.client import Client
from nexus_agents.contracts import TriageRequest
from nexus_agents.workflows import SecurityTriageWorkflow


async def main() -> None:
    parser = argparse.ArgumentParser(description="Submit a NEXUS security triage task")
    parser.add_argument("--tenant-id", required=True)
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--event-type", required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--target", required=True)
    parser.add_argument("--details", required=True)
    parser.add_argument("--observed-at", required=True)
    args = parser.parse_args()
    request = TriageRequest(**vars(args))
    client = await Client.connect("localhost:7233")
    result = await client.execute_workflow(
        SecurityTriageWorkflow.run,
        request,
        id=f"nexus-triage:{request.tenant_id}:{request.task_id}",
        task_queue="nexus-agent-foundation",
    )
    print(result)


if __name__ == "__main__":
    asyncio.run(main())
