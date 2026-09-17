# Vendored third-party libraries

PHASE 08.3 — these are the exact same versions `twin.html` and
`operational-map.html` previously loaded from external CDNs, vendored
locally so those two pages don't depend on outbound access to
`gstatic.com`, `unpkg.com`, `cdnjs.cloudflare.com`, or `cdn.jsdelivr.net`
at runtime, in local acceptance testing, Preview, or Production alike.
Each is the unmodified upstream build for its pinned version, taken from
the corresponding npm package already used elsewhere in this repo
(`cesium`, `maplibre-gl`) or fetched at the exact same version for this
purpose (`firebase`).

| Library | Version | Previously loaded from | License |
|---|---|---|---|
| `firebase/11.0.0/` | 11.0.0 | `www.gstatic.com/firebasejs/11.0.0/` | Apache-2.0 |
| `cesium/1.122.0/` | 1.122.0 | `unpkg.com/cesium@1.122.0/Build/Cesium/` | Apache-2.0 (see `cesium/1.122.0/LICENSE.md`) |
| `maplibre-gl/4.7.1/` | 4.7.1 | `unpkg.com/maplibre-gl@4.7.1/dist/` | BSD-3-Clause (see `maplibre-gl/4.7.1/LICENSE.txt`) |

`firebase-auth.js` and `firebase-firestore.js` had one hardcoded absolute
import URL each (`https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js`,
gstatic's own self-referential cross-module import) rewritten to the
relative `./firebase-app.js` so they resolve locally; nothing else in any
of the three libraries was modified.
