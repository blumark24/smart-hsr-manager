'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');const root=path.join(__dirname,'..');const files=[];
function collect(relative){for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){const child=path.join(relative,entry.name);if(entry.isDirectory())collect(child);else if(/\.(?:js|mjs)$/.test(entry.name))files.push(child)}}
for(const directory of ['platform','preview-only','scripts','test'])collect(directory);
for(const relative of files){let source=fs.readFileSync(path.join(root,relative),'utf8').replace(/^#!.*\r?\n/,'');if(relative.endsWith('.mjs'))new vm.SourceTextModule(source,{identifier:relative});else new vm.Script(source,{filename:relative})}
console.log(`JavaScript syntax OK: ${files.length} files`);
