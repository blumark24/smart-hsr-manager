/* SMART HSR — offline, synthetic-only municipal field case demonstration.
 * This module has NO imports, credentials, storage, fetch calls, or real GIS coordinates.
 * Its five-stage simulated workflow does not claim parity with deployed production APIs.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SmartHSROfflineFieldDemo = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';
  const STATUS = Object.freeze({
    PENDING: 'رصد',
    ASSIGNED: 'إسناد',
    IN_PROGRESS: 'تنفيذ',
    PENDING_REVIEW: 'تحقق',
    COMPLETED: 'إغلاق',
  });
  const ACTIONS = Object.freeze({
    assign: { from: 'PENDING', to: 'ASSIGNED', role: 'supervisor' },
    start: { from: 'ASSIGNED', to: 'IN_PROGRESS', role: 'field_worker' },
    submit: { from: 'IN_PROGRESS', to: 'PENDING_REVIEW', role: 'field_worker' },
    verify: { from: 'PENDING_REVIEW', to: 'COMPLETED', role: 'inspector' },
  });
  const SYNTHETIC_TENANT = 'DEMO-TENANT-ONLY';
  const SYNTHETIC_CASE = 'SYN-FIELD-0001';
  const SYNTHETIC_WORKER = 'DEMO-WORKER-01';
  const INITIAL_TIME = '2026-11-01T00:00:00.000Z';

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }
  function createDemo() {
    return {
      tenantId: SYNTHETIC_TENANT,
      observations: [{
        caseId: SYNTHETIC_CASE,
        tenantId: SYNTHETIC_TENANT,
        type: 'visual_distortion',
        status: 'PENDING',
        assignedTo: null,
        updatedAt: INITIAL_TIME,
        locationVerified: false,
        coordinates: null,
        evidence: null,
      }],
      generalIncidents: [],
      audit: [{
        caseId: SYNTHETIC_CASE, action: 'created', status: 'PENDING',
        role: 'synthetic_fixture', at: INITIAL_TIME,
      }],
    };
  }
  function act(state, action, actor, at, options) {
    const rule = ACTIONS[action];
    if (!rule) throw new Error('UNKNOWN_ACTION');
    if (!actor || actor.tenantId !== SYNTHETIC_TENANT || state.tenantId !== SYNTHETIC_TENANT) {
      throw new Error('TENANT_DENIED');
    }
    if (actor.role !== rule.role) throw new Error('ROLE_DENIED');
    if (typeof at !== 'string' || !Number.isFinite(Date.parse(at)) ||
        new Date(at).toISOString() !== at ||
        Date.parse(at) <= Date.parse(state.observations[0].updatedAt)) {
      throw new Error('INVALID_EVENT_TIME');
    }
    const current = state.observations[0];
    if (current.status !== rule.from || current.caseId !== SYNTHETIC_CASE ||
        current.tenantId !== SYNTHETIC_TENANT) {
      throw new Error('INVALID_TRANSITION');
    }
    if (action === 'assign' && actor.id !== 'DEMO-SUPERVISOR-01') throw new Error('ACTOR_DENIED');
    if (action === 'start' || action === 'submit') {
      if (actor.id !== SYNTHETIC_WORKER || current.assignedTo !== SYNTHETIC_WORKER) {
        throw new Error('ASSIGNEE_DENIED');
      }
    }
    if (action === 'submit' && (options?.evidenceTag !== 'SYNTHETIC-EVIDENCE-ONLY')) {
      throw new Error('SYNTHETIC_EVIDENCE_REQUIRED');
    }
    if (action === 'verify' &&
        (actor.id !== 'DEMO-INSPECTOR-01' || options?.humanApproved !== true)) {
      throw new Error('HUMAN_VERIFICATION_REQUIRED');
    }
    const next = copy(state);
    const observation = next.observations[0];
    observation.status = rule.to;
    observation.updatedAt = at;
    if (action === 'assign') observation.assignedTo = SYNTHETIC_WORKER;
    if (action === 'submit') observation.evidence = {
      kind: 'synthetic', tag: 'SYNTHETIC-EVIDENCE-ONLY',
      note: 'مثال اصطناعي؛ لا توجد صورة أو وثيقة حقيقية',
    };
    next.audit.push({
      caseId: observation.caseId, action, status: rule.to,
      role: actor.role, at,
    });
    return next;
  }
  function project(state) {
    const row = state?.observations?.[0];
    if (!row || row.caseId !== SYNTHETIC_CASE || row.tenantId !== SYNTHETIC_TENANT ||
        state.tenantId !== SYNTHETIC_TENANT) throw new Error('INVALID_SYNTHETIC_SOURCE');
    const summary = {
      caseId: row.caseId,
      status: row.status,
      label: STATUS[row.status],
      updatedAt: row.updatedAt,
    };
    if (!summary.label) throw new Error('UNKNOWN_STATUS');
    const kpis = Object.fromEntries(Object.keys(STATUS).map(s =>
      [s, state.observations.filter(o => o.tenantId === state.tenantId && o.status === s).length]));
    const incidents = (state.generalIncidents || [])
      .filter(i => i.tenantId === state.tenantId && i.type !== 'visual_distortion')
      .map(i => i.caseId);
    return {
      kpis,
      manager: copy(summary),
      map: { ...copy(summary), hasVerifiedGPS: row.locationVerified === true && row.coordinates !== null,
        position: row.locationVerified === true ? copy(row.coordinates) : null },
      twin: copy(summary),
      detail: { ...copy(summary), assignedTo: row.assignedTo, evidence: copy(row.evidence) },
      generalIncidentIds: incidents,
      audit: copy(state.audit),
    };
  }
  return Object.freeze({ STATUS, SYNTHETIC_TENANT, SYNTHETIC_CASE, SYNTHETIC_WORKER,
    createDemo, act, project });
});
