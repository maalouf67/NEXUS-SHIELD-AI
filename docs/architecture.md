# Architecture Overview

## Project goal

NEXUS SHIELD AI is designed as a cyber-defense intelligence platform with a modular architecture focusing on:

- risk monitoring
- AI-based analysis
- secure incident workflow
- operational visibility
- extensibility for mobile and web client access

## Monorepo layout

```text
apps/web        -> Next.js web console
services/api    -> Express API service
services/ai     -> FastAPI AI analysis engine
packages/shared -> shared TypeScript contracts
``` 

## Design principles

- separation of concerns
- secure configuration management
- typed APIs between services
- low-risk incremental architecture
- cloud-ready operations

## Security configuration

- Use `.env` files only for local development
- Store production secrets in a vault or environment manager
- Disable debug logging in production
- Restrict CORS to trusted domains
- Use strong JWT secrets and rotate regularly

## Deployment guidance

1. Run PostgreSQL via Docker Compose
2. Start the API service
3. Start the AI service
4. Start the web application
5. Connect clients through `/api` and AI analysis routes
