(() => {
'use strict';

if (window.__smartHsrUserCenterReferenceUI) return;
window.__smartHsrUserCenterReferenceUI = true;

const U = window.SmartHSRInstitutionalUC;
const STYLE_ID = 'ucv21-reference-style';
const clean = value => String(value == null ? '' : value).trim();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
  .ucv2-app{
    --r-bg:#071224;--r-surface:rgba(11,27,50,.78);--r-surface2:rgba(14,32,58,.92);
    --r-border:rgba(94,145,210,.16);--r-border2:rgba(94,145,210,.28);
    --r-text:#f7fbff;--r-muted:#7f91ab;--r-blue:#4a8cff;--r-cyan:#35c8ff;
    --r-purple:#8c65ff;--r-green:#42d49b;--r-amber:#f4a63a;--r-rose:#ff6b87;
    position:relative!important;isolation:isolate!important;overflow:hidden!important;
    background:
      radial-gradient(520px 260px at 8% 14%,rgba(60,87,255,.10),transparent 65%),
      radial-gradient(440px 300px at 92% 88%,rgba(113,52,255,.09),transparent 68%),
      linear-gradient(145deg,#07111f 0%,#09182b 48%,#07111f 100%)!important;
    border:0!important;border-radius:0!important;padding:22px 28px 32px!important;gap:18px!important;
    color:var(--r-text)!important;box-shadow:inset 0 1px rgba(255,255,255,.025),0 28px 90px rgba(0,0,0,.18)!important;
  }
  .ucv2-shell-overlay{background:transparent!important;pointer-events:none!important;backdrop-filter:none!important}
  .ucv2-host{position:fixed!important;top:78px!important;right:74px!important;bottom:0!important;left:0!important;width:auto!important;height:auto!important;z-index:90!important;overflow:auto!important;background:#050b15!important;padding:0!important;direction:rtl!important;pointer-events:auto!important}
  .ucv2-host>.ucv2-app{min-height:100%!important}
  .ucv2-app:before,.ucv2-app:after{content:"";position:absolute;border-radius:999px;filter:blur(78px);pointer-events:none;z-index:-1;opacity:.18}
  .ucv2-app:before{width:430px;height:430px;left:-180px;top:22%;background:#3558ff}
  .ucv2-app:after{width:350px;height:350px;right:12%;bottom:-170px;background:#6d3bff}
  .ucv2-header{align-items:center!important}.ucv2-header>div:first-child{display:flex!important;align-items:center!important;gap:13px!important}
  .ucv2-header>div:first-child:before{content:"👥";width:46px;height:46px;flex:0 0 46px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(145deg,rgba(39,85,174,.34),rgba(40,58,111,.18));border:1px solid rgba(89,135,255,.22);box-shadow:inset 0 1px rgba(255,255,255,.05)}
  .ucv2-eyebrow{display:none!important}.ucv2-header h1{font-size:26px!important;margin:0 0 6px!important;color:#fff!important;letter-spacing:-.02em!important}.ucv2-header p{font-size:12px!important;color:var(--r-muted)!important}
  .ucv2-header-actions{gap:10px!important}.ucv2-btn{height:40px!important;min-height:40px!important;border-radius:11px!important;padding:0 16px!important;font-size:12px!important;border-color:var(--r-border2)!important;background:rgba(13,29,52,.82)!important;color:#dce8f8!important}
  .ucv2-btn.primary{background:linear-gradient(135deg,#2f76ff,#5367ff)!important;border-color:rgba(109,150,255,.7)!important;box-shadow:0 8px 24px rgba(41,94,255,.24)!important;color:#fff!important}
  .ucv2-ref-import{display:inline-flex;align-items:center;justify-content:center;gap:6px}

  .ucv2-kpis{grid-template-columns:repeat(6,minmax(130px,1fr))!important;gap:13px!important}
  .ucv2-kpi{min-height:108px!important;border-radius:17px!important;border-color:var(--r-border)!important;background:linear-gradient(145deg,rgba(14,31,55,.90),rgba(10,24,44,.74))!important;padding:16px 17px!important;gap:14px!important;position:relative!important;overflow:hidden!important}
  .ucv2-kpi:before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 18% 0%,currentColor 0,transparent 48%);opacity:.07;pointer-events:none}
  .ucv2-kpi-icon{width:46px!important;height:46px!important;border-radius:14px!important;background:color-mix(in srgb,currentColor 15%,rgba(255,255,255,.02))!important;border:1px solid color-mix(in srgb,currentColor 24%,transparent)!important;box-shadow:inset 0 1px rgba(255,255,255,.04)!important}
  .ucv2-kpi b{font-size:30px!important;color:#fff!important}.ucv2-kpi small{font-size:11px!important;color:#d8e3f4!important}.ucv2-kpi:nth-child(1){color:var(--r-purple)!important}.ucv2-kpi:nth-child(2){color:var(--r-cyan)!important}.ucv2-kpi:nth-child(3){color:var(--r-rose)!important}.ucv2-kpi:nth-child(4){color:var(--r-amber)!important}.ucv2-kpi:nth-child(5){color:var(--r-green)!important}.ucv2-kpi:nth-child(6){color:var(--r-blue)!important}

  .ucv2-toolbar{grid-template-columns:minmax(300px,1.55fr) repeat(5,minmax(120px,.62fr)) auto!important;gap:9px!important;padding:14px!important;background:linear-gradient(180deg,rgba(10,24,43,.82),rgba(8,20,37,.74))!important;border:1px solid var(--r-border)!important;border-radius:16px 16px 0 0!important;margin-bottom:-16px!important}
  .ucv2-toolbar input,.ucv2-toolbar select,.ucv2-grid-head select{height:38px!important;border-radius:10px!important;background:rgba(14,31,55,.78)!important;color:#dce7f8!important;border-color:var(--r-border)!important;font-size:10px!important}
  .ucv2-toolbar input:focus,.ucv2-toolbar select:focus{border-color:rgba(74,140,255,.62)!important;box-shadow:0 0 0 3px rgba(74,140,255,.09)!important;outline:0!important}
  .ucv2-quick{padding:12px 14px!important;background:rgba(8,20,37,.76)!important;border-inline:1px solid var(--r-border)!important;margin:0!important}.ucv2-chip-button{height:27px!important;border-color:rgba(86,132,190,.15)!important;background:rgba(15,33,59,.5)!important;color:#8194af!important;font-size:9px!important}.ucv2-chip-button.active{color:#d8e6ff!important;border-color:rgba(74,140,255,.44)!important;background:rgba(50,94,182,.18)!important}
  .ucv2-grid-head{padding:10px 14px!important;background:rgba(8,20,37,.76)!important;border-inline:1px solid var(--r-border)!important;color:#7f91ab!important}
  .ucv2-table-wrap{border-radius:0!important;border-color:var(--r-border)!important;background:rgba(8,20,37,.76)!important;max-height:min(58vh,650px)!important}.ucv2-table{font-size:10px!important}.ucv2-table thead th{background:rgba(13,29,52,.98)!important;color:#8ea1bc!important;padding:11px 10px!important;border-color:var(--r-border)!important;font-size:9px!important}.ucv2-table td{padding:11px 10px!important;border-color:rgba(91,137,195,.10)!important;color:#dce7f8!important}.ucv2-table tbody tr:hover,.ucv2-table tbody tr:focus{background:linear-gradient(90deg,rgba(38,78,144,.08),rgba(38,78,144,.02))!important}
  .ucv2-person{min-width:170px!important}.ucv2-person b{color:#f5f9ff!important;font-size:11px!important}.ucv2-person small{color:#7387a4!important;font-size:8.5px!important}.ucv2-avatar{width:34px!important;height:34px!important;border-radius:50%!important;background:linear-gradient(145deg,#28395e,#172640)!important;border-color:rgba(113,152,215,.22)!important;color:#8cb7ff!important}
  .ucv2-chip{height:24px!important;border-radius:999px!important;font-size:8px!important}.ucv2-chip.product{min-width:54px!important;background:rgba(14,28,49,.5)!important}.ucv2-chip.product.field{color:#f0ad4d!important;border-color:rgba(244,166,58,.23)!important}.ucv2-chip.product.lands{color:#65d6a8!important;border-color:rgba(66,212,155,.23)!important}.ucv2-chip.product.mobility{color:#77a9ff!important;border-color:rgba(74,140,255,.23)!important}.ucv2-chip.ok{color:#79d8b0!important;background:rgba(66,212,155,.06)!important;border-color:rgba(66,212,155,.20)!important}.ucv2-chip.warn{color:#f7bf69!important;background:rgba(244,166,58,.06)!important;border-color:rgba(244,166,58,.22)!important}.ucv2-chip.danger{color:#ff8198!important;background:rgba(255,107,135,.06)!important;border-color:rgba(255,107,135,.22)!important}.ucv2-role{color:#aebed3!important}.ucv2-muted{color:#71849f!important}.ucv2-legacy-note{color:#f0b866!important}
  .ucv21-service-cell{text-align:center!important}.ucv21-service-dot{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:999px;border:1px solid rgba(92,135,188,.13);background:rgba(14,28,49,.46);color:#53647d}.ucv21-service-dot.on.field{color:#f0ad4d;border-color:rgba(244,166,58,.24);background:rgba(244,166,58,.07)}.ucv21-service-dot.on.lands{color:#65d6a8;border-color:rgba(66,212,155,.24);background:rgba(66,212,155,.07)}.ucv21-service-dot.on.mobility{color:#77a9ff;border-color:rgba(74,140,255,.24);background:rgba(74,140,255,.07)}
  .ucv21-more{width:32px;height:30px;border-radius:9px;border:1px solid rgba(91,137,195,.14);background:rgba(16,34,59,.55);color:#7f92ac;cursor:pointer}.ucv21-more:hover{color:#e4efff;border-color:rgba(74,140,255,.42)}
  .ucv2-pagination{padding:12px 15px!important;border:1px solid var(--r-border)!important;border-top:0!important;border-radius:0 0 16px 16px!important;background:rgba(8,20,37,.76)!important;color:#7c8da6!important}

  .iuc{background:rgba(1,7,16,.80)!important;backdrop-filter:blur(18px)!important}
  .iuc>div,.ucv2-dialog{background:linear-gradient(155deg,rgba(11,27,49,.985),rgba(7,18,34,.985))!important;color:#edf5ff!important;border:1px solid rgba(96,145,211,.20)!important;box-shadow:0 34px 110px rgba(0,0,0,.62),inset 0 1px rgba(255,255,255,.025)!important;border-radius:22px!important;max-width:min(940px,calc(100vw - 32px))!important;max-height:calc(100vh - 34px)!important;padding:20px!important}
  .iuc .ih{background:linear-gradient(180deg,rgba(10,25,46,.99),rgba(10,25,46,.94))!important;border-bottom-color:rgba(96,145,211,.14)!important;border-radius:22px 22px 0 0!important}.iuc .ih b{font-size:17px!important;color:#fff!important}.iuc .ih p{font-size:10px!important;color:#7f92ad!important}
  .iuc .sec{border:1px solid rgba(96,145,211,.11)!important;background:rgba(11,26,47,.45)!important;border-radius:15px!important;padding:14px!important;margin-bottom:12px!important}.iuc .st span,.iuc label{color:#dbe7f7!important}.iuc .st small,.iuc .note{color:#7f91ab!important}
  .iuc .in,.iuc .sel,.iuc input,.iuc select,.iuc textarea{background:rgba(13,30,54,.80)!important;color:#eaf2ff!important;border:1px solid rgba(96,145,211,.18)!important;border-radius:10px!important}.iuc .in:focus,.iuc .sel:focus,.iuc input:focus,.iuc select:focus,.iuc textarea:focus{outline:0!important;border-color:rgba(74,140,255,.62)!important;box-shadow:0 0 0 3px rgba(74,140,255,.09)!important}
  .iuc .btn{border-radius:10px!important;background:rgba(15,32,57,.80)!important;color:#dbe7f7!important;border-color:rgba(96,145,211,.20)!important}.iuc .btn.pr{background:linear-gradient(135deg,#2f76ff,#5367ff)!important;color:#fff!important;border-color:rgba(103,148,255,.60)!important;box-shadow:0 8px 24px rgba(41,94,255,.18)!important}
  .ucv2-current-value{border-color:rgba(96,145,211,.14)!important;background:rgba(14,31,55,.66)!important}.ucv2-password-toggle{color:#6ba1ff!important}

  .ucv21-single-page{width:min(880px,calc(100vw - 34px))!important;padding:0!important;overflow:auto!important}
  .ucv21-single-page .ih{position:sticky;top:0;z-index:7;padding:18px 22px!important}
  .ucv21-single-page .hier,.ucv21-single-page .tabs,.ucv21-single-page .ucv2-employee360{display:none!important}
  .ucv21-single-page .pane{display:block!important;padding:0 22px!important;margin:0!important}
  .ucv21-single-page .pane[hidden]{display:block!important}
  .ucv21-single-page .pane[data-id="o"],.ucv21-single-page .pane[data-id="h"]{display:none!important}
  .ucv21-single-page .pane>.act{display:none!important}
  .ucv21-single-page .pane[data-id="a"]>.sec>.act{display:flex!important;align-items:center!important;gap:8px!important;flex-wrap:wrap!important;margin-top:10px!important}
  .ucv21-single-page .pane[data-id="a"] .pwbtn{display:none!important}
  .ucv21-single-page .sec{padding:16px!important;margin:0 0 14px!important;border-radius:16px!important;background:linear-gradient(145deg,rgba(13,31,56,.78),rgba(9,23,43,.68))!important;border:1px solid rgba(101,151,219,.13)!important}
  .ucv21-single-page .grid{gap:12px!important;grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .ucv21-section-head{display:flex;align-items:center;gap:9px;margin:2px 0 11px;color:#f4f8ff;font-size:12px;font-weight:800}.ucv21-section-head:before{content:"";width:7px;height:7px;border-radius:999px;background:#4a8cff;box-shadow:0 0 16px rgba(74,140,255,.55)}
  .ucv21-section-head small{margin-inline-start:auto;color:#7188a7;font-size:9px;font-weight:500}
  .ucv21-single-page .rolebox{margin:0!important}.ucv21-single-page .prod{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:10px!important}.ucv21-single-page .pc{min-width:0!important;border-radius:13px!important;background:rgba(10,24,44,.72)!important;border-color:rgba(98,148,211,.13)!important}.ucv21-single-page .pc.on{border-color:rgba(74,140,255,.38)!important;box-shadow:0 0 0 1px rgba(74,140,255,.08),0 16px 34px -28px rgba(49,102,255,.7)!important}.ucv21-single-page .pc .dest,.ucv21-single-page .pc .note{font-size:8px!important}
  .ucv21-password-inline{padding:0 22px 4px!important}.ucv21-password-inline .sec{margin-bottom:12px!important}.ucv21-password-note{font-size:9px!important;color:#7f91ab!important;margin-top:8px!important}
  .ucv21-history-wrap{padding:0 22px 10px!important}.ucv21-history-toggle{height:34px;border-radius:9px;border:1px solid rgba(96,145,211,.15);background:rgba(12,28,51,.72);color:#8ea3bf;padding:0 12px;cursor:pointer;font-size:10px}.ucv21-history-wrap .hist{margin-top:10px!important}
  .ucv21-profile-footer{position:sticky;bottom:0;z-index:8;display:flex;align-items:center;gap:10px;padding:14px 22px 18px;background:linear-gradient(180deg,rgba(7,18,34,.72),rgba(7,18,34,.98) 32%);border-top:1px solid rgba(96,145,211,.12);backdrop-filter:blur(14px)}
  .ucv21-profile-footer .ucv21-save{margin-inline-start:auto;min-width:150px}.ucv21-profile-footer .ucv21-cancel{min-width:96px}.ucv21-profile-msg{flex:1;min-width:120px;font-size:10px;color:#8397b3}.ucv21-profile-msg.ok{color:#70d5a9}.ucv21-profile-msg.er{color:#ff8096}

  @media(max-width:1380px){.ucv2-kpis{grid-template-columns:repeat(3,1fr)!important}.ucv2-toolbar{grid-template-columns:minmax(220px,1.4fr) repeat(3,1fr)!important}.ucv2-table th:nth-child(4),.ucv2-table td:nth-child(4),.ucv2-table th:nth-child(8),.ucv2-table td:nth-child(8){display:none!important}}
  @media(max-width:820px){.ucv2-host{top:68px!important;right:0!important}.ucv2-app{padding:14px!important;border-radius:16px!important}.ucv2-header{align-items:flex-start!important;flex-direction:column!important}.ucv2-header-actions{width:100%!important}.ucv2-header-actions .ucv2-btn{flex:1!important}.ucv2-kpis{grid-template-columns:repeat(2,1fr)!important}.ucv2-toolbar{grid-template-columns:1fr 1fr!important}.ucv2-search{grid-column:1/-1!important}.ucv2-table-wrap{display:none!important}.ucv2-mobile-list{display:grid!important}.ucv21-single-page .grid,.ucv21-single-page .prod{grid-template-columns:1fr!important}.ucv21-single-page .pane,.ucv21-password-inline,.ucv21-history-wrap{padding-inline:14px!important}.ucv21-profile-footer{padding-inline:14px!important;flex-wrap:wrap!important}.ucv21-profile-msg{order:3;flex-basis:100%}}
  @media(prefers-reduced-motion:reduce){.ucv2-app,.ucv2-app *,.iuc,.iuc *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
  `;
  document.head.appendChild(style);
}

function ensureImportButton(app) {
  const actions = app.querySelector('.ucv2-header-actions');
  if (!actions || actions.querySelector('[data-ucv21-import]')) return;
  const originalRoot = app.parentElement;
  const original = Array.from(originalRoot?.querySelectorAll?.('[data-ucv2-original="true"] button,[data-ucv2-original="true"] [role="button"]') || []).find(b => /استيراد/.test(clean(b.textContent)));
  if (!original) return;
  const button = document.createElement('button');
  button.type = 'button';button.className = 'ucv2-btn ghost ucv2-ref-import';button.dataset.ucv21Import = '1';button.textContent = '⇧ استيراد ملف';
  button.addEventListener('click', () => original.click());actions.prepend(button);
}

function tuneHeader(app) {
  const h1 = app.querySelector('.ucv2-header h1');if (h1) h1.textContent = 'مركز إدارة المستخدمين';
  const p = app.querySelector('.ucv2-header p');if (p) p.textContent = 'إدارة بيانات الموظفين والصلاحيات والمنتجات والربط مع الأنظمة المختلفة';
  ensureImportButton(app);
}

function tuneKpis(app) {
  const cards = Array.from(app.querySelectorAll('.ucv2-kpi'));
  const labels = ['إجمالي الموظفين','الحسابات النشطة','بدون حساب / موقوف','الحصر الميداني','الأراضي والممتلكات','الحركة والسير'];
  const icons = ['👥','⌁','◉','▤','◫','▰'];
  cards.forEach((card, i) => {const small=card.querySelector('small');if(small&&labels[i])small.textContent=labels[i];const icon=card.querySelector('.ucv2-kpi-icon');if(icon&&icons[i])icon.textContent=icons[i];});
}

function serviceCell(enabled, type) {
  const td=document.createElement('td');td.className='ucv21-service-cell';const span=document.createElement('span');span.className=`ucv21-service-dot${enabled?` on ${type}`:''}`;span.textContent=enabled?'●':'—';td.appendChild(span);return td;
}

function transformTable(app) {
  const table=app.querySelector('.ucv2-table');if(!table||table.dataset.ucv21Reference==='1')return;const head=table.querySelector('thead tr');if(!head)return;
  const labels=['الموظف','الإدارة','القسم','المسمى','الحصر','الأراضي','الحركة','دور الحركة','المركبة','الحالة','إجراءات'];head.innerHTML=labels.map(x=>`<th>${x}</th>`).join('');
  table.querySelectorAll('tbody tr').forEach(row=>{const cells=Array.from(row.children);if(cells.length<10)return;if(row.classList.contains('ucv2-legacy')){const employee=cells[0],status=cells[1];row.innerHTML='';row.appendChild(employee);const note=document.createElement('td');note.colSpan=8;note.className='ucv2-legacy-note';note.textContent='حساب قديم غير مرتبط بسجل موظف — يتطلب مسار ربط آمن.';row.appendChild(note);const st=document.createElement('td');st.appendChild(status.querySelector('.ucv2-chip')||status);row.appendChild(st);const action=document.createElement('td');action.innerHTML='<button class="ucv21-more" disabled>•••</button>';row.appendChild(action);return;}
    const employee=cells[0],account=cells[1],admin=cells[3],dept=cells[4],title=cells[5],services=cells[6],role=cells[7],vehicle=cells[8],action=cells[10];const text=clean(services?.textContent);const hasField=/الحصر/.test(text),hasLands=/الأراضي/.test(text),hasMobility=/الحركة/.test(text);const actionButton=action?.querySelector('button');if(actionButton){actionButton.className='ucv21-more';actionButton.textContent='•••';actionButton.setAttribute('aria-label','تعديل المستخدم');}row.innerHTML='';row.appendChild(employee);row.appendChild(admin);row.appendChild(dept);row.appendChild(title);row.appendChild(serviceCell(hasField,'field'));row.appendChild(serviceCell(hasLands,'lands'));row.appendChild(serviceCell(hasMobility,'mobility'));row.appendChild(role);row.appendChild(vehicle);row.appendChild(account);row.appendChild(action);
  });table.dataset.ucv21Reference='1';
}

function tuneGridHead(app){const head=app.querySelector('.ucv2-grid-head');if(!head)return;const first=head.querySelector('span');if(first)first.textContent=first.textContent.replace(/^عرض\s+/,'إجمالي ');}
function addSectionHead(pane,title,small=''){if(!pane||pane.querySelector(':scope > .ucv21-section-head'))return;const h=document.createElement('div');h.className='ucv21-section-head';h.innerHTML=`<span>${title}</span>${small?`<small>${small}</small>`:''}`;pane.prepend(h);}

async function runExisting(button,msg){
  if(!button)return true;button.click();await sleep(30);if(msg?.classList.contains('er'))return false;
  for(let i=0;i<120;i+=1){if(!button.disabled)return !msg?.classList.contains('er');await sleep(50);}return false;
}

function buildSinglePageProfile(panel,employee){
  if(!panel)return;
  if(employee) panel.__ucv21Employee=employee;
  if(panel.dataset.ucv21SinglePage==='1') return;
  panel.dataset.ucv21SinglePage='1';panel.dataset.dialogLabel='تعديل المستخدم';panel.classList.add('ucv21-single-page');
  const title=panel.querySelector('.ih b'),sub=panel.querySelector('.ih p');if(title)title.textContent='تعديل المستخدم';if(sub)sub.textContent='تحديث بيانات المستخدم والصلاحيات';
  const tabs=panel.querySelector('.tabs');if(tabs)tabs.hidden=true;
  const basic=panel.querySelector('.pane[data-id="p"]'),org=panel.querySelector('.pane[data-id="o"]'),account=panel.querySelector('.pane[data-id="a"]'),roles=panel.querySelector('.pane[data-id="r"]'),history=panel.querySelector('.pane[data-id="h"]');
  [basic,account,roles].forEach(p=>{if(p)p.hidden=false;});
  const basicGrid=basic?.querySelector('.sec .grid'),orgGrid=org?.querySelector('.sec .grid');if(basicGrid&&orgGrid){Array.from(orgGrid.children).forEach(node=>basicGrid.appendChild(node));}
  addSectionHead(basic,'البيانات الأساسية','بيانات الموظف والتنظيم');addSectionHead(roles,'الخدمات والصلاحيات','الدور + المنتج + القسم');addSectionHead(account,'حالة الحساب','إدارة الوصول والهوية');
  if(account){const oldPw=account.querySelector('.pwbtn');if(oldPw)oldPw.hidden=true;}
  if(panel.__ucv21Employee?.authUid&&!panel.querySelector('.ucv21-password-inline')){
    const wrap=document.createElement('section');wrap.className='ucv21-password-inline';wrap.innerHTML=`<div class="ucv21-section-head"><span>تعديل كلمة المرور</span><small>اختياري</small></div><div class="sec"><div class="grid"><div class="f"><label>كلمة المرور الجديدة</label><input class="in" id="ucv21-npw" type="password" autocomplete="new-password"></div><div class="f"><label>تأكيد كلمة المرور</label><input class="in" id="ucv21-npw2" type="password" autocomplete="new-password"></div></div><div class="ucv21-password-note">إذا تركت الحقلين فارغين تبقى كلمة المرور الحالية بدون تغيير. عند الحفظ تصبح الكلمة الجديدة معتمدة وتُنهي الجلسات السابقة.</div></div>`;roles?.after(wrap)||account?.after(wrap);wrap.querySelectorAll('input[type="password"]').forEach(i=>i.setAttribute('aria-label',i.previousElementSibling?.textContent||'كلمة المرور'));
  }
  if(history&&!panel.querySelector('.ucv21-history-wrap')){const hw=document.createElement('div');hw.className='ucv21-history-wrap';hw.innerHTML='<button type="button" class="ucv21-history-toggle">عرض سجل الموظف</button>';history.before(hw);hw.appendChild(history);history.hidden=true;hw.querySelector('button').onclick=()=>{history.hidden=!history.hidden;hw.querySelector('button').textContent=history.hidden?'عرض سجل الموظف':'إخفاء سجل الموظف';};}
  if(!panel.querySelector('.ucv21-profile-footer')){
    const footer=document.createElement('footer');footer.className='ucv21-profile-footer';footer.innerHTML='<div class="ucv21-profile-msg" aria-live="polite"></div><button type="button" class="btn ucv21-cancel">إلغاء</button><button type="button" class="btn pr ucv21-save">حفظ التعديلات</button>';panel.appendChild(footer);
    footer.querySelector('.ucv21-cancel').onclick=()=>panel.querySelector('.ix')?.click();
    footer.querySelector('.ucv21-save').onclick=async ev=>{const b=ev.currentTarget,msg=footer.querySelector('.ucv21-profile-msg'),employeeRef=panel.__ucv21Employee;b.disabled=true;msg.className='ucv21-profile-msg';msg.textContent='جاري حفظ التعديلات...';try{
      const steps=[[panel.querySelector('.savep'),panel.querySelector('.mp')],[panel.querySelector('.saveo'),panel.querySelector('.mo')],[panel.querySelector('.saver'),panel.querySelector('.mr')]];for(const [button,m] of steps){if(button&&!(await runExisting(button,m)))throw Error(clean(m?.textContent)||'تعذر حفظ أحد الأقسام.');}
      const p1=panel.querySelector('#ucv21-npw')?.value||'',p2=panel.querySelector('#ucv21-npw2')?.value||'';if(p1||p2){if(p1!==p2)throw Error('كلمتا المرور غير متطابقتين.');if(!U?.strongPw?.(p1))throw Error('كلمة المرور لا تطابق سياسة الأمان.');if(!employeeRef?.authUid)throw Error('لا يوجد حساب دخول مرتبط.');await U.post('/api/admin/users',{action:'setPassword',uid:employeeRef.authUid,password:p1});panel.querySelector('#ucv21-npw').value='';panel.querySelector('#ucv21-npw2').value='';}
      msg.className='ucv21-profile-msg ok';msg.textContent='تم حفظ التعديلات بنجاح.';U?.stale?.();
    }catch(error){msg.className='ucv21-profile-msg er';msg.textContent=error?.message||'تعذر حفظ التعديلات.';}finally{b.disabled=false;}};
  }
}

function tuneDialog(modal){const panel=modal.matches('.iuc')?modal.querySelector(':scope > div'):modal;if(!panel||!panel.__ucv21Employee)return;const text=clean(panel.textContent);if(/ملف الموظف|تعديل المستخدم/.test(text)){buildSinglePageProfile(panel,panel.__ucv21Employee);}}

if(U&&typeof U.profile==='function'&&!U.__phase11fReferenceProfileWrapped){const baseProfile=U.profile;U.__phase11fReferenceProfileWrapped=true;U.profile=async employee=>{const out=await baseProfile.call(U,employee);const panel=document.querySelector('#iuc-profile > div');if(panel){panel.__ucv21Employee=employee;buildSinglePageProfile(panel,employee);}return out;};}

function apply(){injectStyle();document.querySelectorAll('.ucv2-app').forEach(app=>{tuneHeader(app);tuneKpis(app);tuneGridHead(app);transformTable(app);});document.querySelectorAll('.iuc').forEach(tuneDialog);}
let scheduled=false;function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;apply();});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
})();
