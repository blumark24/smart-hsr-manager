(() => {
'use strict';
const mail=/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
let busy=false;
const txt=e=>(e?.textContent||'').replace(/\s+/g,' ').trim();
async function bridge(){
  const U=window.SmartHSRInstitutionalUC;
  if(!U||busy||document.querySelector('.iuc'))return;
  const trigger=[...document.querySelectorAll('button')].find(b=>/^(تعطيل|تفعيل) المستخدم$/.test(txt(b)));
  if(!trigger)return;
  const overlay=trigger.closest('div[style*="position:fixed"]');
  if(!overlay||overlay.dataset.iucLegacy==='1')return;
  const t=txt(overlay),email=(t.match(mail)||[])[0];
  if(!email||!/كلمة المرور/.test(t))return;
  overlay.dataset.iucLegacy='1';busy=true;
  try{
    const close=overlay.querySelector('button[aria-label="إغلاق"]');
    if(close)close.click();else overlay.style.display='none';
    const d=await U.dir(true),u=d.users.find(x=>U.clean(x.email).toLowerCase()===email.toLowerCase());
    const e=u&&d.employees.find(x=>x.authUid===u.uid);
    if(e)return await U.profile(e);
    const body=`<div class="sec"><div class="st"><span>حساب قديم يحتاج استكمال</span><small>لم يتم ربطه بعد بسجل موظف مؤسسي</small></div><div class="note">البريد: ${U.esc(email)}<br>لن نعرض نافذة الحساب القديمة بعد الآن. الحساب القديم غير مرتبط بسجل موظف، ولن يتم إنشاء هوية بديلة أو تنفيذ ربط صامت.</div></div>`;
    U.shell('iuc-legacy-note','ملف المستخدم','حساب قديم غير مرتبط بسجل موظف',body,true);
  }catch(err){
    const reason=U.why(err.reason||err.message);
    const body=`<div class="sec"><div class="st"><span>تعذر التحقق من الحساب القديم</span><small>لم يتم تنفيذ أي تغيير على الهوية أو سجل الموظف</small></div><div class="msg er">${U.esc(reason)}</div></div>`;
    U.shell('iuc-legacy-error','تعذر فتح ملف المستخدم','راجع البيانات ثم حاول مرة أخرى.',body,true);
  }finally{busy=false}
}
function start(){bridge();let q=false;new MutationObserver(()=>{if(q)return;q=true;requestAnimationFrame(()=>{q=false;bridge()})}).observe(document.body,{childList:true,subtree:true})}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
})();