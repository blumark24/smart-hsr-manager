(() => {
'use strict';

if (window.__smartHsrManagerExecutivePolish) return;
window.__smartHsrManagerExecutivePolish = true;

const STYLE_ID = 'manager-phase11f-executive-polish-style';
const obsState = { status:'all', priority:'all', type:'all' };
const clean = value => String(value == null ? '' : value).replace(/\s+/g,' ').trim();

function injectStyles(){
  if(document.getElementById(STYLE_ID)) return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
  .hsr-brand-lockup{position:relative;isolation:isolate}
  .hsr-brand-lockup:before{content:"";position:absolute;inset:-9px -12px;border-radius:18px;background:radial-gradient(circle at 70% 50%,rgba(34,197,94,.10),rgba(76,139,224,.08) 42%,transparent 72%);filter:blur(8px);z-index:-1;pointer-events:none}
  .hsr-brand-mark{filter:drop-shadow(0 0 10px rgba(38,201,113,.18)) drop-shadow(0 0 18px rgba(65,132,255,.12));transition:filter .18s ease,transform .18s ease}
  .hsr-brand-mark:hover{filter:drop-shadow(0 0 12px rgba(38,201,113,.28)) drop-shadow(0 0 22px rgba(65,132,255,.18));transform:translateY(-1px)}

  .manager-view-panel.hsr-observations-panel{width:min(1160px,100%)!important;padding:18px!important;background:radial-gradient(540px 260px at 88% 0%,rgba(50,87,255,.08),transparent 70%),linear-gradient(155deg,rgba(10,25,47,.995),rgba(6,16,31,.995))!important;border-color:rgba(92,145,220,.25)!important;box-shadow:0 38px 110px rgba(0,0,0,.62),0 0 44px rgba(34,116,255,.07)!important}
  .hsr-observations-panel input[aria-label="تصفية البلاغات"]{height:40px!important;background:rgba(13,30,54,.82)!important;border-color:rgba(96,145,211,.18)!important;box-shadow:inset 0 1px rgba(255,255,255,.025)!important}
  .hsr-observations-panel input[aria-label="تصفية البلاغات"]:focus{border-color:rgba(74,140,255,.58)!important;box-shadow:0 0 0 3px rgba(74,140,255,.09)!important}
  .hsr-observation-filterbar{display:grid;grid-template-columns:auto repeat(3,minmax(118px,1fr));align-items:center;gap:8px;margin:-2px 0 12px;padding:10px 11px;border-radius:13px;background:rgba(8,20,37,.62);border:1px solid rgba(92,145,210,.12)}
  .hsr-observation-filterbar .hsr-observation-count{font-size:10px;color:#8195b1;white-space:nowrap;padding-inline:4px}
  .hsr-observation-filterbar select{height:34px;min-width:0;border-radius:9px;border:1px solid rgba(96,145,211,.16);background:rgba(13,30,54,.78);color:#d9e6f7;padding:0 9px;font:inherit;font-size:9.5px;outline:0}
  .hsr-observation-filterbar select:focus{border-color:rgba(74,140,255,.56);box-shadow:0 0 0 3px rgba(74,140,255,.08)}
  .manager-observations-grid.hsr-observations-grid{gap:9px!important}
  .hsr-observation-card{position:relative!important;overflow:hidden!important;min-height:118px!important;background:linear-gradient(145deg,rgba(13,30,54,.78),rgba(9,22,40,.70))!important;border-color:rgba(96,145,211,.13)!important;box-shadow:inset 0 1px rgba(255,255,255,.018)!important}
  .hsr-observation-card:before{content:"";position:absolute;inset:0 auto 0 0;width:2px;background:var(--hsr-priority,#4a8cff);opacity:.85}
  .hsr-observation-card:hover{transform:translateY(-2px)!important;border-color:rgba(76,139,224,.42)!important;box-shadow:0 18px 34px -28px rgba(38,101,255,.72),inset 0 1px rgba(255,255,255,.025)!important}
  .hsr-observation-card[data-priority="حرجة"]{--hsr-priority:#ff5d78}.hsr-observation-card[data-priority="عالية"]{--hsr-priority:#f4a63a}.hsr-observation-card[data-priority="متوسطة"]{--hsr-priority:#4a8cff}.hsr-observation-card[data-priority="منخفضة"]{--hsr-priority:#42d49b}
  .hsr-observation-card .manager-observation-meta span{font-size:8.5px!important;background:rgba(7,17,32,.72)!important;border-color:rgba(93,146,214,.12)!important}
  .hsr-observation-card .manager-observation-meta span:nth-child(2){color:var(--hsr-priority,#aab9ce)!important}
  .hsr-observation-empty{grid-column:1/-1;display:none;min-height:150px;border-radius:14px;border:1px dashed rgba(94,145,210,.17);background:rgba(8,20,37,.52);align-items:center;justify-content:center;text-align:center;color:#8397b3;font-size:11px;padding:24px}
  .hsr-observation-empty.visible{display:flex}

  .hsr-map-surface{box-shadow:inset 0 0 0 1px rgba(96,145,211,.08),0 24px 64px -42px rgba(0,0,0,.95)!important}
  .hsr-map-surface .leaflet-control-zoom a{background:rgba(8,20,37,.92)!important;color:#dce9f8!important;border-color:rgba(96,145,211,.18)!important}
  .hsr-map-surface .leaflet-control-attribution{background:rgba(5,13,25,.72)!important;color:#7f91ab!important}
  .hsr-map-surface .leaflet-interactive{filter:drop-shadow(0 0 4px rgba(80,155,255,.5));stroke-linecap:round;stroke-linejoin:round}
  .hsr-map-switch{box-shadow:0 10px 28px -20px rgba(0,0,0,.8),inset 0 1px rgba(255,255,255,.035)!important}
  .hsr-map-switch button[aria-pressed="true"]{box-shadow:0 5px 18px -10px rgba(64,125,255,.8)!important}

  .hsr-service-link{position:relative!important}.hsr-service-link:after{content:"";position:absolute;inset-inline-start:9px;top:50%;width:4px;height:4px;border-radius:999px;background:currentColor;opacity:0;transform:translateY(-50%);transition:opacity .16s ease}.hsr-service-link:hover:after{opacity:.5}

  @media(max-width:760px){.hsr-observation-filterbar{grid-template-columns:1fr 1fr}.hsr-observation-filterbar .hsr-observation-count{grid-column:1/-1}.manager-view-panel.hsr-observations-panel{padding:12px!important}.hsr-observation-card{min-height:108px!important}}
  @media(prefers-reduced-motion:reduce){.hsr-brand-mark,.hsr-observation-card,.hsr-service-link:after{transition:none!important}}
  `;
  document.head.appendChild(style);
}

function findByText(root,selector,text){
  return Array.from((root||document).querySelectorAll(selector)).find(node=>clean(node.textContent).includes(text));
}

function polishBrand(){
  document.querySelectorAll('img[alt="سمارت حصر"],img[src*="smart-hsr-mark"]').forEach(img=>{
    img.classList.add('hsr-brand-mark');
    const wrap=img.parentElement;if(wrap)wrap.classList.add('hsr-brand-lockup');
  });
}

function option(value,label){return `<option value="${value}">${label}</option>`;}
function normalizeStatus(text){
  const value=clean(text);
  for(const status of ['جديد','قيد الانتظار','بانتظار','قيد المعالجة','تحت المعالجة','مكتمل','مكتملة','تمت المعالجة','مغلق','مغلقة']) if(value.includes(status)) return status;
  return value.split('·')[0].trim()||'غير محددة';
}

function ensureObservationFilterbar(panel){
  let bar=panel.querySelector('.hsr-observation-filterbar');
  if(bar)return bar;
  const search=panel.querySelector('input[aria-label="تصفية البلاغات"]');
  const toolbar=search?.parentElement;
  const grid=panel.querySelector('.manager-observations-grid');
  if(!toolbar||!grid)return null;
  bar=document.createElement('div');bar.className='hsr-observation-filterbar';
  bar.innerHTML=`<span class="hsr-observation-count" aria-live="polite">—</span><select data-hsr-obs-filter="status" aria-label="تصفية حالة البلاغ">${option('all','كل الحالات')}${option('قيد','قيد المعالجة')}${option('مكت','مكتملة')}${option('جديد','جديدة')}</select><select data-hsr-obs-filter="priority" aria-label="تصفية أولوية البلاغ">${option('all','كل الأولويات')}${option('حرجة','حرجة')}${option('عالية','عالية')}${option('متوسطة','متوسطة')}${option('منخفضة','منخفضة')}</select><select data-hsr-obs-filter="type" aria-label="تصفية نوع البلاغ">${option('all','كل الأنواع')}</select>`;
  toolbar.after(bar);
  bar.querySelectorAll('select').forEach(select=>select.addEventListener('change',()=>{obsState[select.dataset.hsrObsFilter]=select.value;applyObservationFilter(panel);}));
  return bar;
}

function classifyObservationCards(panel){
  const grid=panel.querySelector('.manager-observations-grid');if(!grid)return [];
  grid.classList.add('hsr-observations-grid');
  const cards=Array.from(grid.querySelectorAll('.manager-observation-card'));
  const types=new Set();
  cards.forEach(card=>{
    card.classList.add('hsr-observation-card');
    const meta=card.querySelectorAll('.manager-observation-meta span');
    const type=clean(meta[0]?.textContent)||'غير محدد';
    const priority=clean(meta[1]?.textContent)||'غير محددة';
    const statusLine=clean(Array.from(card.children).find(el=>clean(el.textContent).includes('·'))?.textContent);
    const status=normalizeStatus(statusLine);
    card.dataset.type=type;card.dataset.priority=priority;card.dataset.status=status;types.add(type);
    card.setAttribute('aria-label',`${clean(card.querySelector('div span')?.textContent)||'بلاغ'}، ${status}، ${priority}`);
  });
  const typeSelect=panel.querySelector('[data-hsr-obs-filter="type"]');
  if(typeSelect){const selected=obsState.type;const existing=new Set(Array.from(typeSelect.options).map(x=>x.value));types.forEach(type=>{if(!existing.has(type))typeSelect.insertAdjacentHTML('beforeend',option(type,type));});if(Array.from(typeSelect.options).some(x=>x.value===selected))typeSelect.value=selected;}
  return cards;
}

function applyObservationFilter(panel){
  const cards=classifyObservationCards(panel);let visible=0;
  cards.forEach(card=>{
    const okStatus=obsState.status==='all'||clean(card.dataset.status).includes(obsState.status);
    const okPriority=obsState.priority==='all'||card.dataset.priority===obsState.priority;
    const okType=obsState.type==='all'||card.dataset.type===obsState.type;
    const show=okStatus&&okPriority&&okType;card.hidden=!show;if(show)visible+=1;
  });
  const count=panel.querySelector('.hsr-observation-count');if(count)count.textContent=`عرض ${visible} من ${cards.length} بلاغ`;
  const grid=panel.querySelector('.manager-observations-grid');if(grid){let empty=grid.querySelector('.hsr-observation-empty');if(!empty){empty=document.createElement('div');empty.className='hsr-observation-empty';empty.textContent='لا توجد بلاغات مطابقة للتصفية الحالية.';grid.appendChild(empty);}empty.classList.toggle('visible',cards.length>0&&visible===0);}
}

function polishObservations(){
  document.querySelectorAll('.manager-view-panel').forEach(panel=>{
    const title=clean(panel.querySelector('h1,h2,h3')?.textContent);
    if(!title.includes('البلاغات'))return;
    panel.classList.add('hsr-observations-panel');
    ensureObservationFilterbar(panel);applyObservationFilter(panel);
  });
}

function polishMaps(){
  document.querySelectorAll('[aria-label*="الخريطة التشغيلية"]').forEach(surface=>{surface.classList.add('hsr-map-surface');surface.parentElement?.classList.add('hsr-map-surface');});
  document.querySelectorAll('[role="group"][aria-label="نوع السطح الجغرافي"]').forEach(group=>group.classList.add('hsr-map-switch'));
}

function polishProducts(){
  [['إدارة الحصر الميداني','field'],['إدارة الأراضي والممتلكات','lands'],['إدارة الحركة والسير','mobility']].forEach(([label,key])=>{
    document.querySelectorAll('a,[role="button"],button').forEach(node=>{if(clean(node.textContent)===label){node.classList.add('hsr-service-link');node.dataset.hsrProduct=key;node.setAttribute('aria-label',`فتح ${label}`);}});
  });
}

function apply(){injectStyles();polishBrand();polishObservations();polishMaps();polishProducts();}
let queued=false;function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply();});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
})();
