'use strict';
const os=require('node:os');const path=require('node:path');const {spawnSync}=require('node:child_process');
const cli=require.resolve('firebase-tools/lib/bin/firebase'),projectId='demo-smart-hsr-phase1c';
if(!projectId.startsWith('demo-'))throw new Error('Phase 1C requires demo project.');
const result=spawnSync(process.execPath,[cli,'emulators:exec','--project',projectId,'--only','firestore','node --test test/phase1c-firestore-rules.test.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,CI:'true',FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true',XDG_CONFIG_HOME:path.join(os.tmpdir(),'smart-hsr-phase1c-config')},stdio:'inherit'});
if(result.error)throw result.error;process.exitCode=result.status??1;
