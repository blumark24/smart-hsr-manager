(() => {
'use strict';
const U=window.SmartHSRInstitutionalUC;if(!U)return;
U.add=async()=>{
  // PHASE13D.3 — WINDOW SYSTEM V1 reference implementation. A real 4-step
  // flow (not the old single-page-all-at-once form): each step is its own
  // <section data-step-pane> shown one at a time; Next/Previous/Save drive
  // navigation; nothing is submitted until the final step. Backend calls,
  // field names, and role/product logic below are byte-identical to the
  // pre-existing single-page implementation — only the presentation and
  // step sequencing changed. Visual chrome for `.ucv2-add-dialog` lives in
  // manager-phase11g-user-center-approved-skin.js (the approved skin's own
  // "FINAL VISUAL OWNER" layer); this function only owns structure/logic.
  let d=await U.dir();
  let mans=U.managerOptions(d.employees,'employee','','');
  const roleOrder=['employee','department_head','general_supervisor','manager'];
  const roleLabelAr={manager:'مدير البلدية',general_supervisor:'مشرف عام',department_head:'رئيس قسم',employee:'موظف'};
  const roleDescAr={manager:'الحساب الأعلى للمؤسسة — لا يُنشأ من هذه الشاشة.',general_supervisor:'ينوب عن المدير في لوحة البلدية.',department_head:'نطاقه حسب المنتج والقسم.',employee:'حسب التسكين التشغيلي.'};
  // Step 3's label matches the approved visual reference's stepper text
  // ("الأدوار والخدمات", plural) — a copy-only change, the pane's own
  // content/id ("wiz-note" below) is untouched.
  const stepTitles=['البيانات الأساسية','التعيين المؤسسي','الصلاحيات والخدمات','حساب الدخول والمراجعة'];

  // Field order/widths match the approved Add Employee reference: full-width
  // name, then a 2-col email+ref-number row, then full-width phone.
  const pane1=`<section class="wiz-pane" data-step-pane="1"><div class="sec"><div class="st has-icon"><span class="ucv2-section-icon" data-icon="doc" aria-hidden="true"></span><span class="st-text"><span>البيانات الأساسية</span><small>إدخال المعلومات الشخصية الأساسية للموظف</small></span></div><div class="grid">${U.input('الاسم','add-name','',{w:true})}${U.input('البريد الإلكتروني','add-email','',{type:'email'})}${U.input('الرقم الوظيفي','add-ref')}${U.input('الجوال','add-phone','',{w:true,type:'tel'})}</div></div></section>`;
  const pane2=`<section class="wiz-pane" data-step-pane="2" hidden><div class="sec"><div class="st"><span>التعيين المؤسسي</span><small>الإدارة + القسم + الدور + المدير المباشر</small></div><div class="grid">${U.input('الإدارة','add-admin')}${U.input('القسم','add-dept')}${U.sel('الدور المؤسسي','inst-role','employee',[['manager','مدير البلدية — من حساب المؤسسة',true],['general_supervisor','المشرف العام'],['department_head','رئيس قسم'],['employee','موظف']])}${U.input('المسمى الوظيفي','add-title')}${U.sel('المدير المباشر','add-manager','',mans,{w:true})}${U.sel('الحالة الوظيفية','add-emp','active',[['active','على رأس العمل'],['inactive','غير نشط']])}</div></div></section>`;
  const pane3=`<section class="wiz-pane" data-step-pane="3" hidden>${U.permissions('employee')}<div class="wiz-note">فعّل الخدمات المطلوبة فقط، وحدد أهلية المركبة بشكل مستقل.</div></section>`;
  const pane4=`<section class="wiz-pane" data-step-pane="4" hidden><div class="sec"><label class="wiz-check"><input id="mk-account" type="checkbox"> إنشاء حساب دخول الآن</label><div class="acct" hidden style="margin-top:12px"><div class="grid">${U.input('بريد الدخول','login-email','',{type:'email'})}${U.input('كلمة المرور','pw','',{type:'password',ac:'new-password'})}${U.input('تأكيد كلمة المرور','pw2','',{type:'password',ac:'new-password'})}</div><div class="note">كلمة المرور التي يحددها مدير البلدية تصبح كلمة الدخول المعتمدة للحساب، ولا يُطلب تغييرها عند أول دخول.</div></div></div><div class="sec wiz-review"><div class="st"><span>مراجعة قبل الحفظ</span><small>تحقق من البيانات قبل إنشاء السجل</small></div><div class="wiz-review-body"></div></div></section>`;

  // Stepper circles are connected by a real .wiz-step-line element
  // (not a CSS pseudo-element) so RTL flex ordering places the lines
  // correctly with no positioning math — see manager-phase11g's
  // WINDOW SYSTEM V1 CSS for the visual treatment.
  const stepperHtml=stepTitles.map((t,i)=>`${i>0?'<span class="wiz-step-line" aria-hidden="true"></span>':''}<span class="wiz-step-dot${i===0?' on':''}" role="listitem" data-dot="${i+1}"><b>${i+1}</b>${U.esc(t)}</span>`).join('');
  const bodyHtml=`<div class="wiz" data-step="1"><div class="wiz-steps" role="list" aria-label="خطوات إضافة الموظف">${stepperHtml}</div><div class="wiz-body">${pane1}${pane2}${pane3}${pane4}</div><div class="wiz-footer"><div class="msg" role="status" aria-live="polite"></div><div class="wiz-footer-actions"><button type="button" class="btn ghost wiz-prev" hidden>السابق</button><span class="wiz-footer-spacer"></span><button type="button" class="btn cancel">إلغاء</button><button type="button" class="btn pr wiz-next">التالي</button><button type="button" class="btn pr save" hidden>حفظ الموظف</button></div></div></div>`;

  let {c,close}=U.shell('iuc-add','إضافة موظف','إنشاء سجل وظيفي وإسناد الدور والخدمات',bodyHtml);

  // Role segmented control: a compact visual proxy over the existing
  // #inst-role <select> (kept in the DOM, hidden) so U.bind/U.readProducts
  // and every other role-logic consumer keep reading the exact same value
  // + 'change' event contract — only the control's appearance changes.
  const roleSelect=c.querySelector('#inst-role');
  if(roleSelect){
    const roleField=roleSelect.closest('.f');
    const seg=document.createElement('div');
    seg.className='wiz-role-seg';seg.setAttribute('role','group');seg.setAttribute('aria-label','الدور الإداري');
    seg.innerHTML=roleOrder.map(v=>{
      const opt=[...roleSelect.options].find(o=>o.value===v);
      const disabled=opt?.disabled?' disabled aria-disabled="true"':'';
      return `<button type="button" class="wiz-role-opt${v==='employee'?' on':''}" data-role="${v}"${disabled}>${U.esc(roleLabelAr[v])}</button>`;
    }).join('');
    const desc=document.createElement('div');
    desc.className='wiz-role-desc';desc.textContent=roleDescAr.employee;
    if(roleField){roleField.hidden=true;roleField.after(seg);seg.after(desc);}
    seg.addEventListener('click',event=>{
      const btn=event.target.closest('.wiz-role-opt');
      if(!btn||btn.disabled)return;
      seg.querySelectorAll('.wiz-role-opt').forEach(b=>b.classList.toggle('on',b===btn));
      roleSelect.value=btn.dataset.role;
      roleSelect.dispatchEvent(new Event('change',{bubbles:true}));
      desc.textContent=roleDescAr[btn.dataset.role]||'';
    });
  }

  U.bind(c);
  const refreshManagers=()=>{
    const select=c.querySelector('#add-manager'); if(!select)return;
    const current=select.value;
    const opts=U.managerOptions(d.employees,roleSelect?.value||'employee',c.querySelector('#add-admin')?.value||'',c.querySelector('#add-dept')?.value||'');
    select.innerHTML=opts.map(x=>`<option value="${U.esc(x[0])}">${U.esc(x[1])}</option>`).join('');
    if(opts.some(x=>String(x[0])===String(current)))select.value=current;
  };
  c.querySelector('#add-dept').oninput=()=>{U.dest(c);refreshManagers()};
  c.querySelector('#add-admin').oninput=refreshManagers;
  roleSelect?.addEventListener('change',refreshManagers);
  refreshManagers();

  const mk=c.querySelector('#mk-account'),acct=c.querySelector('.acct');
  const wiz=c.querySelector('.wiz');
  const panes=[...c.querySelectorAll('.wiz-pane')];
  const dots=[...c.querySelectorAll('.wiz-step-dot')];
  const prevBtn=c.querySelector('.wiz-prev'),nextBtn=c.querySelector('.wiz-next'),saveBtn=c.querySelector('.save');
  const msg=c.querySelector('.msg');
  let step=1;

  function showStep(n){
    step=n;wiz.dataset.step=String(n);
    panes.forEach(p=>p.hidden=Number(p.dataset.stepPane)!==n);
    dots.forEach(dot=>dot.classList.toggle('on',Number(dot.dataset.dot)===n));
    prevBtn.hidden=n===1;nextBtn.hidden=n===4;saveBtn.hidden=n!==4;
    msg.className='msg';msg.textContent='';
    panes[n-1].querySelector('input:not([disabled]),select:not([disabled]),button:not([disabled])')?.focus();
  }

  function renderReview(){
    const val=id=>U.clean(c.querySelector(id)?.value);
    const role=roleSelect?roleSelect.value:'employee';
    const services=role==='general_supervisor'?['إدارة الحصر الميداني (مشرف عام)']:[...c.querySelectorAll('.pc.on')].map(p=>U.txt(p.querySelector('.pt b'))).filter(Boolean);
    const managerText=c.querySelector('#add-manager')?.selectedOptions[0]?.textContent||'بدون تحديد';
    const rows=[
      ['الاسم',val('#add-name')||'—'],['الرقم الوظيفي',val('#add-ref')||'—'],
      ['البريد الإلكتروني',val('#add-email')||'—'],['الجوال',val('#add-phone')||'—'],
      ['الإدارة',val('#add-admin')||'—'],['القسم',val('#add-dept')||'—'],
      ['المسمى الوظيفي',val('#add-title')||'—'],
      ['الحالة الوظيفية',c.querySelector('#add-emp').value==='active'?'على رأس العمل':'غير نشط'],
      ['المدير المباشر',managerText],['الدور الإداري',roleLabelAr[role]||role],
      ['الخدمات المفعلة',services.length?services.join('، '):'—'],
      ['حساب الدخول',mk.checked?'سيُنشأ عند الحفظ':'بدون حساب دخول'],
    ];
    const reviewBody=c.querySelector('.wiz-review-body');
    if(reviewBody)reviewBody.innerHTML=rows.map(([k,v])=>`<div class="wiz-review-row"><span>${U.esc(k)}</span><b>${U.esc(v)}</b></div>`).join('');
  }

  mk.onchange=()=>{acct.hidden=!mk.checked;if(mk.checked&&!c.querySelector('#login-email').value)c.querySelector('#login-email').value=c.querySelector('#add-email').value;renderReview();};

  nextBtn.onclick=()=>{
    if(step===1&&!U.clean(c.querySelector('#add-name').value)){msg.className='msg er';msg.textContent='اسم الموظف مطلوب.';return;}
    const next=step+1;
    if(next===4)renderReview();
    showStep(next);
  };
  prevBtn.onclick=()=>showStep(step-1);
  c.querySelector('.cancel').onclick=close;

  saveBtn.onclick=async e=>{
    let b=e.currentTarget,name=U.clean(c.querySelector('#add-name').value),id=null,partial=false;
    if(!name){msg.className='msg er';msg.textContent='اسم الموظف مطلوب.';showStep(1);return;}
    let x,pw,email;
    if(mk.checked){
      email=U.clean(c.querySelector('#login-email').value)||U.clean(c.querySelector('#add-email').value);
      pw=c.querySelector('#pw').value;
      if(!email)return msg.className='msg er',msg.textContent='بريد الدخول مطلوب.';
      if(pw!==c.querySelector('#pw2').value)return msg.className='msg er',msg.textContent='كلمتا المرور غير متطابقتين.';
      if(!U.strongPw(pw))return msg.className='msg er',msg.textContent='كلمة المرور: 8 أحرف مع كبير وصغير ورقم ورمز.';
      try{x=U.readProducts(c,roleSelect.value)}catch(er){return msg.className='msg er',msg.textContent=er.reason==='field_head_not_ready'?'رئيس قسم الحصر يحتاج صلاحية قسمية مستقلة قبل تفعيله.':'فعّل منتجًا واحدًا على الأقل.'}
    }
    b.disabled=true;prevBtn.disabled=true;msg.className='msg';msg.textContent='جاري الحفظ...';
    try{
      let r=await U.post('/api/admin/employees',{action:'create',organizationId:await U.org(),name,employeeRef:U.clean(c.querySelector('#add-ref').value)||undefined,email:U.clean(c.querySelector('#add-email').value)||email||undefined,phone:U.clean(c.querySelector('#add-phone').value)||undefined,administration:U.clean(c.querySelector('#add-admin').value)||undefined,department:U.clean(c.querySelector('#add-dept').value)||undefined,jobTitle:U.clean(c.querySelector('#add-title').value)||undefined,institutionalRole:roleSelect.value,employmentStatus:c.querySelector('#add-emp').value,directManagerEmployeeId:c.querySelector('#add-manager').value||undefined});
      id=r.employee?.employeeId;
      if(mk.checked){
        msg.textContent='تم حفظ الموظف. جاري إنشاء الحساب...';
        let a=await U.post('/api/admin/employees',{action:'activateAccount',employeeId:id,email,password:pw,field:x.field,lands:x.lands,mobility:x.mobility,vehicleEligible:x.vehicleEligible});
        await U.sync(id,a.authUid,x,{employeeAlreadySynced:true});
        msg.className='msg ok';msg.textContent='تم إنشاء الموظف والحساب والتسكين واعتماد كلمة المرور.';
      }else{msg.className='msg ok';msg.textContent='تم إنشاء سجل الموظف بدون حساب دخول.';}
      U.stale();setTimeout(close,1000);
    }catch(er){
      partial=!!id;
      msg.className='msg er';
      msg.textContent=partial?'تم حفظ سجل الموظف، لكن لم يكتمل إنشاء حساب الدخول أو التسكين. أغلق النافذة وافتح السجل لاستكمال التفعيل بأمان.':U.why(er.reason||er.message);
    }finally{
      b.disabled=partial;prevBtn.disabled=partial;
      if(partial)b.textContent='تم حفظ السجل — لا تعد الإرسال';
    }
  };
};
U.rowEmployee=(row,d)=>{let t=U.txt(row),em=(t.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig)||[])[0];if(em){let e=d.employees.find(x=>U.clean(x.email).toLowerCase()===em.toLowerCase());if(e)return e;let u=d.users.find(x=>U.clean(x.email).toLowerCase()===em.toLowerCase());if(u){let l=d.employees.find(x=>x.authUid===u.uid);if(l)return l}}let a=d.employees.filter(x=>x.name&&t.includes(x.name));return a.length===1?a[0]:null};
U.profile=async e=>{let d=(U.cache&&Array.isArray(U.cache.employees)&&U.cache.employees.length)?U.cache:await U.dir(false);let cached=d.employees.find(x=>x.employeeId===e.employeeId);e={...(cached||{}),...e};let linked=!!e.authUid,role=U.inst(e),mans=[['','بدون تحديد'],...d.employees.filter(x=>x.employeeId!==e.employeeId).map(x=>[x.employeeId,x.name+(x.department?' · '+x.department:'')])],body=`${U.hierarchy()}<div class="tabs"><button class="tab on" data-t="p">البيانات الأساسية</button><button class="tab" data-t="o">التنظيم</button><button class="tab" data-t="a">الحساب والأمان</button><button class="tab" data-t="r">المنتجات والصلاحيات</button><button class="tab" data-t="h">السجل</button></div><div class="pane" data-id="p"><div class="sec"><div class="grid">${U.input('الاسم','edit-name',e.name,{w:true})}${U.input('الرقم الوظيفي','edit-ref',e.employeeRef||'')}${U.input('الجوال','edit-phone',e.phone||'',{type:'tel'})}${U.input('البريد','edit-email',e.email||'',{type:'email',ac:'email'})}${U.input('المسمى','edit-title',e.jobTitle||'')}${U.sel('الحالة الوظيفية','edit-emp',e.employmentStatus||'active',[['active','على رأس العمل'],['inactive','غير نشط']])}</div></div><div class="act"><button class="btn pr savep">حفظ البيانات</button></div><div class="msg mp"></div></div><div class="pane" data-id="o" hidden><div class="sec"><div class="grid">${U.input('الإدارة','edit-admin',e.administration||'')}${U.input('القسم','edit-dept',e.department||'')}${U.sel('المدير المباشر','edit-manager',e.directManagerEmployeeId||'',mans,{w:true})}</div></div><div class="act"><button class="btn pr saveo">حفظ التنظيم</button></div><div class="msg mo"></div></div><div class="pane" data-id="a" hidden><div class="sec">${linked?`<div class="note">الحساب: ${U.esc(e.accountStatus||'ACTIVE')} · ${U.esc(e.email||'')}</div><div class="act"><button class="btn pwbtn">تعديل كلمة المرور</button><button class="btn ${e.accountStatus==='SUSPENDED'?'pr':'bad'} tog">${e.accountStatus==='SUSPENDED'?'تفعيل الحساب':'إيقاف الحساب'}</button></div>`:`<div class="grid">${U.input('بريد الدخول','act-email',e.email||'',{type:'email'})}${U.input('كلمة المرور','act-pw','',{type:'password',ac:'new-password'})}${U.input('تأكيد كلمة المرور','act-pw2','',{type:'password',ac:'new-password'})}</div>${U.roles(role,e)}<div class="act"><button class="btn pr activate">إنشاء حساب الدخول</button></div>`}</div><div class="msg ma"></div></div><div class="pane" data-id="r" hidden>${linked?U.roles(role,e)+'<div class="act"><button class="btn pr saver">حفظ التسكين والصلاحيات</button></div>':'<div class="sec"><div class="msg">أنشئ حساب الدخول أولًا قبل تفعيل المنتجات.</div></div>'}<div class="msg mr"></div></div><div class="pane" data-id="h" hidden><div class="sec hist"><div class="msg">جاري تحميل التكليفات...</div></div></div>`,{c}=U.shell('iuc-profile','ملف الموظف',`${e.name} · الدور المؤسسي: ${role==='general_supervisor'?'المشرف العام':role==='department_head'?'رئيس قسم':'موظف'}`,body);U.bind(c);c.querySelector('#edit-dept').oninput=()=>U.dest(c);c.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{c.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x===t));c.querySelectorAll('.pane').forEach(p=>p.hidden=p.dataset.id!==t.dataset.t)});
let sp=c.querySelector('.savep');sp.onclick=async()=>{let m=c.querySelector('.mp'),name=U.clean(c.querySelector('#edit-name').value),nextEmail=U.email(c.querySelector('#edit-email').value),currentEmail=U.email(e.email);if(!name)return m.className='msg er mp',m.textContent='الاسم مطلوب.';sp.disabled=true;try{let q={action:'updateProfile',employeeId:e.employeeId,name,employeeRef:U.clean(c.querySelector('#edit-ref').value),phone:U.clean(c.querySelector('#edit-phone').value),jobTitle:U.clean(c.querySelector('#edit-title').value),employmentStatus:c.querySelector('#edit-emp').value};if(!linked&&nextEmail&&/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(nextEmail))q.email=nextEmail;await U.post('/api/admin/employees',q);e.employeeRef=q.employeeRef;e.phone=q.phone;e.jobTitle=q.jobTitle;e.employmentStatus=q.employmentStatus;if(!linked&&q.email)e.email=q.email;let emailChanged=linked&&nextEmail!==currentEmail,emailValid=!nextEmail||/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(nextEmail);if(emailChanged&&!emailValid){U.stale();m.className='msg wa mp';m.textContent='تم حفظ بيانات الموظف، لكن بريد الدخول غير صالح ولم يتم تغييره.';return;}if(emailChanged){await U.post('/api/admin/employees',{action:'changeLoginEmail',employeeId:e.employeeId,email:nextEmail,confirmEmail:nextEmail});e.email=nextEmail;}U.stale();m.className='msg ok mp';m.textContent=emailChanged?'تم حفظ بيانات الموظف وتحديث بريد الدخول.':'تم حفظ بيانات الموظف.'}catch(er){m.className='msg er mp';m.textContent=er.reason==='reauthentication_required'?'تم حفظ بيانات الموظف، لكن تعديل بريد الدخول يتطلب تسجيل دخول حديث. سجّل الخروج ثم ادخل من جديد لتغيير البريد.':U.why(er.reason||er.message)}finally{sp.disabled=false}};
let so=c.querySelector('.saveo');so.onclick=async()=>{let m=c.querySelector('.mo');so.disabled=true;try{await U.post('/api/admin/employees',{action:'transfer',employeeId:e.employeeId,administration:U.clean(c.querySelector('#edit-admin').value),department:U.clean(c.querySelector('#edit-dept').value),directManagerEmployeeId:c.querySelector('#edit-manager').value||''});U.stale();m.className='msg ok mo';m.textContent='تم حفظ التغيير وإضافته لسجل النقل.'}catch(er){m.className='msg er mo';m.textContent=U.why(er.reason||er.message)}finally{so.disabled=false}};
c.querySelector('.saver')?.addEventListener('click',async ev=>{let b=ev.currentTarget,m=c.querySelector('.mr');b.disabled=true;try{let x=U.readProducts(c,c.querySelector('#inst-role').value);await U.sync(e.employeeId,e.authUid,x,{institutionalRole:c.querySelector('#inst-role').value});U.stale();m.className='msg ok mr';m.textContent='تم حفظ التسكين. اللوحة ستتحدد تلقائيًا عند الدخول.'}catch(er){m.className='msg er mr';m.textContent=er.reason==='field_head_not_ready'?'لن نمنح رئيس قسم الحصر صلاحية supervisor لأنها أوسع من القسم.':U.why(er.reason||er.message)}finally{b.disabled=false}});
c.querySelector('.pwbtn')?.addEventListener('click',()=>U.password(e));c.querySelector('.tog')?.addEventListener('click',async ev=>{let b=ev.currentTarget,m=c.querySelector('.ma'),n=e.accountStatus==='SUSPENDED'?'ACTIVE':'SUSPENDED';b.disabled=true;try{await U.post('/api/admin/employees',{action:'setAccountStatus',employeeId:e.employeeId,status:n});e.accountStatus=n;U.stale();m.className='msg ok ma';m.textContent=n==='ACTIVE'?'تم تفعيل الحساب.':'تم إيقاف الحساب.';b.textContent=n==='ACTIVE'?'إيقاف الحساب':'تفعيل الحساب'}catch(er){m.className='msg er ma';m.textContent=U.why(er.reason||er.message)}finally{b.disabled=false}});
c.querySelector('.activate')?.addEventListener('click',async ev=>{let b=ev.currentTarget,m=c.querySelector('.ma'),email=U.clean(c.querySelector('#act-email').value),pw=c.querySelector('#act-pw').value;if(!email)return m.className='msg er ma',m.textContent='بريد الدخول مطلوب.';if(pw!==c.querySelector('#act-pw2').value)return m.className='msg er ma',m.textContent='كلمتا المرور غير متطابقتين.';if(!U.strongPw(pw))return m.className='msg er ma',m.textContent='كلمة المرور لا تطابق السياسة.';b.disabled=true;try{let x=U.readProducts(c,c.querySelector('#inst-role').value),a=await U.post('/api/admin/employees',{action:'activateAccount',employeeId:e.employeeId,email,password:pw,field:x.field,lands:x.lands,mobility:x.mobility,vehicleEligible:x.vehicleEligible});await U.sync(e.employeeId,a.authUid,x,{employeeAlreadySynced:true,institutionalRole:c.querySelector('#inst-role').value});U.stale();m.className='msg ok ma';m.textContent='تم إنشاء الحساب والتسكين واعتماد كلمة المرور.'}catch(er){m.className='msg er ma';m.textContent=U.why(er.reason||er.message)}finally{b.disabled=false}});U.loadHist(c,e)};
U.loadHist=async(c,e)=>{let h=c.querySelector('.hist');try{let r=await U.post('/api/admin/employees',{action:'listAssignments',organizationId:await U.org(),employeeId:e.employeeId}),a=r.assignments||[];h.innerHTML=a.length?`<div class="tw"><table class="tb"><thead><tr><th>المنتج</th><th>التكليف</th><th>النطاق</th><th>الحالة</th></tr></thead><tbody>${a.map(x=>`<tr><td>${U.esc(x.productId||'—')}</td><td>${U.esc(x.assignmentType||'—')}</td><td>${U.esc(x.scope?.id||x.scope?.type||'—')}</td><td>${U.esc(x.status||'—')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="msg">لا توجد تكليفات مؤسسية مسجلة.</div>'}catch(er){h.innerHTML=`<div class="msg er">${U.esc(U.why(er.reason||er.message))}</div>`}};
U.password=e=>{let body=`<div class="sec"><div class="grid">${U.input('كلمة المرور الجديدة','npw','',{type:'password',w:true,ac:'new-password'})}${U.input('تأكيد كلمة المرور','npw2','',{type:'password',w:true,ac:'new-password'})}</div><div class="note">كلمة المرور لا تُخزن في Firestore. عند الحفظ تصبح كلمة الدخول المعتمدة للحساب وتُنهى الجلسات السابقة لأمان المستخدم.</div></div><div class="act"><button class="btn pr sv">حفظ كلمة المرور</button><button class="btn cc">إلغاء</button></div><div class="msg"></div>`,{c,close}=U.shell('iuc-pw','تعديل كلمة المرور',e.email||e.name,body,true);c.querySelector('.cc').onclick=close;c.querySelector('.sv').onclick=async ev=>{let b=ev.currentTarget,m=c.querySelector('.msg'),p=c.querySelector('#npw').value;if(p!==c.querySelector('#npw2').value)return m.className='msg er',m.textContent='كلمتا المرور غير متطابقتين.';if(!U.strongPw(p))return m.className='msg er',m.textContent='كلمة المرور لا تطابق سياسة الأمان.';b.disabled=true;try{await U.post('/api/admin/users',{action:'setPassword',uid:e.authUid,password:p});m.className='msg ok';m.textContent='تم تعديل كلمة المرور واعتمادها وإنهاء الجلسات السابقة.';setTimeout(close,1100)}catch(er){m.className='msg er';m.textContent=U.why(er.reason||er.message)}finally{b.disabled=false}}};
})();
