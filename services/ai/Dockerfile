FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends clamav-daemon clamdscan \
    && command -v clamdscan \
    && rm -rf /var/lib/apt/lists/*

COPY infra/clamav/railway-clamdscan.conf /etc/clamav/clamdscan.conf

COPY services/ai/requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir -r requirements.txt

COPY services/ai/app ./app

RUN useradd --system --uid 10001 --create-home nexus \
    && mkdir -p /var/lib/nexus/quarantine \
    && chown -R nexus:nexus /var/lib/nexus \
    && chmod 0700 /var/lib/nexus/quarantine

USER nexus

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
