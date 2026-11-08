import {policy,quietAdjusted} from '../booking/integration-config.ts';
import {snapshot} from '../booking/integration-plan.ts';
import {customerEmailState,customerEmailText} from '../booking/customer-email.ts';
import type { Database } from '../booking/repository.ts';
import { bodyText, canonical, digest } from '../booking/shared.ts';
import { send, poll, providerConfigured, type ProviderEnv, type Message } from './providers.ts';
export interface GatewayEnv extends ProviderEnv {
  DB: Database;
  BOOKING_DB?: Database;
  GATEWAY_DELIVERY_ENABLED?: string;
  GATEWAY_HMAC_SECRET?: string;
  /** Server-only mapping opaque keys to explicitly approved destinations. */
  GATEWAY_RECIPIENTS_JSON?: string;
  HQ_ORIGIN?: string;
  REMINDER_POLICY_JSON?: string;
}
type Row={id:string;payload_hash:string;payload_json:string;destination:string;state:string;provider_id:string|null;next_at:number;attempts:number;created_at:number;updated_at:number};
const reply=(status:number,value:object)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function receipt(row:Row,now:number) { return { idempotencyKey:row.id,status:row.state==='retry'?'not_found':row.state==='sending'?(now-row.updated_at>=30000?'uncertain':'accepted'):row.state,...(row.provider_id?{providerId:row.provider_id}:{}) }; }
class InvalidRequest extends Error {}
function validate(input: unknown, env: GatewayEnv): Message {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new InvalidRequest();
  const x=input as Record<string,unknown>;
  if(Object.keys(x).filter(k=>k!=='customerState').sort().join(',')!=='channel,expiresAt,idempotencyKey,recipientKey,subject,text')throw new InvalidRequest();
  if(typeof x.idempotencyKey!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(x.idempotencyKey)||typeof x.recipientKey!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(x.recipientKey)||x.channel!=='email'||typeof x.subject!=='string'||x.subject.length<1||x.subject.length>120||/[\r\n]/.test(x.subject)||typeof x.text!=='string'||x.text.length>1200||!Number.isSafeInteger(x.expiresAt))throw new InvalidRequest();
  const origin=new URL(env.HQ_ORIGIN!);if(origin.protocol!=='https:'||origin.origin!==env.HQ_ORIGIN)throw new InvalidRequest();
  // Only the reviewed generic templates may cross this boundary; no arbitrary body/child notes.
  if(x.recipientKey.startsWith('customer_')){if(x.subject!=='An update about your SantaBlizard booking'||typeof x.customerState!=='string')throw new InvalidRequest();return x as unknown as Message;}
  if(x.customerState!==undefined)throw new InvalidRequest();
  const subjects=['A new letter has arrived!','A little Christmas magic is confirmed','An upcoming sleigh stop needs a look','A Gentle Jingle','Your pre-event sleigh check','Today’s Christmas magic','The Elves Are Concerned','Mrs. Claus Has Been Notified','Santa Is Officially in the Doghouse','The sleigh check is resolved'];
  if(!subjects.includes(x.subject))throw new InvalidRequest();
  const lines=x.text.split('\n');
  const approved=[
    'The sleigh check is resolved. No booking was canceled by the reminder system.',
    'Santa, please open this booking and tap Got It! to acknowledge your pre-event check.',
    'Santa has not acknowledged this sleigh check yet. Please use the secure desk for details.',
    'A little Christmas planning is ready for your attention. Open the secure desk for details.',
  ];
  if(lines.length!==2||!approved.includes(lines[0])||!lines[1].startsWith(origin.origin+'/hq?booking=')||!/^\/hq\?booking=[a-f0-9-]{36}#reminders$/.test(new URL(lines[1]).pathname+new URL(lines[1]).search+new URL(lines[1]).hash))throw new InvalidRequest();
  return x as unknown as Message;
}
function destination(message: Message,env: GatewayEnv):string {
  const map=JSON.parse(env.GATEWAY_RECIPIENTS_JSON||'{}') as Record<string,{channel?:string;destination?:string}>;
  const target=Object.hasOwn(map,message.recipientKey)?map[message.recipientKey]:undefined;
  if(target?.channel!==message.channel||typeof target.destination!=='string'||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(target.destination))throw new InvalidRequest();
  return target.destination;
}
async function row(env:GatewayEnv,key:string) {return env.DB.prepare('SELECT * FROM gateway_deliveries WHERE id=?').bind(key).first<Row>();}
export async function handleGateway(request:Request,env:GatewayEnv,fetcher:typeof fetch=fetch,now=Date.now(),clock:()=>number=()=>now):Promise<Response>{
  const url=new URL(request.url);
  if(url.pathname==='/webhooks/resend')return handleWebhook(request,env,now);const key=url.pathname.match(/^\/deliveries\/([A-Za-z0-9_-]{16,128})$/)?.[1];
  if(url.origin!=='https://notify.internal'||!key||url.search)return reply(404,{error:'not_found'});
  if(!['GET','POST'].includes(request.method))return reply(405,{error:'method_not_allowed'});
  if(!env.DB||!env.GATEWAY_HMAC_SECRET||env.GATEWAY_HMAC_SECRET.length<32)return reply(503,{error:'gateway_not_configured'});
  try {
    let existing=await row(env,key);
    if(request.method==='GET')return reply(200,existing?receipt(existing,now):{idempotencyKey:key,status:'not_found'});
    if(env.GATEWAY_DELIVERY_ENABLED!=='true')return reply(503,{error:'delivery_disabled'});
    if(request.headers.get('content-type')?.split(';')[0]!=='application/json'||request.headers.get('idempotency-key')!==key)return reply(400,{error:'invalid_request'});
    const message=validate(JSON.parse(await bodyText(request)),env);
    if(message.idempotencyKey!==key)return reply(400,{error:'invalid_request'});
    const hash=await digest(env.GATEWAY_HMAC_SECRET,canonical(message));
    if(existing&&existing.payload_hash!==hash)return reply(409,{error:'idempotency_conflict'});
    if(existing&&existing.state!=='retry')return reply(200,receipt(existing,now));
    if(message.expiresAt<=now)return reply(410,{error:'delivery_expired'});
    if(!providerConfigured(message.channel,env))return reply(503,{error:'provider_not_configured'});
    let customerTo:string|undefined;
    if(message.recipientKey.startsWith('customer_')){
      const id=message.recipientKey.slice(9);
      if(!/^[a-f0-9-]{36}$/.test(id)||!env.BOOKING_DB)return reply(503,{error:'customer_route_unavailable'});
      const booking=await snapshot(env.BOOKING_DB,id);
      if(!booking||customerEmailState(booking)!==message.customerState||customerEmailText(booking)!==message.text)return reply(410,{error:'customer_update_superseded'});
      customerTo=booking.request.customer.email;
    }
    const to=existing?.destination||customerTo||destination(message,env);
    await env.DB.batch([env.DB.prepare(`INSERT INTO gateway_deliveries(id,payload_hash,payload_json,destination,state,next_at,created_at,updated_at) VALUES(?,?,?,?,'retry',?,?,?) ON CONFLICT(id) DO NOTHING`).bind(key,hash,JSON.stringify(message),to,now,now,now)]);
    existing=await row(env,key);
    if(!existing||existing.payload_hash!==hash)return reply(409,{error:'idempotency_conflict'});
    // Commit a unique sending fence BEFORE crossing a provider boundary. A crash
    // remains uncertain; no lease expiry ever permits a second email send.
    const claimed=(await env.DB.batch<Row>([env.DB.prepare(`UPDATE gateway_deliveries SET state='sending',attempts=attempts+1,updated_at=? WHERE id=? AND state='retry' AND next_at<=? RETURNING *`).bind(now,key,now)]))[0].results[0];
    if(!claimed){existing=(await row(env,key))!;if(existing.state==='retry')return reply(503,{error:'retry_later'});return reply(200,receipt(existing,now));}
    const dispatchAt=clock(),quiet=quietAdjusted(dispatchAt,policy(env));
    if(dispatchAt>=message.expiresAt||quiet>dispatchAt){
      await env.DB.batch([env.DB.prepare("UPDATE gateway_deliveries SET state=?,error_code=?,next_at=?,updated_at=? WHERE id=? AND state='sending'").bind(dispatchAt>=message.expiresAt?'failed':'retry',dispatchAt>=message.expiresAt?'delivery_expired':'quiet_hours',quiet,dispatchAt,key)]);
      return reply(dispatchAt>=message.expiresAt?410:503,{error:'delivery_deferred_or_expired'});
    }
    const result=await send(message,claimed.destination,env,fetcher);
    await env.DB.batch([env.DB.prepare(`UPDATE gateway_deliveries SET state=?,provider_id=?,error_code=?,next_at=?,updated_at=? WHERE id=? AND state='sending'`).bind(result.state,result.id||null,result.code||null,now+60000,now,key)]);
    existing=(await row(env,key))!;
    if(existing.state==='retry')return reply(503,{error:'provider_rate_limited'});
    return reply(200,receipt(existing,now));
  }catch(error){return reply(error instanceof RangeError?413:error instanceof InvalidRequest||error instanceof SyntaxError?400:503,{error:'gateway_request_failed'});}
}
/** Poll receipts only. Retrying a send must return through the booking runner's
 * current version/acknowledgment/deadline/quiet-hour authorization checks. */
export async function reconcileGateway(env:GatewayEnv,fetcher:typeof fetch=fetch,now=Date.now()){
  if(env.GATEWAY_DELIVERY_ENABLED!=='true'||!env.DB)return;
  const rows=(await env.DB.batch<Row>([env.DB.prepare("SELECT * FROM gateway_deliveries WHERE state='accepted' AND provider_id IS NOT NULL AND next_at<=? ORDER BY next_at LIMIT 20").bind(now)]))[0].results;
  for(const r of rows){const m=JSON.parse(r.payload_json) as Message;const result=await poll(m.channel,r.provider_id!,env,fetcher);await env.DB.batch([env.DB.prepare("UPDATE gateway_deliveries SET state=?,error_code=?,next_at=?,updated_at=? WHERE id=? AND state='accepted' AND provider_id=?").bind(result.state,result.code||null,now+300000,now,r.id,r.provider_id)]);}
  await env.DB.batch([env.DB.prepare("UPDATE gateway_deliveries SET state='uncertain',error_code='interrupted_provider_handoff',updated_at=? WHERE state='sending' AND updated_at<=?").bind(now,now-30000)]);
}
export default {fetch:(request:Request,env:GatewayEnv)=>handleGateway(request,env,fetch,Date.now(),Date.now),scheduled:(_event:unknown,env:GatewayEnv,ctx:{waitUntil(p:Promise<unknown>):void})=>ctx.waitUntil(reconcileGateway(env))};

/** Svix/Resend signatures authenticate raw bytes, timestamps and message IDs.
 * No raw webhook payload, email address or customer data is logged or retained. */
export async function handleWebhook(request:Request,env:GatewayEnv,now=Date.now()):Promise<Response>{
  if(request.method!=='POST')return reply(405,{error:'method_not_allowed'});
  if(!env.RESEND_WEBHOOK_SECRET?.startsWith('whsec_')||!env.DB)return reply(503,{error:'webhook_not_configured'});
  try{
    const id=request.headers.get('svix-id')||'',time=request.headers.get('svix-timestamp')||'',signature=request.headers.get('svix-signature')||'';
    if(!/^[A-Za-z0-9_-]{1,200}$/.test(id)||!/^\d{10}$/.test(time)||Math.abs(now-Number(time)*1000)>300000||signature.length>2000)return reply(403,{error:'invalid_signature'});
    const raw=await bodyText(request);
    const secret=Uint8Array.from(atob(env.RESEND_WEBHOOK_SECRET.slice(6)),c=>c.charCodeAt(0));
    const key=await crypto.subtle.importKey('raw',secret,{name:'HMAC',hash:'SHA-256'},false,['verify']);
    const signed=new TextEncoder().encode(id+'.'+time+'.'+raw);
    let verified=false;
    for(const item of signature.split(' ')){const [version,value]=item.split(',');if(version==='v1'&&value){try{if(await crypto.subtle.verify('HMAC',key,Uint8Array.from(atob(value),c=>c.charCodeAt(0)),signed))verified=true;}catch{}}}
    if(!verified)return reply(403,{error:'invalid_signature'});
    const event=JSON.parse(raw) as {type?:string;data?:{email_id?:string;tags?:Record<string,string>|{name:string;value:string}[]}};
    const data=event.data;const delivery=Array.isArray(data?.tags)?data.tags.find(t=>t.name==='onp_delivery')?.value:data?.tags?.onp_delivery;
    if(!delivery||!/^[A-Za-z0-9_-]{16,128}$/.test(delivery)||!data?.email_id||!/^[A-Za-z0-9_-]{1,100}$/.test(data.email_id))return reply(200,{received:true});
    const existing=await row(env,delivery);if(!existing)return reply(200,{received:true});
    if(existing.provider_id&&existing.provider_id!==data.email_id)return reply(409,{error:'receipt_identity_mismatch'});
    const state=event.type==='email.delivered'?'delivered':['email.bounced','email.complained','email.failed','email.suppressed'].includes(event.type||'')?'failed':event.type==='email.sent'?'accepted':null;
    if(!state)return reply(200,{received:true});
    await env.DB.batch([
      env.DB.prepare(`UPDATE gateway_deliveries SET state=?,provider_id=?,error_code=?,updated_at=?,next_at=? WHERE id=? AND NOT EXISTS(SELECT 1 FROM gateway_webhook_receipts WHERE id=?) AND (state IN ('sending','accepted','uncertain') OR (?='failed' AND state='delivered'))`).bind(state,data.email_id,state==='failed'?'provider_delivery_failed':null,now,now+300000,delivery,id,state),
      env.DB.prepare('INSERT INTO gateway_webhook_receipts(id,received_at) VALUES(?,?) ON CONFLICT(id) DO NOTHING').bind(id,now),
    ]);
    return reply(200,{received:true});
  }catch{return reply(400,{error:'invalid_webhook'});}
}
