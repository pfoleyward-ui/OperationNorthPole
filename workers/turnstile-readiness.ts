import {bodyText} from './booking/shared.ts';
import {record} from '../src/domain/booking/request.ts';
export interface ReadinessEnv {
  SITE_STAGING_ENABLED?:string;
  TURNSTILE_READINESS_ENABLED?:string;
  TURNSTILE_SITE_KEY?:string;
  TURNSTILE_SECRET?:string;
}
const origin='https://staging.santablizard.com';
const action='launch_readiness';
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const reply=(status:number,result:object)=>Response.json(result,{status,headers});
/** Called only after the site's signed Santa Access authorization. No database/provider messaging bindings. */
export async function turnstileReadiness(request:Request,env:ReadinessEnv,fetcher:typeof fetch=fetch):Promise<Response>{
 const url=new URL(request.url);
 if(env.SITE_STAGING_ENABLED!=='true'||env.TURNSTILE_READINESS_ENABLED!=='true'||url.origin!==origin)return reply(404,{error:'not_found'});
 if(!env.TURNSTILE_SECRET||!env.TURNSTILE_SITE_KEY||!/^0x[A-Za-z0-9_-]+$/.test(env.TURNSTILE_SITE_KEY))return reply(503,{error:'unavailable'});
 if(request.method==='GET'){
  const nonce=crypto.randomUUID();
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Staging security check</title><style nonce="${nonce}">body{font:18px system-ui;max-width:36rem;margin:3rem auto;padding:1rem;line-height:1.6}button{font:inherit;padding:.8rem;margin:.5rem 0}#result{white-space:pre-wrap}</style><h1>Staging security check</h1><p>This check creates no booking and collects no customer or child information.</p><p>Complete the security check, then select Verify. If it expires, reload this page.</p><div class="cf-turnstile" data-sitekey="${env.TURNSTILE_SITE_KEY}" data-action="${action}" data-callback="ready" data-expired-callback="expired" data-error-callback="failed"></div><button id="verify" disabled>Verify security check</button><button id="reject">Test invalid proof rejection</button><p id="result" role="status" aria-live="polite"></p><script nonce="${nonce}">let proof='';const result=document.getElementById('result'),verify=document.getElementById('verify');window.ready=t=>{proof=t;verify.disabled=false;result.textContent='Ready to verify.'};window.expired=()=>{proof='';verify.disabled=true;result.textContent='Check expired. Reload and try again.'};window.failed=()=>{window.expired();result.textContent='Security check could not load. Reload and try again.'};async function check(token,invalid){verify.disabled=true;document.getElementById('reject').disabled=true;try{const response=await fetch('/launch-readiness/turnstile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({proof:token})});const value=await response.json();result.textContent=invalid?(response.status===403&&value.result==='rejected'?'PASS: Invalid proof rejected. Reload to complete the real check.':'Check inconclusive. Reload and try again.'):(response.ok&&value.result==='verified'?'PASS: Real Turnstile proof verified for staging.':'Security check did not pass. Reload and try again.')}catch{result.textContent='Check unavailable. Reload and try again.'}finally{proof=''}}verify.onclick=()=>check(proof,false);document.getElementById('reject').onclick=()=>check('invalid-readiness-proof',true);</script><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script></html>`,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}' https://challenges.cloudflare.com; style-src 'nonce-${nonce}'; frame-src https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`}});
 }
 if(request.method!=='POST')return reply(405,{error:'method_not_allowed'});
 if(request.headers.get('origin')!==origin)return reply(403,{error:'forbidden'});
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return reply(415,{error:'json_required'});
 try{
  const input:unknown=JSON.parse(await bodyText(request));
  if(!record(input)||Object.keys(input).length!==1||typeof input.proof!=='string'||!input.proof||input.proof.length>2048)return reply(400,{error:'invalid_body'});
  const response=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(5000),body:new URLSearchParams({secret:env.TURNSTILE_SECRET,response:input.proof})});
  if(!response.ok)return reply(503,{error:'unavailable'});
  const result=await response.json() as {success?:boolean;hostname?:string;action?:string};
  if(result.success!==true||result.hostname!=='staging.santablizard.com'||result.action!==action)return reply(403,{result:'rejected'});
  return reply(200,{result:'verified'});
 }catch(error){return reply(error instanceof RangeError?413:503,{error:'unavailable'});}
}
