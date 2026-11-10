# Inspector V2 functional inventory

Baseline: `666e7d3`. Reference UI is preserved verbatim as non-executable test data at `test/fixtures/legacy/dashboard.txt`; `test/` is excluded from Vercel deployments. It is not imported by V2. Historical source assertions explicitly read that fixture; they are not evidence that V2 works.

| Legacy capability | Decision | Independent V2 implementation / constraint |
| --- | --- | --- |
| Firebase session and inspector role | REFACTOR | Firebase Auth SDK; trusted API resolves active inspector from users; authoritative active owner/manager records deny workspace access |
| Organization and creator scope | KEEP | Every list/count/cursor/write checks authenticated organization AND creator; inputs cannot select tenant |
| Personal report list, filters, pagination | REPLACE | Tasks route, text/status filters for loaded pages, server cursor pages of 25 |
| KPI tiles | REFACTOR | Server aggregate counts over all own records; no fabricated targets or trend data |
| Personal map, status markers, selection | REPLACE | Lazy Leaflet adapter, own loaded reports only, accessible markers, compact case card and native dialog |
| Location centering and map context | REFACTOR | Authenticated organization context and actual device coordinates; no invented city location |
| GPS confirmation | REFACTOR | Three sequential high-accuracy samples, stability test, ≤30m accuracy, ≤30s age; cancellation on hidden/pagehide; server enforces accuracy/freshness and configured municipality bounds |
| Manual map correction / weak GPS bypass | REMOVE | Not exposed; no weaker bypass to GPS validation |
| Capture and file selection | REPLACE | Native file/camera input, JPEG/PNG/WebP; bounded compression to existing 700KiB storage limit |
| Private before evidence upload | KEEP | Existing authenticated upload/read services and MIME/container validation; pending upload ownership checked at atomic creation |
| Observation creation and retries | REFACTOR | Server transaction uses create-only write + pending-evidence finalization; fixed UUID, exact acknowledgement, no overwrite of existing observations |
| Draft Vision analysis and cached binding | KEEP | Existing secured AI analyze/bind endpoints; optional advisory with explicit human review; failure does not block non-AI report creation |
| Persisted Vision / root cause / work order | REPLACE | Case sheet calls existing server endpoints; outputs remain advisory; no workflow mutation |
| Before/after comparison | REPLACE | Lazy authenticated evidence images shown side by side / stacked; no legacy slider or modal |
| After image and resolution note | REFACTOR | Transaction permitted only for own non-completed, unassigned observation without previous after evidence; status unchanged |
| Inspector direct completion | REMOVE | Legacy attempted completion despite deployed rule denial and could falsely show success. V2 never closes or approves observations |
| Supervisor/manager review, contractor assignment | NOT APPLICABLE | Read actual status, assignment UID and supervisor note; real mutations stay in existing authorized workspaces |
| Navigation to report | KEEP | Google Maps directions with verified coordinates, opened with noopener/noreferrer |
| Quick photo/note/observation | REPLACE | Capture route with focused photo/note fields; same validation and server save |
| Location scan | REPLACE | Operational map + explicit GPS control; no invented scanning service |
| Account and logout | REPLACE | Real session identity and sign-out, no local editable privilege fields |
| Theme, giant modals, local demo badge, inline UI patches | REMOVE | Independent navy/green responsive stylesheet and small icon module; no legacy CSS/scripts |
| PDF/KPI insight buttons | REMOVE | Legacy functions were alerts / unavailable; no fake equivalent |
| Weather, notification count, 3D map, SLA countdown | NOT APPLICABLE | No backend contract available. Weather/countdown/3D omitted; notifications honestly disabled |
| Inspector assignment queue, contractor directory, routing optimization | NOT APPLICABLE | Backend currently exposes creator-owned observations, not assignments to inspectors. No simulated queue/company/geofence/SLA |

Every primary route exists under `inspector.html#home`, `#tasks`, `#new`, `#statistics`, `#account`, `#map`. `dashboard.html` is a small forward-only compatibility entry to V2. Login and contractor role recovery target V2 directly.
