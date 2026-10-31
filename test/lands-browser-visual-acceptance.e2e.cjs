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
  assert.equal(await page.locator('header.lands-manager-source-header').count(),1);
  assert.equal(await page.locator('header.lands-manager-source-header img[src="/smart-hsr-mark.svg"]').count(),1);
  assert.equal(await page.locator('#headerMunicipalityName').count(),1);
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
   await page.screenshot({path:path.join(out,v.name+'-'+theme+'-profile.png'),fullPage:false});
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('#accountButton').getAttribute('aria-expanded'),'false');
   const b=await overflow();
   assert.ok(b.html<=3,v.name+'/'+theme+': html overflow '+b.html);
   assert.ok(b.header.left>=-2&&b.header.right<=v.width+2,v.name+'/'+theme+': header exceeds viewport');
  }
  await page.locator('#aiTrigger').click();
  assert.equal(await page.locator('#aiPanel').getAttribute('aria-hidden'),'false');
  await page.locator('#aiInput').fill('كم عدد المنح؟');
  await page.locator('#aiInput').press('Enter');
  await page.waitForFunction(()=>document.querySelector('#aiThread')?.textContent?.includes('منحة'),null,{timeout:7000});
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
