from nats.js.api import StreamConfig, RetentionPolicy, StorageType
from nats.js.errors import NotFoundError

STREAM = "NEXUS_AGENT_EVENTS"
SUBJECT = "nexus.agent.events.*"
DUPLICATE_WINDOW_SECONDS = 600


def build_stream_config() -> StreamConfig:
    """Build the JetStream stream configuration using nats-py's seconds value."""
    return StreamConfig(
        name=STREAM,
        subjects=[SUBJECT],
        retention=RetentionPolicy.LIMITS,
        storage=StorageType.FILE,
        duplicate_window=DUPLICATE_WINDOW_SECONDS,
    )


async def ensure_stream(js) -> None:
    try:
        await js.stream_info(STREAM)
    except NotFoundError:
        await js.add_stream(build_stream_config())


async def publish_event(js, tenant_id: str, task_id: str, subject: str, payload: str) -> None:
    await js.publish(
        subject,
        payload.encode("utf-8"),
        headers={"Nats-Msg-Id": f"nexus-agent:{tenant_id}:{task_id}"},
    )
