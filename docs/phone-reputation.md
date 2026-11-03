# Phone reputation scanner

The first implementation adds an authenticated web page at `/phone-reputation`, a same-origin web proxy route, and an API boundary at `POST /api/phone-reputation/check`.

## Current implementation status

- Admin and Analyst roles can open the page and submit an E.164-formatted phone number.
- The API validates the format and requires an authenticated Admin or Analyst session.
- The API fails closed with HTTP 503 until a provider adapter is implemented.
- No reputation verdict is fabricated, no phone number is persisted, and no live provider request is made yet.
- Viewer accounts cannot submit checks.

## Required before live checks

Choose a phone-reputation provider and obtain its authorized application/API access. Implement its documented authentication, request schema, response mapping, timeout behavior, and error handling in `services/api/src/phone-reputation/`. Keep provider credentials in server-side environment variables only. Add tests for all four verdicts (`malicious`, `suspicious`, `safe`, `unknown`), invalid input, provider timeout, provider errors, and rate limiting.

The Malwarebytes reputation-check capability available inside ChatGPT is not automatically an API credential or callable service for this separately deployed application. Do not copy ChatGPT connector credentials into the application or expose any provider secret to the browser.

A `safe` verdict must be presented as a provider reputation result, not proof of caller identity. An `unknown` verdict must remain unverified, never be converted to safe.
