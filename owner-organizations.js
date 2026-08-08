// Organizations module for the Owner Command Center (#/organizations).
//
// Extracted from owner.html (Sprint 6.2.8). Owns rendering and CRUD
// behavior for the organizations table and its add/edit modal only.
// Shared state ownership (ORGS), cross-module orchestration
// (refreshAll), notifications, and invoice creation stay in owner.html
// and are received here via dependency injection — this avoids a
// circular import between this module and any future subscriptions
// module that would also need ORGS.
import { doc, addDoc, updateDoc, deleteDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

export function initOrganizationsModule({ db, getOrgs, showNotif, refreshAll, createInvoice } = {}) {
  const orgsBody = document.getElementById('orgsBody');
  const searchBox = document.getElementById('searchBox');
  const addOrgBtn = document.getElementById('addOrgBtn');
  const orgModal = document.getElementById('orgModal');
  const orgForm = document.getElementById('orgForm');
  const deleteBtn = document.getElementById('deleteBtn');

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
      wrap.appendChild(mkBtn('ترقية','upgrade','btn btn-primary'));
      wrap.appendChild(mkBtn('حذف','delete','btn btn-outline'));
      tdActions.appendChild(wrap); tr.appendChild(tdActions);

      orgsBody.appendChild(tr);
    });
  }

  function openOrgModal(org=null){
    orgForm.reset();
    document.getElementById('modalTitle').textContent = org? 'تعديل مؤسسة' : 'إضافة مؤسسة';
    const f = orgForm.elements;
    f.name.value = org?.name||''; f.manager.value = org?.manager||''; f.email.value = org?.email||''; f.phone.value = org?.phone||'';
    f.plan.value = org?.plan||'Trial'; f.billingCycle.value = org?.billingCycle||'monthly'; f.status.value = org?.status|| (org?.plan==='Trial'?'trial':'active');
    f.expiresAt.value = org?.expiresAt? new Date(org.expiresAt).toISOString().slice(0,10): '';
    f.docId.value = org?.id||''; deleteBtn.classList.toggle('hidden', !org);
    orgModal.showModal();
  }

  // أحداث الجدول
  orgsBody.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button'); if(!btn) return;
    const act = btn.dataset.act; const id = btn.dataset.id; const org = getOrgs().find(o=>o.id===id);
    if(act==='edit'){ openOrgModal(org); }
    if(act==='upgrade'){ // ترقية الخطة → تحديث المؤسسة + إنشاء فاتورة
      const newPlan = org.plan==='Pro' ? 'Enterprise' : (org.plan==='Basic' ? 'Pro' : 'Pro');
      await updateDoc(doc(db,'organizations', id), { plan:newPlan, status:'active', updatedAt: serverTimestamp() });
      await createInvoice({ org, plan:newPlan, billingCycle: org.billingCycle||'monthly' });
      showNotif(`تمت ترقية خطة ${org.name} إلى ${newPlan} وإصدار فاتورة تلقائيًا.`);
      await refreshAll();
    }
    if(act==='delete'){
      if(confirm('تأكيد حذف المؤسسة؟')){ await deleteDoc(doc(db,'organizations', id)); showNotif('تم حذف المؤسسة بنجاح.'); await refreshAll(); }
    }
  });

  // بحث
  searchBox.addEventListener('input', (e)=> renderOrgs(e.target.value.trim()));

  // مودال المؤسسة
  addOrgBtn.addEventListener('click', ()=> openOrgModal());

  orgForm.addEventListener('submit', async (e)=>{
    e.preventDefault(); const f = orgForm.elements;
    const payload = {
      name:f.name.value.trim(), manager:f.manager.value.trim(), email:f.email.value.trim(), phone:f.phone.value.trim(),
      plan:f.plan.value, billingCycle:f.billingCycle.value, status:f.status.value,
      expiresAt: f.expiresAt.value ? new Date(f.expiresAt.value).toISOString() : null,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    };
    const id = f.docId.value;
    if(id){ await updateDoc(doc(db,'organizations', id), payload); showNotif('تم تحديث بيانات المؤسسة.'); }
    else { const ref = await addDoc(collection(db,'organizations'), payload); showNotif('تمت إضافة مؤسسة جديدة بنجاح.'); }
    orgModal.close(); await refreshAll();
  });
  deleteBtn.addEventListener('click', async ()=>{
    const id = orgForm.elements.docId.value; if(!id) return;
    if(confirm('تأكيد الحذف؟')){ await deleteDoc(doc(db,'organizations', id)); orgModal.close(); showNotif('تم حذف المؤسسة.'); await refreshAll(); }
  });

  return Object.freeze({ renderOrgs, openOrgModal });
}
