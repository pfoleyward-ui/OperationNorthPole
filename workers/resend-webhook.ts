/** Staging-only signed webhook ingress. The private gateway verifies Svix HMAC.
 * No delivery, HQ, Google, asset or database endpoint is exposed here.
 */
export interface WebhookIngressEnv {
  RESEND_WEBHOOK_INGRESS_ENABLED?:string;
  NOTIFY_WEBHOOK?:{fetch(request:Request):Promise<Response>};
}
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function routeWebhookIngress(request:Request,env:WebhookIngressEnv):Promise<Response>{
 const url=new URL(request.url);
 if(env.RESEND_WEBHOOK_INGRESS_ENABLED!=='true'||url.origin!=='https://webhooks-staging.santablizard.com'||url.pathname!=='/webhooks/resend'||url.search)return new Response('Not found',{status:404,headers});
 if(request.method!=='POST')return new Response('Method not allowed',{status:405,headers:{...headers,Allow:'POST'}});
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return new Response('JSON required',{status:415,headers});
 const length=request.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>32768))return new Response('Invalid body size',{status:413,headers});
 if(!env.NOTIFY_WEBHOOK)return new Response('Unavailable',{status:503,headers});
 try{
  // Preserve the raw bytes and signature headers; the gateway also bounds streamed bodies.
  const response=await env.NOTIFY_WEBHOOK.fetch(new Request('https://notify.internal/webhooks/resend',request));
  const safe=new Headers(headers);safe.set('Content-Type','application/json');
  return new Response(response.body,{status:response.status,headers:safe});
 }catch{return new Response('Unavailable',{status:503,headers});}
}
export default {fetch:routeWebhookIngress};
