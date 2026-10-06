(function(){
  "use strict";
  const script=document.currentScript;
  const mode=(script&&script.dataset.hsrSplash)||"auto";
  const force=new URLSearchParams(location.search).get("splash")==="1";
  const key="smart-hsr.company-splash.v5";
  let root=null;
  let startedAt=performance.now();
  const minimum=760;

  function shouldShow(){
    if(mode==="manual") return true;
    if(force) return true;
    try{return sessionStorage.getItem(key)!=="shown";}catch{return true;}
  }
  function markShown(){
    try{sessionStorage.setItem(key,"shown");}catch{}
  }
  function mount(){
    if(root||!shouldShow()) return root;
    root=document.createElement("div");
    root.id=mode==="manual"?"bootScreen":"hsrCompanySplash";
    root.className="hsr-company-splash";
    root.setAttribute("role","status");
    root.setAttribute("aria-live","polite");
    root.setAttribute("aria-label","جاري تشغيل منصة SMART HSR");
    root.innerHTML='<div class="hsr-company-splash__core" aria-hidden="true">'+
      '<div class="hsr-company-splash__brand">'+
        '<img class="hsr-company-splash__mark" src="/smart-hsr-mark.svg" alt="">'+
        '<div class="hsr-company-splash__wordmark">'+
          '<span class="hsr-company-splash__smart">SMART</span>'+
          '<span class="hsr-company-splash__hsr">HSR</span>'+
        '</div>'+
      '</div>'+
      '<span class="hsr-company-splash__tagline">SAUDI MUNICIPAL INTELLIGENCE SYSTEM</span>'+
      '<span class="hsr-company-splash__line"></span>'+
      '<div class="hsr-company-splash__status signature-status"><i></i><span>تهيئة بيئة SMART HSR الآمنة</span></div>'+
    '</div>';
    document.documentElement.classList.add("hsr-splash-active");
    document.documentElement.appendChild(root);
    startedAt=performance.now();
    return root;
  }
  function setStatus(label,ready){
    if(!root) return;
    const span=root.querySelector(".hsr-company-splash__status span");
    if(span&&label) span.textContent=label;
    if(ready) root.dataset.ready="true";
  }
  function dismiss(){
    if(!root) return;
    const remaining=Math.max(0,minimum-(performance.now()-startedAt));
    window.setTimeout(()=>{
      if(!root) return;
      root.dataset.ready="true";
      root.classList.add("is-exiting");
      markShown();
      const doomed=root;
      window.setTimeout(()=>{
        if(doomed&&doomed.parentNode) doomed.remove();
        if(root===doomed) root=null;
        document.documentElement.classList.remove("hsr-splash-active");
      },260);
    },remaining);
  }
  function show(){
    if(!root) mount();
  }

  window.SmartHSRCompanySplash={mount,show,dismiss,setStatus};
  mount();

  if(mode!=="manual"&&root){
    const done=()=>dismiss();
    if(document.readyState==="complete") done();
    else window.addEventListener("load",done,{once:true});
    window.setTimeout(done,2600);
  }
})();