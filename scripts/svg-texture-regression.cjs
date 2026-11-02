const assert=require('node:assert/strict');
const {readFileSync,mkdirSync,writeFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {createHash}=require('node:crypto');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PACKAGE||'playwright');
const asset=process.env.SVG_ASSET||'pilot';assert.ok(['pilot','pilot-attack'].includes(asset));
const origin='https://svg-texture.invalid';
const original=readFileSync(resolve(__dirname,`fixtures/${asset}-original.svg`));
const ORIGINAL_SHA={pilot:'657cf70c596a7d022470f235317fd68b04913ed44442735b7b4bbed5f50f72b9','pilot-attack':'83386b0b933ebcaa072cceef32a59d44eced08957ead9742aedcc8421817babf'}[asset];
assert.equal(createHash('sha256').update(original).digest('hex'),ORIGINAL_SHA);
const sized=readFileSync(resolve(__dirname,`../client/public/assets/${asset}.svg`));
assert.equal(sized.toString().replace('<svg width="128" height="128" ','<svg '),original.toString());
const html='<!doctype html><meta charset="utf-8"><title>Isolated SVG texture diagnostic</title><body></body>';
function allowed(request){
 const u=new URL(request.url());
 return request.method()==='GET'&&u.origin===origin&&!u.username&&!u.password&&!u.search&&!u.hash&&['/','/original.svg','/sized.svg'].includes(u.pathname);
}
async function evaluateVariant(page,{variant,version}){
 return page.evaluate(async ({variant,version})=>{
  const image=new Image();image.src=variant==='sized'?'/sized.svg':'/original.svg';await image.decode();
  const source=document.createElement('canvas');source.width=128;source.height=128;
  const ctx=source.getContext('2d');ctx.drawImage(image,0,0,128,128);
  function count(pixels){let transparent=0,opaque=0,colored=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]===0)transparent++;if(pixels[i+3]===255)opaque++;if(pixels[i+3]>0&&pixels[i+1]>100&&pixels[i+2]>100)colored++;}return{transparent,opaque,colored};}
  const decodedPixels=ctx.getImageData(0,0,128,128).data;
  const decoded=count(decodedPixels);
  const decodedSHA=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',decodedPixels))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;document.body.append(canvas);
  const gl=canvas.getContext(version===2?'webgl2':'webgl');
  if(!gl)return {variant,version,available:false,decoded,decodedSHA};
  const shader=(type,text)=>{const s=gl.createShader(type);gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('shader-compile');return s;};
  const program=gl.createProgram();
  const vertex=version===2?'#version 300 es\nin vec2 p;out vec2 uv;void main(){uv=(p+1.0)*0.5;gl_Position=vec4(p,0,1);}':'attribute vec2 p;varying vec2 uv;void main(){uv=(p+1.0)*0.5;gl_Position=vec4(p,0,1);}';
  const fragment=version===2?'#version 300 es\nprecision mediump float;in vec2 uv;uniform sampler2D t;out vec4 c;void main(){c=texture(t,uv);}':'precision mediump float;varying vec2 uv;uniform sampler2D t;void main(){gl_FragColor=texture2D(t,uv);}';
  gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('shader-link');gl.useProgram(program);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  const loc=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  const priorError=gl.getError();gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,variant==='canvas'?source:image);const uploadError=gl.getError();
  const framebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);const framebufferStatus=gl.checkFramebufferStatus(gl.FRAMEBUFFER);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  gl.viewport(0,0,128,128);gl.disable(gl.BLEND);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  const pixels=new Uint8Array(128*128*4);gl.readPixels(0,0,128,128,gl.RGBA,gl.UNSIGNED_BYTE,pixels);const drawError=gl.getError();
  // Pixel evidence comes directly from readPixels, not an overlay or forced game draw.
  const evidence=document.createElement('canvas');evidence.width=128;evidence.height=128;evidence.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels),128,128),0,0);
  return {variant,version,available:true,explicitWidth:image.hasAttribute('width'),explicitHeight:image.hasAttribute('height'),naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,decoded,decodedSHA,priorError,uploadError,framebufferStatus,drawError,rendered:count(pixels),png:evidence.toDataURL('image/png')};
 },{variant,version});
}
async function run(){
 const output=resolve(process.env.SVG_DIAGNOSTIC_OUTPUT||'test-artifacts/svg-texture-'+Date.now());mkdirSync(output,{recursive:true});
 const results=[];
 for(const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   for(const version of [1,2])for(const variant of ['original','sized','canvas']){
    const context=await browser.newContext({serviceWorkers:'block'});let blocked=0;const errors=[];
    try{
     await context.routeWebSocket('**/*',ws=>{blocked++;ws.close();});
     await context.route('**/*',route=>{const req=route.request();if(!allowed(req)){blocked++;return route.abort('blockedbyclient');}const path=new URL(req.url()).pathname;return route.fulfill({status:200,contentType:path==='/'?'text/html':'image/svg+xml',body:path==='/'?html:path==='/sized.svg'?sized:original});});
     const page=await context.newPage();page.on('pageerror',()=>errors.push('page-error'));page.setDefaultTimeout(15000);await page.goto(origin+'/');
     const result=await evaluateVariant(page,{variant,version});const png=result.png;delete result.png;
     if(png){assert.match(png,/^data:image\/png;base64,/);writeFileSync(resolve(output,`${engineName}-webgl${version}-${variant}.png`),Buffer.from(png.split(',')[1],'base64'));}
     const safe={asset,engine:engineName,...result,blockedRequests:blocked,pageErrors:errors.length};results.push(safe);writeFileSync(resolve(output,'results.json'),JSON.stringify({asset,sourceSHA256:ORIGINAL_SHA,results},null,2)+'\n');
     assert.equal(result.available,true,'GPU context required for this regression');assert.equal(blocked,0);assert.equal(errors.length,0);assert.ok(result.decoded.transparent>0&&result.decoded.colored>0);
     if(result.available&&variant!=='original'){assert.equal(result.priorError,0);assert.equal(result.uploadError,0);assert.equal(result.drawError,0);assert.equal(result.framebufferStatus,36053);assert.ok(result.rendered.transparent>0&&result.rendered.colored>0);}
    }finally{await context.close();}
   }
  }finally{await browser.close();}
 }
 // The original remains an observational control; exact 2D pixels must be preserved.
 for(const engine of ['chromium','webkit'])for(const version of [1,2]){const group=results.filter(x=>x.engine===engine&&x.version===version);assert.equal(group.length,3);assert.equal(group[0].decodedSHA,group[1].decodedSHA);assert.equal(group[0].decodedSHA,group[2].decodedSHA);}
 console.log(JSON.stringify({variants:results.length,externalRequests:0,results}));
}
if(require.main===module)run().catch(()=>{console.error('svg-texture-diagnostic-failed; inspect allowlisted results artifact');process.exitCode=1;});
module.exports={allowed};
