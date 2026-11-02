const {test}=require('node:test');const assert=require('node:assert/strict');const {localTestURL,isolateBrowserNetwork}=require('./browser-network-safety.cjs');
test('test entry accepts only known loopback HTTP origins without credentials',()=>{
 for(const url of ['https://chameleonjp-lab.github.io/masumen/','http://localhost.evil:4175/','http://user:pass@localhost:4175/','https://localhost:4175/','http://localhost:80/'])assert.throws(()=>localTestURL(url));
 assert.equal(localTestURL().origin,'http://localhost:4175');assert.equal(localTestURL().pathname,'/');assert.equal(localTestURL('http://127.0.0.1:4175/masumen/').origin,'http://127.0.0.1:4175');
});
test('only same-origin static GET/HEAD fetched, redirects and websockets denied',async()=>{
 let handler,ws;const context={route:async(_,h)=>handler=h,routeWebSocket:async(_,h)=>ws=h};await isolateBrowserNetwork(context,localTestURL());
 async function run(url,method='GET',status=200){let fetched=0,aborted=0,fulfilled=0;await handler({request:()=>({url:()=>url,method:()=>method}),abort:async()=>aborted++,continue:async()=>{throw Error('unguarded continue')},fetch:async options=>{fetched++;assert.equal(options.maxRedirects,0);assert.equal(options.maxRetries,2);return {status:()=>status}},fulfill:async()=>fulfilled++});return {fetched,aborted,fulfilled};}
 for(const [url,method] of [['https://example.com','GET'],['http://localhost:4175/a','POST'],['http://localhost:4175/a','DELETE'],['http://localhost:4176/a','GET']])assert.deepEqual(await run(url,method),{fetched:0,aborted:1,fulfilled:0});
 for(const method of ['GET','HEAD'])assert.deepEqual(await run('http://localhost:4175/a',method),{fetched:1,aborted:0,fulfilled:1});
 await assert.rejects(run('http://localhost:4175/a','GET',302),/redirect/);let closed=false;ws({close:()=>closed=true});assert.equal(closed,true);
});
