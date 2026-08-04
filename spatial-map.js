const STATUS = Object.freeze({
  PENDING: { color:'#ef4444', icon:'!', label:'قيد الانتظار', motion:'active' },
  IN_PROGRESS: { color:'#f59e0b', icon:'↻', label:'قيد المعالجة', motion:'slow' },
  PENDING_REVIEW: { color:'#f59e0b', icon:'↻', label:'بانتظار مراجعة المراقب', motion:'slow' },
  COMPLETED: { color:'#10b981', icon:'✓', label:'تمت المعالجة', motion:'static' }
});

let stylesInstalled = false;
export function installCivicSpatialStyles(){
  if(stylesInstalled || typeof document==='undefined') return;
  stylesInstalled=true;
  const style=document.createElement('style');
  style.dataset.smartHsrSpatial='true';
  style.textContent=`
    .smart-hsr-status-marker{--marker-status-color:#64748b;position:relative;width:44px;height:44px;display:grid;place-items:center;border:0;background:transparent;color:#fff;line-height:1;filter:drop-shadow(0 4px 8px rgba(15,23,42,.22))}
    .smart-hsr-status-marker__core{position:relative;z-index:2;width:30px;height:30px;display:grid;place-items:center;border-radius:999px;background:var(--marker-status-color);border:3px solid #fff;font:800 15px/1 system-ui,sans-serif}
    .smart-hsr-status-marker::before{content:"";position:absolute;inset:7px;border-radius:999px;border:3px solid var(--marker-status-color);opacity:.5;transform:scale(.82)}
    .smart-hsr-status-marker[data-motion="active"]::before{animation:smartHsrMarkerPulse 1.7s ease-out infinite}
    .smart-hsr-status-marker[data-motion="slow"]::before{animation:smartHsrMarkerPulse 2.8s ease-out infinite}
    .smart-hsr-status-marker.is-selected::after{content:"";position:absolute;inset:1px;border:3px solid #0f172a;border-radius:999px;box-shadow:0 0 0 3px #fff;animation:smartHsrSelectedOnce .65s ease-out 1}
    @keyframes smartHsrMarkerPulse{0%{transform:scale(.72);opacity:.75}100%{transform:scale(1.5);opacity:0}}
    @keyframes smartHsrSelectedOnce{0%{transform:scale(.8);opacity:.35}100%{transform:scale(1);opacity:1}}
    html.smart-hsr-map-paused .smart-hsr-status-marker::before,body.reduce-motion .smart-hsr-status-marker::before{animation-play-state:paused!important}
    .leaflet-control-attribution{display:block!important;max-width:calc(100vw - 24px);padding:2px 6px!important;direction:rtl;text-align:right;white-space:normal;font:600 10px/1.35 system-ui,sans-serif;background:rgba(255,255,255,.9)!important;color:#334155!important}
    .leaflet-control-attribution a{color:#075985!important;text-decoration:underline}
    @media(prefers-reduced-motion:reduce){.smart-hsr-status-marker::before,.smart-hsr-status-marker::after{animation:none!important}}
  `;
  document.head.appendChild(style);
  const syncMotion=()=>document.documentElement.classList.toggle('smart-hsr-map-paused',document.hidden);
  document.addEventListener('visibilitychange',syncMotion,{passive:true});syncMotion();
}

export function applyMapAttribution(map){
  installCivicSpatialStyles();
  map?.attributionControl?.setPrefix(false);
}

export function statusMarkerIcon(L,status,{selected=false,title=''}={}){
  installCivicSpatialStyles();
  const meta=STATUS[status]||STATUS.PENDING;
  const safeTitle=String(title||meta.label).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return L.divIcon({
    className:'smart-hsr-marker-host',iconSize:[44,44],iconAnchor:[22,22],popupAnchor:[0,-22],
    html:`<span class="smart-hsr-status-marker${selected?' is-selected':''}" data-motion="${meta.motion}" style="--marker-status-color:${meta.color}" role="img" aria-label="${safeTitle}: ${meta.label}"><span class="smart-hsr-status-marker__core" aria-hidden="true">${meta.icon}</span></span>`
  });
}

export async function fetchOrganizationMapContext(auth,{organizationId='',ownerSelected=false}={}){
  const user=auth?.currentUser;
  if(!user) throw new Error('UNAUTHENTICATED');
  const token=await user.getIdToken();
  const query=ownerSelected&&organizationId?`?organizationId=${encodeURIComponent(organizationId)}`:'';
  const response=await fetch(`/api/organization/context${query}`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},cache:'no-store'});
  if(!response.ok) throw new Error(`CONTEXT_${response.status}`);
  const value=await response.json();
  if(!value||typeof value.organizationId!=='string'||!value.organizationId.trim())throw new Error('INVALID_CONTEXT');
  if(organizationId&&value.organizationId!==organizationId)throw new Error('ORGANIZATION_MISMATCH');
  const center=value.mapCenter;
  if(center&&(!Number.isFinite(center.lat)||!Number.isFinite(center.lng)||Math.abs(center.lat)>90||Math.abs(center.lng)>180))throw new Error('INVALID_CENTER');
  return Object.freeze({...value,mapCenter:center?Object.freeze({lat:center.lat,lng:center.lng}):null});
}

export function observationCoordinates(observation,verifiedOrganizationId){
  if(!observation||observation.organizationId!==verifiedOrganizationId)return null;
  let lat=Number(observation.correctedLat??observation.lat),lng=Number(observation.correctedLng??observation.lng);
  if((!Number.isFinite(lat)||!Number.isFinite(lng))&&typeof observation.location==='string'){
    [lat,lng]=observation.location.split(',').map(v=>Number(v.trim()));
  }
  return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180?{lat,lng}:null;
}

export function openVerifiedMap(map,observations,organizationId,context,{maxZoom=16,padding=[36,36]}={}){
  const points=(observations||[]).map(o=>observationCoordinates(o,organizationId)).filter(Boolean);
  if(points.length){map.fitBounds(points.map(p=>[p.lat,p.lng]),{padding,maxZoom});return 'observations'}
  if(context?.organizationId===organizationId&&context.mapCenter){map.setView([context.mapCenter.lat,context.mapCenter.lng],context.mapDefaultZoom||13);return 'organization'}
  return 'unavailable';
}

export const _test={STATUS};

// Manager-only presentation refinement. This deliberately runs only on
// manager.html and does not alter Firebase, query, authorization or data paths.
const MANAGER_UI_FLAG = Symbol.for('smartHsr.managerUiV2');
function installManagerCommandEnhancements(){
  if(typeof window==='undefined'||typeof document==='undefined') return;
  if(!/(^|\/)manager\.html$/i.test(window.location.pathname)) return;
  if(window[MANAGER_UI_FLAG]) return;
  window[MANAGER_UI_FLAG]=true;

  const style=document.createElement('style');
  style.dataset.smartHsrManagerUi='v2';
  style.textContent=`
    body.manager-command-v2{--bm-control-h:42px;--bm-control-radius:13px}
    body.manager-command-v2 .bm-btn{min-height:var(--bm-control-h)!important;height:auto!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:.42rem!important;padding:.52rem .9rem!important;border-radius:var(--bm-control-radius)!important;border:1px solid transparent!important;font-size:.78rem!important;font-weight:850!important;line-height:1.25!important;white-space:nowrap!important;box-shadow:none!important;transition:transform .16s ease,background .16s ease,border-color .16s ease,box-shadow .16s ease!important}
    body.manager-command-v2 .bm-btn:hover{transform:translateY(-1px)!important}
    body.manager-command-v2 .bm-btn:active{transform:translateY(0) scale(.98)!important}
    body.manager-command-v2 .bm-btn-primary{background:var(--color-green)!important;color:#fff!important;box-shadow:0 7px 16px rgba(8,127,91,.16)!important}
    body.manager-command-v2 .bm-btn-secondary{background:var(--surface)!important;color:var(--text)!important;border-color:var(--line)!important}
    body.manager-command-v2 .bm-btn-secondary:hover{border-color:var(--color-cyan)!important;background:var(--surface-2)!important}
    body.manager-command-v2 .bm-btn-info{background:var(--color-navy)!important;color:#fff!important}
    body.manager-command-v2 .bm-btn-success{background:#087f5b!important;color:#fff!important}
    body.manager-command-v2 .bm-btn-warning{background:#b54708!important;color:#fff!important}
    body.manager-command-v2 .bm-btn-danger{background:#b42318!important;color:#fff!important}
    body.manager-command-v2 .bm-btn svg{width:16px!important;height:16px!important;flex:0 0 16px!important}

    body.manager-command-v2 .workflow-board{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:.65rem!important;align-items:start!important}
    body.manager-command-v2 .workflow-column{min-height:0!important;padding:.55rem!important;border-radius:1rem!important;background:color-mix(in srgb,var(--surface-2) 88%,var(--color-navy) 12%)!important}
    body.manager-command-v2 .workflow-column-head{padding:.15rem .25rem .55rem!important;font-size:.86rem!important}
    body.manager-command-v2 .workflow-count{min-width:26px!important;width:26px!important;height:26px!important}
    body.manager-command-v2 .workflow-items{gap:.45rem!important}
    body.manager-command-v2 .work-item{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;grid-template-areas:'head head' 'meta actions'!important;gap:.45rem .65rem!important;padding:.62rem .7rem!important;border-radius:.8rem!important;box-shadow:0 3px 10px rgba(7,29,51,.045)!important}
    body.manager-command-v2 .work-item>div:first-child{grid-area:head!important}
    body.manager-command-v2 .work-meta{grid-area:meta!important;display:flex!important;flex-wrap:wrap!important;align-items:center!important;gap:.22rem .7rem!important;margin:0!important;font-size:.67rem!important}
    body.manager-command-v2 .work-meta span{display:inline-flex!important;align-items:center!important}
    body.manager-command-v2 .work-actions{grid-area:actions!important;align-self:end!important;justify-content:flex-end!important;gap:.35rem!important;flex-wrap:nowrap!important}
    body.manager-command-v2 .work-actions .bm-btn{min-height:36px!important;padding:.35rem .6rem!important;font-size:.68rem!important;border-radius:10px!important}
    body.manager-command-v2 .work-item-title{font-size:.8rem!important;line-height:1.35!important}

    body.manager-command-v2 .sow-modal{background:rgba(2,16,29,.74)!important;backdrop-filter:blur(18px) saturate(125%)!important;-webkit-backdrop-filter:blur(18px) saturate(125%)!important;padding:clamp(.7rem,2.2vw,1.5rem)!important}
    body.manager-command-v2 .sow-dialog{width:min(1120px,100%)!important;max-height:min(94dvh,900px)!important;border-radius:26px!important;border:1px solid color-mix(in srgb,var(--line) 68%,#fff 32%)!important;background:linear-gradient(180deg,color-mix(in srgb,var(--surface) 94%,#fff 6%),var(--surface))!important;box-shadow:0 34px 110px rgba(2,16,29,.48)!important;overflow:auto!important}
    body.manager-command-v2 .sow-header{padding:1rem 1.15rem!important;background:linear-gradient(135deg,color-mix(in srgb,var(--color-navy) 8%,var(--surface) 92%),color-mix(in srgb,var(--color-green) 9%,var(--surface) 91%))!important}
    body.manager-command-v2 .sow-header-id h3{font-size:1.3rem!important;line-height:1.3!important}
    body.manager-command-v2 .sow-body{gap:.85rem!important;padding:1rem!important}
    body.manager-command-v2 .sow-media-card,body.manager-command-v2 .sow-insight-card,body.manager-command-v2 .sow-ai-card,body.manager-command-v2 .sow-timeline-card{border-radius:18px!important}
    body.manager-command-v2 .sow-media-card{padding:.7rem!important}
    body.manager-command-v2 .sow-media-figure{min-height:220px!important;display:grid!important;place-items:center!important;border-radius:15px!important}
    body.manager-command-v2 .sow-media-figure img{width:100%!important;max-height:390px!important;object-fit:contain!important;background:#061724!important}
    body.manager-command-v2 .bm-media-open{position:absolute!important;inset:auto .7rem .7rem auto!important;z-index:3!important;min-height:40px!important;padding:.45rem .78rem!important;border-radius:12px!important;background:rgba(7,29,51,.9)!important;color:#fff!important;border:1px solid rgba(255,255,255,.22)!important;font-size:.75rem!important;font-weight:850!important;display:inline-flex!important;align-items:center!important;gap:.4rem!important;backdrop-filter:blur(10px)!important}
    body.manager-command-v2 .sow-lightbox{z-index:2000!important;overflow:hidden!important;touch-action:none!important}
    body.manager-command-v2 .sow-lightbox img{max-width:none!important;max-height:none!important;will-change:transform!important;cursor:grab!important;user-select:none!important;-webkit-user-drag:none!important;transition:transform .08s linear!important}
    body.manager-command-v2 .sow-lightbox img:active{cursor:grabbing!important}
    body.manager-command-v2 .bm-zoom-toolbar{position:fixed!important;left:50%!important;bottom:max(18px,env(safe-area-inset-bottom))!important;transform:translateX(-50%)!important;z-index:2002!important;display:flex!important;align-items:center!important;gap:.4rem!important;padding:.45rem!important;border:1px solid rgba(255,255,255,.18)!important;border-radius:16px!important;background:rgba(7,29,51,.78)!important;backdrop-filter:blur(18px)!important;box-shadow:0 15px 45px rgba(0,0,0,.35)!important}
    body.manager-command-v2 .bm-zoom-toolbar button{width:44px!important;height:44px!important;min-height:44px!important;border-radius:12px!important;display:grid!important;place-items:center!important;background:rgba(255,255,255,.1)!important;color:#fff!important;border:1px solid rgba(255,255,255,.12)!important}
    body.manager-command-v2 .bm-zoom-toolbar button:hover{background:rgba(255,255,255,.2)!important}
    body.manager-command-v2 .leaflet-popup-content-wrapper{border-radius:16px!important;box-shadow:0 18px 50px rgba(7,29,51,.24)!important}
    body.manager-command-v2 .smart-hsr-status-marker{cursor:pointer!important}

    @media(max-width:900px){
      body.manager-command-v2 .workflow-board{grid-template-columns:1fr!important}
      body.manager-command-v2 .work-item{grid-template-columns:1fr!important;grid-template-areas:'head' 'meta' 'actions'!important}
      body.manager-command-v2 .work-actions{justify-content:flex-start!important;flex-wrap:wrap!important}
    }
    @media(max-width:640px){
      body.manager-command-v2{--bm-control-h:44px;--bm-control-radius:12px}
      body.manager-command-v2 .sow-modal{align-items:flex-end!important;padding:0!important}
      body.manager-command-v2 .sow-dialog{width:100%!important;max-height:95dvh!important;border-radius:24px 24px 0 0!important}
      body.manager-command-v2 .sow-header{padding:.85rem .9rem!important}
      body.manager-command-v2 .sow-header-id h3{font-size:1.08rem!important}
      body.manager-command-v2 .sow-body{padding:.8rem!important}
      body.manager-command-v2 .sow-grid{grid-template-columns:1fr!important}
      body.manager-command-v2 .sow-media-figure{min-height:180px!important}
      body.manager-command-v2 .bm-btn{white-space:normal!important;text-align:center!important}
    }
  `;
  document.head.appendChild(style);
  document.body.classList.add('manager-command-v2');

  const classifyButton=button=>{
    if(!(button instanceof HTMLButtonElement)) return;
    if(button.closest('.command-nav,.header-actions,.presentation-bar,.bm-zoom-toolbar')||button.classList.contains('icon-button')) return;
    button.classList.add('bm-btn');
    const text=(button.textContent||'').trim();
    const classes=button.className;
    button.classList.remove('bm-btn-primary','bm-btn-secondary','bm-btn-info','bm-btn-success','bm-btn-warning','bm-btn-danger');
    if(/حذف|red-/.test(text+' '+classes)) button.classList.add('bm-btn-danger');
    else if(/إغلاق|تمت|green-|emerald-/.test(text+' '+classes)) button.classList.add('bm-btn-success');
    else if(/تغيير|amber-|yellow-/.test(text+' '+classes)) button.classList.add('bm-btn-warning');
    else if(/عرض|دليل|indigo-|slate-/.test(text+' '+classes)) button.classList.add('bm-btn-info');
    else if(button.classList.contains('btn')) button.classList.add('bm-btn-primary');
    else button.classList.add('bm-btn-secondary');
  };

  const enhanceMedia=()=>{
    document.querySelectorAll('#sowMedia .sow-media-figure').forEach(figure=>{
      if(figure.querySelector('.bm-media-open')) return;
      const button=document.createElement('button');
      button.type='button';
      button.className='bm-media-open';
      button.setAttribute('aria-label','عرض الصورة مع أدوات التكبير والتصغير');
      button.innerHTML='<span aria-hidden="true">⌕</span><span>عرض الصورة</span>';
      figure.appendChild(button);
    });
  };

  const setupLightboxControls=()=>{
    const box=document.getElementById('sowLightbox');
    const image=document.getElementById('sowLightboxImg');
    if(!box||!image||box.dataset.zoomReady==='true') return;
    box.dataset.zoomReady='true';
    const toolbar=document.createElement('div');
    toolbar.className='bm-zoom-toolbar';
    toolbar.setAttribute('role','toolbar');
    toolbar.setAttribute('aria-label','أدوات تكبير الصورة');
    toolbar.innerHTML=`<button type="button" data-zoom="in" aria-label="تكبير الصورة">＋</button><button type="button" data-zoom="out" aria-label="تصغير الصورة">−</button><button type="button" data-zoom="reset" aria-label="إعادة ضبط الصورة">↺</button><button type="button" data-zoom="full" aria-label="عرض ملء الشاشة">⛶</button>`;
    box.appendChild(toolbar);
    let scale=1,x=0,y=0,dragging=false,lastX=0,lastY=0;
    const clampScale=value=>Math.min(5,Math.max(.5,value));
    const render=()=>{image.style.transform=`translate3d(${x}px,${y}px,0) scale(${scale})`};
    const reset=()=>{scale=1;x=0;y=0;render()};
    toolbar.addEventListener('click',event=>{
      const action=event.target.closest('[data-zoom]')?.dataset.zoom;if(!action)return;
      if(action==='in')scale=clampScale(scale+.25);
      if(action==='out')scale=clampScale(scale-.25);
      if(action==='reset')reset();
      if(action==='full'){if(!document.fullscreenElement)box.requestFullscreen?.();else document.exitFullscreen?.()}
      render();
    });
    image.addEventListener('wheel',event=>{event.preventDefault();scale=clampScale(scale+(event.deltaY<0?.2:-.2));render()},{passive:false});
    image.addEventListener('pointerdown',event=>{dragging=true;lastX=event.clientX;lastY=event.clientY;image.setPointerCapture?.(event.pointerId)});
    image.addEventListener('pointermove',event=>{if(!dragging)return;x+=event.clientX-lastX;y+=event.clientY-lastY;lastX=event.clientX;lastY=event.clientY;render()});
    image.addEventListener('pointerup',()=>{dragging=false});
    image.addEventListener('pointercancel',()=>{dragging=false});
    const classObserver=new MutationObserver(()=>{if(box.classList.contains('open'))reset()});
    classObserver.observe(box,{attributes:true,attributeFilter:['class']});
  };

  const scan=root=>{
    const scope=root instanceof Element?root:document;
    scope.querySelectorAll?.('button').forEach(classifyButton);
    enhanceMedia();
    setupLightboxControls();
  };
  scan(document);
  new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1){classifyButton(node);scan(node)}}))).observe(document.body,{childList:true,subtree:true});

  const patchLeaflet=()=>{
    const L=window.L;
    if(!L?.Marker?.prototype||L.Marker.prototype.__smartHsrManagerPopupPatched) return;
    const original=L.Marker.prototype.bindPopup;
    Object.defineProperty(L.Marker.prototype,'__smartHsrManagerPopupPatched',{value:true});
    L.Marker.prototype.bindPopup=function(content,options){
      if(typeof content==='string'&&content.includes('showObservationImages')){
        const match=content.match(/showObservationImages\(decodeURIComponent\('([^']+)'\)\)/);
        if(match&&!this.__smartHsrObservationClick){
          this.__smartHsrObservationClick=true;
          const encodedId=match[1];
          this.on('click',()=>{
            const activeMap=this._map;
            if(activeMap){const target=this.getLatLng();const zoom=Math.max(activeMap.getZoom?.()||13,15);activeMap.flyTo?.(target,zoom,{duration:.55})}
            window.setTimeout(()=>window.showObservationImages?.(decodeURIComponent(encodedId)),180);
          });
          return this;
        }
      }
      return original.call(this,content,options);
    };
  };
  patchLeaflet();
}

if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installManagerCommandEnhancements,{once:true});
  else installManagerCommandEnhancements();
}
