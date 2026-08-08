// Overview module for the Owner Command Center (#/overview).
//
// Sprint 6.6.1: extracted rendering/chart logic verbatim from owner.html.
// Sprint 6.6.2: upgraded into an executive summary — richer KPI
// breakdowns, an Attention Center, Quick Actions (reusing the existing
// Organizations/Invoices/Users modal buttons and the router's own
// navigate(), never duplicating their logic), a Revenue Trend chart, and
// a Recent Activity empty-state (the audit backend is not active yet —
// no fabricated events).
// Sprint 6.7: added Organization Intelligence (total/active/trial/
// expired breakdown + latest-organizations list) and Revenue
// Intelligence (revenue/paid-invoices/subscription summary) panels,
// both derived from the same ORGS/INVOICES already read elsewhere in
// this module — no new data source, no new computation beyond what
// renderKPIs() already had.
//
// ORGS/INVOICES ownership stays in owner.html; this module only reads
// them via the injected getOrgs()/getInvoices(). No Firestore/Firebase
// calls here. Per the approved Sprint 6.6.1 decision, Users data is not
// aggregated across organizations — the Users KPI card is a static
// "unavailable" state, not computed from any API call.
export function initOverviewModule({ getOrgs, getInvoices, showNotif, navigate } = {}) {
  // رأس تنفيذي
  const overviewLastUpdated = document.getElementById('overviewLastUpdated');

  // بطاقات المؤشرات
  const kpiOrgsTotal = document.getElementById('kpiOrgsTotal');
  const kpiOrgsActiveBadge = document.getElementById('kpiOrgsActiveBadge');
  const kpiOrgsGrowthBadge = document.getElementById('kpiOrgsGrowthBadge');
  const kpiRevenue = document.getElementById('kpiRevenue');
  const kpiRevenueCountBadge = document.getElementById('kpiRevenueCountBadge');
  const kpiRevenueTrendBadge = document.getElementById('kpiRevenueTrendBadge');
  const kpiSubsActive = document.getElementById('kpiSubsActive');
  const kpiSubsExpiringBadge = document.getElementById('kpiSubsExpiringBadge');

  // مركز الانتباه
  const attentionList = document.getElementById('attentionList');

  // ذكاء المؤسسات والإيرادات
  const orgIntelligencePanel = document.getElementById('orgIntelligencePanel');
  const revenueIntelligencePanel = document.getElementById('revenueIntelligencePanel');

  // إجراءات سريعة — تُشغّل الأزرار الحقيقية للوحدات الأخرى، دون تكرار منطقها
  const qaAddOrg = document.getElementById('qaAddOrg');
  const qaNewInvoice = document.getElementById('qaNewInvoice');
  const qaAddUser = document.getElementById('qaAddUser');
  const qaAiCenter = document.getElementById('qaAiCenter');

  function formatSAR(n){ return new Intl.NumberFormat('ar-SA', {minimumFractionDigits:2, maximumFractionDigits:2}).format(n) + ' ر.س'; }

  const DAY_MS = 24 * 60 * 60 * 1000;
  const EXPIRING_SOON_DAYS = 30;

  function isSameMonth(a, b){ return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth(); }
  function monthsAgo(base, n){ return new Date(base.getFullYear(), base.getMonth() - n, 1); }

  function renderAttentionCenter(ORGS, now){
    if (!attentionList) return;
    const items = [];
    ORGS.forEach(o => {
      if (o.expiresAt) {
        const diff = new Date(o.expiresAt).getTime() - now.getTime();
        if (diff > 0 && diff <= EXPIRING_SOON_DAYS * DAY_MS) {
          items.push(`⚠ اشتراك «${o.name || o.id}» ينتهي قريباً`);
        }
      }
      if ((o.status || '') === 'expired') {
        items.push(`⚠ مؤسسة «${o.name || o.id}» غير نشطة`);
      }
    });

    attentionList.innerHTML = '';
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'muted text-sm';
      li.textContent = 'لا توجد تنبيهات حالياً';
      attentionList.appendChild(li);
      return;
    }
    items.slice(0, 5).forEach(text => {
      const li = document.createElement('li');
      li.textContent = text;
      attentionList.appendChild(li);
    });
    if (items.length > 5) {
      const li = document.createElement('li');
      li.className = 'muted text-xs';
      li.textContent = `+${items.length - 5} أخرى`;
      attentionList.appendChild(li);
    }
  }

  function renderOrgIntelligence(ORGS){
    if (!orgIntelligencePanel) return;
    orgIntelligencePanel.innerHTML = '';

    const title = document.createElement('h3');
    title.className = 'text-sm font-bold muted mb-3';
    title.textContent = 'ذكاء المؤسسات';
    orgIntelligencePanel.appendChild(title);

    const total = ORGS.length;
    const active = ORGS.filter(o => o.plan && o.plan !== 'Trial' && (o.status || 'active') === 'active').length;
    const trial = ORGS.filter(o => (o.plan === 'Trial' || (o.status || '') === 'trial')).length;
    const expired = ORGS.filter(o => (o.status || '') === 'expired').length;

    const stats = document.createElement('div');
    stats.className = 'status-strip mb-3';
    [['الإجمالي', total], ['نشطة', active], ['تجريبية', trial], ['منتهية', expired]].forEach(([label, value]) => {
      const chip = document.createElement('span');
      chip.className = 'status-chip';
      chip.textContent = `${label}: ${value}`;
      stats.appendChild(chip);
    });
    orgIntelligencePanel.appendChild(stats);

    const listTitle = document.createElement('p');
    listTitle.className = 'text-xs muted mb-2';
    listTitle.textContent = 'أحدث المؤسسات';
    orgIntelligencePanel.appendChild(listTitle);

    const latest = [...ORGS].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);
    if (!latest.length) {
      const empty = document.createElement('p');
      empty.className = 'muted text-sm';
      empty.textContent = 'لا توجد مؤسسات بعد';
      orgIntelligencePanel.appendChild(empty);
    } else {
      const list = document.createElement('ul');
      list.className = 'space-y-1 text-sm';
      latest.forEach(o => {
        const li = document.createElement('li');
        li.className = 'flex items-center justify-between gap-2 flex-wrap';
        const name = document.createElement('span');
        name.textContent = o.name || o.id;
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = `${o.plan || 'Trial'} · ${o.status || 'active'}`;
        li.appendChild(name); li.appendChild(badge);
        list.appendChild(li);
      });
      orgIntelligencePanel.appendChild(list);
    }
  }

  function renderRevenueIntelligence({ revenue, paidInvoicesCount, active, expiringSoon }){
    if (!revenueIntelligencePanel) return;
    revenueIntelligencePanel.innerHTML = '';

    const title = document.createElement('h3');
    title.className = 'text-sm font-bold muted mb-3';
    title.textContent = 'ذكاء الإيرادات';
    revenueIntelligencePanel.appendChild(title);

    const stats = document.createElement('div');
    stats.className = 'status-strip';
    [
      ['إجمالي الإيرادات', formatSAR(revenue)],
      ['فواتير مدفوعة', String(paidInvoicesCount)],
      ['اشتراكات نشطة', String(active)],
      ['تنتهي قريبًا', String(expiringSoon)],
    ].forEach(([label, value]) => {
      const chip = document.createElement('span');
      chip.className = 'status-chip';
      chip.textContent = `${label}: ${value}`;
      stats.appendChild(chip);
    });
    revenueIntelligencePanel.appendChild(stats);
  }

  function renderKPIs(){
    const ORGS = getOrgs();
    const INVOICES = getInvoices();
    const now = new Date();

    // المؤسسات
    const active = ORGS.filter(o => o.plan && o.plan !== 'Trial' && (o.status || 'active') === 'active').length;
    const growthThisMonth = ORGS.filter(o => o.createdAt && isSameMonth(new Date(o.createdAt), now)).length;
    if (kpiOrgsTotal) kpiOrgsTotal.textContent = ORGS.length;
    if (kpiOrgsActiveBadge) kpiOrgsActiveBadge.textContent = `نشطة: ${active}`;
    if (kpiOrgsGrowthBadge) kpiOrgsGrowthBadge.textContent = growthThisMonth > 0 ? `+${growthThisMonth} هذا الشهر` : 'لا نمو هذا الشهر';

    // الإيرادات
    const paidInvoices = INVOICES.filter(i => (i.status || '') === 'paid');
    const revenue = paidInvoices.reduce((sum, i) => sum + (i.total || 0), 0);
    const thisMonthRevenue = paidInvoices.filter(i => i.createdAt && isSameMonth(new Date(i.createdAt), now)).reduce((s, i) => s + (i.total || 0), 0);
    const lastMonthRevenue = paidInvoices.filter(i => i.createdAt && isSameMonth(new Date(i.createdAt), monthsAgo(now, 1))).reduce((s, i) => s + (i.total || 0), 0);
    if (kpiRevenue) kpiRevenue.textContent = formatSAR(revenue);
    if (kpiRevenueCountBadge) kpiRevenueCountBadge.textContent = `${paidInvoices.length} فاتورة`;
    if (kpiRevenueTrendBadge) {
      if (lastMonthRevenue > 0) {
        const pct = Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100);
        kpiRevenueTrendBadge.textContent = pct === 0 ? 'بدون تغيّر' : (pct > 0 ? `↑ ${pct}%` : `↓ ${Math.abs(pct)}%`);
      } else if (thisMonthRevenue > 0) {
        kpiRevenueTrendBadge.textContent = 'إيراد جديد هذا الشهر';
      } else {
        kpiRevenueTrendBadge.textContent = 'لا توجد بيانات كافية';
      }
    }

    // الاشتراكات
    const expiringSoon = ORGS.filter(o => {
      if (!o.expiresAt) return false;
      const diff = new Date(o.expiresAt).getTime() - now.getTime();
      return diff > 0 && diff <= EXPIRING_SOON_DAYS * DAY_MS;
    }).length;
    if (kpiSubsActive) kpiSubsActive.textContent = active;
    if (kpiSubsExpiringBadge) kpiSubsExpiringBadge.textContent = `تنتهي قريبًا: ${expiringSoon}`;

    renderAttentionCenter(ORGS, now);
    renderOrgIntelligence(ORGS);
    renderRevenueIntelligence({ revenue, paidInvoicesCount: paidInvoices.length, active, expiringSoon });

    if (overviewLastUpdated) overviewLastUpdated.textContent = 'آخر تحديث: ' + now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  }

  // رسوم بيانية
  let lineChart, pieChart, revenueChart;
  function renderCharts(){
    const ORGS = getOrgs();
    const INVOICES = getInvoices();
    const now = new Date();

    // خطي: نمو المؤسسات
    const byMonth = Array.from({length:6}).map(()=>0);
    ORGS.forEach(o=>{ const d = o.createdAt? new Date(o.createdAt): null; if(!d) return; const diff = (now.getMonth()-d.getMonth()+12)%12; if(diff<6) byMonth[5-diff]++;});
    const labels = Array.from({length:6}).map((_,i)=> new Date(now.getFullYear(), now.getMonth()-(5-i)).toLocaleDateString('ar-SA',{month:'long'}));
    const ctx1 = document.getElementById('orgsChart'); lineChart && lineChart.destroy();
    lineChart = new Chart(ctx1,{ type:'line', data:{ labels, datasets:[{ label:'المؤسسات الجديدة', data:byMonth, borderColor:'#10b981', backgroundColor:'rgba(16,185,129,.2)', borderWidth:3, tension:.35, fill:true }]}, options:{ plugins:{ legend:{ labels:{ color:'var(--muted)'} } }, scales:{ x:{ ticks:{ color:'var(--muted)'} }, y:{ ticks:{ color:'var(--muted)'} } } }});

    // دائري: توزيع الخطط
    const plans = {Trial:0,Basic:0,Pro:0,Enterprise:0};
    ORGS.forEach(o=>{ plans[o.plan||'Trial'] = (plans[o.plan||'Trial']||0)+1; });
    const ctx2 = document.getElementById('plansChart'); pieChart && pieChart.destroy();
    pieChart = new Chart(ctx2, { type:'doughnut', data:{ labels:Object.keys(plans), datasets:[{ data:Object.values(plans) }] }, options:{ plugins:{ legend:{ labels:{ color:'var(--muted)'} } } } });

    // خطي: اتجاه الإيرادات (فواتير مدفوعة فقط، نفس نافذة الأشهر الستة)
    const revenueByMonth = Array.from({length:6}).map(()=>0);
    INVOICES.forEach(inv=>{
      if ((inv.status||'')!=='paid') return;
      const d = inv.createdAt? new Date(inv.createdAt): null; if(!d) return;
      const diff = (now.getMonth()-d.getMonth()+12)%12; if(diff<6) revenueByMonth[5-diff] += (inv.total||0);
    });
    const ctx3 = document.getElementById('revenueChart');
    if (ctx3) {
      revenueChart && revenueChart.destroy();
      revenueChart = new Chart(ctx3, { type:'line', data:{ labels, datasets:[{ label:'الإيرادات (ر.س)', data:revenueByMonth, borderColor:'#ffd700', backgroundColor:'rgba(255,215,0,.15)', borderWidth:3, tension:.35, fill:true }]}, options:{ plugins:{ legend:{ labels:{ color:'var(--muted)'} } }, scales:{ x:{ ticks:{ color:'var(--muted)'} }, y:{ ticks:{ color:'var(--muted)'} } } } });
    }
  }

  // إجراءات سريعة — إعادة استخدام الأزرار والمنطق الحالي فقط
  qaAddOrg && qaAddOrg.addEventListener('click', () => { const btn = document.getElementById('addOrgBtn'); btn && btn.click(); });
  qaNewInvoice && qaNewInvoice.addEventListener('click', () => { const btn = document.getElementById('newInvoiceBtn'); btn && btn.click(); });
  qaAddUser && qaAddUser.addEventListener('click', () => { const btn = document.getElementById('addUserBtn'); btn && btn.click(); });
  qaAiCenter && qaAiCenter.addEventListener('click', () => { if (typeof navigate === 'function') navigate('/ai'); });

  return Object.freeze({ renderKPIs, renderCharts });
}
