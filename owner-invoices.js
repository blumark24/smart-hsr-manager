// Invoices / Subscriptions module for the Owner Command Center (#/subscriptions).
//
// Extracted from owner.html (Sprint 6.4.1). Owns rendering and creation
// (manual + upgrade-triggered) of invoice records, plus their PDF
// generation. INVOICES array ownership and fetchInvoices() stay in
// owner.html (same decision already applied to ORGS/fetchOrganizations
// for the Organizations module), since fetchInvoices() is called
// directly from the shared refreshAll() orchestrator. This module reads
// the current INVOICES value on demand via the injected getInvoices(),
// mirroring exactly how getOrgs() already works for ORGS.
//
// createInvoice() is also consumed by owner-organizations.js's upgrade
// handler — owner.html re-wires that injection to point here instead of
// to a local function, avoiding a circular import between the two
// extracted modules.
import { addDoc, collection } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

export function initInvoicesModule({ auth, db, getOrgs, getInvoices, showNotif, refreshAll } = {}) {
  const invoicesBody = document.getElementById('invoicesBody');
  const newInvoiceBtn = document.getElementById('newInvoiceBtn');
  const invoiceModal = document.getElementById('invoiceModal');
  const invoiceForm = document.getElementById('invoiceForm');
  const invoiceOrgSelect = document.getElementById('invoiceOrgId');
  const invoiceSaveBtn = document.getElementById('invoiceSaveBtn');
  const ADMIN_API = '/api/admin/users';

  async function callAdminApi(payload){
    const user = auth && auth.currentUser;
    if(!user) throw new Error('انتهت جلسة المالك. سجّل الدخول من جديد.');
    let token = await user.getIdToken();
    let resp = await fetch(ADMIN_API, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+token },
      body:JSON.stringify(payload)
    });
    if(resp.status===401){
      token = await user.getIdToken(true);
      resp = await fetch(ADMIN_API, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+token },
        body:JSON.stringify(payload)
      });
    }
    let data={}; try{ data=await resp.json(); }catch(_){}
    if(!resp.ok) throw new Error(data.reason || data.error || ('HTTP '+resp.status));
    return data;
  }

  function formatSAR(n){ return new Intl.NumberFormat('ar-SA', {minimumFractionDigits:2, maximumFractionDigits:2}).format(n) + ' ر.س'; }

  function fillInvoiceOrgSelect(){
    invoiceOrgSelect.innerHTML = '';
    getOrgs().forEach(o=>{
      invoiceOrgSelect.add(new Option(o.name||o.id, o.id));
    });
  }

  function renderInvoices(){
    const INVOICES = getInvoices();
    invoicesBody.innerHTML = '';
    INVOICES.forEach(inv=>{
      const tr = document.createElement('tr');

      const tdId = document.createElement('td'); tdId.textContent = inv.invoiceId||inv.id; tr.appendChild(tdId);
      const tdOrg = document.createElement('td'); tdOrg.textContent = inv.organization_name||'-'; tr.appendChild(tdOrg);
      const tdPlan = document.createElement('td'); tdPlan.textContent = inv.plan||'-'; tr.appendChild(tdPlan);
      const tdCycle = document.createElement('td'); tdCycle.textContent = inv.billingCycle||'-'; tr.appendChild(tdCycle);
      const tdAmount = document.createElement('td'); tdAmount.textContent = formatSAR(inv.total||0); tr.appendChild(tdAmount);

      const tdStatus = document.createElement('td');
      const badge = document.createElement('span'); badge.className = 'badge';
      const isPaid = inv.status === 'paid';
      badge.style.borderColor = isPaid? '#16a34a':'#f59e0b';
      badge.style.color = isPaid? '#16a34a':'#f59e0b';
      badge.textContent = inv.status||'-';
      tdStatus.appendChild(badge); tr.appendChild(tdStatus);

      const tdDate = document.createElement('td');
      tdDate.textContent = inv.createdAt? new Date(inv.createdAt).toLocaleDateString('ar-SA'):'-';
      tr.appendChild(tdDate);

      const tdFile = document.createElement('td');
      const actions = document.createElement('div');
      actions.className = 'flex items-center gap-1 justify-end flex-wrap';
      const pdfBtn = document.createElement('button'); pdfBtn.className='btn btn-outline'; pdfBtn.textContent='PDF'; pdfBtn.dataset.dl=inv.id;
      const editBtn = document.createElement('button'); editBtn.className='btn btn-outline'; editBtn.textContent='تعديل'; editBtn.dataset.edit=inv.id;
      const archiveBtn = document.createElement('button'); archiveBtn.className='btn btn-outline'; archiveBtn.textContent='أرشفة'; archiveBtn.dataset.archive=inv.id;
      const deleteBtn = document.createElement('button'); deleteBtn.className='btn btn-ghost'; deleteBtn.textContent='حذف'; deleteBtn.dataset.delete=inv.id;
      actions.append(pdfBtn,editBtn,archiveBtn,deleteBtn);
      tdFile.appendChild(actions); tr.appendChild(tdFile);

      invoicesBody.appendChild(tr);
    });
  }

  // مودال فاتورة يدوية
  newInvoiceBtn.addEventListener('click', ()=> {
    invoiceForm.reset();
    invoiceForm.elements.docId.value='';
    fillInvoiceOrgSelect();
    invoiceOrgSelect.disabled=false;
    if(invoiceSaveBtn) invoiceSaveBtn.textContent='إصدار الفاتورة';
    invoiceModal.querySelector('h3').textContent='إصدار فاتورة يدوية';
    invoiceModal.showModal();
  });
  invoiceForm.addEventListener('submit', async (e)=>{
    e.preventDefault(); const f = invoiceForm.elements;
    const docId = f.docId.value;
    try{
      if(docId){
        await callAdminApi({
          action:'ownerInvoiceUpdate', invoiceId:docId,
          plan:f.plan.value, billingCycle:f.billingCycle.value,
          amount:Number(f.amount.value||0), status:f.status.value
        });
        invoiceModal.close(); showNotif('تم تحديث الفاتورة.'); await refreshAll(); return;
      }
      const org = getOrgs().find(o=>o.id===f.orgId.value); if(!org) return;
      await createInvoice({
        org, plan:f.plan.value, billingCycle:f.billingCycle.value,
        amount:Number(f.amount.value||0), status:f.status.value
      });
      invoiceModal.close(); showNotif('تم إصدار الفاتورة وإضافتها إلى السجل.'); await refreshAll();
    }catch(error){
      showNotif('تعذّر حفظ الفاتورة: '+(error.message||'خطأ غير معروف'));
    }
  });

  // إنشاء فاتورة + حفظ PDF
  async function createInvoice({ org, plan, billingCycle, amount, status='paid' }){
    // تسعير افتراضي في حال لم يُرسل مبلغ يدوي
    const base = amount || (plan==='Basic'?249: plan==='Pro'?499: 1499);
    const vat = +(base * 0.15).toFixed(2);
    const total = +(base + vat).toFixed(2);
    const invoiceId = 'INV-' + Math.random().toString(36).slice(2,7).toUpperCase();
    const payload = {
      invoiceId,
      organization_id: org.id,
      organization_name: org.name,
      plan, billingCycle,
      amount: base, vat, total,
      status: ['paid','pending','overdue','cancelled','archived'].includes(status) ? status : 'paid',
      createdAt: new Date().toISOString()
    };
    await addDoc(collection(db,'invoices'), payload);
    // توليد PDF بسيط
    const { jsPDF } = window.jspdf; const docPdf = new jsPDF({ unit:'pt', compress:true });
    docPdf.setFont('helvetica','bold'); docPdf.setFontSize(16);
    docPdf.text(`فاتورة اشتراك – ${invoiceId}` , 40, 40);
    docPdf.setFontSize(12); docPdf.setFont('helvetica','normal');
    docPdf.text(`المؤسسة: ${org.name||'-'}`, 40, 70);
    docPdf.text(`الخطة: ${plan} (${billingCycle})`, 40, 90);
    docPdf.text(`المبلغ: ${base} SAR`, 40, 110);
    docPdf.text(`الضريبة 15%: ${vat} SAR`, 40, 130);
    docPdf.text(`الإجمالي: ${total} SAR`, 40, 150);
    docPdf.text(`التاريخ: ${(new Date()).toLocaleDateString('ar-SA')}`, 40, 170);
    docPdf.save(`${invoiceId}.pdf`);
  }

  // تنزيل PDF من الجدول (إعادة توليد سريع)
  invoicesBody.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button'); if(!btn) return;
    const editId=btn.dataset.edit, archiveId=btn.dataset.archive, deleteId=btn.dataset.delete, dlId=btn.dataset.dl;
    try{
      if(editId){
        const inv=getInvoices().find(x=>x.id===editId); if(!inv) return;
        fillInvoiceOrgSelect();
        invoiceForm.elements.docId.value=inv.id;
        invoiceForm.elements.orgId.value=inv.organization_id||'';
        invoiceOrgSelect.disabled=true;
        invoiceForm.elements.plan.value=inv.plan||'Basic';
        invoiceForm.elements.billingCycle.value=inv.billingCycle||'monthly';
        invoiceForm.elements.amount.value=Number(inv.amount||0);
        invoiceForm.elements.status.value=inv.status||'paid';
        if(invoiceSaveBtn) invoiceSaveBtn.textContent='حفظ التعديلات';
        invoiceModal.querySelector('h3').textContent='تعديل الفاتورة';
        invoiceModal.showModal();
        return;
      }
      if(archiveId){
        if(!confirm('أرشفة هذه الفاتورة؟ ستبقى محفوظة في السجل ويمكن مراجعتها لاحقًا.')) return;
        await callAdminApi({action:'ownerInvoiceArchive',invoiceId:archiveId});
        showNotif('تمت أرشفة الفاتورة.'); await refreshAll(); return;
      }
      if(deleteId){
        if(!confirm('حذف هذه الفاتورة نهائيًا؟ لا يمكن التراجع عن الحذف.')) return;
        await callAdminApi({action:'ownerInvoiceDelete',invoiceId:deleteId});
        showNotif('تم حذف الفاتورة.'); await refreshAll(); return;
      }
      const id=dlId; if(!id) return;
      const inv = getInvoices().find(x=> x.id===id); if(!inv) return;
      const { jsPDF } = window.jspdf; const docPdf = new jsPDF({ unit:'pt', compress:true });
    docPdf.setFont('helvetica','bold'); docPdf.setFontSize(16);
    docPdf.text(`فاتورة اشتراك – ${inv.invoiceId||id}` , 40, 40);
    docPdf.setFontSize(12); docPdf.setFont('helvetica','normal');
    docPdf.text(`المؤسسة: ${inv.organization_name||'-'}`, 40, 70);
    docPdf.text(`الخطة: ${inv.plan||'-'} (${inv.billingCycle||'-'})`, 40, 90);
    docPdf.text(`المبلغ: ${inv.amount||0} SAR`, 40, 110);
    docPdf.text(`الضريبة 15%: ${inv.vat||0} SAR`, 40, 130);
    docPdf.text(`الإجمالي: ${inv.total||0} SAR`, 40, 150);
      docPdf.text(`التاريخ: ${inv.createdAt? new Date(inv.createdAt).toLocaleDateString('ar-SA'): ''}`, 40, 170);
      docPdf.save(`${inv.invoiceId||id}.pdf`);
    }catch(error){
      showNotif('تعذّر تنفيذ العملية: '+(error.message||'خطأ غير معروف'));
    }
  });

  return Object.freeze({ renderInvoices, fillInvoiceOrgSelect, createInvoice });
}
