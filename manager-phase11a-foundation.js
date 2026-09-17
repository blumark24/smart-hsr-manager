(() => {
  'use strict';

  const SERVICE_LABELS = ['إدارة الحصر الميداني','إدارة الأراضي والممتلكات','إدارة الحركة والسير'];
  const HOME_LABELS = ['الرئيسية', 'لوحة المدير'];
  const USER_CENTER_LABELS = ['مركز المستخدمين','مركز إدارة المستخدمين','الصلاحيات والسجل','فتح مركز المستخدمين','فتح مركز إدارة المستخدمين'];
  const SHEETJS_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

  const assignStyles = (el, styles) => {
    if (!el) return;
    Object.entries(styles).forEach(([key, value]) => { if (el.style[key] !== value) el.style[key] = value; });
  };

  const fixedOverlays = () => Array.from(document.querySelectorAll('div')).filter(el => {
    const inline = el.style && el.style.position === 'fixed';
    if (inline) return true;
    try { return window.getComputedStyle(el).position === 'fixed'; } catch (_) { return false; }
  });

  const centerOverlayPanel = (overlay, width, label) => {
    if (!overlay || overlay.dataset.phase11aCentered === 'true') return;
    const panel = Array.from(overlay.children).find(child => child && child.nodeType === 1);
    if (!panel) return;
    overlay.dataset.phase11aCentered = 'true';
    assignStyles(overlay, { alignItems:'center', justifyContent:'center', padding:'16px', background:'rgba(3, 6, 13, 0.68)', backdropFilter:'blur(5px)' });
    panel.setAttribute('role', panel.getAttribute('role') || 'dialog');
    panel.setAttribute('aria-modal', panel.getAttribute('aria-modal') || 'true');
    panel.setAttribute('aria-label', panel.getAttribute('aria-label') || label);
    assignStyles(panel, { width:`min(${width}px, 100%)`, maxHeight:'calc(100vh - 32px)', borderRadius:'18px', border:'1px solid var(--cardBd, rgba(122,164,224,0.18))', boxShadow:'var(--dwSh, 0 30px 80px -28px rgba(0,0,0,.9))', overflow:'auto' });
  };

  const patchMobilityModalCollision = () => {
    const duplicate = document.querySelector('section[role="dialog"][aria-label="لوحة مدير إدارة الحركة والسير"]');
    if (!duplicate) return;
    const overlay = duplicate.parentElement;
    if (!overlay || overlay.dataset.phase11aSuppressed === 'mobility-duplicate-modal') return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.dataset.phase11aSuppressed = 'mobility-duplicate-modal';
  };

  const patchEvidenceDetails = () => {
    document.querySelectorAll('img[alt="صورة قبل المعالجة"], img[alt="صورة بعد المعالجة"]').forEach(img => {
      if (img.dataset.phase11aEvidence === 'true') return;
      img.dataset.phase11aEvidence = 'true';
      assignStyles(img, { width:'100%', maxHeight:'420px', objectFit:'contain', background:'var(--ctl, rgba(20,32,54,0.35))' });
    });
    fixedOverlays().forEach(overlay => {
      const text = (overlay.textContent || '').replace(/\s+/g, ' ');
      if (text.includes('صورة قبل المعالجة') || text.includes('صورة بعد المعالجة')) centerOverlayPanel(overlay, 900, 'تفاصيل البلاغ والأدلة');
    });
  };

  const patchIncidentDetails = () => {
    fixedOverlays().forEach(overlay => {
      const text = (overlay.textContent || '').replace(/\s+/g, ' ');
      if (text.includes('عرض على الخريطة')) centerOverlayPanel(overlay, 720, 'تفاصيل الحادث');
    });
  };

  const renameUserCenterEntryPoints = () => {
    document.querySelectorAll('a,button,[role="button"],span,div').forEach(el => {
      if (el.children.length) return;
      const text = (el.textContent || '').trim();
      if (text === 'مركز المستخدمين' || text === 'فتح مركز المستخدمين' || text === 'الصلاحيات والسجل') {
        el.textContent = text.startsWith('فتح') ? 'فتح مركز إدارة المستخدمين' : 'مركز إدارة المستخدمين';
      }
    });
  };

  const patchUserCenterFullPage = () => {
    const section = Array.from(document.querySelectorAll('section[role="dialog"]')).find(el => {
      const label = el.getAttribute('aria-label') || '';
      const title = (el.querySelector('h2')?.textContent || '').trim();
      return label === 'مركز المستخدمين' || label === 'مركز إدارة المستخدمين' || title === 'مركز المستخدمين' || title === 'مركز إدارة المستخدمين';
    });
    if (!section) return;
    const overlay = section.parentElement;
    if (!overlay || overlay.dataset.phase11bUserCenter === 'true') return;
    overlay.dataset.phase11bUserCenter = 'true';
    section.setAttribute('aria-label', 'مركز إدارة المستخدمين');
    const h2 = section.querySelector('h2');
    if (h2) h2.textContent = 'مركز إدارة المستخدمين';
    assignStyles(overlay, { inset:'0', zIndex:'90', padding:'0', alignItems:'stretch', justifyContent:'stretch', background:'var(--pgBg,#03060d)', backdropFilter:'none' });
    assignStyles(section, { width:'100%', maxWidth:'none', height:'100vh', maxHeight:'none', borderRadius:'0', border:'0', padding:'18px', background:'var(--pgBg,#03060d)', overflow:'auto' });

    // Keep one clear top-level creation path. Account activation remains inside the employee record.
    section.querySelectorAll('button').forEach(btn => {
      const text = (btn.textContent || '').replace(/\s+/g, ' ').trim();
      if (text === 'إضافة مستخدم') { btn.style.display = 'none'; btn.setAttribute('aria-hidden', 'true'); }
      if (text === 'إضافة موظف بلا حساب') btn.textContent = 'إضافة موظف';
    });

    const toolbar = Array.from(section.querySelectorAll('div')).find(el => {
      const text = (el.textContent || '').replace(/\s+/g,' ');
      return text.includes('إضافة موظف') && el.querySelector('button');
    });
    if (toolbar && !toolbar.querySelector('[data-phase11b-import]')) {
      const importBtn = document.createElement('button');
      importBtn.type = 'button';
      importBtn.dataset.phase11bImport = '1';
      importBtn.textContent = 'استيراد ملف';
      importBtn.setAttribute('aria-label', 'استيراد ملف موظفين');
      importBtn.style.cssText = 'height:30px;padding:0 14px;border-radius:9px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;color:var(--tx2,#a9bdd4);background:var(--ctl,rgba(20,32,54,0.5));border:1px solid var(--ctlBd,rgba(122,164,224,0.16));';
      importBtn.addEventListener('click', openImportDialog);
      toolbar.appendChild(importBtn);
    }
  };

  const patchEmployeeAndUserDrawers = () => {
    fixedOverlays().forEach(overlay => {
      const text = (overlay.textContent || '').replace(/\s+/g,' ');
      if (text.includes('حفظ الصلاحيات') || text.includes('سجل التكليف') || text.includes('إنشاء حساب')) {
        centerOverlayPanel(overlay, text.includes('سجل التكليف') ? 980 : 860, 'سجل الموظف');
      }
    });
  };

  const employeeImportFields = ['الاسم','الرقم الوظيفي','البريد','الجوال','الإدارة','القسم','المسمى الوظيفي'];
  const headerMap = new Map([
    ['الاسم','name'],['اسم الموظف','name'],['name','name'],['الرقم الوظيفي','employeeRef'],['رقم الموظف','employeeRef'],['employee id','employeeRef'],['البريد','email'],['البريد الإلكتروني','email'],['email','email'],['الجوال','phone'],['رقم الجوال','phone'],['phone','phone'],['الإدارة','administration'],['الادارة','administration'],['administration','administration'],['القسم','department'],['department','department'],['المسمى الوظيفي','jobTitle'],['الوظيفة','jobTitle'],['job title','jobTitle']
  ]);
  const normalizeHeader = value => String(value || '').trim().toLowerCase().replace(/[إأآ]/g,'ا').replace(/ة/g,'ه').replace(/\s+/g,' ');
  const normalizeRow = raw => {
    const row = {};
    Object.entries(raw || {}).forEach(([key,val]) => {
      const mapped = headerMap.get(normalizeHeader(key));
      if (mapped) row[mapped] = String(val ?? '').trim();
    });
    return row;
  };
  const validateImportRow = row => {
    const errors = [];
    if (!row.name) errors.push('الاسم مطلوب');
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push('البريد غير صالح');
    return errors;
  };
  const parseCsv = text => {
    const lines = String(text || '').replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    const parse = line => {
      const out=[]; let value='', quoted=false;
      for(let i=0;i<line.length;i++){const ch=line[i]; if(ch==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){out.push(value);value='';}else value+=ch;} out.push(value); return out;
    };
    const headers = parse(lines.shift()).map(v=>v.trim());
    return lines.map(line => Object.fromEntries(headers.map((h,i)=>[h,parse(line)[i]||''])));
  };

  async function currentToken() {
    const [appApi, authApi] = await Promise.all([import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'), import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js')]);
    const app = appApi.getApps().find(item => item.name === 'smart-hsr-manager-session') || appApi.getApps()[0];
    if (!app) throw new Error('no_session');
    const auth = authApi.getAuth(app);
    const user = auth.currentUser;
    if (!user) throw new Error('no_session');
    return user.getIdToken();
  }

  async function createEmployee(row, organizationId) {
    const token = await currentToken();
    const response = await fetch('/api/admin/employees', { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body:JSON.stringify({ action:'create', organizationId, name:row.name, employeeRef:row.employeeRef||undefined, email:row.email||undefined, phone:row.phone||undefined, administration:row.administration||undefined, department:row.department||undefined, jobTitle:row.jobTitle||undefined }) });
    const body = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(body.reason || body.error || 'request_failed');
    return body;
  }

  async function ensureXlsx() {
    if (window.XLSX) return window.XLSX;
    await new Promise((resolve,reject)=>{ const script=document.createElement('script'); script.src=SHEETJS_URL; script.defer=true; script.crossOrigin='anonymous'; script.onload=resolve; script.onerror=reject; document.head.appendChild(script); });
    if (!window.XLSX) throw new Error('xlsx_unavailable');
    return window.XLSX;
  }

  function getOrganizationIdFromPage() {
    const text = document.body.innerText || '';
    const match = text.match(/org-[A-Za-z0-9_-]+/);
    return match ? match[0] : null;
  }

  function downloadImportTemplate() {
    const blob = new Blob(['\uFEFF'+employeeImportFields.join(',')+'\n'], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='smart-hsr-employees-template.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),800);
  }

  function openImportDialog() {
    if (document.getElementById('phase11b-import-dialog')) return;
    const wrap = document.createElement('div'); wrap.id='phase11b-import-dialog';
    wrap.style.cssText='position:fixed;inset:0;z-index:160;background:rgba(3,6,13,.72);backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;padding:16px;';
    wrap.innerHTML = `<div role="dialog" aria-modal="true" aria-label="استيراد الموظفين" style="width:min(980px,100%);max-height:calc(100vh - 32px);overflow:auto;border-radius:18px;background:var(--drawer,#0a1120);border:1px solid var(--cardBd,rgba(122,164,224,.18));box-shadow:0 32px 90px -28px rgba(0,0,0,.92);padding:16px;color:var(--tx,#e9f1fb)"><div style="display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--div,rgba(122,164,224,.12));padding-bottom:12px"><strong style="flex:1">استيراد ملف موظفين</strong><button data-x="close">×</button></div><p style="font-size:10.5px;color:var(--tx3,#7d8ea6);line-height:1.8">CSV أو XLSX · الاسم هو الحقل الإلزامي الوحيد · لا يتم حفظ أي صف قبل المعاينة والتأكيد · لا يتم استيراد كلمات المرور.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><label style="height:34px;padding:0 12px;border-radius:9px;background:var(--btn,rgba(56,132,220,.35));border:1px solid var(--btnBd,rgba(120,170,255,.3));display:inline-flex;align-items:center;cursor:pointer;font-size:11px">اختيار ملف<input data-x="file" type="file" accept=".csv,.xlsx,.xls" hidden></label><button data-x="template">تنزيل قالب CSV</button></div><div data-x="preview" style="margin-top:12px"></div><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button data-x="close">إلغاء</button><button data-x="commit" disabled>حفظ الموظفين</button></div></div>`;
    document.body.appendChild(wrap);
    let rows=[];
    const preview=wrap.querySelector('[data-x="preview"]'), commit=wrap.querySelector('[data-x="commit"]');
    const renderPreview=()=>{ const valid=rows.filter(r=>!r.errors.length); preview.innerHTML=rows.length?`<div style="max-height:390px;overflow:auto;border:1px solid var(--div,rgba(122,164,224,.12));border-radius:10px"><table style="width:100%;min-width:760px;border-collapse:collapse"><thead><tr>${['الحالة','الاسم','الرقم الوظيفي','البريد','الإدارة','القسم'].map(h=>`<th style="padding:8px;text-align:right;font-size:10px">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr><td style="padding:8px;font-size:9px;color:${r.errors.length?'#fb7185':'#86efac'}">${r.errors[0]||'جاهز'}</td><td style="padding:8px">${r.row.name||'—'}</td><td style="padding:8px">${r.row.employeeRef||'—'}</td><td style="padding:8px">${r.row.email||'—'}</td><td style="padding:8px">${r.row.administration||'—'}</td><td style="padding:8px">${r.row.department||'—'}</td></tr>`).join('')}</tbody></table></div><div style="font-size:10px;color:var(--tx3,#7d8ea6);margin-top:8px">${valid.length} من ${rows.length} صف جاهز للحفظ</div>`:''; commit.disabled=!valid.length; };
    wrap.addEventListener('click', async e=>{ const x=e.target.closest('[data-x]')?.dataset.x; if(x==='close'){wrap.remove();return;} if(x==='template'){downloadImportTemplate();return;} if(x==='commit'){ const orgId=getOrganizationIdFromPage(); if(!orgId){alert('تعذر تحديد المؤسسة الحالية.');return;} const valid=rows.filter(r=>!r.errors.length); commit.disabled=true; commit.textContent='جاري الحفظ...'; let ok=0,fail=0; for(const item of valid){try{await createEmployee(item.row,orgId);ok++;}catch(_){fail++;}} preview.insertAdjacentHTML('beforeend',`<div style="margin-top:10px;font-size:11px">تمت إضافة ${ok} سجل${fail?` · تعذر ${fail}`:''}.</div>`); commit.textContent='اكتمل'; setTimeout(()=>location.reload(),900); }});
    wrap.querySelector('[data-x="file"]').addEventListener('change', async e=>{ const file=e.target.files?.[0]; if(!file)return; try{ let raw=[]; if(/\.csv$/i.test(file.name))raw=parseCsv(await file.text()); else {const XLSX=await ensureXlsx();const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});raw=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});} if(raw.length>300)throw new Error('too_many'); rows=raw.map(normalizeRow).map(row=>({row,errors:validateImportRow(row)})); renderPreview(); }catch(err){preview.textContent=err.message==='too_many'?'الحد الأقصى 300 موظف في الدفعة.':'تعذر قراءة الملف.';} });
  }

  const applyPhase11BFixes = () => {
    patchMobilityModalCollision(); patchEvidenceDetails(); patchIncidentDetails(); renameUserCenterEntryPoints(); patchUserCenterFullPage(); patchEmployeeAndUserDrawers();
  };

  let scheduled = false;
  const schedule = () => { if (scheduled) return; scheduled = true; requestAnimationFrame(()=>{ scheduled=false; applyPhase11BFixes(); }); };

  const onPrimaryNavigationClick = event => {
    const target = event.target && event.target.closest ? event.target.closest('[data-f],a,button,[role="button"]') : null;
    if (!target) return;
    const label = (target.textContent || '').replace(/\s+/g, ' ').trim();
    if (HOME_LABELS.some(home => label === home || label.includes(home))) {
      event.preventDefault(); event.stopPropagation(); const current = new URL(window.location.href); current.hash=''; current.pathname=current.pathname.replace(/[^/]*$/,'manager.html'); window.location.assign(current.toString()); return;
    }
    if (SERVICE_LABELS.some(service => label.includes(service))) setTimeout(()=>window.scrollTo({top:0,behavior:'smooth'}),0);
  };

  const start = () => {
    if (document.documentElement.dataset.phase11aManagerFoundation === 'true') return;
    document.documentElement.dataset.phase11aManagerFoundation = 'true';
    document.addEventListener('click', onPrimaryNavigationClick, true);
    const observer = new MutationObserver(schedule); observer.observe(document.body,{subtree:true,childList:true}); applyPhase11BFixes();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true }); else start();
})();