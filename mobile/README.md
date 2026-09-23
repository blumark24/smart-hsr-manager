# SMART HSR — Phase 15 Mobile Shell

This directory isolates native mobile tooling from the existing Vercel/Firebase web application.

## Guardrails

- Branch: `phase15-mobile-shell`
- Do not merge to `main` or Production during Mobile RC.
- Existing Auth/RBAC/Firestore Rules stay unchanged.
- Existing protected capture/GPS/AI flows remain authoritative.
- No Production host is hard-coded in the mobile shell.
- If `SMART_HSR_MOBILE_SERVER_URL` is absent, the native shell fails closed and displays no operational data.

## Phase 15.0 — Preview Bridge

The first native build intentionally points Capacitor at an HTTPS Preview URL through the environment variable:

`SMART_HSR_MOBILE_SERVER_URL=https://<preview-host>/inspector-v2.html`

This gives us a controlled iOS/Android shell around the already verified Inspector V2 without duplicating its security-sensitive runtime.

## Toolchain

Capacitor 8, Node 22+, iOS and Android platform packages, plus App/Camera/Geolocation/Network/Splash/StatusBar plugins.

## Commands

From this directory:

- `npm install`
- `npm test`
- `npm run doctor`
- `npm run add:ios`
- `npm run add:android`
- `npm run sync`
- `npm run open:ios`
- `npm run open:android`

## Next gate

After the Preview Bridge runs correctly on physical devices, Phase 15.1 will replace the remote bridge with a packaged local web bundle and an explicit remote API origin. That step must preserve Firebase environment isolation and authenticated API calls before TestFlight/Google Play distribution.
