# SMART HSR — Isolated Render Preview Gate

**Scope:** Render service `smart-hsr-sandbox-preview`, Preview-only branch `deploy/render-free-preview-v1`.

## Deployment identity
- GitHub repository: `blumark24/smart-hsr-manager`
- Hosting: Render Web Service, Free (not Production)
- GitHub Actions: `portable-preview-acceptance.yml`
- Automatic deploy trigger: `checksPass` (deploy only after checks pass)
- Application command: `node portable-preview-server.js`
- Health endpoint: `/__preview/health`

## Safety requirements
- Do not connect production Firebase Authentication, Firestore, municipal user accounts, or credentials.
- Do not assign `smart.blumark24.com` or any Production alias to this service.
- All API endpoints default to HTTP 503 `preview_api_disabled`.
- Client Firebase resolution allows production only on explicit existing Production aliases and fails closed on unknown hosts.
- While staging config is absent, strict Content Security Policy forbids browser data connections to Firebase and Google APIs.
- Enable staged APIs only after verifying **both** service-account and web-client project identifiers equal `smart-hsr-staging-blumark24`.
- Stage-specific Firebase keys belong in secure Render environment variables, not in GitHub.
- Verify the new GitHub commit SHA equals the Render deployed SHA before any browser UAT.
- Run real UAT only with isolated staging credentials, not municipal Production accounts.

## Acceptance
1. GitHub workflow is fully green.
2. Render deploy is Live, with matching commit SHA.
3. GET `/__preview/health` returns `{"status":"ok","mode":"preview","apiEnabled":false}` until staging configuration is explicitly enabled.
4. GET `/firebase-runtime-config.js` uses the **explicit allowlist** rule, never the old `!hostname.endsWith('.vercel.app')` condition.
5. Response headers include CSP with `connect-src 'self'` while APIs are disabled.
6. GET `/api/admin/users` returns 503 until staging environment and isolation tests are ready.

**No launch approval or municipal Production changes are implied by a green Preview deploy.**
