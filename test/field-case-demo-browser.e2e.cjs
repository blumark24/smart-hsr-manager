'use strict';
// Offline synthetic Browser UAT: no deployed preview, Firebase Auth, GIS, or municipality data.
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'fixtures');
const names=new Set([
  '/smart-hsr-field-case-demo.html',
  '/smart-hsr-field-case-demo.js',
  '/smart-hsr-field-case-ui.js',
]);
const output=path.join(__dirname,'..','test-artifacts','field-case-demo');
function startLocalOnly(){
  const server=http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,'http://127.0.0.1').pathname;
    if(!names.has(pathname)){res.writeHead(404);res.end();return;}
    try{
      const name=path.basename(pathname);
      const body=await fs.readFile(path.join(root,name));
      res.writeHead(200,{'content-type':name.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8','cache-control':'no-store'});
      res.end(body);
    }catch(err){res.writeHead(500);res.end();}
  });
  return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server)));
}
async function runViewport(browser,base,viewport,label){
  const context=await browser.newContext({viewport,locale:'ar-SA',reducedMotion:'reduce'});
  const page=await context.newPage();
  const denied=[];
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith(base+'/')) return route.continue();
    denied.push(url);return route.abort();
  });
  try{
    await page.goto(base+'/smart-hsr-field-case-demo.html',{waitUntil:'load'});
    assert.equal((await page.locator('html').getAttribute('dir')),'rtl');
    assert.match(await page.locator('main .warning').textContent(),/بيانات اصطناعية 100%/);
    assert.equal(await page.locator('#caseId').textContent(),'SYN-FIELD-0001');
    for (const [action,status] of [['assign','إسناد'],['start','تنفيذ'],['submit','تحقق'],['verify','إغلاق']]) {
      await page.locator('#'+action).click();
      assert.equal(await page.locator('#status').textContent(),status);
      for(const target of ['#mapCase','#twinCase'])assert.equal(await page.locator(target).textContent(),'SYN-FIELD-0001');
      for(const target of ['#mapStatus','#twinStatus'])assert.match(await page.locator(target).textContent(),new RegExp(status));
    }
    assert.match(await page.locator('#evidence').textContent(),/مثال اصطناعي/);
    assert.match(await page.locator('#mapLocation').textContent(),/الموقع غير موثق/);
    assert.equal(await page.locator('#verify').isDisabled(),true);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(overflow<=3,label+': horizontal overflow '+overflow);
    assert.deepEqual(errors,[]);
    assert.deepEqual(denied,[]);
    await page.screenshot({path:path.join(output,label+'.png'),fullPage:true});
    await page.locator('#reset').click();
    assert.equal(await page.locator('#status').textContent(),'رصد');
    assert.equal(await page.locator('#audit').textContent() !== '',true);
  }finally{await context.close();}
}
test('zero-network synthetic Field case works in desktop and mobile Chromium with one ID and manual close',async()=>{
  await fs.mkdir(output,{recursive:true});
  const server=await startLocalOnly();
  const addr=server.address();
  const base='http://127.0.0.1:'+addr.port;
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try{
    await runViewport(browser,base,{width:1440,height:900},'desktop');
    await runViewport(browser,base,{width:390,height:844},'mobile');
  }finally{
    await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
});
