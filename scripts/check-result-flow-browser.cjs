/** Optional browser test: genuine normal-play defeat, persistent snapshot, same-ID retry. All RPCs mocked. */
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const assert=require('node:assert/strict');
const {checkShareAcceptance}=require('./share-acceptance.cjs');
const {mkdirSync}=require('node:fs');const {resolve}=require('node:path');
const {localTestURL,isolateBrowserNetwork}=require('./browser-network-safety.cjs');
const baseUrl=localTestURL(process.env.MASUMEN_TEST_URL).href;
(async()=>{for(const engine of[chromium,webkit]){
 const browser=await engine.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:402,height:874},locale:'en-US',serviceWorkers:'block'});const calls=[],errors=[];let lose=true;
 page.on('pageerror',e=>errors.push(e.message));
    await isolateBrowserNetwork(page.context(),new URL(baseUrl));
    await page.route('https://mlpnjgezrnhdxsxolyzj.supabase.co/**',r=>{
 const name=r.request().url().split('/').pop(),body=r.request().postDataJSON();calls.push({name,body});let payload=[];
 if(name==='start_masumen_play_v1')payload={accepted:true,duplicate:false,start_id:body.p_start_id,play_id:'30000000-0000-4000-8000-000000000003',game_slug:'masumen',display_name:body.p_display_name,normalized_name:body.p_display_name,client_version:body.p_client_version};
 if(name==='finish_masumen_play_v1'){if(lose)return r.abort('failed');payload={accepted:true,duplicate:true,play_id:body.p_play_id,game_slug:'masumen',result_type:body.p_result_type,reached_wave:body.p_reached_wave,score:body.p_score};}
 return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});
 });
 await page.goto(baseUrl+'?seed=12345');await page.locator('#masumen-player-name').waitFor({timeout:90000});await page.locator('#masumen-language').selectOption('en');
 await page.locator('#masumen-player-name').fill('Actual Run');await page.locator('.name-gate .sound-toggle').click();await page.locator('.name-gate__submit').click();
 let result=false,captured=false;const deadline=Date.now()+180000;
 while(Date.now()<deadline){
 const mode=await page.locator('.game-shell').getAttribute('data-mode');
 if(mode==='result'){result=true;break}
 if(mode==='battle'&&!captured){await page.waitForFunction(()=>{const logo=document.querySelector('img[src$="/assets/relay-mark.svg"]');return logo&&logo.getBoundingClientRect().width>0&&logo.complete&&logo.naturalWidth>0&&[...document.images].filter(img=>img.getBoundingClientRect().width>0).every(img=>img.complete&&img.naturalWidth>0);});const path=resolve(process.env.MASUMEN_TEST_ARTIFACTS||'test-artifacts/share');mkdirSync(path,{recursive:true});await page.screenshot({path:resolve(path,`${engine.name()}-actual-battle.png`)});captured=true;}
 if(mode==='custom'){
 const cards=page.locator('.signal-card');await cards.first().waitFor();if(await page.locator('.signal-card[aria-pressed="true"]').count()===0)await cards.first().click();
 await page.locator('.custom-console .engage-button').click();
 }
 await page.waitForTimeout(500);
 }
 assert.equal(result,true,'normal standing player should reach genuine defeat');
 await page.getByRole('button',{name:'Retry sending score',exact:true}).waitFor({timeout:20000}).catch(async()=>{await page.locator('.result-platform button').filter({hasText:/Retry.*send|Retry.*score/}).waitFor()});
 const saved=await page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('masumen.pending-play.v1:'));return key?JSON.parse(localStorage.getItem(key)):null});
 assert.ok(saved);assert.equal(saved.presentation.mode,'result');assert.equal(saved.presentation.score,saved.result.score);assert.equal(saved.playerName,'Actual Run');assert.equal(saved.result.resultType,'game_over');
 assert.equal(calls.filter(x=>x.name==='start_masumen_play_v1').length,1);assert.equal(calls.filter(x=>x.name==='finish_masumen_play_v1').length,1);
 lose=false;await page.reload();await page.locator('.pending-results button').waitFor({timeout:90000});await page.locator('.pending-results button').click();await page.getByText('Score sent.',{exact:true}).waitFor();
 assert.equal(calls.filter(x=>x.name==='start_masumen_play_v1').length,1);const finishes=calls.filter(x=>x.name==='finish_masumen_play_v1');assert.equal(finishes.length,2);assert.deepEqual(finishes[0].body,finishes[1].body);
 assert.match(await page.locator('.result-share-text').inputValue(),new RegExp(String(saved.result.score)));assert.deepEqual(errors,[]);
 await checkShareAcceptance(browser,engine.name(),baseUrl,saved);
 console.log(JSON.stringify({engine:engine.name(),actualResult:saved.result,elapsed:saved.presentation.elapsed,persistedSnapshot:true,sameFinishPayload:true,noProductionWrites:true}));
 }finally{await browser.close()}
}})().catch(e=>{console.error(e);process.exitCode=1});
