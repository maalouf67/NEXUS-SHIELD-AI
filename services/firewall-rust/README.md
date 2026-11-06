# NEXUS SHIELD AI — Rust Firewall and Network Behavior Engine

This component adds a Rust policy-preview engine, bounded network-behavior heuristics, and an authenticated event adapter for the existing NEXUS SOC ingestion API.

## Architecture

- Rust validates a declarative nftables policy and renders a candidate Linux ingress ruleset.
- A trusted upstream sensor supplies normalized JSON Lines observations (source IP, destination port, TCP/UDP protocol, allowed/blocked result, and event time).
- A bounded sliding-window detector looks for suspected port scans, connection bursts, and repeated blocked probes.
- Detections are serialized to the existing SOC contract and sent to POST /api/integrations/security-events with X-NEXUS-INGESTION-TOKEN.
- The API stores normalized events for analyst review. Its existing contract does not create incidents, alerts, or automated containment.

## Detection behavior

Default thresholds, configurable in code and covered by tests:

| Signal | Threshold | Severity |
| --- | ---: | --- |
| Suspected port scan | 12 distinct protocol/port pairs in 60 seconds | high |
| Connection burst | 100 observations from one source in 60 seconds | medium |
| Repeated blocked probes | 15 blocked observations from one source in 60 seconds | medium |

A per-source/per-signal five-minute cooldown limits duplicate events. Event-time ordering is required per source. The detector bounds tracked sources and observations per source, rejects invalid IPs/port zero, and does not infer compromise from a heuristic.

## SOC connector

Set these server-side environment variables:

- NEXUS_SOC_API_URL — API origin only, for example https://api.example.com (do not include a path).
- NEXUS_EVENT_INGESTION_TOKEN — dedicated ingestion token; at least 32 characters.
- NEXUS_FIREWALL_FINGERPRINT_KEY — separate secret key of at least 32 characters, used to HMAC the source IP into a stable 64-character fingerprint before SOC submission.

The SOC event contains the keyed fingerprint, not the raw source IP. Keep both keys in the server secret store. The offline stdout preview is local operator output and still includes the source IP for local triage.

Remote SOC connections require HTTPS. Plain HTTP is accepted only for localhost in the isolated lab. The adapter posts batches of up to 100 events, retries transient connection/time-out, 408, 429, and 5xx failures up to three attempts, and generates deterministic event IDs from source, signal, and trigger timestamp so replayed input can use the API idempotency constraint. The ingestion header is marked sensitive in the HTTP client.

The token is never placed in command-line arguments or event attributes. Do not commit it or expose it to the browser.

## Safe nftables policy preview

Validate a declarative policy and print candidate nftables rules without changing the host:

~~~json
{
  "allowed_tcp_ports": [22, 443],
  "denied_sources": ["192.0.2.0/24", "2001:db8::/32"]
}
~~~

Save the JSON as `policy.json`, then run:

~~~sh
cargo run -- --policy-preview policy.json
~~~

This command validates ports and CIDR networks, then writes the candidate rules to stdout. It does **not** invoke `nft`, write firewall configuration, or change network state. The rendered policy uses a default-drop input chain; review management, SSH, DNS, DHCP, monitoring, and recovery access for the target host before any separately authorized deployment.

## Input and preview

Each JSONL line must match this schema:

~~~json
{
  "observed_at_unix": 1700000000,
  "source_ip": "198.51.100.27",
  "destination_port": 443,
  "protocol": "tcp",
  "action": "blocked"
}
~~~

Run a safe offline preview:

~~~sh
cargo run -- --input tests/network-flows.jsonl --stdout-only
~~~

Forward detections to the SOC (only from a trusted host with configured secrets):

~~~sh
NEXUS_SOC_API_URL=https://api.example.com \
NEXUS_EVENT_INGESTION_TOKEN="$NEXUS_EVENT_INGESTION_TOKEN" \
cargo run -- --input /var/log/nexus/normalized-flows.jsonl
~~~

## Isolated integration lab

The lab image runs as a non-root user, with no network namespace access beyond its own loopback, no Linux capabilities, a read-only root filesystem, a small memory/PID limit, synthetic documentation-range IP addresses, and a local mock SOC endpoint. It verifies the actual HTTP path, ingestion header, event schema, source-IP pseudonymization, and expected detections without connecting to the real SOC or changing host networking.

~~~sh
docker build -f Dockerfile -t nexus-firewall-lab .
docker run --rm --network none --cap-drop=ALL \
  --security-opt no-new-privileges --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --memory=256m --cpus=1 --pids-limit=64 nexus-firewall-lab
~~~

The GitHub Actions workflow runs formatting, unit tests, Clippy with warnings denied, and this isolated container lab.

## Safety and production boundary

- This engine analyzes normalized observations; it does not capture packets or discover network interfaces. A real sensor/connector must be implemented, configured, and validated separately.
- It does not execute nft, invoke a shell, alter host networking, or apply firewall rules.
- A rendered default-drop ruleset can lock out SSH, management, DNS, DHCP, monitoring, or health probes if the host-specific allow-list is incomplete. Review a complete policy, test with console recovery, and prepare rollback before any privileged apply integration.
- Heuristic detections are leads for analyst review, not confirmed attacks. No automatic block, quarantine, incident creation, or containment is performed.
- This is server-side groundwork; it is not Android VPN filtering, a full endpoint agent, or a production-certified IPS.
