const STATUS = Object.freeze({
  PENDING: { color:'#ef4444', icon:'!', label:'قيد الانتظار', motion:'active' },
  IN_PROGRESS: { color:'#f59e0b', icon:'↻', label:'قيد المعالجة', motion:'slow' },
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
