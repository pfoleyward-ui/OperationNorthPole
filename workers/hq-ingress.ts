/** Exact-host private HQ ingress. Requires interactive, signed, enrolled Santa identity.
 * Default-off; no public booking, family, provider or generic proxy endpoint.
 */
import {authenticate,type AccessEnv} from './booking/auth.ts';
export interface HqIngressEnv extends AccessEnv {HQ_INGRESS_ENABLED?:string;BOOKING?:{fetch(request:Request):Promise<Response>}}
const safe={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','X-Frame-Options':'DENY'};
const fail=(status:number,text:string)=>new Response(text,{status,headers:safe});
export async function routeHqIngress(request:Request,env:HqIngressEnv,fetcher?:typeof fetch,now=Date.now()):Promise<Response>{
 if(env.HQ_INGRESS_ENABLED!=='true')return fail(503,'Private dashboard preparation is in progress.');
 const url=new URL(request.url);
 if(env.HQ_ORIGIN!=='https://hq.santablizard.com'||url.origin!==env.HQ_ORIGIN||url.pathname.includes('%')||!(url.pathname==='/hq'||url.pathname.startsWith('/hq/')))return fail(404,'Not found');
 if(!['GET','POST'].includes(request.method))return fail(405,'Method not allowed');
 try{if((await authenticate(request,env,fetcher,now)).role!=='santa')return fail(403,'Santa access required');}catch{return fail(401,'Sign in through Cloudflare Access');}
 if(!env.BOOKING)return fail(503,'Private dashboard unavailable');
 const headers=new Headers();for(const name of ['cf-access-jwt-assertion','origin','cf-connecting-ip','sec-fetch-site','content-type','idempotency-key','accept']){const value=request.headers.get(name);if(value)headers.set(name,value);}
 try{
  const result=await env.BOOKING.fetch(new Request(url,{method:request.method,headers,...(request.method==='POST'?{body:request.body,duplex:'half'} as RequestInit:{}),redirect:'manual',signal:AbortSignal.timeout(15000)}));
  const out=new Headers(result.headers);for(const [name,value] of Object.entries(safe))out.set(name,value);
  return new Response(result.body,{status:result.status,headers:out});
 }catch{return fail(503,'Private dashboard unavailable');}
}
export default {fetch:(request:Request,env:HqIngressEnv)=>routeHqIngress(request,env)};
