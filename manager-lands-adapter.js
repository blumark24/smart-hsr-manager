'use strict';
// PHASE 05B — read-only Lands data adapter for the Municipality Manager's own
// dedicated إدارة الأراضي والممتلكات dashboard.
//
// Reuses the SAME authenticated Firebase app/session manager-dashboard-
// adapter.js already established ('smart-hsr-manager-session') — never a
// second Firebase app, never a second login, connected only once the manager
// explicitly opens the Lands product (see manager.html's openLandsManager()).
//
// Reads ONLY landsMunicipalities/{organizationId}/... under the existing,
// unmodified Firestore Rules (verified in the Phase 05A cross-repo audit:
// smart-hsr-lands' own firebase/firestore.rules has not drifted from the
// copy already reconciled into this repo's firestore.rules). No write, no
// mutation, no entitlement/Rules change of any kind is performed here.
//
// Tenant mapping: organizationId (this Manager session's own tenant key) is
// used directly as Lands' municipality_id — not an invented mapping; it is
// the exact mapping api/_lib/landsManagerBootstrap.js already uses
// (`const municipalityId = caller.organizationId`).
//
// Firestore Rules require an existing, enabled `municipal_manager` Lands
// membership (enabledMember(municipalityId)) before ANY Lands collection can
// be read. That membership is established by calling the EXISTING, already
// -approved, idempotent, self-only bootstrap operation — api/admin/users.js
// action 'landsBootstrap' (PHASE 06A.2: consolidated from the former
// dedicated api/admin/lands-bootstrap.js endpoint to stay within Vercel's
// Hobby-plan serverless-function limit) — never redesigned here, only
// invoked, and only for the caller's own uid/organizationId (this action
// takes no target parameter at all).
//
// PHASE 05C — Production boundary, proven (not assumed): Manager and Lands
// share ONE Firebase project in every real environment, not just Preview.
// Preview: both apps use smart-hsr-staging-blumark24 (this repo's own
// firebase-runtime-config.js). Production: both apps use smart-hsr-manager
// — confirmed directly in smart-hsr-lands' own source
// (client/lands-client.js's PRODUCTION_PROJECT_ID, introduced in that repo's
// commit ec2f0e5 "make Lands client environment-aware... the SAME existing
// Smart HSR Production Firebase project smart-hsr-manager already uses —
// not a new project"). The prior belief that Lands' own server-side
// verifyIdToken() would reject a Manager-issued Production token was true
// only while a since-fixed Workload Identity Federation quota-project gap
// on Lands' side blocked its Production Firestore/Storage access (that
// repo's commit 6cd5b8c, "IAM is not the gap... Full 62-test suite
// re-verified green") — it does not apply once Lands' Production runtime is
// deployed against smart-hsr-manager as its own source now declares.
// Because both apps' real-time Firestore reads terminate at the SAME
// project in both environments, this adapter's direct onSnapshot calls
// against the manager's own already-authenticated Firebase app are the
// complete, sufficient Manager -> Lands read path everywhere — no separate
// cross-project bridge is required or exists. Tenant isolation is enforced
// exactly once, at the one real boundary that matters regardless of which
// project is active: Firestore Rules' enabledMember(municipalityId), keyed
// off request.auth.uid, never off anything this file or its caller
// supplies — a manager whose real landsMunicipalities/{X}/userAccess/{uid}
// document does not exist or is not enabled cannot read municipality X's
// data no matter what this adapter's local orgId variable claims.
// A real permission/network error (e.g. an unbootstrapped manager, or a
// genuine outage) still surfaces honestly as liveLandsDataState:'error' —
// never masked, never backed by fake data — but that is an authorization or
// availability outcome, not a project-boundary one.

const isLocalPreview = () => ['localhost', '127.0.0.1'].includes(location.hostname)
  && new URLSearchParams(location.search).get('preview') === '1';

let activeComponent = null;
let stopGrants = null;
let stopParcels = null;
let stopDocuments = null;
let stopAudit = null;
let bootstrapAttempted = false;

// PHASE 09 GATE 1 — re-ported from Lands' CURRENT authoritative source,
// smart-hsr-lands/client/lands-core.js's computeCompleteness(). The
// previous port (from an earlier lands-domain.js on the
// design/lands-vision2030-final-ui branch) checked fields Lands' real,
// Rules-enforced landGrant schema never populates — nested
// beneficiary/royal_order/allocation_decision objects, denormalized
// plan_reference_number/parcel_reference_number strings, and a
// conveyance{letter_number,letter_date} object that does not exist
// anywhere in Lands' schema, Rules, or trusted server code. Every grant
// was silently scored far below its real completeness. The real schema
// (confirmed against landsMunicipalities/{id}/landGrants' Rules
// validLandGrant() allowlist) only ever carries the *_id foreign keys
// and document_ids below. Lands' function also accepts a `related` map
// (whether each referenced record still exists) that this read-only,
// single-document adapter does not fetch; omitting it defaults every
// related-record check to true, matching Lands' own default semantics
// for "no evidence the referenced record was deleted."
// Pure function, no I/O — safe to port for read-only rendering since a
// direct ESM import is not possible from manager.html's non-module inline
// Designer script (the same constraint manager-dashboard-adapter.js's own
// header comment documents for window.SmartHSRFormat).
function computeGrantCompleteness(grant) {
  const checks = [
    ['beneficiary', Boolean(grant.beneficiary_id)],
    ['royal_order', Boolean(grant.royal_order_id)],
    ['allocation_decision', Boolean(grant.allocation_decision_id)],
    ['plan', Boolean(grant.plan_id)],
    ['parcel', Boolean(grant.parcel_id)],
    ['documents', Array.isArray(grant.document_ids) && grant.document_ids.length > 0]
  ];
  const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
  const percentage = Math.round(((checks.length - missing.length) / checks.length) * 100);
  return { status: missing.length ? 'incomplete' : 'complete', missing, percentage };
}

// ---- ported from smart-hsr-lands/client/lands-spatial.js (verbatim logic) ----
function isGeoreferenced(parcel) {
  return Boolean(parcel && parcel.spatial && parcel.spatial.geometry);
}

// ---- adapted from smart-hsr-lands/index.html's AutomationEngine ----
// decisionStats() ported verbatim (same three-bucket, mutually-exclusive
// formula: review takes priority, then complete, then needsWork). Applied
// here directly over the FULL scoped grant set rather than per-allocation-
// decision-number groups — AutomationEngine.attentionItems()'s
// decisionGroups()-based grouping is presentation logic this read-only
// executive summary does not need; documented simplification, not a data
// change. missingDocuments()/noLocationRecords() are the same predicates,
// adapted to take the already-loaded documents/parcels arrays as arguments
// instead of reading module-level `domains`.
const STATUS_LABELS = Object.freeze({
  draft: 'مسودة', under_review: 'تحت المراجعة', incomplete: 'تحتاج استكمال',
  approved: 'معتمدة', rejected: 'مرفوضة'
});

function decisionStats(scopedGrants) {
  const total = scopedGrants.length;
  const review = scopedGrants.filter(g => g.status === 'under_review').length;
  const complete = scopedGrants.filter(g => g.completeness.status === 'complete' && g.status !== 'under_review').length;
  const needsWork = total - complete - review;
  const avgPercent = total ? Math.round(scopedGrants.reduce((a, g) => a + g.completeness.percentage, 0) / total) : 0;
  return { total, complete, review, needsWork, avgPercent };
}
function missingDocuments(grants, documents) {
  return grants.filter(g => !documents.some(d => d.record_domain === 'landGrants' && d.record_id === g.id));
}
function noLocationRecords(grants, parcelsById) {
  return grants.filter(g => !isGeoreferenced(parcelsById.get(g.parcel_id)));
}
function documentsForGrant(grantId, documents) {
  return documents.filter(d => d.record_domain === 'landGrants' && d.record_id === grantId);
}

function normalizeGrant(entry) {
  const data = entry.data() || {};
  return { id: entry.id, ...data, completeness: computeGrantCompleteness(data) };
}
function normalizeDocument(entry) {
  const data = entry.data() || {};
  return { id: entry.id, ...data };
}

function buildViewData(grants, documents, parcels, auditEvents, auditState) {
  const stats = decisionStats(grants);
  const parcelsById = new Map(parcels.filter(p => p.id).map(p => [p.id, p]));
  const missingDocs = missingDocuments(grants, documents);
  const noLocation = noLocationRecords(grants, parcelsById);
  const approved = grants.filter(g => g.status === 'approved').length;
  const lowestCompletion = grants
    .filter(g => g.completeness.status === 'incomplete')
    .slice()
    .sort((a, b) => a.completeness.percentage - b.completeness.percentage)
    .slice(0, 5);

  return {
    kpi: {
      total: String(stats.total),
      review: String(stats.review),
      needsWork: String(stats.needsWork),
      approved: String(approved),
      complete: String(stats.complete),
      avgPercent: `${stats.avgPercent}%`,
      missingDocs: String(missingDocs.length),
      noLocation: String(noLocation.length)
    },
    registry: grants.map(g => ({
      id: g.id,
      reference: g.royal_order?.number || g.allocation_decision?.number || g.id,
      beneficiary: g.beneficiary?.name || 'غير متاح',
      royalOrder: g.royal_order?.number || '—',
      allocationDecision: g.allocation_decision?.number || '—',
      status: STATUS_LABELS[g.status] || g.status || 'غير معروف',
      statusCode: g.status,
      completion: `${Math.round(g.completeness.percentage)}%`,
      docCount: documentsForGrant(g.id, documents).length,
      updatedAt: g.updated_at || null
    })),
    documents: documents.map(d => ({
      id: d.id,
      filename: d.filename || 'ملف بدون اسم',
      recordDomain: d.record_domain || '—',
      recordId: d.record_id || '—',
      mimeType: d.mime_type || '—',
      sizeBytes: typeof d.size_bytes === 'number' ? d.size_bytes : null,
      createdAt: d.created_at || null
    })),
    priorities: lowestCompletion.map(g => ({
      id: g.id,
      reference: g.royal_order?.number || g.allocation_decision?.number || g.id,
      beneficiary: g.beneficiary?.name || 'غير متاح',
      percentage: Math.round(g.completeness.percentage)
    })),
    issueFocus: [
      { name: 'تحت المراجعة', n: stats.review },
      { name: 'غير مرتبطة هندسيًا', n: noLocation.length },
      { name: 'نقص مستندات', n: missingDocs.length }
    ],
    noGeometry: noLocation.length === grants.length || grants.length === 0,
    georeferencedCount: grants.length - noLocation.length,
    auditEvents: auditEvents.map(e => ({
      id: e.id,
      action: e.action || '—',
      actorRole: e.actor_role || '—',
      occurredAt: e.occurred_at || null
    })),
    auditState
  };
}

function publish(component, payload) {
  if (!component || component !== activeComponent) return;
  component.liveLandsKpi = payload.kpi;
  component.liveLandsRegistry = payload.registry;
  component.liveLandsDocuments = payload.documents;
  component.liveLandsPriorities = payload.priorities;
  component.liveLandsIssueFocus = payload.issueFocus;
  component.liveLandsNoGeometry = payload.noGeometry;
  component.liveLandsGeoreferencedCount = payload.georeferencedCount;
  component.liveLandsAuditEvents = payload.auditEvents;
  component.liveLandsAuditState = payload.auditState;
  component.liveLandsDataState = 'ready';
  component.liveLandsDataError = '';
  component.setState(state => ({ landsRevision: (state.landsRevision || 0) + 1 }));
}

function fail(component, message) {
  if (!component || component !== activeComponent) return;
  component.liveLandsDataState = 'error';
  component.liveLandsDataError = message;
  component.setState(state => ({ landsRevision: (state.landsRevision || 0) + 1 }));
}

async function ensureBootstrap(idToken) {
  if (bootstrapAttempted) return true;
  try {
    // PHASE 06A.2 — the dedicated api/admin/lands-bootstrap.js endpoint was
    // consolidated into api/admin/users.js as action 'landsBootstrap' (to
    // stay within Vercel's Hobby-plan serverless-function limit); same
    // self-only, idempotent, already-approved bootstrap operation, no
    // target parameter, just a different action name on the existing
    // trusted Admin API.
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action: 'landsBootstrap' })
    });
    if (!res.ok) return false;
    bootstrapAttempted = true;
    return true;
  } catch (_) {
    return false;
  }
}

async function start(component) {
  const orgId = component.state?.orgId;
  if (!orgId) { fail(component, 'تعذر تحديد هوية المنظمة الحالية.'); return; }

  const idToken = await (component.getAuthToken ? component.getAuthToken() : Promise.resolve(null));
  if (!idToken) { fail(component, 'تعذر التحقق من جلسة المصادقة.'); return; }

  // Best-effort only: a manager who was already bootstrapped in an earlier
  // session must not be blocked from reading their own real Lands data just
  // because this one repeat, idempotent bootstrap call had a transient
  // failure. Firestore Rules — not this call's own success/failure — are
  // the actual authority on whether the reads below are allowed; a genuine
  // "never bootstrapped, not entitled" manager still gets an honest
  // permission-denied error from the onSnapshot calls themselves.
  await ensureBootstrap(idToken);

  const [appApi, firestoreApi] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js')
  ]);
  const app = appApi.getApps().find(item => item.name === 'smart-hsr-manager-session');
  if (!app) { fail(component, 'لا توجد جلسة Firebase نشطة.'); return; }
  const db = firestoreApi.getFirestore(app);

  const base = `landsMunicipalities/${orgId}`;
  let grants = [], documents = [], parcels = [], auditEvents = [];
  let auditState = 'loading';
  const update = () => publish(component, buildViewData(grants, documents, parcels, auditEvents, auditState));

  stopGrants = firestoreApi.onSnapshot(
    firestoreApi.collection(db, `${base}/landGrants`),
    { includeMetadataChanges: true },
    snapshot => { if (snapshot.metadata.fromCache) return; grants = snapshot.docs.map(normalizeGrant); update(); },
    () => fail(component, 'تعذر تحميل سجل الأراضي.')
  );
  stopDocuments = firestoreApi.onSnapshot(
    firestoreApi.collection(db, `${base}/documents`),
    { includeMetadataChanges: true },
    snapshot => { if (snapshot.metadata.fromCache) return; documents = snapshot.docs.map(normalizeDocument); update(); },
    () => fail(component, 'تعذر تحميل مستندات الأراضي.')
  );
  stopParcels = firestoreApi.onSnapshot(
    firestoreApi.collection(db, `${base}/parcels`),
    { includeMetadataChanges: true },
    snapshot => { if (snapshot.metadata.fromCache) return; parcels = snapshot.docs.map(normalizeDocument); update(); },
    () => { /* parcels are optional for KPI purposes — treat as none-georeferenced rather than failing the whole dashboard */ parcels = []; update(); }
  );
  // auditLogs read is manager-role-gated by Rules (see Section 6 of the
  // Phase 05B brief) — a permission-denied here means the bootstrap above
  // has not yet propagated or the caller genuinely isn't authorized; either
  // way this must degrade to an honest "unavailable" panel state, never a
  // Rules change and never fabricated events.
  stopAudit = firestoreApi.onSnapshot(
    firestoreApi.query(firestoreApi.collection(db, `${base}/auditLogs`), firestoreApi.orderBy('occurred_at', 'desc'), firestoreApi.limit(5)),
    { includeMetadataChanges: true },
    snapshot => { if (snapshot.metadata.fromCache) return; auditEvents = snapshot.docs.map(normalizeDocument); auditState = 'ready'; update(); },
    () => { auditEvents = []; auditState = 'unavailable'; update(); }
  );
}

window.SmartHSRLandsAdapter = {
  connect(component) {
    if (activeComponent === component) return;
    this.disconnect();
    activeComponent = component;
    component.liveLandsDataState = 'loading';
    component.liveLandsDataError = '';
    if (isLocalPreview()) {
      component.liveLandsDataState = 'ready';
      publish(component, buildViewData([], [], [], [], 'unavailable'));
      return;
    }
    start(component).catch(() => fail(component, 'تعذر تحميل بيانات إدارة الأراضي والممتلكات.'));
  },
  disconnect(component) {
    if (component && component !== activeComponent) return;
    stopGrants?.(); stopDocuments?.(); stopParcels?.(); stopAudit?.();
    stopGrants = stopDocuments = stopParcels = stopAudit = null;
    activeComponent = null;
  }
};
