(function(){
"use strict";
// UI watchdog only: does not create sessions or authorize access.
let timer=null;
function stop(){window.clearTimeout(timer)}
function check(){
 const app=document.getElementById("appShell"),denied=document.getElementById("deniedScreen");
 if((app&&!app.hidden)||(denied&&!denied.hidden)){
  stop();window.SmartHSRCompanySplash?.dismiss();document.body.classList.remove("secure-handoff-active");
 }
}
function timeout(){
 const app=document.getElementById("appShell");
 if(app&&!app.hidden){check();return}
 const denied=document.getElementById("deniedScreen"),message=document.getElementById("deniedMessage"),action=document.getElementById("deniedAction");
 if(message)message.textContent="تعذر إكمال فتح الأراضي. ارجع إلى بوابة الموظفين لإعادة الدخول.";
 if(action)action.onclick=function(){location.assign("/login.html")};
 if(denied)denied.hidden=false;
 check();
}
const observer=new MutationObserver(check);
for(const id of ["appShell","deniedScreen"]){const el=document.getElementById(id);if(el)observer.observe(el,{attributes:true,attributeFilter:["hidden"]})}
timer=window.setTimeout(timeout,30000);
window.addEventListener("pagehide",function(){stop();observer.disconnect()},{once:true});
check();
})();
