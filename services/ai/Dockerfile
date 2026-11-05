FROM python:3.11-alpine

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# ClamAV runs as a separate private-network service. The AI image contains only
# the INSTREAM protocol client implemented with Python's standard library.
COPY services/ai/requirements.txt ./requirements.txt

# Packaging tools are build-time only. Remove them and any bundled metadata
# from the runtime image; the application does not import setuptools or wheel.
RUN python -m pip install --no-cache-dir --upgrade pip setuptools wheel \
    && python -m pip install --no-cache-dir -r requirements.txt \
    && python -m pip uninstall -y setuptools wheel \
    && find /usr -iname '*setuptools*' -exec rm -rf {} + \
    && python -c "import importlib.util; assert importlib.util.find_spec('setuptools') is None"

COPY services/ai/app ./app

RUN adduser -D -u 10001 -h /home/nexus nexus \
    && mkdir -p /var/lib/nexus/quarantine \
    && chown -R nexus:nexus /var/lib/nexus \
    && chmod 0700 /var/lib/nexus/quarantine

USER nexus

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
