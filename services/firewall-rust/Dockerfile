FROM rust:1-bookworm AS builder
WORKDIR /workspace
COPY . .
RUN cargo build --release

FROM python:3.12-slim-bookworm
RUN groupadd --gid 10001 nexus && useradd --uid 10001 --gid nexus --no-create-home --shell /usr/sbin/nologin nexus
WORKDIR /opt/nexus
COPY --from=builder /workspace/target/release/nexus-firewall /usr/local/bin/nexus-firewall
COPY --chown=10001:10001 tests/network-flows.jsonl /opt/nexus/network-flows.jsonl
COPY --chown=10001:10001 tests/isolated_soc_lab.py /opt/nexus/isolated_soc_lab.py
ENV PYTHONDONTWRITEBYTECODE=1
USER 10001:10001
ENTRYPOINT ["python3", "/opt/nexus/isolated_soc_lab.py"]
