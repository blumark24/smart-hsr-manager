// Users & Permissions module for the Owner Command Center (#/users).
//
// Extracted from owner.html (Sprint 6.3.1). Talks ONLY to the secure
// server-side Admin API using the owner's Firebase ID token. Passwords
// are generated client-side, shown once to the owner, and sent to be
// set on the account. The server never returns them.
//
// Unlike the Organizations module, this module makes no Firestore calls
// at all and never touches the shared notification banner — its only
// external dependencies are the already-initialized `auth` instance and
// read-only access to the shared ORGS array, both received via
// dependency injection to avoid any circular import.
export function initUsersModule({ auth, getOrgs } = {}) {
  const ADMIN_API = '/api/admin/users';
  const usersOrgSelect = document.getElementById('usersOrgSelect');
  const userFormOrg    = document.getElementById('userFormOrg');
  const usersBody      = document.getElementById('usersBody');
  const usersMsg       = document.getElementById('usersMsg');
  const addUserBtn     = document.getElementById('addUserBtn');
  const refreshUsersBtn= document.getElementById('refreshUsersBtn');
  const userModal      = document.getElementById('userModal');
  const userForm       = document.getElementById('userForm');
  const userFormMsg    = document.getElementById('userFormMsg');

  const ROLE_AR = { manager:'مدير', supervisor:'مشرف مساعد', inspector:'مراقب', contractor:'مقاول' };

  function setUsersMsg(text, ok){
    usersMsg.textContent = text || '';
    usersMsg.style.color = ok ? 'var(--emerald)' : 'var(--rose)';
  }

  function generateTempPassword(){
    const upper='ABCDEFGHJKLMNPQRSTUVWXYZ', lower='abcdefghijkmnpqrstuvwxyz', digits='23456789', sym='!@#$%*?';
    const all=upper+lower+digits+sym; const buf=new Uint32Array(14);
    crypto.getRandomValues(buf);
    let pick=c=>c[buf[i++]%c.length]; let i=0;
    let pw=pick(upper)+pick(lower)+pick(digits)+pick(sym);
    while(pw.length<12) pw+=all[buf[i++% buf.length]%all.length];
    return pw;
  }

  async function callAdminApi(payload){
    const user = auth.currentUser;
    if(!user) throw new Error('انتهت الجلسة. الرجاء تسجيل الدخول من جديد.');
    const token = await user.getIdToken();
    const resp = await fetch(ADMIN_API, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+token },
      body: JSON.stringify(payload)
    });
    let data={}; try{ data=await resp.json(); }catch(_){}
    if(!resp.ok){
      const reason = data.reason || data.error || ('HTTP '+resp.status);
      throw new Error('فشلت العملية: '+reason);
    }
    return data;
  }

  function populateOrgSelects(){
    const ORGS = getOrgs();
    const opts = (ORGS||[]).map(o=>`<option value="${o.id}">${(o.name||o.id)}</option>`).join('');
    const empty = '<option value="">— لا توجد مؤسسات —</option>';
    usersOrgSelect.innerHTML = opts || empty;
    userFormOrg.innerHTML = opts || empty;
  }

  function fmtDate(t){ if(!t) return '—'; try{ return new Date(t).toLocaleString('ar-SA'); }catch(_){ return '—'; } }

  async function renderUsers(){
    const orgId = usersOrgSelect.value;
    if(!orgId){ usersBody.innerHTML = `<tr><td colspan="6" class="muted">اختر مؤسسة لعرض المستخدمين.</td></tr>`; return; }
    usersBody.innerHTML = `<tr><td colspan="6" class="muted">...جاري التحميل</td></tr>`;
    try{
      const { users } = await callAdminApi({ action:'list', organizationId: orgId });
      if(!users || !users.length){ usersBody.innerHTML = `<tr><td colspan="6" class="muted">لا يوجد مستخدمون في هذه المؤسسة.</td></tr>`; return; }
      usersBody.innerHTML = users.map(u=>{
        const statusPill = u.active
          ? '<span class="pill" style="color:var(--emerald)">نشط</span>'
          : '<span class="pill" style="color:var(--rose)">معطّل</span>';
        const mcp = u.mustChangePassword ? '⚠️ مطلوب' : '—';
        const toggleLabel = u.active ? 'تعطيل' : 'تفعيل';
        return `<tr>
          <td>${u.email||'—'}</td>
          <td>${ROLE_AR[u.role]||u.role||'—'}</td>
          <td>${statusPill}</td>
          <td class="muted">${fmtDate(u.lastSignInTime)}</td>
          <td>${mcp}</td>
          <td>
            <div class="flex items-center gap-1 justify-end flex-wrap">
              <button class="btn btn-outline" data-act="temp" data-uid="${u.uid}">كلمة مرور مؤقتة</button>
              <button class="btn btn-outline" data-act="toggle" data-uid="${u.uid}" data-active="${u.active?1:0}">${toggleLabel}</button>
              <button class="btn btn-ghost" data-act="revoke" data-uid="${u.uid}">إنهاء الجلسات</button>
            </div>
          </td>
        </tr>`;
      }).join('');
      setUsersMsg('تم تحميل '+users.length+' مستخدم.', true);
    }catch(err){
      usersBody.innerHTML = `<tr><td colspan="6" class="muted">تعذّر التحميل.</td></tr>`;
      setUsersMsg(err.message||'تعذّر تحميل المستخدمين.', false);
    }
  }

  usersOrgSelect.addEventListener('change', renderUsers);
  refreshUsersBtn.addEventListener('click', ()=>{ populateOrgSelects(); renderUsers(); });
  addUserBtn.addEventListener('click', ()=>{ populateOrgSelects(); userFormMsg.textContent=''; userForm.reset(); const o=usersOrgSelect.value; if(o) userFormOrg.value=o; userModal.showModal(); });

  userForm.addEventListener('submit', async (e)=>{
    const f = userForm.elements;
    const name=f.name.value.trim(), email=f.email.value.trim(), role=f.role.value, organizationId=f.organizationId.value;
    if(!name||!email||!organizationId){ e.preventDefault(); userFormMsg.style.color='var(--rose)'; userFormMsg.textContent='الرجاء تعبئة الاسم والبريد واختيار المؤسسة.'; return; }
    e.preventDefault();
    userFormMsg.style.color='var(--muted)'; userFormMsg.textContent='...جاري الإنشاء';
    try{
      await callAdminApi({ action:'create', organizationId, role, email, name });
      userModal.close();
      setUsersMsg('تم إنشاء المستخدم بنجاح. استخدم «كلمة مرور مؤقتة» لتوليد كلمة الدخول.', true);
      if(usersOrgSelect.value!==organizationId) usersOrgSelect.value=organizationId;
      renderUsers();
    }catch(err){
      userFormMsg.style.color='var(--rose)'; userFormMsg.textContent=err.message||'تعذّر إنشاء المستخدم.';
    }
  });

  usersBody.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button[data-act]'); if(!btn) return;
    const uid = btn.dataset.uid; const act = btn.dataset.act;
    try{
      if(act==='temp'){
        const pw = generateTempPassword();
        if(!confirm('سيتم تعيين كلمة مرور مؤقتة لهذا المستخدم وسيُطلب منه تغييرها عند أول دخول.\n\nكلمة المرور المؤقتة (انسخها الآن — لن تظهر مجددًا):\n\n'+pw+'\n\nهل تريد المتابعة؟')) return;
        await callAdminApi({ action:'setTempPassword', uid, password: pw });
        setUsersMsg('تم تعيين كلمة المرور المؤقتة. سلّمها للمستخدم بشكل آمن.', true);
        renderUsers();
      } else if(act==='toggle'){
        const currentlyActive = btn.dataset.active==='1';
        const next = !currentlyActive;
        if(!confirm(next ? 'تفعيل هذا الحساب؟' : 'تعطيل هذا الحساب سيمنع المستخدم من الدخول. متابعة؟')) return;
        await callAdminApi({ action:'setActive', uid, active: next });
        setUsersMsg(next ? 'تم تفعيل الحساب.' : 'تم تعطيل الحساب.', true);
        renderUsers();
      } else if(act==='revoke'){
        if(!confirm('إنهاء جميع جلسات هذا المستخدم سيخرجه من كل الأجهزة. متابعة؟')) return;
        await callAdminApi({ action:'revokeSessions', uid });
        setUsersMsg('تم إنهاء جميع جلسات المستخدم.', true);
      }
    }catch(err){
      setUsersMsg(err.message||'تعذّر تنفيذ الإجراء.', false);
    }
  });

  return Object.freeze({ renderUsers, populateOrgSelects });
}
