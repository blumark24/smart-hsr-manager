'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root=path.resolve(__dirname,'..');
const file=path.join(root,'docs/release/SMART_HSR_ENGINEERING_CHECKPOINT_2026-11-01.md');
const report=fs.readFileSync(file,'utf8');

test('Engineering verification checkpoint has 20 nonduplicated evidence-backed checks',()=>{
  const entries=report.split('\n').map(line=>/^\| ([ESFLOG]\d{2}) \| (.+?) \| (PASS|BLOCKED) \| (https:\/\/github\.com\/blumark24\/smart-hsr-manager\/(?:actions\/runs\/\d+|issues\/\d+|pull\/\d+)) \|$/.exec(line)).filter(Boolean);
  assert.equal(entries.length,20,'20 explicitly inspectable score units required');
  const ids=entries.map(x=>x[1]);
  assert.equal(new Set(ids).size,20,'No criterion may be counted twice');
  assert.equal(entries.filter(x=>x[3]==='PASS').length,14);
  assert.equal(entries.filter(x=>x[3]==='BLOCKED').length,6);
  const points=entries.reduce((n,x)=>n+(x[3]==='PASS'?5:0),0);
  assert.equal(points,70);
  assert.match(report,/\*\*70\/100\*\*/);
  assert.match(report,/14 \/ 20 × 100/);
  const blocked=entries.filter(x=>x[1].startsWith('G'));
  assert.equal(blocked.length,6);
  assert.ok(blocked.every(x=>x[3]==='BLOCKED'),'All external release blockers must remain blocked');
});

test('Engineering verification never claims municipal readiness or changes Baseline 001',()=>{
  assert.match(report,/HOLD \/ NO-GO/);
  assert.match(report,/32\/100/);
  assert.match(report,/35 assessed, 65 not evaluated/);
  assert.match(report,/NOT A MUNICIPAL RELEASE CERTIFICATION/);
  assert.match(report,/not a regulatory score/);
  const vercel=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
  assert.equal(vercel.git?.deploymentEnabled?.['fix/owner-upgrade-ledger-no-deploy-20261101'],false);
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/release/municipal-acceptance-2026-10-31.json'),'utf8'));
  assert.equal(manifest.productionChangeAuthorized,false);
  assert.equal(manifest.overallStatus,'NO-GO');
  assert.ok(manifest.gates.every(x=>x.status==='HOLD'));
});
