from dataclasses import dataclass
from types import MappingProxyType
from typing import Mapping


class AgentNotRegisteredError(LookupError):
    """Raised when a requested agent is not part of the reviewed registry."""


@dataclass(frozen=True, slots=True)
class AgentDefinition:
    agent_id: str
    display_name: str
    version: str
    description: str
    capabilities: frozenset[str]
    workflow_name: str
    task_queue: str
    input_contract: str
    output_contract: str
    allowed_workspace_roles: tuple[str, ...]
    read_only: bool
    enabled: bool
    max_concurrent_activities: int
    max_concurrent_workflow_tasks: int
    max_activities_per_second: float
    max_task_queue_activities_per_second: float
    workflow_execution_timeout_seconds: int


SECURITY_TRIAGE_AGENT_ID = "nexus.security-triage.v1"
SECURITY_TRIAGE_CAPABILITY = "security.event.triage"

# Static and immutable by design: new agents require a reviewed code change.
_AGENT_REGISTRY: Mapping[str, AgentDefinition] = MappingProxyType({
    SECURITY_TRIAGE_AGENT_ID: AgentDefinition(
        agent_id=SECURITY_TRIAGE_AGENT_ID,
        display_name="Security Triage",
        version="1.0.0",
        description="Deterministic, evidence-linked, read-only classification of submitted security events.",
        capabilities=frozenset({
            SECURITY_TRIAGE_CAPABILITY,
            "security.risk.classification",
            "security.evidence.link",
        }),
        workflow_name="NexusSecurityTriageWorkflow",
        task_queue="nexus-agent-foundation",
        input_contract="nexus.security-triage.request.v1",
        output_contract="nexus.security-triage.result.v1",
        allowed_workspace_roles=("admin", "analyst"),
        read_only=True,
        enabled=True,
        max_concurrent_activities=4,
        max_concurrent_workflow_tasks=8,
        max_activities_per_second=5.0,
        max_task_queue_activities_per_second=5.0,
        workflow_execution_timeout_seconds=90,
    ),
})


def get_agent(agent_id: str) -> AgentDefinition:
    definition = _AGENT_REGISTRY.get(agent_id)
    if definition is None or not definition.enabled:
        raise AgentNotRegisteredError(f"agent is not registered or enabled: {agent_id}")
    return definition


def list_agents(*, capability: str | None = None) -> tuple[AgentDefinition, ...]:
    definitions = tuple(
        definition
        for definition in _AGENT_REGISTRY.values()
        if definition.enabled and (capability is None or capability in definition.capabilities)
    )
    return tuple(sorted(definitions, key=lambda definition: definition.agent_id))
