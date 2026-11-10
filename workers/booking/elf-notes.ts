import { bodyText, digest } from './shared.ts';
import { seal, unseal } from './google.ts';
import { record } from '../../src/domain/booking/request.ts';
import { HqError } from './hq-service.ts';
import { policy, quietAdjusted, target, type IntegrationEnv } from './integration-config.ts';
import type { Principal } from './auth.ts';
import { elfHTML, elfJS, elfCSS } from './elf-ui.ts';

export interface ElfEnv extends IntegrationEnv {
 ELF_NOTES_ENABLED?: string;
 ELF_ORIGIN?: string;
 ELF_TOKEN_SECRET?: string;
 ELF_ENCRYPTION_KEYS?: string;
 ELF_ACTIVE_KEY?: string;
 ELF_RETENTION_APPROVED?: string;
 ELF_RETENTION_APPROVAL_REFERENCE?: string;
}
const headers = { 'Cache-Control':'no-store, private', 'Referrer-Policy':'no-referrer', 'X-Content-Type-Options':'nosniff', 'X-Robots-Tag':'noindex, nofollow', 'X-Frame-Options':'DENY', 'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'", 'Permissions-Policy':'camera=(), microphone=(), geolocation=()' };
const reply=(status:number,data:unknown)=>Response.json(data,{status,headers});
const fields=['firstName','interests','favoriteToys','pets','achievements','traditions'];
export function validateElfNotes(value:unknown) {
 if(!record(value)||Object.keys(value).some(k=>!['children','guardianConsent','version'].includes(k))||value.guardianConsent!==true||!Number.isSafeInteger(value.version)||(value.version as number)<0||!Array.isArray(value.children)||value.children.length<1||value.children.length>12)throw new HqError(400,'invalid_optional_notes');
 const children=value.children.map(child=>{
  if(!record(child)||Object.keys(child).some(k=>!fields.includes(k)))throw new HqError(400,'invalid_optional_notes');
  const result:Record<string,string>={};
  for(const field of fields)if(Object.hasOwn(child,field)){
   const text=child[field];
   if(typeof text!=='string'||text.length>(field==='firstName'?60:300)||/[\u0000-\u001f\u007f]/.test(text))throw new HqError(400,'invalid_optional_notes');
   if(text.trim())result[field]=text.trim();
  }
  return result;
 });
 return {children,version:value.version as number};
}
function encryption(env:ElfEnv):IntegrationEnv {return {...env,GOOGLE_TOKEN_KEYS:env.ELF_ENCRYPTION_KEYS,GOOGLE_TOKEN_ACTIVE_KEY:env.ELF_ACTIVE_KEY};}
function configured(env:ElfEnv){if(env.ELF_NOTES_ENABLED!=='true'||!env.ELF_TOKEN_SECRET||env.ELF_TOKEN_SECRET.length<32||!env.ELF_ORIGIN||new URL(env.ELF_ORIGIN).origin!==env.ELF_ORIGIN||!env.ELF_ORIGIN.startsWith('https:'))throw new HqError(503,'optional_notes_unavailable');}
async function eligible(env:ElfEnv,id:string,now:number,inviting=false){
 const row=await env.DB.prepare("SELECT status,json_extract(state_json,'$.serviceId') AS service,json_extract(state_json,'$.quote.end') AS visit_end FROM hq_bookings WHERE booking_id=?").bind(id).first<{status:string;service:string;visit_end:number}>();
 if(!row||row.service!=='home-visits'||!(inviting?row.status==='confirmed':['confirmed','completed'].includes(row.status))||!Number.isSafeInteger(row.visit_end)||(inviting&&row.visit_end<=now))throw new HqError(404,'optional_notes_unavailable');
 return row;
}
export async function elfHq(env:ElfEnv,path:string,input:unknown,principal:Principal,now:number){
 const match=/^\/hq\/api\/bookings\/([a-f0-9-]{36})\/elf\/(invite|read|delete)$/.exec(path);
 if(!match)return undefined;
 if(principal.role!=='santa')throw new HqError(403,'santa_required');
 configured(env);const id=match[1];
 if(!record(input)||Object.keys(input).length)throw new HqError(400,'invalid_request');
 if(match[2]==='delete'){await erase(env,id);return {deleted:true};}
 const booking=await eligible(env,id,now,match[2]==='invite');
 if(match[2]==='invite'){
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  const hash=await digest(env.ELF_TOKEN_SECRET!,token);
  await env.DB.batch([env.DB.prepare('INSERT INTO elf_invitations (booking_id,token_hash,expires_at,created_at) VALUES (?,?,?,?) ON CONFLICT(booking_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at,created_at=excluded.created_at').bind(id,hash,booking.visit_end+30*86400000,now)]);
  // Fragment is never transmitted in HTTP requests, referrers or server logs.
  return {invitationUrl:env.ELF_ORIGIN+'/elf-notes#'+token,expiresAt:booking.visit_end+30*86400000};
 }
 const row=await env.DB.prepare('SELECT ciphertext,version FROM elf_notes WHERE booking_id=?').bind(id).first<{ciphertext:string;version:number}>();
 return row?{notes:await unseal(encryption(env),row.ciphertext,'elf:'+id),version:row.version}:{notes:null,version:0};
}
async function erase(env:ElfEnv,id:string){await env.DB.batch([env.DB.prepare('DELETE FROM elf_notes WHERE booking_id=?').bind(id),env.DB.prepare('DELETE FROM elf_alerts WHERE booking_id=?').bind(id)]);}
export async function handleElf(request:Request,env:ElfEnv,now=Date.now()):Promise<Response>{
 try{
  configured(env);const url=new URL(request.url);
  if(url.origin!==env.ELF_ORIGIN||url.search)return reply(404,{error:'not_found'});
  if(request.method==='GET'&&url.pathname==='/elf-notes')return new Response(elfHTML,{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
  if(request.method==='GET'&&url.pathname==='/elf-notes/app.js')return new Response(elfJS,{headers:{...headers,'Content-Type':'application/javascript; charset=utf-8'}});
  if(request.method==='GET'&&url.pathname==='/elf-notes/style.css')return new Response(elfCSS,{headers:{...headers,'Content-Type':'text/css; charset=utf-8'}});
  if(request.method!=='POST'||!['/elf-notes/read','/elf-notes/save','/elf-notes/delete'].includes(url.pathname))return reply(404,{error:'not_found'});
  if(request.headers.get('origin')!==env.ELF_ORIGIN||request.headers.get('sec-fetch-site')==='cross-site'||request.headers.get('content-type')?.split(';')[0]!=='application/json')return reply(403,{error:'forbidden'});
  const token=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if(!token)return reply(401,{error:'private_invitation_required'});
  const hash=await digest(env.ELF_TOKEN_SECRET!,token);
  const bucket=Math.floor(now/60000);const rate=await digest(env.ELF_TOKEN_SECRET!,'elf-rate:'+bucket+':'+hash);
  const limited=await env.DB.batch([env.DB.prepare('DELETE FROM elf_rate_limits WHERE expires_at<=?').bind(now),env.DB.prepare('INSERT INTO elf_rate_limits (key,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 WHERE attempts<20 RETURNING attempts').bind(rate,now+120000)]);
  if(!limited[1].results.length)return reply(429,{error:'try_later'});
  const invite=await env.DB.prepare('SELECT booking_id FROM elf_invitations WHERE token_hash=? AND expires_at>?').bind(hash,now).first<{booking_id:string}>();
  if(!invite)return reply(401,{error:'private_invitation_required'});
  const id=invite.booking_id;
  let input:unknown;
  try{input=JSON.parse(await bodyText(request));}catch(error){return reply(error instanceof RangeError?413:400,{error:'invalid_request'});}
  if(url.pathname==='/elf-notes/delete'){
   if(!record(input)||Object.keys(input).length)return reply(400,{error:'invalid_request'});
   await erase(env,id);return reply(200,{deleted:true});
  }
  await eligible(env,id,now);
  if(url.pathname==='/elf-notes/read'){
   if(!record(input)||Object.keys(input).length)return reply(400,{error:'invalid_request'});
   const row=await env.DB.prepare('SELECT ciphertext,version FROM elf_notes WHERE booking_id=?').bind(id).first<{ciphertext:string;version:number}>();
   return reply(200,row?{notes:await unseal(encryption(env),row.ciphertext,'elf:'+id),version:row.version}:{notes:null,version:0});
  }
  const notes=validateElfNotes(input);const ciphertext=await seal(encryption(env),{children:notes.children},'elf:'+id);
  // Eligibility and optimistic version are checked in the same atomic SQL write.
  const saved=await env.DB.batch([env.DB.prepare(`INSERT INTO elf_notes (booking_id,ciphertext,version,consent_version,consent_at,updated_at)
   SELECT ?,?,1,'guardian-v1',?,? WHERE ?=0 AND EXISTS(SELECT 1 FROM elf_invitations i JOIN hq_bookings b ON b.booking_id=i.booking_id WHERE i.booking_id=? AND i.token_hash=? AND i.expires_at>? AND b.status IN ('confirmed','completed') AND json_extract(b.state_json,'$.serviceId')='home-visits')
   ON CONFLICT(booking_id) DO NOTHING RETURNING version`).bind(id,ciphertext,now,now,notes.version,id,hash,now),
   env.DB.prepare(`UPDATE elf_notes SET ciphertext=?,version=version+1,consent_version='guardian-v1',consent_at=?,updated_at=? WHERE booking_id=? AND version=? AND ?>0 AND EXISTS(SELECT 1 FROM hq_bookings b JOIN elf_invitations i ON i.booking_id=b.booking_id WHERE b.booking_id=? AND b.status IN ('confirmed','completed') AND json_extract(b.state_json,'$.serviceId')='home-visits' AND i.token_hash=? AND i.expires_at>?) RETURNING version`).bind(ciphertext,now,now,id,notes.version,notes.version,id,hash,now)]);
  const result=saved.flatMap(r=>r.results);
  if(!result.length)return reply(409,{error:'notes_changed_reload'});
  return reply(200,{saved:true,version:(result[0] as {version:number}).version});
 }catch(error){return reply(error instanceof HqError?error.status:error instanceof RangeError?413:503,{error:error instanceof HqError?error.message:'optional_notes_unavailable'});}
}
export async function maintainElf(env:ElfEnv,now=Date.now()){
 if(env.ELF_NOTES_ENABLED!=='true')return;
 if(env.ELF_RETENTION_APPROVED==='true'&&env.ELF_RETENTION_APPROVAL_REFERENCE){
  // Read current visit end, so rescheduling cannot leave an obsolete deletion date.
  const due="SELECT booking_id FROM hq_bookings WHERE json_extract(state_json,'$.quote.end')<=?";
  await env.DB.batch(['elf_notes','elf_alerts','elf_invitations'].map(table=>env.DB.prepare(`DELETE FROM ${table} WHERE booking_id IN (${due})`).bind(now-30*86400000)));
 }
 if(env.NOTIFICATION_DELIVERY_ENABLED!=='true'||!env.NOTIFY||quietAdjusted(now,policy(env))>now)return;
 const route=target(env,'santa');if(!route)return;
 const rows=(await env.DB.batch<{id:string;booking_id:string;created_at:number}>([env.DB.prepare('SELECT id,booking_id,created_at FROM elf_alerts WHERE delivered_at IS NULL ORDER BY created_at LIMIT 10')]))[0].results;
 for(const row of rows){
  const key='elf_'+row.id;const endpoint='https://notify.internal/deliveries/'+key;
  let response=await env.NOTIFY.fetch(new Request(endpoint));if(!response.ok)continue;
  let receipt=await response.json() as {status:string};
  if(receipt.status==='not_found'){
   response=await env.NOTIFY.fetch(new Request(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({idempotencyKey:key,expiresAt:row.created_at+7*86400000,recipientKey:route.recipientKey,channel:'email',subject:'Optional Elf Notes are ready',text:'Optional preparation notes are ready. Open the secure desk for details.\n'+env.HQ_ORIGIN+'/hq?booking='+row.booking_id+'#reminders'})}));
   if(!response.ok)continue;receipt=await response.json() as {status:string};
  }
  if(['accepted','delivered','failed','uncertain'].includes(receipt.status))await env.DB.batch([env.DB.prepare('UPDATE elf_alerts SET delivered_at=? WHERE id=?').bind(now,row.id)]);
 }
}
