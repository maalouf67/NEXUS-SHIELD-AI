# NEXUS SHIELD AI

NEXUS SHIELD AI is a cyber-defense and AI operations platform architecture designed for secure onboarding, threat intelligence, AI-assisted response, and operational visibility.

## Repository status

This repository has been initialized with the core project structure required for a scalable engineering setup.

## Architecture

- Frontend: Next.js app for web/admin console
- API: Node.js + TypeScript service
- AI engine: Python + FastAPI service
- Data: PostgreSQL
- Shared contracts: TypeScript package
- Security: environment validation, secret management, CORS, Helmet, input validation

## Quick start

1. Copy `.env.example` to the private environment files used by each app:
   - `services/api/.env` for the API service.
   - `apps/web/.env.local` for the Next.js frontend.
2. Replace every placeholder secret and the `DATABASE_URL` with valid values for your environment. Never commit populated `.env` files.
3. The API validates `JWT_SECRET`, `SESSION_SECRET`, `ALLOWED_ORIGINS`, `AI_BASE_URL`, and `DATABASE_URL` at startup. `DATABASE_URL` must point to a PostgreSQL instance compatible with the TLS CA configuration in `services/api/src/db/pool.ts`.
4. Set `NEXT_PUBLIC_API_BASE_URL` in `apps/web/.env.local` to the reachable API URL.
5. Install dependencies and start the JavaScript workspaces:

```bash
npm install
npm run dev
```

Start PostgreSQL separately only after configuring a database connection that matches the API's TLS requirements. The default local Docker Compose database does not by itself configure the Supabase CA expected by the current pool implementation.

For the AI service, install Python dependencies in `services/ai` and start:

```bash
cd services/ai
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

## Project structure

```text
.
├── apps/
│   └── web/
├── services/
│   ├── api/
│   └── ai/
├── packages/
│   └── shared/
├── database/
├── docs/
├── docker-compose.yml
├── .env.example
├── package.json
└── README.md
```

## Demo data and product status

The threat summary endpoint currently returns sample incident counts and an illustrative AI score. The dashboard labels these values, its chart, agent matrix, and activity examples as demo content. They are not live monitoring results, measured coverage, or proof of active protection. The dashboard's scan control remains unavailable until a real scan workflow is implemented.

## Notes

This is an engineering foundation intended for extension to production-grade deployment, security operations workflows, and AI orchestration. Do not represent planned, sample, or unverified capabilities as implemented production security features.
