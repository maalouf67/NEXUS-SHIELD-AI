from dataclasses import FrozenInstanceError

import pytest

from nexus_agents.gateway import WORKFLOW_RUNNERS
from nexus_agents.orchestrator import build_execution_plan
from nexus_agents.registry import (
    AgentNotRegisteredError,
    SECURITY_TRIAGE_AGENT_ID,
    SECURITY_TRIAGE_CAPABILITY,
    get_agent,
    list_agents,
)


TENANT_ID = "650e8400-e29b-41d4-a716-446655440000"
TASK_ID = "triage-registry-0001"


def test_registry_contains_only_the_executable_security_triage_agent():
    agents = list_agents()
    assert len(agents) == 1
    assert agents[0].agent_id == SECURITY_TRIAGE_AGENT_ID
    assert agents[0].enabled is True
    assert agents[0].read_only is True


def test_registry_filters_by_declared_capability():
    matches = list_agents(capability=SECURITY_TRIAGE_CAPABILITY)
    assert [agent.agent_id for agent in matches] == [SECURITY_TRIAGE_AGENT_ID]
    assert list_agents(capability="endpoint.block") == ()


def test_agent_definition_is_immutable():
    definition = get_agent(SECURITY_TRIAGE_AGENT_ID)
    with pytest.raises(FrozenInstanceError):
        definition.enabled = False


def test_unregistered_agent_is_rejected():
    with pytest.raises(AgentNotRegisteredError):
        get_agent("nexus.unreviewed.agent.v1")


def test_execution_plan_uses_only_registry_controlled_routing_and_limits():
    plan = build_execution_plan(
        agent_id=SECURITY_TRIAGE_AGENT_ID,
        capability=SECURITY_TRIAGE_CAPABILITY,
        tenant_id=TENANT_ID,
        task_id=TASK_ID,
    )
    assert plan.workflow_name == "NexusSecurityTriageWorkflow"
    assert plan.task_queue == "nexus-agent-foundation"
    assert plan.read_only is True
    assert plan.max_concurrent_activities == 4
    assert plan.max_concurrent_workflow_tasks == 8
    assert plan.max_activities_per_second == 5.0
    assert plan.max_task_queue_activities_per_second == 5.0
    assert plan.workflow_execution_timeout_seconds == 90


def test_execution_plan_rejects_unregistered_agent_and_unsupported_capability():
    with pytest.raises(AgentNotRegisteredError):
        build_execution_plan(
            agent_id="nexus.unreviewed.agent.v1",
            capability=SECURITY_TRIAGE_CAPABILITY,
            tenant_id=TENANT_ID,
            task_id=TASK_ID,
        )

    with pytest.raises(PermissionError, match="capability"):
        build_execution_plan(
            agent_id=SECURITY_TRIAGE_AGENT_ID,
            capability="endpoint.block",
            tenant_id=TENANT_ID,
            task_id=TASK_ID,
        )


@pytest.mark.parametrize(
    ("tenant_id", "task_id"),
    [
        ("not-a-uuid", TASK_ID),
        (TENANT_ID, "bad"),
    ],
)
def test_execution_plan_rejects_invalid_identity(tenant_id, task_id):
    with pytest.raises(ValueError):
        build_execution_plan(
            agent_id=SECURITY_TRIAGE_AGENT_ID,
            capability=SECURITY_TRIAGE_CAPABILITY,
            tenant_id=tenant_id,
            task_id=task_id,
        )


def test_every_enabled_registry_agent_has_an_explicit_workflow_implementation():
    registered_workflows = {agent.workflow_name for agent in list_agents()}
    assert registered_workflows
    assert registered_workflows.issubset(WORKFLOW_RUNNERS)
    assert all(callable(WORKFLOW_RUNNERS[name]) for name in registered_workflows)
