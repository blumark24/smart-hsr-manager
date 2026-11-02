/* Offline-only UI. No server APIs, cookies, localStorage, Firebase or network access. */
(function () {
  'use strict';
  const api = window.SmartHSROfflineFieldDemo;
  if (!api) throw new Error('OFFLINE_DEMO_MODULE_MISSING');
  let state = api.createDemo();
  const byId = id => document.getElementById(id);
  const actors = Object.freeze({
    assign: { id: 'DEMO-SUPERVISOR-01', role: 'supervisor', tenantId: api.SYNTHETIC_TENANT },
    start: { id: api.SYNTHETIC_WORKER, role: 'field_worker', tenantId: api.SYNTHETIC_TENANT },
    submit: { id: api.SYNTHETIC_WORKER, role: 'field_worker', tenantId: api.SYNTHETIC_TENANT },
    verify: { id: 'DEMO-INSPECTOR-01', role: 'inspector', tenantId: api.SYNTHETIC_TENANT },
  });
  const expected = Object.freeze({
    assign: 'PENDING', start: 'ASSIGNED', submit: 'IN_PROGRESS', verify: 'PENDING_REVIEW',
  });
  const options = Object.freeze({
    submit: { evidenceTag: 'SYNTHETIC-EVIDENCE-ONLY' },
    verify: { humanApproved: true },
  });

  function render() {
    const data = api.project(state);
    byId('caseId').textContent = data.manager.caseId;
    byId('status').textContent = data.manager.label;
    byId('updatedAt').textContent = data.manager.updatedAt;
    byId('mapCase').textContent = data.map.caseId;
    byId('mapStatus').textContent = data.map.label + ' • ' + data.map.updatedAt;
    byId('mapLocation').textContent = data.map.hasVerifiedGPS
      ? 'نقطة موثقة' : 'الموقع غير موثق — لا يتم عرض علامة جغرافية';
    byId('twinCase').textContent = data.twin.caseId;
    byId('twinStatus').textContent = data.twin.label + ' • ' + data.twin.updatedAt;
    byId('evidence').textContent = data.detail.evidence?.note ||
      'لا يوجد دليل بعد — لن نعرض صورة وهمية';
    byId('assignee').textContent = data.detail.assignedTo
      ? 'مسند إلى موظف تجريبي: ' + data.detail.assignedTo : 'لم يتم الإسناد بعد';
    byId('audit').textContent = JSON.stringify(data.audit, null, 2);

    const metrics = byId('kpis');
    metrics.replaceChildren();
    const stages = byId('trace');
    stages.replaceChildren();
    Object.keys(api.STATUS).forEach(key => {
      const tile = document.createElement('div');
      tile.className = 'kpi';
      const number = document.createElement('strong');
      number.textContent = String(data.kpis[key]);
      const caption = document.createElement('span');
      caption.textContent = api.STATUS[key];
      tile.append(number, caption);
      metrics.append(tile);
      const step = document.createElement('div');
      step.className = 'step' + (key === data.manager.status ? ' current' : '');
      step.textContent = api.STATUS[key];
      stages.append(step);
    });
    Object.keys(expected).forEach(action => {
      byId(action).disabled = expected[action] !== data.manager.status;
    });
  }

  Object.keys(actors).forEach(action => {
    byId(action).addEventListener('click', () => {
      try {
        const lastTime = Date.parse(state.observations[0].updatedAt);
        const at = new Date(Math.max(Date.now(), lastTime + 1000)).toISOString();
        state = api.act(state, action, actors[action], at, options[action] || {});
        byId('error').textContent = '';
      } catch (error) {
        byId('error').textContent = 'تعذر الانتقال: ' + error.message;
      }
      render();
    });
  });
  byId('reset').addEventListener('click', () => {
    state = api.createDemo();
    byId('error').textContent = '';
    render();
  });
  render();
})();
