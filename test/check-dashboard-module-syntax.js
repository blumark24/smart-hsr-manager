'use strict';
const fs=require('node:fs');const vm=require('node:vm');
const path=require('node:path');const marker='<script type="module">';
for(const file of ['dashboard.html','manager.html']){
  const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');const start=html.indexOf(marker)+marker.length;const end=html.indexOf('</script>',start);
  if(start<marker.length||end<0)throw new Error(`${file} module script missing`);
  new vm.SourceTextModule(html.slice(start,end));
  console.log(`${file} module syntax OK`);
}
