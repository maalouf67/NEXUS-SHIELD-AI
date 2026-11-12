# Docker and VPS deployment foundation

## What is automated

The repository defines production Docker images for the Next.js web app and Express API. The existing AI scanner and PostgreSQL runtime images are included in the same image pipeline.

The GHCR publisher is gated on all three workflows succeeding for the same commit on main:

- NEXUS SHIELD AI - Build and Test
- NEXUS SHIELD AI - Security Checks
- NEXUS SHIELD AI - Container Build

Only after those gates pass does the publisher build, scan, and push these images:

- ghcr.io/maalouf67/nexus-shield-ai-web
- ghcr.io/maalouf67/nexus-shield-ai-api
- ghcr.io/maalouf67/nexus-shield-ai-ai
- ghcr.io/maalouf67/nexus-shield-ai-postgres

Each image receives an immutable sha-<commit> tag and a moving latest tag. The production Compose file uses the web, API, and AI images. It uses the official PostgreSQL 16 Alpine image and runs the repository's checksummed migration runner as a one-shot service before starting the API; it deliberately does not execute the SQL files twice through the PostgreSQL image entrypoint.

## Prepare a VPS later

This change does not deploy anything to a live server. No VPS host, SSH key, or production domain is configured in the repository yet.

When the VPS and domain are ready:

1. Use a Linux VPS with Docker Engine and the Docker Compose plugin. Plan for at least 8 GB RAM for the full stack; ClamAV is configured with a 4 GB memory limit.
2. Point the domain's DNS A record to the VPS and allow inbound TCP ports 80 and 443 (plus UDP 443 for HTTP/3).
3. Copy deploy/.env.production.example to .env.production on the VPS. Generate independent random values for JWT_SECRET, SESSION_SECRET, NEXUS_SERVICE_API_TOKEN, and RATE_LIMIT_HASH_SECRET. Use the same NEXUS_SERVICE_API_TOKEN for the API and AI service.
4. Set NEXUS_DOMAIN, POSTGRES_PASSWORD, and DATABASE_URL consistently. Use a URL-safe alphanumeric database password or percent-encode reserved characters in the URL.
5. Authenticate to GHCR with a credential that has read:packages permission if the packages remain private.
6. Pull and start the stack with docker compose --env-file .env.production -f docker-compose.production.yml pull, then docker compose --env-file .env.production -f docker-compose.production.yml up -d.

Caddy obtains and renews TLS certificates automatically after DNS and firewall configuration are correct. PostgreSQL, the AI scanner, ClamAV, and the API are not published directly to the public host ports.

## Secret handling

Never commit .env.production, API keys, database passwords, or GHCR credentials. The Docker build context excludes environment files, local dependency folders, and build outputs. The GHCR workflow uses the short-lived repository GITHUB_TOKEN; a separate read-only package credential is needed by a VPS if the packages are private.

The deploy workflow is intentionally not enabled until a real VPS and its access credentials exist. Image publishing and server deployment remain separate operations.
