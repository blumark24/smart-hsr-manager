'use strict';
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const cli=require.resolve('firebase-tools/lib/bin/firebase');
const projectId='demo-smart-hsr-phase1d';
if(!projectId.startsWith('demo-'))throw new Error('Phase 1D requires a demo project.');
const result=spawnSync(process.execPath,[cli,'emulators:exec','--only','firestore','--project',projectId,'node --test test/phase1d-firestore-integration.test.js'],{cwd:path.resolve(__dirname,'..'),stdio:'inherit',env:{...process.env,CI:'true',FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true',XDG_CONFIG_HOME:path.join(os.tmpdir(),'smart-hsr-phase1d-config')}});
process.exit(result.status === null ? 1 : result.status);
