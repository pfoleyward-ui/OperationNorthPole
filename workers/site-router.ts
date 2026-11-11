import {turnstileReadiness,type ReadinessEnv} from './turnstile-readiness.ts';
import { authenticate, type AccessEnv } from './booking/auth.ts';
export interface SiteEnv extends AccessEnv,ReadinessEnv {
  NOTIFY_WEBHOOK?: {fetch(request:Request):Promise<Response>};
  BOOKING?: {fetch(request:Request):Promise<Response>};
  CUSTOMER_BOOKING_MODE?: string;
  PUBLIC_WEBSITE_ONLY?: string;
  SITE_STAGING_ENABLED?: string;
}
export async function routeSite(request:Request,env:SiteEnv,ctx:unknown,site:{fetch(request:Request,env:SiteEnv,ctx:unknown):Promise<Response>},fetcher?:typeof fetch,now=Date.now()){
  if(env.PUBLIC_WEBSITE_ONLY==='true')return publicWebsite(request,env,ctx,site);
  if(new URL(request.url).pathname==='/webhooks/resend')return env.NOTIFY_WEBHOOK?env.NOTIFY_WEBHOOK.fetch(request):new Response('Not found',{status:404});
  if(env.CUSTOMER_BOOKING_MODE==='staging'&&env.SITE_STAGING_ENABLED!=='true')return new Response('Staging protection is required',{status:503});
  if(env.SITE_STAGING_ENABLED==='true'){
    try{if((await authenticate(request,env,fetcher,now)).role!=='santa')throw new Error();}
    catch{return new Response('Sign in through Cloudflare Access',{status:401,headers:{'Cache-Control':'no-store'}});}
  }
  const path=new URL(request.url).pathname;
  if(path==='/launch-readiness/turnstile')return stagingHeaders(await turnstileReadiness(request,env,fetcher),env);
  if(path==='/api/bookings'||path==='/hq'||path.startsWith('/hq/')||path==='/elf-notes'||path.startsWith('/elf-notes/')){
    if(!env.BOOKING)return new Response('Booking service unavailable',{status:503});
    // Preserve edge Access assertion, Origin and CF-Connecting-IP. No browser-supplied actor.
    return stagingHeaders(await env.BOOKING.fetch(request),env);
  }
  return stagingHeaders(await site.fetch(request,env,ctx),env);
}

function stagingHeaders(response:Response,env:SiteEnv){
  if(env.SITE_STAGING_ENABLED!=='true')return response;
  const headers=new Headers(response.headers);headers.set('Cache-Control','private, no-store');headers.set('X-Robots-Tag','noindex, nofollow');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

/** Production website release: no private bindings or write-capable routes. */
async function publicWebsite(request:Request,env:SiteEnv,ctx:unknown,site:{fetch(request:Request,env:SiteEnv,ctx:unknown):Promise<Response>}){
  const url=new URL(request.url),path=url.pathname;
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  if(env.CUSTOMER_BOOKING_MODE!=='disabled'||env.SITE_STAGING_ENABLED==='true'||env.HQ_ENABLED==='true')return new Response('Website release configuration is invalid',{status:503,headers});
  if(url.hostname==='www.santablizard.com'||(url.hostname==='santablizard.com'&&url.protocol==='http:'))return new Response(null,{status:308,headers:{...headers,Location:'https://santablizard.com'+path+url.search}});
  // A document/static-asset allowlist also hides the synthetic preview and review gallery.
  const allowed=!path.includes('%')&&(path==='/'||path==='/services'||path==='/services/'||path==='/favicon.ico'||['/_next/static/','/images/','/_optimized/'].some(prefix=>path.startsWith(prefix)));
  if(!allowed)return new Response('Not found',{status:404,headers});
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{...headers,Allow:'GET, HEAD'}});
  return site.fetch(request,env,ctx);
}
