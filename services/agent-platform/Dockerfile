FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY services/agent-platform/pyproject.toml ./pyproject.toml
COPY services/agent-platform/src ./src
RUN pip install --no-cache-dir . && useradd --system --uid 10001 nexus-agent
USER 10001:10001
CMD ["python", "-m", "nexus_agents.worker"]
