# Security Baseline

## Requirements

- Never hardcode secrets in source files
- Validate all input payloads with schema checks
- Restrict CORS to approved frontend origins
- Always use environment variables for configuration
- Keep logging free of sensitive payloads

## Local development

Create a local `.env` file based on `.env.example`.

```bash
cp .env.example .env
```

## Production recommendations

- Use secret managers such as GitHub Environments, Kubernetes Secrets, AWS Secrets Manager, or Azure Key Vault
- Require HTTPS for all production endpoints
- Enable rate limiting and request validation at gateway level
- Apply RBAC for analyst/admin roles
