# Smart HSR — Sprint 5B Local AI Gateway Runtime and Provider Conformance

## Executive decision

**GO for Sprint 5C real-provider adapter design in a server-only, local/Preview test boundary. NO-GO for credentials, real images, external calls, page integration, persistence or Production.**

Sprint 5B converts the Sprint 5A contracts into an executable local gateway without opening an HTTP server, initializing Firebase, importing a vendor SDK, or mutating application state. The business ROI is a reusable provider acceptance gate: a future adapter must satisfy the same Arabic, tenant, privacy, capability and advisory controls before procurement or integration effort proceeds.

## 1. Gateway architecture

```text
Local/test runtime guard
  → request envelope validation
  → trusted actor/organization resolver
  → Sprint 4 evidence-reference classification and tenant gate
  → provider capability validation
  → Sprint 5A Provider Router and timeout
  → canonical output and Arabic-summary validation
  → advisory-only command rejection
  → safe response and audit metadata
```

Created modules:

- `platform/ai/local-ai-runtime-guard.js`
- `platform/ai/local-ai-gateway-service.js`
- `platform/ai/provider-capability-contract.js`
- `platform/ai/provider-conformance-suite.js`
- `platform/ai/advisory-output-policy.js`
- `platform/ai/ai-storage-boundary.js`
- `platform/ai/suggestion-decision-contract.js`
- `platform/ai/municipal-summary-fixtures.js`

No application file imports these modules.

## 2. Gateway service contract

Logical handlers:

```text
health()
analyzeObservationImage(request)
verifyBeforeAfter(request)
suggestPriority(request)
```

`analyzeObservationImage` executes the full local contract chain. Before/after and priority handlers exist but return `AI_OPERATION_NOT_ACTIVATED` after runtime/envelope/capability checks. This avoids inventing provider behavior while preserving the future service interface.

The service receives an injected trusted-context resolver. It does not trust `organizationId` or `actorId` merely because they appear in the request. The default resolver returns no identity and therefore fails closed.

## 3. Local request/response envelopes

Request:

```text
requestId
correlationId
organizationId
observationId
actorId
actorRole
operation
imageReference?
beforeImageReference?
afterImageReference?
imageContentType?       (validated runtime metadata)
existingDescription?
locationContext?
requestedAt
controlledImagePayload? (local/test internal input only)
```

Response:

```text
ok
requestId
correlationId
operation
result?
errorCode?
reason?
warnings
auditMetadata
processingTimeMs
```

Image references, bytes, raw descriptions/prompts, locations, provider errors, stacks and credentials are excluded from response audit metadata. Errors use stable gateway codes.

## 4. Local runtime guard

The runtime is disabled by default. Activation requires all of the following injected values:

- `enabled: true`;
- mode exactly `test` or `local`;
- `publicAccess: false`;
- `firebaseEnabled: false`;
- `cloudEnabled: false`;
- `externalNetworkEnabled: false`.

Unknown environments and any public/Firebase/cloud/network capability fail closed. No listener, route, public server, port or deployment configuration was created.

## 5. Provider capability contract

```text
providerId
supportsVision
supportsBeforeAfter
supportsStructuredOutput
supportsArabic
maxImageBytes
supportedMimeTypes
timeoutMs
```

Image analysis requires vision, Arabic and structured output. Before/after requires its explicit capability. Provider size support must meet the 700 KiB gateway limit; MIME support must cover JPEG, PNG and WebP; timeout must be positive and no greater than the 15-second gateway ceiling.

Selection remains exact and deterministic. No provider is enabled by default, and there is no fallback to another provider after denial or failure.

## 6. Provider conformance framework

The reusable suite defines 18 mandatory cases:

1. Pothole success.
2. Leaning pole success.
3. Fallen palm success.
4. Construction waste success.
5. Water leak success.
6. Unclear image with valid low-confidence fallback.
7. Unsupported image denial.
8. Malformed output denial.
9. Timeout normalization.
10. Provider unavailable denial.
11. Non-Arabic summary denial.
12. Under-five-word summary denial.
13. Over-fifteen-word summary denial.
14. Invalid severity denial.
15. Invalid confidence denial.
16. Missing human-review flag denial.
17. Workflow-action attempt denial.
18. Secret/raw-prompt attempt denial.

Result for the deterministic mock adapter: **18 passed, 0 failed**.

Future adapters must supply a local `runCase` implementation and pass every case. Exceptions are normalized and count as failures.

## 7. Advisory-only enforcement

The gateway rejects unknown/non-advisory result fields and searches the serialized canonical result for prohibited commands:

```text
SAVE_OBSERVATION
CREATE_OBSERVATION
ASSIGN_CONTRACTOR
UPDATE_STATUS
COMPLETE
CLOSE
DELETE
```

Explicit fields such as `workflowAction`, `firestoreWrite`, `autoSave`, `applyClassification` and `applyPriority` are rejected. The gateway does not strip a mutation request and continue; it denies the entire provider result.

Allowed results remain descriptions and suggestions only. No Firestore/Firebase import, document write, workflow function, save callback or application command exists in the gateway.

## 8. Inspector choice model

States:

- `MANUAL`
- `AI_SUGGESTED`
- `AI_ACCEPTED`
- `AI_EDITED`
- `AI_IGNORED`

Methods:

```text
createSuggestionSession()
acceptSuggestion()
editSuggestion()
ignoreSuggestion()
useManualDescription()
```

All sessions are immutable and always carry `persisted: false` and `automaticSave: false`. Acceptance requires an explicit state transition but does not save anything. Editing preserves `analysisId`; ignoring returns control to manual input; manual description remains available even without an AI session.

## 9. Municipal Arabic fixture catalog

Twenty deterministic cases were added:

1. Asphalt pothole
2. Road cracking
3. Ground subsidence
4. Leaning lighting pole
5. Damaged lighting pole
6. Fallen palm tree
7. Fallen tree
8. Construction waste
9. Overflowing container
10. Water leakage
11. Damaged sign
12. Visual pollution
13. Damaged sidewalk
14. Exposed electrical cable
15. Open manhole
16. Abandoned vehicle
17. Damaged barrier
18. Illegal excavation
19. Unclear image
20. Unsupported/non-municipal image

All 19 supported summaries pass the Sprint 5A Arabic policy: formal Arabic, 5–15 words, concise issue plus action/impact. The unsupported case intentionally has no generated summary.

## 10. Sprint 4 StorageAdapter boundary

Policy outcomes:

| Reference | Outcome |
|---|---|
| Canonical private key with exact organization and observation | Allowed |
| Legacy private B2 key with exact organization | Allowed for future server resolution |
| Tenant-scoped `local-demo://` | Allowed in local/test only |
| Controlled in-memory test payload | Allowed locally within size limit |
| Cross-organization canonical/legacy reference | Denied |
| Embedded `data:image` | Denied; not treated as a controlled payload |
| Firebase/external/public HTTPS or other ambiguous reference | Denied |
| Invalid/traversal reference | Denied |

No storage adapter is called and no image is fetched or processed.

## 11. Tests

New suite: `test/sprint5b-local-ai-gateway.test.js`.

- Sprint 5A + 5B: **63 passed, 0 failed**.
- Full isolated security/policy regression: **216 passed, 0 failed, 0 skipped/todo**.
- Sprint 5B covers runtime, envelopes, trusted tenant context, capabilities, timeouts, provider failures, malformed output, advisory enforcement, no-persistence guarantees, inspector choices, provenance, storage boundary, 20 summaries and 18 provider conformance cases.
- The full regression ran locally without an emulator, external service or network dependency.

## 12. Sprint 5C integration boundary

Sprint 5C should remain server-only and local/Preview:

1. Select exactly one candidate adapter based on residency, DPA, security and cost requirements.
2. Implement the four Sprint 5A provider methods without modifying the gateway contract.
3. Keep credentials in an injected server-side secret accessor; never environment-copy them into browser code or reports.
4. Resolve private evidence only after existing authenticated tenant ownership checks; provide controlled bytes to the adapter rather than a public URL.
5. Run the full 18-case conformance suite plus adversarial Arabic/image fixtures.
6. Add a mock HTTP request/response adapter bound only to loopback during tests—no public deployment configuration.
7. Add cost, timeout, rate-limit and provider kill-switch controls.
8. Do not touch `processSmartInput()` or any save/workflow call. UI integration is a later separately approved phase.

## 13. Risks and rollback

Remaining blockers:

- No approved real provider, data-residency decision, DPA, API credential or municipal-image authorization.
- No production private-image resolver-to-provider transport.
- No verified municipal category/department master taxonomy.
- No approved adversarial/bias/hallucination evaluation set.
- No cost budget, rate limiter, audit sink, retention policy or operational kill switch.
- Before/after verification and priority handlers remain deliberately inactive.

Rollback is deletion/ignoring of the isolated Sprint 5B modules, test and report. No application import, flag, data, server, migration or cloud resource must be reverted.

## 14. Safety confirmation

- No protected page, login page, Firebase configuration, Firestore rule, Auth behavior, workflow, `storage-adapter.js` or `spatial-map.js` changed.
- No observation was created or saved.
- No real image was opened, fetched, uploaded or processed.
- No external API, vendor SDK, API key, cloud resource, public listener or Production service was used.
- No dependency install, deploy, commit, push, merge, reset or clean occurred.
- Existing pre-Sprint workspace changes remain intact.
