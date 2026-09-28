(() => {
  'use strict';
  if (location.pathname.endsWith('/login.html') || location.pathname.endsWith('/workspace.html')) return;
  const FIELD_ROLES=['supervisor','inspector','contractor'];
  const MOBILITY_ROLES=['mobility_head','department_head','administrative_affairs','employee'];
  function countServices(d){
    const role=d.role, dept=String(d.department||'');
    const ma=Object.prototype.hasOwnProperty.call(d,'mobilityAccess') ? d.mobilityAccess : null;
    const mr=ma!==null ? (ma&&ma.enabled===true&&MOBILITY_ROLES.includes(ma.role)?ma.role:null) : (MOBILITY_ROLES.includes(role)?role:null);
    const field=FIELD_ROLES.includes(role) || (mr==='department_head' && /الحصر|ميداني|field/i.test(dept));
    const lands=!!(d.landsAccess&&d.landsAccess.enabled===true&&['lands_employee','lands_department_manager'].includes(d.landsAccess.role));
    return Number(field)+Number(lands)+Number(!!mr);
  }
  async function boot(){
    const [{initializeApp,getApps},{getAuth,onAuthStateChanged},{getFirestore,doc,getDoc},{resolveFirebaseConfig}]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js'),
      import('./firebase-runtime-config.js')
    ]);
    const cfg=await resolveFirebaseConfig();
    const app=getApps().find(a=>a.name==='[DEFAULT]')||initializeApp(cfg);
    const auth=getAuth(app), db=getFirestore(app);
    onAuthStateChanged(auth,async user=>{
      if(!user)return;
      const snap=await getDoc(doc(db,'users',user.uid)).catch(()=>null);
      if(!snap||!snap.exists())return;
      const d=snap.data()||{};
      const administration=String(d.administration||'').trim();
      const institutionalRole=String(d.institutionalRole||'').trim();
      const canonicalRole=['general_supervisor','department_head','employee'].includes(institutionalRole);
      const canonicalPath=canonicalRole && /الحصر|ميداني|field|الأراضي|الممتلكات|lands|حركة السير|الحركة الذكية|mobility|traffic|الشؤون الإدارية|الشؤون الادارية|administrative/i.test(administration);
      // PHASE16: canonical institutional identities have exactly one active
      // workspace. "خدماتي" exists only for unmigrated legacy accounts.
      if(d.active===false||canonicalPath||countServices(d)<2)return;
      if(document.getElementById('smart-hsr-service-switcher'))return;
      const a=document.createElement('button');
      a.id='smart-hsr-service-switcher'; a.type='button'; a.textContent='خدماتي';
      a.setAttribute('aria-label','فتح خدمات SMART HSR');
      Object.assign(a.style,{
        position:'fixed',left:'16px',top:'16px',zIndex:'2147483000',
        border:'1px solid rgba(120,150,145,.28)',borderRadius:'13px',
        padding:'9px 13px',font:'600 12px -apple-system,BlinkMacSystemFont,"Segoe UI",Tahoma,sans-serif',
        cursor:'pointer',color:'#eaf6f1',background:'rgba(12,42,53,.84)',
        backdropFilter:'blur(16px)',boxShadow:'0 10px 30px rgba(0,0,0,.14)'
      });
      a.onclick=()=>{location.href='workspace.html';};
      document.body.appendChild(a);
    });
  }
  boot().catch(()=>{});
})();