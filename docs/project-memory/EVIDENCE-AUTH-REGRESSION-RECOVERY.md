# Evidence Auth Regression Recovery

## Confirmed regression

Commit `4ba862f` added a manual JWT project check before Firebase Admin verification:

`tokenProject(token) !== getProjectId()`

This check was absent from known-good commit `1c09ea4`. Both `/api/storage/read` and `/api/organization/context` use the shared `verifyRequestToken`, so the new pre-check could return 401 for both routes before Firebase Admin received the token.

On Vercel Preview, `app.options.projectId` may reflect explicit environment selection while the effective credential used by Firebase Admin remains capable of verifying the client token. Treating that metadata comparison as an independent authorization authority created a false-negative path.

## Recovery

`verifyIdToken(token, true)` is restored as the single token verification authority. It already verifies signature, issuer, audience, expiry, revocation, and project compatibility. Missing, expired, invalid, revoked, and wrong-project tokens remain fail-closed. The tenant and organization checks after authentication are unchanged.

The modern client behavior is retained: Authorization bearer header, one forced refresh after 401, exactly one retry, per-user evidence request deduplication, private B2 delivery, canonical `imageObjectKey`, and legacy evidence reads.
