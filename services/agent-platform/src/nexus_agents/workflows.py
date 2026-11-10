from datetime import timedelta
from temporalio import workflow
from temporalio.common import RetryPolicy

from nexus_agents.contracts import TriageRequest, TriageResult


@workflow.defn(name="NexusSecurityTriageWorkflow")
class SecurityTriageWorkflow:
    @workflow.run
    async def run(self, request: TriageRequest) -> TriageResult:
        run_id = await workflow.execute_activity(
            "execute_security_triage",
            request,
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=RetryPolicy(maximum_attempts=3, initial_interval=timedelta(seconds=2)),
        )
        await workflow.execute_activity(
            "publish_security_triage_event",
            {"tenant_id": request.tenant_id, "task_id": request.task_id, "run_id": run_id},
            start_to_close_timeout=timedelta(seconds=20),
            retry_policy=RetryPolicy(maximum_attempts=5, initial_interval=timedelta(seconds=2)),
        )
        return await workflow.execute_activity(
            "read_security_triage_result",
            {"tenant_id": request.tenant_id, "task_id": request.task_id},
            start_to_close_timeout=timedelta(seconds=10),
        )
