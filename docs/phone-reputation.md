# Phone reputation scanner

The authenticated page is available at /phone-reputation. Its same-origin Next.js proxy forwards requests to POST /api/phone-reputation/check. The Express API checks the user's session and Admin/Analyst role before calling the provider.

## Provider

The initial live adapter uses the IPQualityScore Phone Number Validation API. The provider documents a server-side JSON endpoint at:

https://www.ipqualityscore.com/api/json/phone/{API_KEY}/{PHONE_DIGITS}

The adapter sends only the E.164 digits to the provider. For +212 numbers it also supplies country[]=MA. API credentials remain on the Express API server and are never included in browser or React Native bundles.

Set these server-side variables:

- IPQS_API_KEY: a key from the project's own IPQualityScore account.
- IPQS_PHONE_STRICTNESS: 0, 1, or 2. Start at 0 to reduce false positives.

Do not add the key to NEXT_PUBLIC_* variables, mobile app configuration, source control, or request logs. Do not use a ChatGPT connector credential as an application API key.

## Verdict policy

- malicious: only when the provider explicitly returns spammer=true.
- suspicious: when the fraud score is 75 or higher, or the provider reports recent abuse or a risky number.
- safe: only when the provider confirms validity, supplies a score below 75, and explicitly returns false for recent_abuse, risky, and spammer.
- unknown: invalid numbers, missing signals, incomplete records, unsupported data, or any result that does not meet the rules above.

The provider's fraud score is a risk estimate, not proof of intent or identity. A safe verdict is not a guarantee that a caller is legitimate. A missing provider field is never silently converted to false.

## Privacy and operations

Phone lookups are not persisted by this feature. The API applies a per-account limit of five requests every 15 minutes. Provider errors and timeouts fail closed and do not create a verdict. Responses use Cache-Control: no-store.

IPQualityScore documents international phone lookup coverage across more than 150 countries. This does not guarantee complete reputation signals for every +212 operator or every spam complaint. Verify coverage and score quality with a few test cases from the project's own authorized account before enabling the feature for production users.

## Tests

The provider adapter tests cover all four verdicts, invalid/incomplete results, Morocco country routing, missing credentials, rate limiting, and timeout mapping. Route tests cover authentication, role access, validation, and upstream failure. These tests use deterministic fixtures; they do not make paid requests to IPQualityScore.