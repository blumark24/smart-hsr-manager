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
      wrap.appendChild(mkBtn('ترقية','upgrade','btn btn-primary'));
      wrap.appendChild(mkBtn(o.status==='archived'?'استعادة':'أرشفة',o.status==='archived'?'restore':'archive',o.status==='archived'?'btn btn-primary':'btn btn-outline'));
      tdActions.appendChild(wrap); tr.appendChild(tdActions);

      orgsBody.appendChild(tr);
    });
  }

  function openOrgModal(org=null){
    orgForm.reset();
    document.getElementById('modalTitle').textContent = org? 'تعديل مؤسسة' : 'إضافة مؤسسة';
    const f = orgForm.elements;
    f.name.value = org?.name||''; f.manager.value = org?.manager||''; f.email.value = org?.email||''; f.phone.value = org?.phone||'';
    f.managerPassword.value = '';
    f.managerPassword.required = !org;
    f.managerPassword.disabled = Boolean(org);
    const passwordField = document.getElementById('managerPasswordField');
    if(passwordField) passwordField.classList.toggle('hidden', Boolean(org));
    f.plan.value = org?.plan||'Trial'; f.billingCycle.value = org?.billingCycle||'monthly'; f.status.value = org?.status|| (org?.plan==='Trial'?'trial':'active');
    f.expiresAt.value = org?.expiresAt? new Date(org.expiresAt).toISOString().slice(0,10): '';
    f.notes.value = org?.notes||'';
    f.docId.value = org?.id||''; deleteBtn.classList.toggle('hidden', !org);
    deleteBtn.textContent = org?.status === 'archived' ? 'استعادة المؤسسة' : 'أرشفة المؤسسة';
    orgModal.showModal();
  }

  // أحداث الجدول
  orgsBody.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button'); if(!btn) return;
    const act = btn.dataset.act; const id = btn.dataset.id; const org = getOrgs().find(o=>o.id===id);
    if(act==='edit'){ openOrgModal(org); }
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
    const manager = {
      name:f.manager.value.trim(),
      email:f.email.value.trim(),
      password:f.managerPassword.value
    };
    const id = f.docId.value;
    try{
      if(id){
        await updateDoc(doc(db,'organizations', id), {
          ...organization,
          manager:manager.name,
          email:manager.email,
          updatedAt:serverTimestamp()
        });
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
