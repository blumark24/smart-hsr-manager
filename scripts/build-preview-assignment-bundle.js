'use strict';

const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),entry=path.join(root,'platform/browser/assignment-v2-preview-entry.js'),output=path.join(root,'preview-only/assignment-v2-preview.bundle.js');
const modules=new Map();
function id(file){return path.relative(root,file).replaceAll('\\','/');}
function resolveLocal(from,request){const base=path.resolve(path.dirname(from),request);for(const candidate of [base,`${base}.js`,path.join(base,'index.js')])if(fs.existsSync(candidate)&&fs.statSync(candidate).isFile())return candidate;throw new Error(`Cannot resolve ${request} from ${id(from)}`);}
function collect(file){if(modules.has(file))return;let source=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'');const dependencies=[];source=source.replace(/require\((['"])(\.\.?\/[^'"]+)\1\)/g,(_all,_quote,request)=>{const target=resolveLocal(file,request);dependencies.push(target);return `require(${JSON.stringify(id(target))})`;});modules.set(file,source);dependencies.sort((a,b)=>id(a).localeCompare(id(b))).forEach(collect);}
collect(entry);
const body=[...modules.entries()].sort(([a],[b])=>id(a).localeCompare(id(b))).map(([file,source])=>`${JSON.stringify(id(file))}:function(module,exports,require){\n${source}\n}`).join(',\n');
const bundle=`/* Smart HSR Assignment V2 PREVIEW ONLY. Deterministic build; no source map. */\n(function(globalThis){'use strict';\nconst modules={\n${body}\n};\nconst cache=Object.create(null);function require(id){if(cache[id])return cache[id].exports;if(!modules[id])throw new Error('Preview bundle module not found: '+id);const module={exports:{}};cache[id]=module;modules[id](module,module.exports,require);return module.exports;}\nrequire(${JSON.stringify(id(entry))});\n})(globalThis);\n`;
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,bundle,{encoding:'utf8'});process.stdout.write(`${crypto.createHash('sha256').update(bundle).digest('hex')}  ${id(output)}\n`);
