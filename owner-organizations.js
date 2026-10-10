// Organizations module for the Owner Command Center (#/organizations).
//
// Extracted from owner.html (Sprint 6.2.8). Owns rendering and CRUD
// behavior for the organizations table and its add/edit modal only.
// Shared state ownership (ORGS), cross-module orchestration
// (refreshAll), notifications, and invoice creation stay in owner.html
// and are received here via dependency injection — this avoids a
// circular import between this module and any future subscriptions
// module that would also need ORGS.
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

export function initOrganizationsModule({ auth, db, getOrgs, showNotif, refreshAll, createInvoice } = {}) {
  const orgsBody = document.getElementById('orgsBody');
  const searchBox = document.getElementById('searchBox');
  const addOrgBtn = document.getElementById('addOrgBtn');
  const orgModal = document.getElementById('orgModal');
  const orgForm = document.getElementById('orgForm');
  const deleteBtn = document.getElementById('deleteBtn');

  async function ownerAdminCall(payload){
    const user = auth && auth.currentUser;
    if(!user) throw new Error('owner_session_required');
    let token = await user.getIdToken();
    let response = await fetch('/api/admin/users', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+token },
      body: JSON.stringify(payload)
    });
    if(response.status===401){
      token = await user.getIdToken(true);
      response = await fetch('/api/admin/users', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+token },
        body: JSON.stringify(payload)
      });
    }
    const body = await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(body.reason || body.error || 'request_failed');
    return body;
  }

  function renderOrgs(filter=''){
    const ORGS = getOrgs();
    const rows = filter? ORGS.filter(o=> (o.name||'').includes(filter)) : ORGS;
    orgsBody.innerHTML = '';
    if(!rows.length){
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 9; td.className = 'text-center muted py-6'; td.textContent = 'لا توجد مؤسسات بعد';
      tr.appendChild(td); orgsBody.appendChild(tr);
      return;
    }
    rows.forEach(o=>{
      const tr = document.createElement('tr');

      const tdName = document.createElement('td'); tdName.className = 'font-semibold'; tdName.textContent = o.name||'-'; tr.appendChild(tdName);
      const tdManager = document.createElement('td'); tdManager.textContent = o.manager||'-'; tr.appendChild(tdManager);
      const tdEmail = document.createElement('td'); tdEmail.textContent = o.email||'-'; tr.appendChild(tdEmail);
      const tdPhone = document.createElement('td'); tdPhone.textContent = o.phone||'-'; tr.appendChild(tdPhone);

      const tdPlan = document.createElement('td');
      const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = o.plan||'Trial';
      tdPlan.appendChild(badge); tr.appendChild(tdPlan);

      const tdCycle = document.createElement('td'); tdCycle.textContent = o.billingCycle||'monthly'; tr.appendChild(tdCycle);
      const tdStatus = document.createElement('td'); tdStatus.textContent = o.status||'active'; tr.appendChild(tdStatus);

      const tdExpires = document.createElement('td');
      tdExpires.textContent = o.expiresAt? new Date(o.expiresAt).toLocaleDateString('ar-SA'): '-';
      tr.appendChild(tdExpires);

      const tdActions = document.createElement('td');
      const wrap = document.createElement('div'); wrap.className = 'flex gap-2';
      const mkBtn = (label, act, cls)=>{
        const b = document.createElement('button');
        b.className = cls; b.textContent = label;
        b.dataset.act = act; b.dataset.id = o.id;
        return b;
      };
      wrap.appendChild(mkBtn('تعديل','edit','btn btn-outline'));
      if(o.managerUid) wrap.appendChild(mkBtn('كلمة مرور المدير','manager-password','btn btn-outline'));
      else wrap.appendChild(mkBtn('إصلاح حساب المدير','repair-manager','btn btn-outline'));
      wrap.appendChild(mkBtn('فحص ربط الدخول','identity-audit','btn btn-outline'));
      wrap.appendChild(mkBtn('ترقية','upgrade','btn btn-primary'));
      wrap.appendChild(mkBtn(o.status==='archived'?'استعادة':'أرشفة',o.status==='archived'?'restore':'archive',o.status==='archived'?'btn btn-primary':'btn btn-outline'));
      tdActions.appendChild(wrap); tr.appendChild(tdActions);

      orgsBody.appendChild(tr);
    });
  }

  let forceProvision = false;
  function openOrgModal(org=null, { provision=false }={}){
    forceProvision = Boolean(org && provision);
    orgForm.reset();
    document.getElementById('modalTitle').textContent = org? 'تعديل مؤسسة' : 'إضافة مؤسسة';
    const f = orgForm.elements;
    f.name.value = org?.name||''; f.manager.value = org?.manager||''; f.email.value = org?.email||''; f.phone.value = org?.phone||'';
    // Manager identity belongs to Firebase/manager records, not editable org metadata.
    f.manager.readOnly = Boolean(org);
    f.email.readOnly = Boolean(org);
    f.manager.title = org ? 'هوية المدير تتغير فقط بإجراء آمن منفصل' : '';
    f.email.title = org ? 'بريد دخول المدير غير قابل للتعديل من بيانات المؤسسة' : '';
    f.managerPassword.value = '';
    f.managerPassword.required = !org || forceProvision;
    f.managerPassword.disabled = Boolean(org && !forceProvision);
    const passwordField = document.getElementById('managerPasswordField');
    if(passwordField) passwordField.classList.toggle('hidden', Boolean(org && !forceProvision));
    f.plan.value = org?.plan||'Trial'; f.billingCycle.value = org?.billingCycle||'monthly'; f.status.value = org?.status|| (org?.plan==='Trial'?'trial':'active');
    f.expiresAt.value = org?.expiresAt? new Date(org.expiresAt).toISOString().slice(0,10): '';
    f.notes.value = org?.notes||'';
    f.mapCenterLat.value = Number.isFinite(Number(org?.mapCenter?.lat)) ? String(org.mapCenter.lat) : '';
    f.mapCenterLng.value = Number.isFinite(Number(org?.mapCenter?.lng)) ? String(org.mapCenter.lng) : '';
    f.mapDefaultZoom.value = Number.isInteger(Number(org?.mapDefaultZoom)) ? String(org.mapDefaultZoom) : '';
    f.docId.value = org?.id||''; deleteBtn.classList.toggle('hidden', !org);
    deleteBtn.textContent = org?.status === 'archived' ? 'استعادة المؤسسة' : 'أرشفة المؤسسة';
    orgModal.showModal();
  }

  // أحداث الجدول
  orgsBody.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button'); if(!btn) return;
    const act = btn.dataset.act; const id = btn.dataset.id; const org = getOrgs().find(o=>o.id===id);
    if(act==='edit'){ openOrgModal(org); }

    if(act==='repair-manager'){
      if(!org || org.managerUid) return;
      try{
        const audit = await ownerAdminCall({
          action:'ownerAuditTenantIdentity', organizationId:id,
        });
        const m = audit.manager || {};
        const candidates = m.managerCandidates || [];
        const canonicalEmail = String(audit.organization?.displayManagerEmail || '').trim().toLowerCase();
        const valid = candidates.filter(c =>
          c.roleValid && c.authState === 'present' &&
          c.emailMatchesRecord === true &&
          String(c.authEmail || '').trim().toLowerCase() === canonicalEmail
        );
        if(candidates.length === 1 && valid.length === 1 &&
           !m.displayEmailLookup?.registeredAsOwner &&
           !m.displayEmailLookup?.registeredAsStaff &&
           m.displayEmailLookup?.uid === valid[0].uid &&
           m.displayEmailLookup?.matchingManagerRecord){
          if(!confirm('تأكيد ربط حساب المدير الحالي بهذه المؤسسة فقط؟ لا تُغيّر كلمة المرور.')) return;
          await ownerAdminCall({
            action:'ownerRestoreTenantManager', organizationId:id,
            mode:'linkExisting', managerUid:valid[0].uid, confirmation:true,
          });
          showNotif('تم ربط المدير الموجود بالمؤسسة بعد التحقق من Firebase.');
          await refreshAll();
          return;
        }
        if(candidates.length === 0 && m.displayEmailLookup?.state === 'missing'){
          if(!confirm('لا يوجد حساب مدير مسجل لهذا البريد. هل تريد إنشاء حساب إنتاجي جديد للمؤسسة الحالية دون حذف بياناتها؟')) return;
          openOrgModal(org, {provision:true});
          showNotif('أدخل كلمة مرور جديدة وفريدة لمدير المؤسسة ثم احفظ. لا تستخدم كلمة مرور تجريبية قديمة.');
          return;
        }
        showNotif('تم إيقاف الإصلاح الآلي: هوية المدير غير مؤكدة أو توجد سجلات متعارضة. راجع نتيجة فحص ربط الدخول أولًا.');
      }catch(error){
        showNotif('تعذّر إصلاح ربط المدير: '+(error.message || 'خطأ غير معروف'));
      }
      return;
    }

    if(act==='identity-audit'){
      try {
        const audit = await ownerAdminCall({
          action:'ownerAuditTenantIdentity', organizationId:id,
        });
        const statusName = state => ({
          present:'موجود ومفعّل', disabled:'موجود لكنه معطّل',
          missing:'غير موجود في Firebase', unlinked:'غير مربوط',
          lookup_failed:'تعذّر التحقق',
        }[state] || 'غير معروف');
        const manager = audit.manager || {};
        const workforce = audit.workforce || {};
        const summary = [
          'فحص حسابات المؤسسة (قراءة فقط)',
          'المؤسسة: ' + (audit.organization?.name || '—'),
          'معرف مدير المؤسسة: ' + (manager.uid || 'غير مربوط'),
          'حساب المدير في Firebase: ' + statusName(manager.auth?.state),
          'ربط المدير بالمؤسسة: ' + (manager.managerRecordLinked ? 'صحيح' : 'يحتاج مراجعة'),
          'البريد المسجل في Firebase: ' + (manager.auth?.email || 'غير متاح'),
          'تطابق بريد المؤسسة مع تسجيل الدخول: ' +
            (manager.displayEmailMatchesAuth === true ? 'متطابق'
             : manager.displayEmailMatchesAuth === false ? 'مختلف — يحتاج تصحيحًا'
             : 'غير مؤكد'),
          'الموظفون المفحوصون: ' + (workforce.scanned ?? 0),
          'حسابات الموظفين غير الموجودة في Firebase: ' + (workforce.missingAuth ?? 0),
          'حسابات الموظفين المعطلة: ' + (workforce.disabledAuth ?? 0),
          'عدم تطابق بريد الموظف: ' + (workforce.emailMismatch ?? 0),
          'تعذر فحص الحساب: ' + (workforce.lookupFailed ?? 0),
          (workforce.scanned >= workforce.scanLimit ? 'تنبيه: تم فحص أول 50 موظفًا فقط.' : ''),
          'لم يتم تعديل أي حساب أو كلمة مرور.',
        ].filter(Boolean).join('\n');
        window.alert(summary);
      } catch(error) {
        showNotif('تعذّر فحص الربط: '+(error.message || 'خطأ غير معروف'));
      }
      return;
    }
    if(act==='manager-password'){
      if(!org?.managerUid) return;
      const password = prompt('أدخل كلمة مرور جديدة قوية لمدير البلدية:');
      if(!password) return;
      try{
        await ownerAdminCall({
          action:'ownerSetManagerPassword',
          organizationId:id,
          managerUid:org.managerUid,
          password
        });
        showNotif('تم تحديث كلمة مرور مدير البلدية وإنهاء جلساته القديمة.');
      }catch(error){
        showNotif('تعذّر تحديث كلمة مرور المدير: '+(error.message||'خطأ غير معروف'));
      }
      return;
    }
    if(act==='upgrade'){ // ترقية الخطة → تحديث المؤسسة + إنشاء فاتورة
      const newPlan = org.plan==='Pro' ? 'Enterprise' : (org.plan==='Basic' ? 'Pro' : 'Pro');
      await updateDoc(doc(db,'organizations', id), { plan:newPlan, status:'active', updatedAt: serverTimestamp() });
      await createInvoice({ org, plan:newPlan, billingCycle: org.billingCycle||'monthly' });
      showNotif(`تمت ترقية خطة ${org.name} إلى ${newPlan} وإصدار فاتورة تلقائيًا.`);
      await refreshAll();
    }
    if(act==='archive'){
      const label = org?.name || id;
      if(confirm(`تأكيد أرشفة ${label}؟ لن تُحذف الحسابات أو الفواتير أو السجلات المرتبطة.`)){
        await ownerAdminCall({ action:'ownerArchiveOrganization', organizationId:id });
        showNotif('تمت أرشفة المؤسسة بأمان مع الإبقاء على جميع السجلات المرتبطة.');
        await refreshAll();
      }
    }
    if(act==='restore'){
      await ownerAdminCall({ action:'ownerRestoreOrganization', organizationId:id, status:'active' });
      showNotif('تمت استعادة المؤسسة وتفعيلها.');
      await refreshAll();
    }
  });

  // بحث
  searchBox.addEventListener('input', (e)=> renderOrgs(e.target.value.trim()));

  // مودال المؤسسة
  addOrgBtn.addEventListener('click', ()=> openOrgModal());

  // A one-click Owner SaaS audit above the horizontally-scrollable org table;
  // mobile operators can reconcile ALL existing tenants without touching users.
  const identityAuditBtn = document.createElement('button');
  identityAuditBtn.type = 'button';
  identityAuditBtn.className = 'btn btn-outline';
  identityAuditBtn.textContent = 'فحص حسابات المؤسسات';
  addOrgBtn.parentNode.insertBefore(identityAuditBtn, addOrgBtn);
  identityAuditBtn.addEventListener('click', async () => {
    const orgs = getOrgs().slice(0, 20);
    if (!orgs.length) { showNotif('لا توجد مؤسسات لفحصها.'); return; }
    identityAuditBtn.disabled = true;
    identityAuditBtn.textContent = 'جاري فحص الربط...';
    try {
      const report = ['فحص دخول المؤسسات — قراءة فقط'];
      for (const organization of orgs) {
        try {
          const audit = await ownerAdminCall({
            action:'ownerAuditTenantIdentity', organizationId:organization.id,
          });
          const manager = audit.manager || {};
          const staff = audit.workforce || {};
          const stateName = ({
            present:'موجود', disabled:'معطل', missing:'مفقود',
            unlinked:'غير مربوط', lookup_failed:'تعذر التحقق',
          })[manager.auth?.state] || 'غير مؤكد';
          report.push(
            '\nالمؤسسة: ' + (audit.organization?.name || organization.name || '—'),
            'حساب المدير: ' + stateName,
            'ربط المدير: ' + (manager.managerRecordLinked ? 'صحيح' : 'غير مكتمل'),
            'بريد المدير المربوط: ' + (manager.auth?.email || 'غير متاح'),
            'البحث ببريد المؤسسة: ' + (manager.displayEmailLookup?.state === 'present'
              ? 'هوية Firebase موجودة' : manager.displayEmailLookup?.state === 'disabled'
              ? 'هوية Firebase معطلة' : manager.displayEmailLookup?.state === 'missing'
              ? 'لا يوجد حساب بهذا البريد' : 'تعذر التحقق'),
            'معرف الحساب الموجود بالبريد: ' + (manager.displayEmailLookup?.uid || 'غير متاح'),
            'دور المدير لهذا الحساب: ' + (manager.displayEmailLookup?.matchingManagerRecord
              ? 'سجل مدير مطابق للمؤسسة' : manager.displayEmailLookup?.managerOtherTenant
              ? 'مسجل كمدير لمؤسسة أخرى — لا تربطه' : 'لا يوجد ربط مدير مطابق مؤكد'),
            'سجل هوية مالك أو موظف: ' +
              (manager.displayEmailLookup?.registeredAsOwner || manager.displayEmailLookup?.registeredAsStaff
                ? 'تعارض أدوار — يحتاج مراجعة' : 'لا يوجد تعارض مثبت'),
            'سجلات مديري المؤسسة الموجودة: ' + (manager.managerCandidates?.length ?? 0),
            ...(manager.managerCandidates || []).map(c =>
              'مرشح مدير: ' + (c.authEmail || c.recordEmail || c.uid)
              + ' — الحساب: ' + c.authState
              + ' — الدور: ' + (c.roleValid ? 'صحيح' : 'يحتاج مراجعة')),
            'الموظفون المفحوصون: ' + (staff.scanned ?? 0),
            'حسابات الموظفين المفقودة: ' + (staff.missingAuth ?? 0),
            'حسابات الموظفين المعطلة: ' + (staff.disabledAuth ?? 0),
            'أخطاء التحقق: ' + (staff.lookupFailed ?? 0)
          );
        } catch (error) {
          report.push('\nالمؤسسة: ' + (organization.name || '—'),
            'فشل الفحص: ' + (error.message || 'غير معروف'));
        }
      }
      if (getOrgs().length > 20) report.push('تنبيه: تم فحص أول 20 مؤسسة فقط.');
      report.push('\nلم تُعدّل أي حسابات.');
      window.alert(report.join('\n'));
    } finally {
      identityAuditBtn.disabled = false;
      identityAuditBtn.textContent = 'فحص حسابات المؤسسات';
    }
  });


  orgForm.addEventListener('submit', async (e)=>{
    e.preventDefault(); const f = orgForm.elements;
    const organization = {
      name:f.name.value.trim(),
      phone:f.phone.value.trim(),
      plan:f.plan.value,
      billingCycle:f.billingCycle.value,
      status:f.status.value,
      expiresAt: f.expiresAt.value ? new Date(f.expiresAt.value).toISOString() : null,
      notes:f.notes.value.trim()
    };
    const latRaw = f.mapCenterLat.value.trim();
    const lngRaw = f.mapCenterLng.value.trim();
    const zoomRaw = f.mapDefaultZoom.value.trim();
    const hasAnySpatialValue = Boolean(latRaw || lngRaw || zoomRaw);
    let spatialPatch = {};
    if(hasAnySpatialValue){
      const lat = Number(latRaw), lng = Number(lngRaw), zoom = Number(zoomRaw);
      if(!latRaw || !lngRaw || !zoomRaw || !Number.isFinite(lat) || lat < -90 || lat > 90 ||
         !Number.isFinite(lng) || lng < -180 || lng > 180 ||
         !Number.isInteger(zoom) || zoom < 4 || zoom > 19){
        showNotif('أكمل مركز الخريطة الموثوق بإحداثيات صحيحة ومستوى تكبير من 4 إلى 19.');
        return;
      }
      spatialPatch = { mapCenter:{ lat, lng }, mapDefaultZoom:zoom };
    }
    const manager = {
      name:f.manager.value.trim(),
      email:f.email.value.trim(),
      password:f.managerPassword.value
    };
    const id = f.docId.value;
    try{
      if(id){
        if(forceProvision){
          await ownerAdminCall({
            action:'ownerRestoreTenantManager',
            organizationId:id, mode:'createMissing',
            confirmation:true, password:manager.password,
          });
          showNotif('تم إنشاء حساب المدير وربطه بالمؤسسة الحالية. لم تتغير بقية بيانات المؤسسة.');
          orgModal.close();
          await refreshAll();
          return;
        }
        await ownerAdminCall({
          action:'ownerUpdateOrganizationDetails', organizationId:id, organization,
        });
        if(Object.keys(spatialPatch).length){
          await ownerAdminCall({
            action:'ownerSetOrganizationSpatialContext',
            organizationId:id,
            mapCenter:spatialPatch.mapCenter,
            mapDefaultZoom:spatialPatch.mapDefaultZoom
          });
        }
        showNotif('تم تحديث بيانات المؤسسة.');
      }else{
        if(!manager.password){
          showNotif('حدد كلمة مرور مدير البلدية قبل إنشاء المؤسسة.');
          return;
        }
        const result = await ownerAdminCall({
          action:'ownerCreateOrganizationWithManager',
          organization,
          manager
        });
        if(!result.managerCreated || !result.managerUid || !result.organizationId){
          throw new Error('manager_provisioning_incomplete');
        }
        if(Object.keys(spatialPatch).length){
          await ownerAdminCall({
            action:'ownerSetOrganizationSpatialContext',
            organizationId:result.organizationId,
            mapCenter:spatialPatch.mapCenter,
            mapDefaultZoom:spatialPatch.mapDefaultZoom
          });
        }
        showNotif('تم إنشاء المؤسسة ومدير البلدية وربط الحساب بنجاح.');
      }
      orgModal.close();
      await refreshAll();
    }catch(error){
      showNotif('تعذّر حفظ المؤسسة: '+(error.message||'خطأ غير معروف'));
    }
  });
  deleteBtn.addEventListener('click', async ()=>{
    const id = orgForm.elements.docId.value; if(!id) return;
    const org = getOrgs().find(o=>o.id===id);
    if(org?.status === 'archived'){
      await ownerAdminCall({ action:'ownerRestoreOrganization', organizationId:id, status:'active' });
      orgModal.close();
      showNotif('تمت استعادة المؤسسة وتفعيلها.');
      await refreshAll();
      return;
    }
    const label = org?.name || id;
    if(confirm(`تأكيد أرشفة ${label}؟ لن تُحذف الحسابات أو الفواتير أو السجلات المرتبطة.`)){
      await ownerAdminCall({ action:'ownerArchiveOrganization', organizationId:id });
      orgModal.close();
      showNotif('تمت أرشفة المؤسسة بأمان مع الإبقاء على السجلات المرتبطة.');
      await refreshAll();
    }
  });

  return Object.freeze({ renderOrgs, openOrgModal });
}
