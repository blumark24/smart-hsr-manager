import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { resolveFirebaseConfig } from "./firebase-runtime-config.js";

const state={user:null,data:null,filters:{employee:'',mission:'',missionStatus:'ALL',authorization:'',authorizationStatus:'ALL'}};
const $=id=>document.getElementById(id);
const esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function pill(text,type=''){return '<span class="pill '+type+'">'+esc(text)+'</span>'}
function toast(text){const el=$('msg');el.textContent=text;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2800)}
function setLoading(v){$('loading').hidden=!v}
function fmtRole(v){return ({department_head:'رئيس قسم',general_supervisor:'مشرف عام',employee:'موظف'})[v]||v||'—'}
function empStatus(v){return v==='inactive'?pill('غير نشط','bad'):pill('نشط','ok')}
function missionStatus(v){return v==='PENDING_APPROVAL'?pill('بانتظار الموافقة','wait'):v==='APPROVED'?pill('معتمد','ok'):v==='REJECTED'?pill('مرفوض','bad'):pill(v||'—')}
function authStatus(v){return v==='PENDING_AUTHORIZATION'?pill('بانتظار الاعتماد','wait'):v==='AUTHORIZED'?pill('معتمد','ok'):['REJECTED','REVOKED'].includes(v)?pill(v==='REJECTED'?'مرفوض':'ملغي','bad'):pill(v||'—')}
const norm=v=>String(v??'').trim().toLocaleLowerCase('ar');
const contains=(row,needle,keys)=>!needle||keys.some(k=>norm(row?.[k]).includes(needle));
function applyFilters(){
  const d=state.data||{}, employees=d.employees||[], missions=d.missions||[], auths=d.authorizations||[];
  const ef=norm(state.filters.employee), mf=norm(state.filters.mission), af=norm(state.filters.authorization);
  const filteredEmployees=employees.filter(e=>contains(e,ef,['name','administration','department','jobTitle','institutionalRole']));
  const filteredMissions=missions.filter(m=>(state.filters.missionStatus==='ALL'||m.status===state.filters.missionStatus)&&contains(m,mf,['requestedEmployeeName','department','destination','reason','status']));
  const filteredAuths=auths.filter(a=>(state.filters.authorizationStatus==='ALL'||a.status===state.filters.authorizationStatus)&&contains(a,af,['employeeName','department','vehicleId','authorizationNumber','status']));
  return {employees:filteredEmployees,missions:filteredMissions,auths:filteredAuths,totalEmployees:employees.length,totalMissions:missions.length,totalAuths:auths.length};
}

async function api(action,payload={}){
  const token=await state.user.getIdToken();
  const res=await fetch('/api/admin/users',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...payload})});
  const body=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(body.reason||body.error||'request_failed');
  return body;
}

function render(){
  const d=state.data||{}, allEmployees=d.employees||[], allMissions=d.missions||[], allAuths=d.authorizations||[];
  const {employees,missions,auths,totalEmployees,totalMissions,totalAuths}=applyFilters();
  $('kEmployees').textContent=String(allEmployees.length);
  $('kMissions').textContent=String(allMissions.filter(x=>x.status==='PENDING_APPROVAL').length);
  $('kAuth').textContent=String(allAuths.filter(x=>x.status==='PENDING_AUTHORIZATION').length);
  $('kActive').textContent=String(allMissions.filter(x=>['APPROVED','VEHICLE_ALLOCATED','HANDED_OVER','READY','IN_PROGRESS','INCIDENT_HOLD','COMPLETED','AWAITING_RETURN'].includes(x.status)).length);

  const pending=allMissions.filter(x=>x.status==='PENDING_APPROVAL').slice(0,6);
  $('employeeCount').textContent=employees.length+' من '+totalEmployees;
  $('missionCount').textContent=missions.length+' من '+totalMissions;
  $('authorizationCount').textContent=auths.length+' من '+totalAuths;
  $('overviewMissions').innerHTML=pending.length?'<div class="table-wrap"><table class="tbl"><thead><tr><th>الموظف</th><th>القسم</th><th>الحالة</th></tr></thead><tbody>'+pending.map(m=>'<tr><td>'+esc(m.requestedEmployeeName)+'</td><td>'+esc(m.department)+'</td><td>'+missionStatus(m.status)+'</td></tr>').join('')+'</tbody></table></div>':'<div class="empty">لا توجد طلبات معلقة حاليًا.</div>';

  $('employeeRows').innerHTML=employees.length?employees.map(e=>'<tr><td><b>'+esc(e.name)+'</b></td><td>'+esc(e.administration)+'</td><td>'+esc(e.department)+'</td><td>'+esc(e.jobTitle)+'</td><td>'+esc(fmtRole(e.institutionalRole))+'</td><td>'+(e.vehicleEligible?pill('مؤهل','ok'):pill('غير مؤهل'))+'</td><td>'+empStatus(e.employmentStatus)+'</td></tr>').join(''):'<tr><td colspan="7" class="empty">لا توجد بيانات موظفين متاحة.</td></tr>';

  $('missionRows').innerHTML=missions.length?missions.map(m=>'<tr><td>'+esc(m.requestedEmployeeName)+'</td><td>'+esc(m.department)+'</td><td>'+esc(m.destination)+'</td><td>'+esc(m.reason)+'</td><td>'+missionStatus(m.status)+'</td><td>'+(m.status==='PENDING_APPROVAL'?'<div class="actions"><button class="btn primary" data-mission="'+esc(m.missionId)+'" data-decision="APPROVED">اعتماد</button><button class="btn danger" data-mission="'+esc(m.missionId)+'" data-decision="REJECTED">رفض</button><button class="btn" data-mission="'+esc(m.missionId)+'" data-decision="DRAFT">إعادة</button></div>':'—')+'</td></tr>').join(''):'<tr><td colspan="6" class="empty">لا توجد مهام.</td></tr>';

  $('authorizationRows').innerHTML=auths.length?auths.map(a=>'<tr><td>'+esc(a.employeeName)+'</td><td>'+esc(a.department)+'</td><td>'+esc(a.vehicleId)+'</td><td>'+esc(a.authorizationNumber)+'</td><td>'+authStatus(a.status)+'</td><td>'+(a.status==='PENDING_AUTHORIZATION'?'<div class="actions"><button class="btn primary" data-auth="'+esc(a.missionId)+'" data-auth-decision="AUTHORIZED">اعتماد</button><button class="btn danger" data-auth="'+esc(a.missionId)+'" data-auth-decision="REJECTED">رفض</button></div>':a.status==='AUTHORIZED'?'<button class="btn danger" data-auth="'+esc(a.missionId)+'" data-auth-decision="REVOKED">إلغاء التفويض</button>':'—')+'</td></tr>').join(''):'<tr><td colspan="6" class="empty">لا توجد تفويضات.</td></tr>';
}

async function refresh(){
  setLoading(true);
  try{
    state.data=await api('getMobilityWorkspace');
    render();
    $('health').textContent='متصل · بيانات موثوقة';
  }
  catch(e){
    $('health').textContent='تعذر التحديث';
    toast('تعذر تحميل بيانات الشؤون الإدارية.');
    console.error(e);
  }
  finally{setLoading(false)}
}

document.addEventListener('click',async e=>{
  const nav=e.target.closest('.nav');
  if(nav){document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('on',x===nav));document.querySelectorAll('.view').forEach(x=>x.classList.toggle('on',x.id===nav.dataset.view));return}
  const mb=e.target.closest('[data-mission]');
  if(mb){mb.disabled=true;try{await api('decideMobilityMission',{missionId:mb.dataset.mission,toStatus:mb.dataset.decision});toast('تم تحديث قرار المهمة.');await refresh()}catch(err){toast('تعذر تنفيذ القرار.')}finally{mb.disabled=false}return}
  const ab=e.target.closest('[data-auth]');
  if(ab){ab.disabled=true;try{await api('decideVehicleAuthorization',{missionId:ab.dataset.auth,toStatus:ab.dataset.authDecision});toast('تم تحديث التفويض.');await refresh()}catch(err){toast('تعذر تنفيذ قرار التفويض.')}finally{ab.disabled=false}}
});

$('theme').onclick=()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;localStorage.setItem('smart-hsr-admin-theme',next)};
$('refresh').onclick=refresh;
$('employeeSearch').addEventListener('input',e=>{state.filters.employee=e.target.value;render()});
$('missionSearch').addEventListener('input',e=>{state.filters.mission=e.target.value;render()});
$('missionFilter').addEventListener('change',e=>{state.filters.missionStatus=e.target.value;render()});
$('authorizationSearch').addEventListener('input',e=>{state.filters.authorization=e.target.value;render()});
$('authorizationFilter').addEventListener('change',e=>{state.filters.authorizationStatus=e.target.value;render()});
document.documentElement.dataset.theme=localStorage.getItem('smart-hsr-admin-theme')||'light';

const cfg=await resolveFirebaseConfig();
const app=getApps().find(a=>a.name==='[DEFAULT]')||initializeApp(cfg);
const auth=getAuth(app),db=getFirestore(app);
$('logout').onclick=async()=>{await signOut(auth).catch(()=>{});location.replace('login.html')};

onAuthStateChanged(auth,async user=>{
  if(!user){location.replace('login.html');return}
  const snap=await getDoc(doc(db,'users',user.uid)).catch(()=>null);
  if(!snap||!snap.exists()){await signOut(auth).catch(()=>{});location.replace('login.html');return}
  const d=snap.data()||{}, administration=String(d.administration||'').trim();
  const mobility=d.mobilityAccess;
  const allowed=d.active!==false
    && d.institutionalRole==='department_head'
    && /الشؤون الإدارية|الشؤون الادارية|administrative/i.test(administration)
    && mobility&&mobility.enabled===true&&mobility.role==='administrative_affairs';
  if(!allowed){await signOut(auth).catch(()=>{});location.replace('login.html');return}
  state.user=user;
  $('identity').textContent=[d.name||user.email,administration,d.department].filter(Boolean).join(' · ');
  await refresh();
});
