import re
from dataclasses import dataclass
from uuid import UUID

from nexus_agents.registry import AgentDefinition, get_agent


@dataclass(frozen=True, slots=True)
class AgentExecutionPlan:
    agent_id: str
    workflow_name: str
    task_queue: str
    input_contract: str
    output_contract: str
    read_only: bool
    workflow_execution_timeout_seconds: int
    max_concurrent_activities: int
    max_concurrent_workflow_tasks: int
    max_activities_per_second: float
    max_task_queue_activities_per_second: float


def build_execution_plan(
    *,
    agent_id: str,
    capability: str,
    tenant_id: str,
    task_id: str,
) -> AgentExecutionPlan:
    """Resolve an execution plan only from reviewed server-side registry data."""
    try:
        UUID(tenant_id)
    except (ValueError, TypeError) as exc:
        raise ValueError("tenant_id must be a UUID") from exc

    if not isinstance(task_id, str) or not re.fullmatch(r"[A-Za-z0-9._:-]{8,128}", task_id):
        raise ValueError("task_id must be 8-128 safe characters")

    definition: AgentDefinition = get_agent(agent_id)
    if capability not in definition.capabilities:
        raise PermissionError("agent does not provide the requested capability")
    if not definition.read_only:
        raise PermissionError("agent execution requires an explicit human-approved action policy")

    return AgentExecutionPlan(
        agent_id=definition.agent_id,
        workflow_name=definition.workflow_name,
        task_queue=definition.task_queue,
        input_contract=definition.input_contract,
        output_contract=definition.output_contract,
        read_only=definition.read_only,
        workflow_execution_timeout_seconds=definition.workflow_execution_timeout_seconds,
        max_concurrent_activities=definition.max_concurrent_activities,
        max_concurrent_workflow_tasks=definition.max_concurrent_workflow_tasks,
        max_activities_per_second=definition.max_activities_per_second,
        max_task_queue_activities_per_second=definition.max_task_queue_activities_per_second,
    )
