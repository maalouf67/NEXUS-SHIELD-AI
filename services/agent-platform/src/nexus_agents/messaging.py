from datetime import timedelta
from nats.js.api import StreamConfig, RetentionPolicy, StorageType
from nats.js.errors import NotFoundError

STREAM = "NEXUS_AGENT_EVENTS"
SUBJECT = "nexus.agent.events.*"


async def ensure_stream(js) -> None:
    try:
        await js.stream_info(STREAM)
    except NotFoundError:
        await js.add_stream(StreamConfig(
            name=STREAM,
            subjects=[SUBJECT],
            retention=RetentionPolicy.LIMITS,
            storage=StorageType.FILE,
            duplicate_window=timedelta(minutes=10),
        ))


async def publish_event(js, tenant_id: str, task_id: str, subject: str, payload: str) -> None:
    await js.publish(
        subject,
        payload.encode("utf-8"),
        headers={"Nats-Msg-Id": f"nexus-agent:{tenant_id}:{task_id}"},
    )
