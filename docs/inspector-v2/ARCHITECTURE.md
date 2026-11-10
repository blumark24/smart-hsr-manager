# Inspector V2 architecture and contracts

- `inspector.html`: independent RTL shell, accessible main navigation and native case dialog.
- `inspector/app.mjs`: presentation, route composition, state transitions and use-case coordination.
- `inspector/domain.mjs`: pure status, coordinate, distance, GPS and evidence eligibility policies.
- `inspector/services.mjs`: authenticated transport, bounded requests, image compression/upload, server repository and GPS adapter.
- `inspector/map.mjs`: lazy pinned Leaflet with integrity hashes, organization/GPS centering, markers, cleanup and honest tile failure state.
- `api/inspector/observations.js`: trusted access boundary, read repository, cursor/count queries, atomic create and after-evidence use cases.
- `api/_lib/evidenceBinding.js`: shared canonical key and pending-upload identifier policy, reused by upload/finalize/V2.

Existing Firebase Auth, private B2 storage, image validation, AI provider guards and review APIs are retained. No runtime dependency was added. Firebase Rules are unchanged. One additive composite count index is added. No database migration, destructive script, production command, user mutation or bulk observation rewrite was executed.

## API contract

All requests require a Firebase bearer token verified with revocation checking. Responses use `private, no-store`. Missing session -> 401; wrong/inactive/unscoped role or authoritative owner/manager -> 403. Errors never disclose private credentials/provider text.

`GET /api/inspector/observations[?cursor=<last-document-id>]` returns 25 allowlisted observation summaries, nextCursor, and own profile. A cursor must itself be owned by the caller in the same organization. Ordering uses createdAt descending and the document snapshot cursor. `GET ?summary=1` returns four status counts over the same complete scope.

`POST` accepts id, objectKey, title (1–160), details (≤3000), type (MAINTENANCE/CLEANLINESS/SAFETY/OTHER), latitude, longitude, accuracy (0–30, exclusive zero), capturedAt (milliseconds), sampleCount (integer ≥3), stable=true. Request size ≤8KiB. Fields such as organizationId, creator, status, timestamps, assignment, review or priority cannot be chosen by the client. GPS values are device reports, not cryptographic proof of physical presence. Configured organization bounds are checked server-side; absent bounds mean no geographical policy has been configured, never a guessed municipality boundary.

In a single Firestore transaction, the server verifies pending evidence owner, tenant, observation ID, canonical path, expiry and state; creates a new PENDING observation; finalizes evidence. Existing matching caller-owned IDs return confirmation without rewriting any field. Conflicting evidence fails closed. A timeout is an unknown outcome; retries preserve ID and payload. Successful creation is reported only after transaction completion. The browser freezes the submitted payload after an uncertain response; a definitive stale/outside-area rejection unlocks GPS recovery without reuploading evidence.

`PATCH` accepts id, objectKey and note, and only attaches after evidence without changing lifecycle. Assigned/completed observations and replacement of existing after evidence are denied. Exact retry is idempotent. No DELETE handler exists.

## Workflow extension contracts

Future inspector assignments, contractor names, municipality service areas, routes, SLA policies, notifications and review approval need explicit trusted endpoints and authorization rules. Their future optional fields must be additive and must not derive authorization from client data. Until implemented, V2 presents only existing assignment UID/status and own observations. Do not infer contractor responsibility, deadline, distance or field assignment from an image or AI suggestion.

Official lifecycle stays `PENDING -> IN_PROGRESS -> PENDING_REVIEW -> COMPLETED` under existing role permissions. V2 captures evidence and advisory output, but cannot approve or close. A future review endpoint must separately authorize inspector review; client visibility is never authorization.

## Performance / state

First server page bounded to 25; load more is explicit. Counts use aggregate queries. Leaflet loads only for map-bearing routes. Evidence loads on intersection or case opening through authenticated byte reads; object URLs and map instances are released on route/page exit. A sheet holds at most two evidence images until close. No permanent GPS watcher or database snapshot subscription. Stable GPS uses three sequential one-shot requests with a total timeout and cancellation. API requests and evidence reads have deadlines and AbortControllers. User changes invalidate pending list responses. No sensitive draft is stored in localStorage; a page reload loses an unsent draft, and this release does not claim offline queueing or cross-reload draft recovery.

## Visual scope

The supplied image governs compact map, floating case card, AI strip, current task, four quick actions, reports and floating bottom navigation. Tablet/desktop compose a two-column layout rather than stretching mobile. Identity remains the existing SVG and navy/green. Actual street map tiles are used, not an illustrated fake city. Weather, fictional counts, routes, 3D controls and countdowns are not reproduced without real services. Pixel-level visual acceptance remains a staging UAT task.
