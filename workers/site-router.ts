import { authenticate, type AccessEnv } from './booking/auth.ts';
export interface SiteEnv extends AccessEnv {
  NOTIFY_WEBHOOK?: {fetch(request:Request):Promise<Response>};
  BOOKING: {fetch(request:Request):Promise<Response>};
  CUSTOMER_BOOKING_MODE?: string;
  SITE_STAGING_ENABLED?: string;
}
export async function routeSite(request:Request,env:SiteEnv,ctx:unknown,site:{fetch(request:Request,env:SiteEnv,ctx:unknown):Promise<Response>},fetcher?:typeof fetch,now=Date.now()){
  if(new URL(request.url).pathname==='/webhooks/resend')return env.NOTIFY_WEBHOOK?env.NOTIFY_WEBHOOK.fetch(request):new Response('Not found',{status:404});
  if(env.CUSTOMER_BOOKING_MODE==='staging'&&env.SITE_STAGING_ENABLED!=='true')return new Response('Staging protection is required',{status:503});
  if(env.SITE_STAGING_ENABLED==='true'){
    try{if((await authenticate(request,env,fetcher,now)).role!=='santa')throw new Error();}
    catch{return new Response('Sign in through Cloudflare Access',{status:401,headers:{'Cache-Control':'no-store'}});}
  }
  const path=new URL(request.url).pathname;
  if(path==='/api/bookings'||path==='/hq'||path.startsWith('/hq/')){
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
