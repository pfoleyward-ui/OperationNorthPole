import { record } from '../../src/domain/booking/request.ts';
import { bookableServices } from '../../src/config/services.ts';
import { canonical,digest } from './shared.ts';
import { origin,lease,release,IntegrationError,type IntegrationEnv } from './integration-config.ts';
import { snapshot,desiredCalendar,type Job } from './integration-plan.ts';
import type { Principal } from './auth.ts';
import { HqError } from './hq-service.ts';

export const GOOGLE_SCOPE='https://www.googleapis.com/auth/calendar.app.created';
const API='https://www.googleapis.com/calendar/v3/';
const TOKEN='https://oauth2.googleapis.com/token';
const encoder=new TextEncoder();
function b64(data:Uint8Array){return btoa(String.fromCharCode(...data));}
function bytes(data:string){return Uint8Array.from(atob(data),c=>c.charCodeAt(0));}
function random(){return b64(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}
async function hash(value:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
function keys(env:IntegrationEnv):Record<string,string>{
  try{const k:unknown=JSON.parse(env.GOOGLE_TOKEN_KEYS||'{}');if(!record(k)||Object.keys(k).length>5||!env.GOOGLE_TOKEN_ACTIVE_KEY||!Object.hasOwn(k,env.GOOGLE_TOKEN_ACTIVE_KEY)||Object.entries(k).some(([id,key])=>!/^[A-Za-z0-9_-]{1,40}$/.test(id)||typeof key!=='string'||bytes(key).length!==32))throw new Error();return k as Record<string,string>;}catch{throw new IntegrationError('token_encryption_not_configured');}
}
export async function seal(env:IntegrationEnv,value:unknown,aad:string):Promise<string>{
  const ring=keys(env),kid=env.GOOGLE_TOKEN_ACTIVE_KEY!;const iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await crypto.subtle.importKey('raw',bytes(ring[kid]),'AES-GCM',false,['encrypt']);
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(aad)},key,encoder.encode(JSON.stringify(value)));
  return JSON.stringify({kid,iv:b64(iv),data:b64(new Uint8Array(encrypted))});
}
export async function unseal(env:IntegrationEnv,value:string,aad:string):Promise<unknown>{
  try{const ring=keys(env),input:unknown=JSON.parse(value);if(!record(input)||typeof input.kid!=='string'||!Object.hasOwn(ring,input.kid)||typeof input.iv!=='string'||typeof input.data!=='string'||input.data.length>40000||bytes(input.iv).length!==12)throw new Error();
    const key=await crypto.subtle.importKey('raw',bytes(ring[input.kid]),'AES-GCM',false,['decrypt']);
    return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(input.iv),additionalData:encoder.encode(aad)},key,bytes(input.data))));
  }catch{throw new IntegrationError('token_decryption_failed');}
}
type Tokens={accessToken:string;refreshToken:string;expiresAt:number;scope:string};
type Connection={id:string;owner_sub:string;status:string;encrypted_tokens:string|null;calendar_id:string|null;calendar_state:string;setup_nonce:string|null};
async function connection(env:IntegrationEnv){return env.DB.prepare("SELECT * FROM integration_google WHERE id='google'").first<Connection>();}
function enabled(env:IntegrationEnv,principal?:Principal){
  if(env.GOOGLE_OAUTH_ENABLED!=='true')throw new HqError(503,'google_oauth_disabled');
  if(principal&&principal.role!=='santa')throw new HqError(403,'santa_google_authorization_required');
  if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET||!env.INTAKE_HMAC_SECRET||!env.INTEGRATION_INSTALLATION_ID||!/^[A-Za-z0-9_-]{16,100}$/.test(env.INTEGRATION_INSTALLATION_ID))throw new IntegrationError('google_not_configured');
  keys(env);origin(env);
}
function validTokens(value:unknown,now:number,old?:Tokens):Tokens{
  if(!record(value)||typeof value.access_token!=='string'||value.access_token.length>8192||!value.access_token||typeof value.expires_in!=='number'||!Number.isSafeInteger(value.expires_in)||value.expires_in<60||value.expires_in>86400||value.token_type!=='Bearer')throw new IntegrationError('invalid_oauth_response');
  const scope=typeof value.scope==='string'?value.scope:old?.scope;
  if(scope!==GOOGLE_SCOPE)throw new IntegrationError('unexpected_oauth_scope');
  const refresh=typeof value.refresh_token==='string'?value.refresh_token:old?.refreshToken;
  if(!refresh||refresh.length>8192)throw new IntegrationError('refresh_token_required');
  return {accessToken:value.access_token,refreshToken:refresh,expiresAt:now+value.expires_in*1000,scope};
}
async function tokenPost(fetcher:typeof fetch,body:URLSearchParams){
  const r=await fetcher(TOKEN,{method:'POST',body,redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw new IntegrationError(r.status===400||r.status===401?'google_reauthorization_required':'google_retry');
  return r.json();
}
export async function beginGoogle(env:IntegrationEnv,principal:Principal,now:number){
  enabled(env,principal);const state=random(),verifier=random();
  const stateHash=await digest(env.INTAKE_HMAC_SECRET!,`oauth:${state}`);
  const challenge=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(verifier)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  await env.DB.batch([
    env.DB.prepare('UPDATE integration_oauth_states SET consumed_at=? WHERE consumed_at IS NULL').bind(now),
    env.DB.prepare('INSERT INTO integration_oauth_states (state_hash,owner_sub,encrypted_verifier,expires_at) VALUES (?,?,?,?)').bind(stateHash,principal.sub,await seal(env,{verifier},'oauth:'+stateHash),now+600000),
    env.DB.prepare("INSERT INTO integration_control (key,value) VALUES ('google_oauth_active',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(stateHash),
  ]);
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID!,redirect_uri:origin(env)+'/hq/oauth/google/callback',response_type:'code',scope:GOOGLE_SCOPE,access_type:'offline',prompt:'consent select_account',include_granted_scopes:'false',state,code_challenge:challenge,code_challenge_method:'S256'}).toString();
  return {authorizationUrl:url.href};
}
export async function finishGoogle(env:IntegrationEnv,principal:Principal,url:URL,fetcher:typeof fetch,now:number){
  enabled(env,principal);const state=url.searchParams.get('state'),code=url.searchParams.get('code');
  if(!state||!/^[A-Za-z0-9_-]{43}$/.test(state)||!code||code.length>4096||url.searchParams.has('error'))throw new HqError(400,'invalid_oauth_callback');
  const stateHash=await digest(env.INTAKE_HMAC_SECRET!,`oauth:${state}`);
  const claimed=(await env.DB.batch<{encrypted_verifier:string}>([env.DB.prepare("UPDATE integration_oauth_states SET consumed_at=? WHERE state_hash=? AND owner_sub=? AND consumed_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM integration_control WHERE key='google_oauth_active' AND value=?) RETURNING encrypted_verifier").bind(now,stateHash,principal.sub,now,stateHash)]))[0].results[0];
  if(!claimed)throw new HqError(409,'oauth_state_invalid_or_consumed');
  const privateState=await unseal(env,claimed.encrypted_verifier,'oauth:'+stateHash);
  if(!record(privateState)||typeof privateState.verifier!=='string')throw new IntegrationError('oauth_state_invalid');
  const tokens=validTokens(await tokenPost(fetcher,new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID!,client_secret:env.GOOGLE_CLIENT_SECRET!,code,code_verifier:privateState.verifier,grant_type:'authorization_code',redirect_uri:origin(env)+'/hq/oauth/google/callback'})),now);
  const saved=(await env.DB.batch([env.DB.prepare(`INSERT INTO integration_google (id,owner_sub,status,encrypted_tokens,calendar_state,updated_at) SELECT 'google',?,'connected',?,'missing',? WHERE EXISTS(SELECT 1 FROM integration_control WHERE key='google_oauth_active' AND value=?) ON CONFLICT(id) DO UPDATE SET owner_sub=excluded.owner_sub,status='connected',encrypted_tokens=excluded.encrypted_tokens,updated_at=excluded.updated_at RETURNING id`).bind(principal.sub,await seal(env,tokens,'google:tokens'),now,stateHash)]))[0].results;
  if(!saved.length)throw new HqError(409,'oauth_flow_superseded');
}
async function accessToken(env:IntegrationEnv,fetcher:typeof fetch,now:number):Promise<string>{
  const c=await connection(env);if(!c||c.status!=='connected'||!c.encrypted_tokens)throw new IntegrationError('google_not_connected');
  const parsed=await unseal(env,c.encrypted_tokens,'google:tokens');
  if(!record(parsed)||typeof parsed.accessToken!=='string'||typeof parsed.refreshToken!=='string'||typeof parsed.expiresAt!=='number'||parsed.scope!==GOOGLE_SCOPE)throw new IntegrationError('invalid_stored_tokens');
  const tokens=parsed as Tokens;if(tokens.expiresAt>now+60000)return tokens.accessToken;
  const owner=await lease(env.DB,'google-refresh',now);if(!owner)throw new IntegrationError('google_busy_retry');
  try{
    const current=await connection(env);if(current?.encrypted_tokens!==c.encrypted_tokens)return accessToken(env,fetcher,now);
    const next=validTokens(await tokenPost(fetcher,new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID!,client_secret:env.GOOGLE_CLIENT_SECRET!,refresh_token:tokens.refreshToken,grant_type:'refresh_token'})),now,tokens);
    const updated=(await env.DB.batch<{id:string}>([env.DB.prepare("UPDATE integration_google SET encrypted_tokens=?,updated_at=? WHERE id='google' AND encrypted_tokens=? AND status='connected' RETURNING id").bind(await seal(env,next,'google:tokens'),now,c.encrypted_tokens)]))[0].results;
    if(!updated.length)throw new IntegrationError('google_connection_changed');
    return next.accessToken;
  }finally{await release(env.DB,'google-refresh',owner);}
}
async function google(env:IntegrationEnv,fetcher:typeof fetch,path:string,now:number,init:RequestInit={}){
  const token=await accessToken(env,fetcher,now);
  return fetcher(API+path,{...init,headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json',...Object.fromEntries(new Headers(init.headers))},redirect:'error',signal:AbortSignal.timeout(8000)});
}
export async function setupCalendar(env:IntegrationEnv,principal:Principal,input:unknown,fetcher:typeof fetch,now:number){
  enabled(env,principal);if(!record(input)||Object.keys(input).some(k=>k!=='calendarId'))throw new HqError(400,'invalid_calendar_setup');
  const c=await connection(env);if(!c||c.status!=='connected')throw new HqError(409,'google_not_connected');
  const marker='Operation North Pole installation '+env.INTEGRATION_INSTALLATION_ID;
  if(input.calendarId!==undefined){
    if(typeof input.calendarId!=='string'||input.calendarId==='primary'||input.calendarId.length>500)throw new HqError(400,'invalid_calendar_id');
    if(c.calendar_state==='ready'&&input.calendarId!==c.calendar_id)throw new HqError(409,'calendar_already_bound');
    const r=await google(env,fetcher,'calendars/'+encodeURIComponent(input.calendarId),now);if(!r.ok)throw new HqError(409,'calendar_not_accessible');
    const value=await r.json() as {id?:string;summary?:string;description?:string};
    if(value.id!==input.calendarId||value.summary!=='SantaBlizard Bookings'||value.description!==marker)throw new HqError(409,'calendar_ownership_mismatch');
    await env.DB.batch([env.DB.prepare("UPDATE integration_google SET calendar_id=?,calendar_state='ready',updated_at=? WHERE id='google' AND status='connected'").bind(value.id,now)]);
    return {calendarReady:true};
  }
  if(c.calendar_state==='ready')return {calendarReady:true};
  if(c.calendar_state!=='missing')throw new HqError(409,'calendar_creation_uncertain_recover_id');
  const nonce=crypto.randomUUID();
  const claimed=(await env.DB.batch<{id:string}>([env.DB.prepare("UPDATE integration_google SET calendar_state='creating',setup_nonce=? WHERE id='google' AND calendar_state='missing' AND status='connected' RETURNING id").bind(nonce)]))[0].results;
  if(!claimed.length)throw new HqError(409,'calendar_setup_in_progress');
  try{
    const r=await google(env,fetcher,'calendars',now,{method:'POST',body:JSON.stringify({summary:'SantaBlizard Bookings',description:marker,timeZone:'America/New_York'})});
    if(!r.ok)throw new IntegrationError('calendar_setup_failed');
    const value=await r.json() as {id?:string};if(typeof value.id!=='string'||!value.id||value.id.length>500||value.id==='primary')throw new IntegrationError('invalid_calendar_response');
    await env.DB.batch([env.DB.prepare("UPDATE integration_google SET calendar_id=?,calendar_state='ready',updated_at=? WHERE id='google' AND setup_nonce=? AND status='connected'").bind(value.id,now,nonce)]);
    return {calendarReady:true};
  }catch{
    await env.DB.batch([env.DB.prepare("UPDATE integration_google SET calendar_state='uncertain' WHERE id='google' AND setup_nonce=?").bind(nonce)]);
    throw new HqError(409,'calendar_creation_uncertain_recover_id');
  }
}
export async function disconnectGoogle(env:IntegrationEnv,principal:Principal,fetcher:typeof fetch,now:number){
  enabled(env,principal);const c=await connection(env);if(!c?.encrypted_tokens)return {disconnected:true};
  await env.DB.batch([env.DB.prepare("UPDATE integration_google SET status='revocation_pending' WHERE id='google'")]);
  const stored=await unseal(env,c.encrypted_tokens,'google:tokens');if(!record(stored)||typeof stored.refreshToken!=='string')throw new IntegrationError('invalid_stored_tokens');
  const r=await fetcher('https://oauth2.googleapis.com/revoke',{method:'POST',body:new URLSearchParams({token:stored.refreshToken}),redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw new IntegrationError('google_revocation_pending');
  await env.DB.batch([env.DB.prepare("UPDATE integration_google SET status='disconnected',encrypted_tokens=NULL,updated_at=? WHERE id='google' AND encrypted_tokens=?").bind(now,c.encrypted_tokens)]);
  return {disconnected:true};
}
export async function googleStatus(env:IntegrationEnv){const c=await connection(env);return {oauthEnabled:env.GOOGLE_OAUTH_ENABLED==='true',syncEnabled:env.CALENDAR_SYNC_ENABLED==='true',connected:c?.status==='connected',connectionStatus:c?.status||'not_connected',calendarState:c?.calendar_state||'missing'};}
export async function synchronizeCalendar(env:IntegrationEnv,job:Job,fetcher:typeof fetch,now:number){
  if(env.CALENDAR_SYNC_ENABLED!=='true')throw new IntegrationError('calendar_sync_disabled');
  const owner=await lease(env.DB,'calendar:'+job.booking_id,now);if(!owner)throw new IntegrationError('google_busy_retry');
  try{
    const s=await snapshot(env.DB,job.booking_id);if(!s||await desiredCalendar(s,env)!==job.calendar_hash)return 'superseded';
    const c=await connection(env);if(!c?.calendar_id||c.calendar_state!=='ready'||c.status!=='connected')throw new IntegrationError('calendar_not_configured');
    if(!env.INTEGRATION_INSTALLATION_ID)throw new IntegrationError('google_not_configured');
    const mapped=await env.DB.prepare('SELECT event_id,incarnation FROM integration_calendar WHERE booking_id=?').bind(s.id).first<{event_id:string;incarnation:number}>();
    let incarnation=mapped?.incarnation||0;
    let eventId=mapped?.event_id||await hash('onp:'+env.INTEGRATION_INSTALLATION_ID+':'+s.id);
    const base='calendars/'+encodeURIComponent(c.calendar_id)+'/events';
    const r=await google(env,fetcher,base+'/'+eventId,now);
    if(!r.ok&&r.status!==404&&r.status!==410)throw new IntegrationError('google_retry');
    let existing=r.ok?await r.json() as {etag?:string;status?:string;extendedProperties?:{private?:Record<string,string>}}:null;
    if((r.status===410||existing?.status==='cancelled')&&mapped&&s.state.status==='confirmed'){
      incarnation++;
      eventId=await hash('onp:'+env.INTEGRATION_INSTALLATION_ID+':'+s.id+':'+incarnation);
      existing=null;
    }
    if(existing?.status==='cancelled'&&mapped&&s.state.status==='canceled')existing=null;
    if(existing&&(existing.extendedProperties?.private?.onp_booking_id!==s.id||existing.extendedProperties?.private?.onp_installation!==env.INTEGRATION_INSTALLATION_ID))throw new IntegrationError('calendar_event_ownership_mismatch');
    if(existing&&(typeof existing.etag!=='string'||!existing.etag||existing.etag.length>2000))throw new IntegrationError('calendar_etag_required');
    const latest=await snapshot(env.DB,s.id);if(!latest||await desiredCalendar(latest,env)!==job.calendar_hash)return 'superseded';
    await env.DB.batch([env.DB.prepare('INSERT INTO integration_calendar (booking_id,event_id,incarnation,checked_at) VALUES (?,?,?,?) ON CONFLICT(booking_id) DO UPDATE SET event_id=excluded.event_id,incarnation=excluded.incarnation').bind(s.id,eventId,incarnation,now)]);
    if(s.state.status==='canceled'){
      if(existing){const removed=await google(env,fetcher,base+'/'+eventId+'?sendUpdates=none',now,{method:'DELETE',headers:existing.etag?{'If-Match':existing.etag}:{}});if(!removed.ok&&![404,410].includes(removed.status))throw new IntegrationError('google_retry');}
    }else if(s.state.status==='confirmed'&&s.state.quote){
      const q=s.state.quote;
      const event={id:eventId,summary:bookableServices[s.state.serviceId].name,location:s.request.location,
        description:'SantaBlizard booking reference '+s.id+'\nManage securely: '+origin(env)+'/hq?booking='+s.id,
        start:{dateTime:new Date(q.start).toISOString(),timeZone:'America/New_York'},end:{dateTime:new Date(q.end).toISOString(),timeZone:'America/New_York'},
        visibility:'private',transparency:'opaque',reminders:{useDefault:false,overrides:[]},extendedProperties:{private:{onp_booking_id:s.id,onp_installation:env.INTEGRATION_INSTALLATION_ID}}};
      const result=await google(env,fetcher,base+(existing?'/'+eventId:'')+'?sendUpdates=none',now,{method:existing?'PUT':'POST',headers:existing?.etag?{'If-Match':existing.etag}:{},body:JSON.stringify(event)});
      if(!result.ok)throw new IntegrationError(result.status===409||result.status===412?'google_reconcile_retry':'google_retry');
    }else return 'superseded';
    await env.DB.batch([env.DB.prepare('INSERT INTO integration_calendar (booking_id,event_id,synced_hash,checked_at) VALUES (?,?,?,?) ON CONFLICT(booking_id) DO UPDATE SET event_id=excluded.event_id,synced_hash=excluded.synced_hash,checked_at=excluded.checked_at,error_code=NULL').bind(s.id,eventId,job.calendar_hash!,now)]);
    return 'synced';
  }finally{await release(env.DB,'calendar:'+job.booking_id,owner);}
}
