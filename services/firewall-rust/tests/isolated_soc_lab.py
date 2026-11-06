#!/usr/bin/env python3
import json
import os
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

TOKEN = "nexus-isolated-lab-token-do-not-reuse-in-production"
FINGERPRINT_KEY = "nexus-isolated-fingerprint-key-do-not-reuse"
captured = []
errors = []

class SocMockHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/api/integrations/security-events":
            errors.append("unexpected endpoint path")
            self.send_error(404)
            return
        if self.headers.get("X-NEXUS-INGESTION-TOKEN") != TOKEN:
            errors.append("missing or invalid ingestion header")
            self.send_error(401)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length))
            events = payload["events"]
            if not isinstance(events, list) or not events or len(events) > 100:
                raise ValueError("invalid events batch")
            for event in events:
                required = {
                    "source", "externalEventId", "eventType",
                    "severity", "observedAt", "summary", "attributes"
                }
                if not required.issubset(event):
                    raise ValueError("event missing SOC contract fields")
                if event["source"] != "nexus-rust-firewall":
                    raise ValueError("unexpected source identifier")
                attributes = event["attributes"]
                if "source_ip" in attributes or len(attributes.get("source_fingerprint", "")) != 64:
                    raise ValueError("source IP was not pseudonymized before SOC storage")
                if "198.51.100.27" in event["summary"]:
                    raise ValueError("raw source IP leaked into SOC summary")
            captured.extend(events)
        except Exception as exc:
            errors.append(str(exc))
            self.send_error(400, str(exc))
            return

        self.send_response(202)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", "2")
        self.end_headers()
        self.wfile.write(b"{}")

    def log_message(self, _format, *_args):
        pass

def main():
    server = HTTPServer(("127.0.0.1", 0), SocMockHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    port = server.server_address[1]
    environment = os.environ.copy()
    environment["NEXUS_EVENT_INGESTION_TOKEN"] = TOKEN
    environment["NEXUS_FIREWALL_FINGERPRINT_KEY"] = FINGERPRINT_KEY

    try:
        result = subprocess.run(
            [
                "/usr/local/bin/nexus-firewall",
                "--input", "/opt/nexus/network-flows.jsonl",
                "--soc-url", f"http://127.0.0.1:{port}",
            ],
            env=environment,
            text=True,
            capture_output=True,
            timeout=15,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"firewall process failed ({result.returncode}): "
                f"{result.stderr[-2000:]}"
            )
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)

    event_types = {event["eventType"] for event in captured}
    expected = {
        "network.port_scan_suspected",
        "network.repeated_blocked_probes",
    }
    if errors:
        raise RuntimeError(f"SOC mock rejected request: {errors}")
    if not expected.issubset(event_types):
        raise RuntimeError(
            f"missing expected detections: {expected - event_types}; got {event_types}"
        )
    if len(captured) != 2:
        raise RuntimeError(f"expected exactly two de-duplicated alerts; got {len(captured)}")
    print("ISOLATED_LAB_PASS")
    print("Synthetic flow observations processed and two normalized events accepted by the mock SOC.")
    print("No host firewall rules, packet capture, external network, or production SOC were used.")

if __name__ == "__main__":
    main()
