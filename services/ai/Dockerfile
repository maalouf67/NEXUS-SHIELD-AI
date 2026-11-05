FROM python:3.13-alpine

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# ClamAV runs as a separate private-network service. The AI image contains only
# the INSTREAM protocol client implemented with Python's standard library.
COPY services/ai/requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir -r requirements.txt \
    # pip/setuptools/wheel are build tools; none are required by the runtime.
    && python -m pip uninstall -y pip setuptools wheel \
    && rm -rf /usr/local/lib/python3.13/ensurepip /usr/local/bin/pip* \
    && python -c "import importlib.util; assert importlib.util.find_spec('pip') is None; assert importlib.util.find_spec('setuptools') is None"

COPY services/ai/app ./app

RUN adduser -D -u 10001 -h /home/nexus nexus \
    && mkdir -p /var/lib/nexus/quarantine \
    && chown -R nexus:nexus /var/lib/nexus \
    && chmod 0700 /var/lib/nexus/quarantine

USER nexus

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
