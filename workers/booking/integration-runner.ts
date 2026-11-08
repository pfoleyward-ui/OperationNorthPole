import {customerEmailState,customerEmailText} from './customer-email.ts';
import {digest} from './shared.ts';
import { policy,quietAdjusted,target,mrsConsent,origin,stableHashKey,IntegrationError,type IntegrationEnv,type Recipient,type Target } from './integration-config.ts';
import { cycleId,desiredCalendar,planBooking,planResolutions,snapshot,type Cycle,type Job } from './integration-plan.ts';
import { synchronizeCalendar } from './google.ts';

const NEVER=253402300799999;
const titles={customer_update:'An update about your SantaBlizard booking',new_request:'A new letter has arrived!',confirmation:'A little Christmas magic is confirmed',seven_days:'An upcoming sleigh stop needs a look',twenty_four_hours:'A Gentle Jingle',three_hours:'Your pre-event sleigh check',morning:'Today’s Christmas magic',escalation_2:'The Elves Are Concerned',escalation_3:'Mrs. Claus Has Been Notified',escalation_4:'Santa Is Officially in the Doghouse',resolution:'The sleigh check is resolved'};
const escalationKinds=['twenty_four_hours','escalation_2','escalation_3','escalation_4'];
async function settle(env:IntegrationEnv,job:Job,state:string,now:number,code:string|null=null,providerId:string|null=null){
  const next=state==='accepted'||state==='blocked'?now+60000:state==='uncertain'?now+900000:state==='retry'||state==='unknown'?now+Math.min(3600000,30000*2**Math.min(job.attempts,7)):NEVER;
  await env.DB.batch([env.DB.prepare(`UPDATE integration_jobs SET state=?,next_at=?,claim_token=NULL,claim_until=NULL,error_code=?,provider_id=COALESCE(?,provider_id),
    accepted_at=CASE WHEN ? IN ('accepted','delivered') THEN COALESCE(accepted_at,?) ELSE accepted_at END,updated_at=? WHERE id=? AND claim_token=? AND state='sending'`)
    .bind(state,next,code,providerId,state,now,now,job.id,job.claim_token)]);
  if(state==='accepted'||state==='delivered'){
    if(job.kind==='twenty_four_hours'&&job.cycle_id)await env.DB.batch([env.DB.prepare('UPDATE integration_cycles SET level1_sent_at=COALESCE(level1_sent_at,?) WHERE id=?').bind(job.dispatched_at||now,job.cycle_id)]);
    await planResolutions(env,job.booking_id,now);
  }
}
async function attempt(env:IntegrationEnv,job:Job,now:number):Promise<boolean>{
  const result=(await env.DB.batch<{attempts:number}>([env.DB.prepare("UPDATE integration_jobs SET attempts=attempts+1,updated_at=? WHERE id=? AND claim_token=? AND state='sending' RETURNING attempts").bind(now,job.id,job.claim_token)]))[0].results[0];
  if(result)job.attempts=result.attempts;
  return !!result;
}
type Verdict={state:'ok'|'canceled'|'expired'|'retry'|'blocked';code?:string;next?:number;version?:number};
async function eligibility(env:IntegrationEnv,job:Job,now:number):Promise<Verdict>{
  const s=await snapshot(env.DB,job.booking_id);if(!s)return {state:'canceled',code:'booking_removed'};
  if(job.kind==='customer_update'){const state=customerEmailState(s);return env.CUSTOMER_EMAIL_ENABLED==='true'&&state&&await digest(env.INTAKE_HMAC_SECRET!,state)===job.calendar_hash?{state:'ok',version:s.state.version}:{state:'canceled',code:'customer_update_superseded'};}
  if(job.kind==='new_request')return {state:'ok',version:s.state.version};
  const c=job.cycle_id?await env.DB.prepare('SELECT * FROM integration_cycles WHERE id=?').bind(job.cycle_id).first<Cycle>():null;
  if(job.kind==='resolution')return c?.state==='resolved'?{state:'ok',version:s.state.version}:{state:'canceled',code:'not_resolved'};
  const required=await env.DB.prepare('SELECT 1 AS ok FROM integration_plans p WHERE p.booking_id=? AND ? IN (SELECT value FROM json_each(p.required_job_ids))').bind(job.booking_id,job.id).first();
  if(!required)return {state:'canceled',code:'policy_changed'};
  if(s.state.status!=='confirmed'||!s.state.quote||!c||await cycleId(s,env.INTAKE_HMAC_SECRET!)!==job.cycle_id)return {state:'canceled',code:'appointment_changed'};
  if(now>=s.state.quote.start||now>=job.expires_at)return {state:'expired',code:'event_started'};
  const level=escalationKinds.indexOf(job.kind);
  if(level>=0){
    if(c.acknowledged_at!==null||c.state!=='active')return {state:'canceled',code:'acknowledged'};
    if(level>0){
      const previous=await env.DB.prepare('SELECT dispatched_at,accepted_at FROM integration_jobs WHERE cycle_id=? AND kind=?').bind(c.id,escalationKinds[level-1]).first<{dispatched_at:number|null;accepted_at:number|null}>();
      const p=policy(env);
      // Normal offsets are measured from Level 1. Deferred stages retain their
      // configured step spacing when a previous message was dispatched. Provider
      // failure must not suppress Mrs. Claus or the final technical fallback.
      const base=c.level1_sent_at||c.ack_due;
      if(base===null)return {state:'canceled',code:'acknowledgment_not_applicable'};
      const due=quietAdjusted(Math.max(base+p.escalationMinutes[level]*60000,previous?.dispatched_at?previous.dispatched_at+(p.escalationMinutes[level]-p.escalationMinutes[level-1])*60000:base+p.escalationMinutes[level]*60000),p);
      if(due>=c.start_at)return {state:'expired',code:'no_pre_event_window'};
      if(now<due)return {state:'retry',code:'escalation_not_due',next:due};
    }
  }
  return {state:'ok',version:s.state.version};
}
async function defer(env:IntegrationEnv,job:Job,verdict:Verdict,now:number){
  await settle(env,job,verdict.state,now,verdict.code||null);
  if(verdict.next)await env.DB.batch([env.DB.prepare("UPDATE integration_jobs SET next_at=? WHERE id=? AND state='retry'").bind(verdict.next,job.id)]);
}
type GatewayResult={status:'not_found'|'accepted'|'delivered'|'failed'|'uncertain';idempotencyKey:string;providerId?:string};
async function gatewayResult(response:Response,key:string):Promise<GatewayResult>{
  if(!response.ok)throw new IntegrationError('notification_gateway_retry');
  const value=await response.json() as GatewayResult;
  if(value.idempotencyKey!==key||!['not_found','accepted','delivered','failed','uncertain'].includes(value.status)||(value.providerId!==undefined&&(typeof value.providerId!=='string'||!/^[A-Za-z0-9_.:-]{1,200}$/.test(value.providerId))))throw new IntegrationError('notification_gateway_invalid_response');
  return value;
}
async function outcome(env:IntegrationEnv,job:Job,result:GatewayResult,now:number){
  if(result.status==='accepted'||result.status==='delivered')await settle(env,job,result.status,now,null,result.providerId||null);
  else if(result.status==='uncertain')await settle(env,job,'uncertain',now,'gateway_delivery_uncertain',result.providerId||null);
  else if(result.status==='failed')await settle(env,job,'failed',now,'provider_delivery_failed',result.providerId||null);
}
async function notification(env:IntegrationEnv,job:Job,now:number,clock:()=>number){
  if(env.NOTIFICATION_DELIVERY_ENABLED!=='true'){await settle(env,job,'blocked',now,'notification_delivery_disabled');return;}
  if(!env.NOTIFY){await settle(env,job,'blocked',now,'notification_gateway_not_configured');return;}
  if(!await attempt(env,job,now))return;
  // A gateway must durably implement lookup + idempotent acceptance for each key.
  // After a timeout we look up that same key; we never blindly resend an email.
  const lookup=await gatewayResult(await env.NOTIFY.fetch(new Request('https://notify.internal/deliveries/'+job.id,{signal:AbortSignal.timeout(8000),redirect:'error'})),job.id);
  if(lookup.status!=='not_found'){await outcome(env,job,lookup,clock());return;}
  if(job.accepted_at!==null||job.error_code==='gateway_delivery_uncertain'||job.attempts>=8){await settle(env,job,'uncertain',now,'accepted_receipt_missing');return;}
  now=clock();
  const verdict=await eligibility(env,job,now);if(verdict.state!=='ok'){await defer(env,job,verdict,now);return;}
  const quiet=quietAdjusted(now,policy(env));
  if(quiet>now){
    if(quiet>=job.expires_at){await settle(env,job,'expired',now,'no_pre_event_window');return;}
    await defer(env,job,{state:'retry',code:'quiet_hours',next:quiet},now);return;
  }
  const recipient=job.recipient as Recipient;
  let configured:Target|null=job.target_key&&job.channel?{recipientKey:job.target_key,channel:job.channel}:target(env,recipient);
  if(recipient==='customer'){configured={recipientKey:'customer_'+job.booking_id,channel:'email'};}
  if(configured&&configured.channel!=='email'){await settle(env,job,'blocked',now,'email_only');return;}
  if(!configured){await settle(env,job,'blocked',now,'recipient_not_configured');return;}
  if(recipient==='mrs_claus'&&(!mrsConsent(env,configured.recipientKey,now)||configured.channel!=='email')){await settle(env,job,'blocked',now,'mrs_claus_consent_required');return;}
  const text=job.kind==='resolution'?'The sleigh check is resolved. No booking was canceled by the reminder system.':job.kind==='twenty_four_hours'?'Santa, please open this booking and tap Got It! to acknowledge your pre-event check.':job.kind.startsWith('escalation_')?'Santa has not acknowledged this sleigh check yet. Please use the secure desk for details.':'A little Christmas planning is ready for your attention. Open the secure desk for details.';
  const customer=recipient==='customer'?await snapshot(env.DB,job.booking_id):null;
  const payload=job.payload_json||JSON.stringify({idempotencyKey:job.id,expiresAt:job.expires_at,recipientKey:configured.recipientKey,channel:configured.channel,subject:titles[job.kind as keyof typeof titles],text:customer?customerEmailText(customer):text+'\n'+origin(env)+'/hq?booking='+job.booking_id+'#reminders',...(customer?{customerState:customerEmailState(customer)}:{})});
  // Atomic dispatch authorization closes the ack-vs-claim race. A message already
  // handed to a provider may finish in flight; its receipt creates a resolution.
  const clause=escalationKinds.includes(job.kind)?'AND EXISTS(SELECT 1 FROM integration_cycles WHERE id=? AND acknowledged_at IS NULL AND state=\'active\')':'';
  const values:(string|number|null)[]=[configured.recipientKey,configured.channel,payload,now,now,job.id,job.claim_token,job.booking_id,verdict.version!];
  if(clause)values.push(job.cycle_id);
  const authorization=[env.DB.prepare(`UPDATE integration_jobs SET target_key=?,channel=?,payload_json=COALESCE(payload_json,?),dispatched_at=COALESCE(dispatched_at,?),updated_at=? WHERE id=? AND claim_token=? AND state='sending'
    AND EXISTS(SELECT 1 FROM booking_requests b LEFT JOIN hq_bookings h ON h.booking_id=b.id WHERE b.id=? AND COALESCE(h.version,1)=?) ${clause} RETURNING id`).bind(...values)];
  if(job.kind==='twenty_four_hours')authorization.push(env.DB.prepare(`UPDATE integration_cycles SET level1_sent_at=COALESCE(level1_sent_at,?) WHERE id=? AND EXISTS(SELECT 1 FROM integration_jobs WHERE id=? AND claim_token=? AND state='sending' AND dispatched_at IS NOT NULL)`).bind(now,job.cycle_id,job.id,job.claim_token));
  const allowed=(await env.DB.batch<{id:string}>(authorization))[0].results.length===1;
  if(!allowed){await settle(env,job,'canceled',now,'dispatch_no_longer_authorized');return;}
  job.dispatched_at=job.dispatched_at||now;
  const result=await gatewayResult(await env.NOTIFY.fetch(new Request('https://notify.internal/deliveries/'+job.id,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':job.id},body:payload,redirect:'error',signal:AbortSignal.timeout(8000)})),job.id);
  if(result.status==='not_found')throw new IntegrationError('notification_gateway_invalid_response');
  await outcome(env,job,result,clock());
}
export async function processJob(env:IntegrationEnv,id:string,now:number,fetcher:typeof fetch=fetch,clock:()=>number=()=>now){
  const token=crypto.randomUUID();
  const job=(await env.DB.batch<Job>([env.DB.prepare(`UPDATE integration_jobs SET state='sending',claim_token=?,claim_until=?,updated_at=? WHERE id=? AND due_at<=? AND next_at<=?
    AND (state IN ('queued','retry','unknown','accepted','blocked') OR (state='uncertain' AND kind<>'calendar') OR (state='sending' AND claim_until<=?)) RETURNING *`).bind(token,now+120000,now,id,now,now,now)]))[0].results[0];
  if(!job)return;
  try{
    if(job.kind==='calendar'){
      if(env.CALENDAR_SYNC_ENABLED!=='true'){await settle(env,job,'blocked',now,'calendar_sync_disabled');return;}
      if(!await attempt(env,job,now))return;
      const result=await synchronizeCalendar(env,job,fetcher,now);await settle(env,job,result==='synced'?'delivered':'canceled',now,result==='synced'?null:'appointment_changed');
    }else await notification(env,job,now,clock);
  }catch(error){
    const code=error instanceof IntegrationError?error.code:'provider_outcome_unknown';
    const blocked=['google_not_connected','calendar_not_configured','google_not_configured','google_reauthorization_required','token_decryption_failed','token_encryption_not_configured','calendar_event_ownership_mismatch','google_connection_changed'].includes(code);
    await settle(env,job,blocked?'blocked':job.attempts>=8?'uncertain':job.kind==='calendar'?'retry':'unknown',clock(),code);
  }
}
export async function runIntegrations(env:IntegrationEnv,now=Date.now(),fetcher:typeof fetch=fetch,clock:()=>number=()=>now){
  if(env.INTEGRATION_PLANNER_ENABLED!=='true')return {disabled:true,processed:0};
  await stableHashKey(env);
  policy(env);origin(env);
  const outbox=(await env.DB.batch<{source:'intake'|'hq';source_id:string;booking_id:string}>([env.DB.prepare(`SELECT 'intake' AS source,o.booking_id AS source_id,o.booking_id FROM booking_outbox o WHERE NOT EXISTS(SELECT 1 FROM integration_outbox_receipts r WHERE r.source='intake' AND r.source_id=o.booking_id)
    UNION ALL SELECT 'hq',o.operation_id,o.booking_id FROM hq_event_outbox o WHERE NOT EXISTS(SELECT 1 FROM integration_outbox_receipts r WHERE r.source='hq' AND r.source_id=o.operation_id) LIMIT 50`)]))[0].results;
  for(const row of outbox)if(await planBooking(env,row.booking_id,now))await env.DB.batch([env.DB.prepare('INSERT INTO integration_outbox_receipts (source,source_id,booking_id,processed_at) VALUES (?,?,?,?) ON CONFLICT(source,source_id) DO NOTHING').bind(row.source,row.source_id,row.booking_id,now)]);
  const cursor=await env.DB.prepare("SELECT value FROM integration_control WHERE key='reconcile_cursor'").first<{value:string}>();
  const page=(await env.DB.batch<{id:string}>([env.DB.prepare('SELECT id FROM booking_requests WHERE id>? ORDER BY id LIMIT 25').bind(cursor?.value||'')]))[0].results;
  for(const row of page)await planBooking(env,row.id,now);
  await env.DB.batch([env.DB.prepare("INSERT INTO integration_control (key,value) VALUES ('reconcile_cursor',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(page.length===25?page.at(-1)!.id:'')]);
  const due=(await env.DB.batch<{id:string}>([env.DB.prepare(`SELECT id FROM integration_jobs WHERE due_at<=? AND next_at<=? AND (state IN ('queued','retry','unknown','accepted','blocked') OR (state='uncertain' AND kind<>'calendar') OR (state='sending' AND claim_until<=?)) ORDER BY next_at,id LIMIT 20`).bind(now,now,now)]))[0].results;
  for(const row of due)await processJob(env,row.id,clock(),fetcher,clock);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM integration_control WHERE key='last_runner_error'"),
    env.DB.prepare("INSERT INTO integration_control (key,value) VALUES ('last_runner_success',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(clock())),
  ]);
  return {disabled:false,processed:due.length};
}
export default {
  fetch(){return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});},
  scheduled(_event:unknown,env:IntegrationEnv,ctx:{waitUntil(promise:Promise<unknown>):void}){ctx.waitUntil(runIntegrations(env,Date.now(),fetch,Date.now).catch(async(error)=>{if(env.INTEGRATION_PLANNER_ENABLED==='true')await env.DB.batch([env.DB.prepare("INSERT INTO integration_control (key,value) VALUES ('last_runner_error',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify({code:error instanceof IntegrationError?error.code:'integration_run_failed',at:Date.now()}))]);}).catch(()=>undefined));},
};
