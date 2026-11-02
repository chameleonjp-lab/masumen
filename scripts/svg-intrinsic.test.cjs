const test=require('node:test'),assert=require('node:assert/strict'),{readFileSync}=require('node:fs');
for(const name of ['pilot','pilot-attack'])test(`${name} has explicit intrinsic size and unchanged artwork`,()=>{
 const original=readFileSync(`scripts/fixtures/${name}-original.svg`,'utf8');
 const current=readFileSync(`client/public/assets/${name}.svg`,'utf8');
 assert.match(current,/^<svg width="128" height="128" /);
 assert.equal(current.replace('<svg width="128" height="128" ','<svg '),original);
});
