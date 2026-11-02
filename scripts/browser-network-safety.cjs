function localTestURL(value='http://localhost:4175/'){
 const url=new URL(value);
 if(url.protocol!=='http:'||!['localhost','127.0.0.1'].includes(url.hostname)||url.port!=='4175'||url.username||url.password)throw new Error('Browser checks require the local test server on port 4175');
 return url;
}
async function isolateBrowserNetwork(context,base){
 await context.routeWebSocket('**/*',socket=>socket.close());
 await context.route('**/*',async route=>{
  const request=route.request();
  if(new URL(request.url()).origin!==base.origin||!['GET','HEAD'].includes(request.method()))return route.abort('blockedbyclient');
  // Retry only Playwright ECONNRESET for the already restricted local static GET/HEAD.
  const response=await route.fetch({maxRedirects:0,maxRetries:2});
  if(response.status()>=300&&response.status()<400){await route.abort();throw new Error('Unexpected local redirect blocked');}
  await route.fulfill({response});
 });
}
module.exports={localTestURL,isolateBrowserNetwork};
