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

export function initInvoicesModule({ db, getOrgs, getInvoices, showNotif, refreshAll } = {}) {
  const invoicesBody = document.getElementById('invoicesBody');
  const newInvoiceBtn = document.getElementById('newInvoiceBtn');
  const invoiceModal = document.getElementById('invoiceModal');
  const invoiceForm = document.getElementById('invoiceForm');
  const invoiceOrgSelect = document.getElementById('invoiceOrgId');

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
      const btn = document.createElement('button'); btn.className = 'btn btn-outline'; btn.textContent = 'PDF';
      btn.dataset.dl = inv.id;
      tdFile.appendChild(btn); tr.appendChild(tdFile);

      invoicesBody.appendChild(tr);
    });
  }

  // مودال فاتورة يدوية
  newInvoiceBtn.addEventListener('click', ()=> { invoiceForm.reset(); fillInvoiceOrgSelect(); invoiceModal.showModal(); });
  invoiceForm.addEventListener('submit', async (e)=>{
    e.preventDefault(); const f = invoiceForm.elements;
    const org = getOrgs().find(o=>o.id===f.orgId.value); if(!org) return;
    await createInvoice({ org, plan:f.plan.value, billingCycle:f.billingCycle.value, amount: Number(f.amount.value||0) });
    invoiceModal.close(); showNotif('تم إصدار الفاتورة وإضافتها إلى السجل.'); await refreshAll();
  });

  // إنشاء فاتورة + حفظ PDF
  async function createInvoice({ org, plan, billingCycle, amount }){
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
      status: 'paid', // مبدئيًا مدفوعة – يمكن ربطها لاحقًا ببوابة الدفع
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
    const btn = e.target.closest('button'); if(!btn) return; const id = btn.dataset.dl; if(!id) return;
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
  });

  return Object.freeze({ renderInvoices, fillInvoiceOrgSelect, createInvoice });
}
