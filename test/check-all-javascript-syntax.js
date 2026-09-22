'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

const root=path.join(__dirname,'..');
const files=[];

function collect(relative){
  for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){
    const child=path.join(relative,entry.name);
    if(entry.isDirectory()) collect(child);
    else if(/\.(?:js|mjs)$/.test(entry.name)) files.push(child);
  }
}

for(const directory of ['platform','preview-only','scripts','test']){
  if(fs.existsSync(path.join(root,directory))) collect(directory);
}

for(const relative of files){
  const result=spawnSync(process.execPath,['--check',path.join(root,relative)],{encoding:'utf8'});
  if(result.status!==0){
    process.stderr.write(result.stderr||result.stdout||('Syntax check failed: '+relative+'\n'));
    process.exit(result.status||1);
  }
}

console.log('JavaScript syntax OK: '+files.length+' files');
