'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const core=read('manager-phase11c-user-center-core.js');
const dialogs=read('manager-phase11c-user-center-dialogs.js');
const enhancements=read('manager-phase11d-user-center-enhancements.js');

test('legacy Field department head renders as canonical institutional department head',()=>{
  assert.match(core,/U\.isFieldHeadCompat/);
  assert.match(core,/return'department_head'/);
  assert.match(enhancements,/if\(typeof U\.isFieldHeadCompat==='function'&&U\.isFieldHeadCompat\(employee\)\) return \['field'\]/);
});

test('vehicle eligibility display is independent from Mobility workspace enablement',()=>{
  assert.match(enhancements,/const eligible = e\?\.vehicleEligible === true \|\| e\?\.products\?\.mobility\?\.vehicleEligible === true/);
  assert.doesNotMatch(enhancements,/if \(!enabled\(e,'mobility'\)\) return '<span class="ucv2-muted">—<\/span>'/);
});

test('profile save persists employee data before optional login email mutation',()=>{
  const idx=dialogs.indexOf("let sp=c.querySelector('.savep')");
  assert.notEqual(idx,-1);
  const block=dialogs.slice(idx,dialogs.indexOf("let so=c.querySelector('.saveo')",idx));
  const profileCall=block.indexOf("action:'updateProfile'");
  const emailCall=block.indexOf("action:'changeLoginEmail'");
  assert.ok(profileCall>-1);
  assert.ok(emailCall>-1);
  assert.ok(profileCall<emailCall,'profile update must happen before optional login-email mutation');
  assert.match(block,/U\.email\(c\.querySelector\('#edit-email'\)\.value\)/);
  assert.match(block,/تم حفظ بيانات الموظف، لكن تعديل بريد الدخول يتطلب تسجيل دخول حديث/);
});

test('email normalizer strips invisible bidi/control formatting characters',()=>{
  assert.match(core,/U\.email=v=>U\.clean\(v\)\.replace\(\/\[\\u200B-\\u200F\\u202A-\\u202E\\u2060\\uFEFF\]\/g,''\)/);
});
