const assert=require('node:assert/strict');
const {mkdirSync}=require('node:fs');const {resolve}=require('node:path');
const {isolateBrowserNetwork,localTestURL}=require('./browser-network-safety.cjs');
const languages=['ja','en','es','pt-BR','zh-Hans','fr','de','ko','ru','it','zh-Hant','id','tr','vi','th'];
function metrics(el){
 const r=el.getBoundingClientRect(),s=getComputedStyle(el);let opacity=1,visible=true;
 for(let n=el;n;n=n.parentElement){const c=getComputedStyle(n);opacity*=Number(c.opacity);if(n.hidden||c.display==='none'||['hidden','collapse'].includes(c.visibility))visible=false;}
 const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
 return {width:r.width,height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom,vw:innerWidth,vh:innerHeight,hit:hit===el||el.contains(hit),hitId:hit?.id,opacity,visible,color:s.color,background:s.backgroundColor,transform:s.transform,transition:s.transition,disabled:el.disabled,text:el.textContent.trim(),clipped:el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1};
}
async function waitForStableTarget(el){
 let previous='',stable=0,active=[];
 for(let frame=0;frame<120;frame++){
  await new Promise(resolve=>requestAnimationFrame(resolve));
  active=[];for(let node=el;node;node=node.parentElement)active.push(...node.getAnimations().filter(animation=>animation.effect?.getTiming().iterations!==Infinity&&(animation.playState==='running'||animation.pending)));
  const r=el.getBoundingClientRect(),key=JSON.stringify([r.x,r.y,r.width,r.height]);
  stable=!active.length&&key===previous?stable+1:0;previous=key;
  if(stable>=2)return;
 }
 throw Error('Share target layout did not stabilize: '+JSON.stringify({rect:previous,finiteAnimations:active.map(animation=>({state:animation.playState,pending:animation.pending,timing:animation.effect?.getTiming()}))}));
}
async function acceptTarget(page,selector,language,screen,engine,artifacts){
 const button=page.locator(selector),sizes=['ja','en','de'].includes(language)?[{width:393,height:852},{width:852,height:393},{width:393,height:600}]:[{width:393,height:852}];
 for(const size of sizes){
  const prefix=resolve(artifacts,`${engine}-${language}-${screen}-${size.width}x${size.height}`);
  await page.setViewportSize(size);await button.scrollIntoViewIfNeeded();
  try{await button.evaluate(waitForStableTarget);}catch(error){await page.screenshot({path:prefix+'-stability-failure.png'});throw error;}
  const m=await button.evaluate(metrics);
  await page.screenshot({path:prefix+'-diagnostic.png'});
  assert.equal(await button.isVisible(),true);assert.equal(m.visible,true);assert.equal(m.opacity,1);assert.equal(m.disabled,false);assert.equal(m.hit,true,JSON.stringify(m));
  assert.ok(m.width>=44&&m.height>=44,`44px target ${JSON.stringify(m)}`);assert.ok(m.left>=0&&m.right<=m.vw+1&&m.top>=0&&m.bottom<=m.vh+1,'reachable viewport');assert.equal(m.clipped,false);
  assert.equal(m.background,'rgb(0, 0, 0)');assert.equal(m.color,'rgb(255, 255, 255)');if(language==='ja')assert.equal(m.text,'Xでシェア');
  await button.focus();assert.equal(await button.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(0, 0, 0)');
  await page.mouse.move((m.left+m.right)/2,(m.top+m.bottom)/2);await page.mouse.down();
  const active=await button.evaluate(el=>({bg:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));
  if(['ja','en','de'].includes(language))await page.screenshot({path:prefix+'-pressed.png'});
  await page.mouse.move(0,0);await page.mouse.up();assert.equal(active.bg,'rgb(0, 0, 0)');assert.equal(active.color,'rgb(255, 255, 255)');
  const before=await page.evaluate(()=>window.__shareIntents.length);await button.tap();await page.waitForFunction(n=>window.__shareIntents.length===n+1,before);
  const url=new URL(await page.evaluate(()=>window.__shareIntents.at(-1)));assert.equal(url.origin,'https://x.com');assert.equal(url.pathname,'/intent/tweet');
  const text=url.searchParams.get('text');assert.ok(text.includes('https://chameleonjp-lab.github.io/masumen/'));assert.match(text,/#マスメン #ゲーム制作/u);
  if(screen==='result')assert.equal(text,await page.locator('.result-share-text').inputValue());
 }
}
async function checkShareAcceptance(browser,engine,baseUrl,saved){
 const artifacts=resolve(process.env.MASUMEN_TEST_ARTIFACTS||'test-artifacts/share');mkdirSync(artifacts,{recursive:true});
 const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,locale:'ja-JP',serviceWorkers:'block'});
 try{
  await isolateBrowserNetwork(context,localTestURL(baseUrl));
  const calls=[];await context.route('https://*.supabase.co/**',route=>{
   const name=route.request().url().split('/').pop(),body=route.request().postDataJSON();calls.push(name);let payload;
   if(name==='start_masumen_play_v1')payload={accepted:true,duplicate:true,start_id:body.p_start_id,play_id:'30000000-0000-4000-8000-000000000003',game_slug:'masumen',display_name:body.p_display_name,normalized_name:body.p_display_name,client_version:body.p_client_version};
   else if(name==='finish_masumen_play_v1')payload={accepted:true,duplicate:true,play_id:body.p_play_id,game_slug:'masumen',result_type:body.p_result_type,reached_wave:body.p_reached_wave,score:body.p_score};
   else if(name==='get_best_score_ranking')payload=Array.from({length:30},(_,i)=>({rank_no:i+1,display_name:`Mock Player ${i+1}`,best_score:900-i}));else throw Error('Unmocked ranking RPC');
   return route.fulfill({contentType:'application/json',body:JSON.stringify(payload)});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{window.__shareIntents=[];window.open=url=>{window.__shareIntents.push(url);return {opener:null};};});
  await page.goto(baseUrl);await page.locator('#masumen-language').waitFor({timeout:90000});
  const target=page.locator('.name-gate .x-share-action');
  for(const [property,value] of [['opacity','0'],['display','none']]){const old=await target.evaluate((e,[p,v])=>{const old=e.parentElement.style[p];e.parentElement.style[p]=v;return old;},[property,value]);try{const m=await target.evaluate(metrics);assert.ok(m.opacity===0||!m.visible);}finally{await target.evaluate((e,[p,v])=>e.parentElement.style[p]=v,[property,old]);}}
  for(const language of languages){await page.locator('#masumen-language').selectOption(language);await acceptTarget(page,'.name-gate .x-share-action',language,'home',engine,artifacts);}
  assert.equal(calls.length,0);
  // The saved presentation came from the genuine defeat above, not a forced result state.
  await page.locator('#masumen-language').selectOption('en');
  await page.evaluate(value=>localStorage.setItem('masumen.pending-play.v1:'+value.startId,JSON.stringify(value)),saved);
  await page.reload();await page.locator('.pending-results button').waitFor({timeout:90000});await page.locator('.pending-results button').click();await page.locator('.result-share-button').waitFor();await page.getByText('Score sent.',{exact:true}).waitFor();await page.locator('.online-ranking li').first().waitFor();
  await page.evaluate(async()=>{const source=performance.getEntriesByType('resource').find(x=>/\/src\/i18n\/index\.ts(?:\?|$)/.test(x.name));if(!source)throw Error('Vite language module missing');window.__shareLanguage=await import(source.name);});
  const count=calls.length;
  for(const language of languages){await page.evaluate(code=>window.__shareLanguage.setLanguage(code),language);await page.waitForFunction(code=>document.documentElement.lang===code,language);await acceptTarget(page,'.result-share-button',language,'result',engine,artifacts);assert.equal(calls.length,count);}
  assert.deepEqual(errors,[]);console.log(`PASS ${engine}: isolated mobile X acceptance 15 locales, actual-defeat restored result, no extra RPCs`);
 }finally{await context.close();}
}
module.exports={checkShareAcceptance};
