# SMART HSR Spatial Intelligence v1

## Product decision

SMART HSR will use one proprietary spatial experience across all municipal map surfaces. The product will not ship separate unrelated maps for Home, Field Survey, Operational Map, and Digital Twin.

The architecture is:

1. Executive Command Map — Municipality Manager Home
2. Field Intelligence Map — Field Survey
3. Spatial Command Center — Full Operational Map
4. Digital Twin — Deep spatial object view

All four surfaces share one spatial design language, one interaction model, one permission model, and one data contract.

## Experience principles

- SMART HSR-native visual identity only.
- No visible third-party provider branding in primary interface chrome.
- Any legally required data attribution must be kept in a discreet Data / Legal information surface rather than used as product branding.
- Government-grade Arabic RTL.
- Day + Night parity.
- No stock GIS look.
- No generic default Leaflet controls.
- No duplicated map logic across views.
- No fake AI metrics or fabricated operational data.
- Every AI-derived signal must be explainable and traceable to source inputs.
- Every critical action remains human-approved.

## Spatial visual language

### Night
- Deep municipal navy base.
- Cyan/teal topology.
- Emerald verified/healthy state.
- Amber attention state.
- Red critical state.
- Controlled glow only on active spatial signals.
- High-contrast road/label hierarchy.
- Glass surfaces with restrained blur.

### Day
- Municipal mist-green / warm grey base.
- Low-glare neutral geography.
- Dark green structural boundaries.
- Cyan intelligence overlays.
- No pure-white map field.

## Master capabilities

### Municipal Pulse
A municipality/sector operational health indicator calculated only from verified metrics:
- open cases
- response time
- coverage
- delayed missions
- unresolved critical incidents
- repeat-location frequency

Every score must include an explanation panel.

### Spatial Lenses
One-click context modes:
- الوضع الآن
- الأولويات
- التغطية
- المخاطر
- الإنجاز

Each lens changes layer emphasis, filters, labels, and decision context without changing the underlying data source.

### Ask the Map
Natural-language spatial query surface.
Examples:
- أين أعلى ضغط تشغيلي اليوم؟
- اعرض البلاغات المتأخرة أكثر من 48 ساعة.
- أين توجد فجوات تغطية؟
- اعرض المركبات خارج النطاق.

Expected behavior:
query -> spatial filters -> zoom/focus -> highlighted layer -> explainable summary.

### Smart Action Card
Every selected spatial object opens a SMART HSR action card instead of a generic map popup.

Required fields when available:
- object identity
- current status
- priority
- responsible person/team
- elapsed time
- location
- last action
- evidence preview
- next allowed action
- Digital Twin entry

### Operational Playback
Time-based spatial replay for verified historical events:
- field movement
- reports created
- reports resolved
- vehicles
- task assignment
- out-of-range alerts
- coverage changes

### Spatial Memory
Location-centric history:
- repeated cases
- prior visits
- before/after evidence
- contractor activity
- linked municipal services
- decisions

### Cross-Service Intelligence
Spatial relationships across:
- Field Survey
- Lands
- Mobility
- Reports / Incidents
- Vehicles / Teams

Cross-service relationships must be explicitly derived, not inferred without evidence.

## Surface definitions

### A. Executive Command Map
Location: Municipality Manager Home.

Purpose:
Answer within five seconds:
- What is happening?
- Where is attention required?
- Is coverage healthy?
- What changed?

Must remain visually calm.
No dense GIS tools.

### B. Field Intelligence Map
Location: Manager Field Survey experience.

Default layer scope:
Field Survey only.

Capabilities:
- observations
- inspectors
- assignment
- visit status
- evidence
- coverage
- before/after
- route context

### C. Spatial Command Center
Location: Dedicated Operational Map.

This is the master municipal GIS experience.

Core layers:
- Field Survey
- Lands
- Mobility
- Reports
- Incidents
- Vehicles
- Teams
- Municipal boundaries
- Risk / coverage overlays

Core controls:
- Smart search
- Layer manager
- Spatial lenses
- Timeline
- Street / satellite / custom vector style
- Clustering
- Selection
- Fullscreen
- Explainability panel
- Digital Twin launch

### D. Digital Twin
Digital Twin is not a fourth generic map.

It is the deep spatial object surface.

Map -> Object -> Digital Twin

Examples:
- land parcel
- report
- vehicle
- mission
- municipal asset

Digital Twin should show:
- spatial context
- identity
- documents
- timeline
- relationships
- evidence
- decisions
- completeness
- audit trail

## Technical direction

### Immediate delivery path
Keep the current map engine during municipality delivery if replacing it would introduce risk.

Fix:
- current map visual regression
- dedicated route behavior
- full-map CTA
- Digital Twin routing
- map lifecycle/remount

### Spatial Platform v1 target
Recommended target stack for the proprietary map experience:

- MapLibre GL JS for custom vector rendering
- Self-hosted or controlled vector tiles / PMTiles where operationally justified
- SMART HSR custom style JSON
- SMART HSR custom controls/components
- Shared spatial state/controller
- Shared layer registry
- Shared permission-aware spatial DTOs

Optional future modules:
- deck.gl for dense analytical layers
- 3D terrain/buildings only where justified
- offline field tile package if municipal deployments require it

The visible product must never depend on a default vendor UI.

## Architecture rule

One shared spatial core:

SMART HSR Spatial Core
  -> Executive Map
  -> Field Map
  -> Operational Map
  -> Digital Twin

Shared:
- map style tokens
- layer definitions
- status semantics
- marker system
- clusters
- selection
- search
- permissions
- telemetry
- accessibility
- responsive behavior

## Acceptance gate

Spatial Intelligence v1 is not approved until:

- Home map visually renders correctly in Day and Night
- Dedicated Operational Map route works
- Full Operational Map works
- Digital Twin entry works
- No map view leaks cross-role or cross-tenant data
- No duplicated live map instances after navigation
- Desktop 1440 PASS
- Laptop 1180 PASS
- iPad portrait/landscape PASS
- Mobile 390 PASS
- Reduced-motion PASS
- Keyboard focus PASS
- Empty state PASS
- Data-loaded state PASS
- Loading/error state PASS
- P0 = 0
- P1 = 0

## Design quality target

Target: 10/10 product quality by acceptance criteria, not visual effects alone.

10/10 means:
- unmistakably SMART HSR
- operationally useful
- fast
- explainable
- accessible
- stable
- permission-safe
- visually premium
- consistent across all spatial surfaces
