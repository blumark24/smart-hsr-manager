'use strict';
// Real headless Chromium interactions; localhost Review Mode fixtures ONLY.
// No Firebase credentials, municipal data, external AI, hosted site, or writes.
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'), out=path.join(root,'test-artifacts','lands-browser');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
const names=['initializeApp','getApps','getAuth','connectAuthEmulator','onAuthStateChanged','setPersistence','browserLocalPersistence','browserSessionPersistence','signInWithEmailAndPassword','signInWithCustomToken','signOut','getFirestore','connectFirestoreEmulator','collection','doc','getDoc','getDocs','setDoc','query','orderBy','serverTimestamp','writeBatch','getStorage','connectStorageEmulator','ref','uploadBytes','getBytes','sendPasswordResetEmail'];
const stub=names.map(n=>'export const '+n+' = () => {throw new Error("OFFLINE_NO_FIREBASE");};').join('\n');
function server(){
 return http.createServer(async(req,res)=>{
  try{
   const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   let f=path.resolve(root,'.'+p);
   if(f!==root&&!f.startsWith(root+path.sep)) {res.writeHead(403).end();return;}
   if((await fs.stat(f)).isDirectory())f=path.join(f,'index.html');
   const bytes=await fs.readFile(f);
   res.writeHead(200,{'content-type':mime[path.extname(f)]||'application/octet-stream','cache-control':'no-store'});
   res.end(bytes);
  }catch{res.writeHead(404).end();}
 });
}
async function runViewport(browser,base,v){
 const context=await browser.newContext({viewport:{width:v.width,height:v.height},reducedMotion:'reduce',locale:'ar-SA'});
 const page=await context.newPage(),blockedData=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',request=>{
  if(/firestore\.googleapis|identitytoolkit\.googleapis|securetoken\.googleapis|\/api\//.test(request.url()))
    blockedData.push(request.url().split('?')[0]);
 });
 await page.route('**/*',route=>{
  const url=route.request().url();
  if(url.startsWith(base+'/'))return route.continue();
  if(url.startsWith('https://www.gstatic.com/firebasejs/'))return route.fulfill({status:200,contentType:'text/javascript',body:stub});
  if(url.startsWith('https://unpkg.com/lucide@'))return route.fulfill({status:200,contentType:'text/javascript',body:'window.lucide={createIcons(){}};'});
  return route.abort();
 });
 try{
  await page.goto(base+'/lands/?review=1',{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>document.getElementById('appShell')?.hidden===false&&
   document.getElementById('headerProfileName')?.textContent?.trim(),null,{timeout:30000});
  await page.locator('#landsReviewLoader').waitFor({state:'detached',timeout:30000});
  // Regression: screenshots must show the application, not a branded splash
  // still covering the viewport. Earlier geometry assertions passed even
  // while the splash overlay was visible in captured screenshot artifacts.
  const visuallyUnobstructed=()=>page.evaluate(()=>{
    const boot=document.getElementById('bootScreen');
    const center=document.getElementById('main');
    if(!boot||!center)return false;
    const bootStyle=getComputedStyle(boot);
    if(!boot.hidden && bootStyle.display!=='none' && bootStyle.visibility!=='hidden')
      return false;
    const r=center.getBoundingClientRect();
    if(r.width<200||r.height<100)return false;
    const p=document.elementFromPoint(
      Math.max(0,Math.min(innerWidth-1,r.left+r.width*.5)),
      Math.max(0,Math.min(innerHeight-1,r.top+Math.min(180,r.height*.5)))
    );
    return Boolean(p&&(center.contains(p)||p===center));
  });
  await page.waitForFunction(()=>{
    const boot=document.getElementById('bootScreen');
    const main=document.getElementById('main');
    if(!boot||!main)return false;
    const style=getComputedStyle(boot);
    if(!boot.hidden && style.display!=='none'&&style.visibility!=='hidden')return false;
    const r=main.getBoundingClientRect();
    if(r.width<200||r.height<100)return false;
    const element=document.elementFromPoint(
      Math.max(0,Math.min(innerWidth-1,r.left+r.width*.5)),
      Math.max(0,Math.min(innerHeight-1,r.top+Math.min(180,r.height*.5)))
    );
    return element&&(element===main||main.contains(element));
  },null,{timeout:15000});

  assert.equal(await page.locator('header.lands-manager-source-header').count(),1);
  assert.equal(await page.locator('header.lands-manager-source-header img[src="/smart-hsr-mark.svg"]').count(),1);
  assert.equal(await page.locator('#headerMunicipalityName').count(),1);
  // Physical layout must match the approved municipal right-side rail.
  // Fixtures are local-only: never load or interact with municipal Production.
  const layout=async()=>page.evaluate(()=>{
    const side=document.getElementById('landsSidebar')?.getBoundingClientRect();
    const main=document.getElementById('main')?.getBoundingClientRect();
    if(!side||!main) return null;
    return {sideLeft:side.left,sideRight:side.right,sideWidth:side.width,
      mainLeft:main.left,mainRight:main.right,mainWidth:main.width,
      direction:getComputedStyle(document.querySelector('#appShell .shell')).direction};
  });
  async function requireUnobstructed(label) {
    for(let attempt=0;attempt<36;attempt++){
      if(await visuallyUnobstructed())return;
      await page.waitForTimeout(250);
    }
    const diagnostic=await page.evaluate(()=>{
      const boot=document.getElementById('bootScreen');
      const app=document.getElementById('appShell');
      const main=document.getElementById('main');
      const rect=main?.getBoundingClientRect();
      const x=rect?Math.max(0,Math.min(innerWidth-1,rect.left+rect.width*.5)):0;
      const y=rect?Math.max(0,Math.min(innerHeight-1,rect.top+Math.min(180,rect.height*.5))):0;
      const top=document.elementFromPoint(x,y);
      return {bootHidden:boot?.hidden,bootDisplay:boot&&getComputedStyle(boot).display,
        appHidden:app?.hidden,appDisplay:app&&getComputedStyle(app).display,
        hitTag:top?.tagName,hitId:top?.id,hitClass:typeof top?.className==='string'?top.className.slice(0,130):'',
        mainTop:rect?.top,mainWidth:rect?.width,
        mainHeight:rect?.height,bodyClass:document.body.className};
    });
    throw Error(label+': app still obscured after 9s; '+JSON.stringify(diagnostic));
  }
  const initial=await layout();
  assert.ok(initial,v.name+': missing Lands layout');
  if(v.width>700){
    assert.ok(initial.sideLeft>=initial.mainRight-4,
      v.name+': navigation rail is NOT physically to the right of main content: '+JSON.stringify(initial));
    assert.ok(initial.mainWidth>Math.min(370,v.width*.45),
      v.name+': main content unexpectedly cramped');
    await page.evaluate(()=>document.body.classList.add('sidebar-collapsed'));
    await page.waitForTimeout(270);
    const collapsed=await layout();
    assert.ok(collapsed.sideLeft>=collapsed.mainRight-4,
      v.name+': collapsed navigation moved to the left: '+JSON.stringify(collapsed));
    assert.ok(collapsed.sideWidth<=110,
      v.name+': collapsed navigation rail not compact: '+JSON.stringify(collapsed));
    assert.ok(collapsed.mainWidth>Math.min(370,v.width*.45),
      v.name+': collapsed state squeezed main content');
    await requireUnobstructed(v.name);
    await page.screenshot({path:path.join(out,v.name+'-sidebar-collapsed.png'),fullPage:false});
    await page.evaluate(()=>document.body.classList.remove('sidebar-collapsed'));
    await page.waitForTimeout(270);
  }else{
    await page.evaluate(()=>document.body.classList.add('mobile-nav-open'));
    await page.waitForTimeout(270);
    const opened=await layout();
    assert.ok(Math.abs(opened.sideRight-v.width)<=5,
      v.name+': mobile drawer is not on right edge: '+JSON.stringify(opened));
    await requireUnobstructed(v.name);
    await page.screenshot({path:path.join(out,v.name+'-sidebar-right.png'),fullPage:false});
    await page.evaluate(()=>document.body.classList.remove('mobile-nav-open'));
  }
  assert.match(await page.locator('#landsSidebar').getAttribute('aria-label'),/اليمنى/);
  assert.match(await page.locator('#mobileNavToggle').getAttribute('aria-label'),/اليمنى/);
  const overflow=async()=>page.evaluate(()=>({
   html:document.documentElement.scrollWidth-innerWidth,
   header:(()=>{const r=document.querySelector('#appShell > header.lands-manager-source-header').getBoundingClientRect();return {left:r.left,right:r.right};})()
  }));
  for(const theme of ['light','dark']){
   await page.locator(theme==='light'?'#themeDayButton':'#themeNightButton').click();
   assert.equal(await page.evaluate(()=>document.body.classList.contains('dark')),theme==='dark');
   assert.equal(await page.locator(theme==='light'?'#themeDayButton':'#themeNightButton').getAttribute('aria-pressed'),'true');
   await page.locator('#accountButton').click();
   await page.locator('#landsReadOnlyProfileDetails').waitFor({state:'visible',timeout:7000});
   for(const id of ['landsReadOnlyName','landsReadOnlyMunicipality','landsReadOnlyDepartment','landsReadOnlyJobTitle','landsReadOnlyLandsRole'])
    assert.ok((await page.locator('#'+id).textContent()).trim(),v.name+': '+id);
   assert.equal(await page.locator('#accountButton').getAttribute('aria-expanded'),'true');
   await requireUnobstructed(v.name);
   await page.screenshot({path:path.join(out,v.name+'-'+theme+'-profile.png'),fullPage:false});
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('#accountButton').getAttribute('aria-expanded'),'false');
   const b=await overflow();
   assert.ok(b.html<=3,v.name+'/'+theme+': html overflow '+b.html);
   assert.ok(b.header.left>=-2&&b.header.right<=v.width+2,v.name+'/'+theme+': header exceeds viewport');
  }
  const triggerVisibility = await page.evaluate(() => {
    const el=document.getElementById('aiTrigger'),style=getComputedStyle(el),box=el.getBoundingClientRect();
    return { display:style.display, visibility:style.visibility, opacity:style.opacity,
      width:box.width,height:box.height,x:box.x,y:box.y, body:document.body.className,
      mobile:matchMedia('(max-width:700px)').matches };
  });
  process.stdout.write('AI_TRIGGER_VISIBILITY='+v.name+' '+JSON.stringify(triggerVisibility)+'\n');
  if (triggerVisibility.mobile) {
    // Mobile intentionally hides the floating trigger; use its real bottom navigation.
    await page.locator('#mobileBottomNav button[onclick="openAiPanel()"]').click();
  } else {
    assert.equal(triggerVisibility.visibility,'visible',v.name+': assistant trigger unexpectedly hidden');
    await page.locator('#aiTrigger').click();
  }
  assert.equal(await page.locator('#aiPanel').getAttribute('aria-hidden'),'false');
  await page.locator('#aiInput').fill('كم عدد المنح؟');
  await page.locator('#aiInput').press('Enter');
  await page.waitForFunction(()=>/منح|منحة/.test(document.querySelector('#aiThread .ai-msg.bot')?.textContent||''),null,{timeout:7000});
  assert.match(await page.locator('#aiThread .ai-msg.bot').last().innerText(),/منح|منحة/);
  await requireUnobstructed(v.name);
  await page.screenshot({path:path.join(out,v.name+'-assistant.png'),fullPage:false});
  // Only mutate in-memory synthetic localhost fixtures to test privacy reset.
  await page.evaluate(()=>{session={...session,firebaseUid:'synthetic-other',municipalityId:'synthetic-other',role:'lands_employee'};renderShellChrome();});
  assert.equal((await page.locator('#aiThread').textContent()).trim(),'');
  assert.equal(await page.locator('#aiPanel').getAttribute('aria-hidden'),'true');
  assert.deepEqual(blockedData,[],v.name+': real network/API attempted');
  assert.deepEqual(errors,[],v.name+': uncaught browser error');
  return {viewport:v.name,result:'PASS'};
 }finally{await context.close();}
}
test('Lands Manager-style header, profile, two themes and isolated assistant in REAL Chromium with local fixtures only',{timeout:180000},async()=>{
 await fs.mkdir(out,{recursive:true});
 const s=server();await new Promise((ok,fail)=>{s.once('error',fail);s.listen(0,'127.0.0.1',ok);});
 const base='http://127.0.0.1:'+s.address().port;let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const results=[];
  for(const v of [{name:'desktop',width:1440,height:900},{name:'ipad',width:820,height:1180},{name:'mobile',width:390,height:844}])
   results.push(await runViewport(browser,base,v));
  assert.equal(results.length,3);process.stdout.write('LOCAL_VISUAL='+JSON.stringify(results)+'\n');
 }finally{if(browser)await browser.close();await new Promise(ok=>s.close(ok));}
});
