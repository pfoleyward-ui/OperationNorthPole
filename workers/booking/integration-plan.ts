import { canonical,digest } from './shared.ts';
import { HqError } from './hq-service.ts';
import type { HqState } from './hq-service.ts';
import type { BookingRequest } from '../../src/domain/booking/request.ts';
import { localParts } from '../../src/domain/booking/time.ts';
import { policy,quietAdjusted,wall,stableHashKey, type IntegrationEnv,type Kind,type Recipient } from './integration-config.ts';
import type { Database,Statement } from './repository.ts';
import type { Principal } from './auth.ts';

export type Snapshot={id:string;request:BookingRequest;state:HqState;receivedAt:number;confirmedAt:number;wasConfirmed:boolean};
export type Cycle={id:string;booking_id:string;start_at:number;end_at:number;confirmed_at:number;ack_due:number|null;level1_sent_at:number|null;state:'active'|'resolved';acknowledged_at:number|null;resolved_reason:string|null};
export type Job={id:string;booking_id:string;cycle_id:string|null;kind:Kind;recipient:Recipient|'google';target_key:string|null;channel:'email'|'sms'|null;calendar_hash:string|null;due_at:number;expires_at:number;next_at:number;state:string;attempts:number;claim_token:string|null;claim_until:number|null;dispatched_at:number|null;accepted_at:number|null;provider_id:string|null;payload_json:string|null;error_code:string|null;updated_at:number};
const NEVER=253402300799999;
export async function snapshot(db:Database,id:string):Promise<Snapshot|null>{
  const row=await db.prepare(`SELECT b.id,b.request_json,b.received_at,h.state_json,
    EXISTS(SELECT 1 FROM hq_operations o WHERE o.booking_id=b.id AND o.action='confirm') AS was_confirmed
    FROM booking_requests b LEFT JOIN hq_bookings h ON b.id=h.booking_id WHERE b.id=?`).bind(id).first<{id:string;request_json:string;received_at:number;state_json:string|null;was_confirmed:number}>();
  if(!row)return null;
  const request=JSON.parse(row.request_json) as BookingRequest;
  const state: HqState=row.state_json?JSON.parse(row.state_json):{id,serviceId:request.serviceId,status:'pending',version:1};
  let confirmedAt=row.received_at;
  if(state.quote){const confirmation=await db.prepare(`SELECT MAX(occurred_at) AS at FROM hq_operations WHERE booking_id=? AND action IN ('confirm','apply_reschedule') AND json_extract(response_json,'$.quote.id')=? AND json_extract(response_json,'$.quote.revision')=?`).bind(id,state.quote.id,state.quote.revision).first<{at:number|null}>();if(confirmation?.at)confirmedAt=confirmation.at;}
  return {id,request,state,receivedAt:row.received_at,confirmedAt,wasConfirmed:row.was_confirmed===1};
}
export async function cycleId(s:Snapshot,secret:string):Promise<string>{return digest(secret,`cycle:${s.id}:${s.state.quote!.id}:${s.state.quote!.revision}:${s.state.quote!.start}:${s.state.quote!.end}`);}
export async function desiredCalendar(s:Snapshot,env:IntegrationEnv):Promise<string|null>{
  if(s.state.status==='confirmed'&&s.state.quote)return digest(env.INTAKE_HMAC_SECRET!,canonical({id:s.id,service:s.state.serviceId,start:s.state.quote.start,end:s.state.quote.end,location:s.request.location}));
  if(s.state.status==='canceled'&&s.wasConfirmed)return digest(env.INTAKE_HMAC_SECRET!,`delete:${s.id}`);
  return null; // Completed history stays on Google; no new event is created for it.
}
const gate='EXISTS(SELECT 1 FROM booking_requests b LEFT JOIN hq_bookings h ON b.id=h.booking_id WHERE b.id=? AND COALESCE(h.version,1)=?)';
export async function planBooking(env:IntegrationEnv,id:string,now:number):Promise<boolean>{
  await stableHashKey(env);
  const s=await snapshot(env.DB,id);if(!s)return false;
  const p=policy(env),secret=env.INTAKE_HMAC_SECRET!;
  const cycle=s.state.status==='confirmed'&&s.state.quote?await cycleId(s,secret):null;
  const hash=await desiredCalendar(s,env);
  const policyHash=await digest(secret,canonical(p));
  const prior=await env.DB.prepare('SELECT booking_version,calendar_hash,policy_hash,required_job_ids FROM integration_plans WHERE booking_id=?').bind(id).first<{booking_version:number;calendar_hash:string|null;policy_hash:string;required_job_ids:string}>();
  const present=prior?await env.DB.prepare('SELECT COUNT(*) AS n FROM integration_jobs WHERE id IN (SELECT value FROM json_each(?))').bind(prior.required_job_ids).first<{n:number}>():null;
  if(prior?.booking_version===s.state.version&&prior.calendar_hash===hash&&prior.policy_hash===policyHash&&present?.n===(JSON.parse(prior.required_job_ids) as string[]).length){
    // Round-robin reconciliation must not rewrite every future reminder each
    // minute. Only due calendar verification and missing resolutions need work.
    if(hash)await env.DB.batch([env.DB.prepare("UPDATE integration_jobs SET state='queued',next_at=? WHERE booking_id=? AND kind='calendar' AND calendar_hash=? AND state='delivered' AND updated_at<=?").bind(now,id,hash,now-p.reconcileMinutes*60000)]);
    await planResolutions(env,id,now);return true;
  }
  const q=s.state.quote;
  const statements:Statement[]=[];
  let ackDue:number|null=null;
  if(cycle&&q){const target=quietAdjusted(q.start-p.acknowledgmentHours*3600000,p);if(q.start-p.acknowledgmentHours*3600000>=s.confirmedAt&&target<q.start)ackDue=target;
    statements.push(env.DB.prepare(`INSERT INTO integration_cycles (id,booking_id,start_at,end_at,confirmed_at,ack_due,state)
      SELECT ?,?,?,?,?,?,'active' WHERE ${gate} ON CONFLICT(id) DO UPDATE SET ack_due=excluded.ack_due WHERE integration_cycles.state='active' AND integration_cycles.level1_sent_at IS NULL`)
      .bind(cycle,id,q.start,q.end,s.confirmedAt,ackDue,id,s.state.version));
  }
  statements.push(
    env.DB.prepare(`UPDATE integration_cycles SET state='resolved',resolved_reason=? WHERE booking_id=? AND state='active' AND id<>? AND ${gate}`).bind(s.state.status==='canceled'?'booking_canceled':s.state.status==='completed'?'event_completed':'appointment_changed',id,cycle||'',id,s.state.version),
    env.DB.prepare(`UPDATE integration_jobs SET state='canceled',error_code='appointment_changed',updated_at=? WHERE booking_id=? AND state IN ('queued','retry','blocked') AND ((cycle_id IS NOT NULL AND cycle_id<>? AND kind<>'resolution') OR (kind='calendar' AND COALESCE(calendar_hash,'')<>?)) AND ${gate}`).bind(now,id,cycle||'',hash||'',id,s.state.version),
  );
  type Spec={kind:Kind;recipient:Job['recipient'];due:number;expires:number;cycle:string|null;hash?:string};
  const specs:Spec[]=[{kind:'new_request',recipient:'santa',due:quietAdjusted(s.receivedAt,p),expires:NEVER,cycle:null}];
  if(hash)specs.push({kind:'calendar',recipient:'google',due:s.confirmedAt,expires:NEVER,cycle:null,hash});
  if(cycle&&q){
    const add=(kind:Kind,target:number,recipient:Job['recipient']='santa')=>{const due=quietAdjusted(target,p);if(target>=s.confirmedAt&&due<q.start)specs.push({kind,recipient,due,expires:q.start,cycle});};
    add('confirmation',s.confirmedAt);add('seven_days',q.start-p.sevenDayHours*3600000);add('twenty_four_hours',q.start-p.acknowledgmentHours*3600000);add('three_hours',q.start-p.finalReminderHours*3600000);
    const morning=wall(localParts(q.start).date,p.morningTime);if(morning!==null)add('morning',morning);
    if(ackDue!==null){add('escalation_2',ackDue+p.escalationMinutes[1]*60000);add('escalation_3',ackDue+p.escalationMinutes[2]*60000,'mrs_claus');add('escalation_4',ackDue+p.escalationMinutes[3]*60000,'technical_admin');}
  }
  const requiredIds:string[]=[];
  for(const spec of specs){
    const jobId=await digest(secret,`job:${id}:${spec.cycle||''}:${spec.kind}:${spec.hash||''}`);
    requiredIds.push(jobId);
    statements.push(env.DB.prepare(`INSERT INTO integration_jobs (id,booking_id,cycle_id,kind,recipient,calendar_hash,due_at,expires_at,next_at,state,updated_at)
      SELECT ?,?,?,?,?,?,?,?,?,'queued',? WHERE ${gate}
      ON CONFLICT(id) DO UPDATE SET due_at=excluded.due_at,expires_at=excluded.expires_at,
        next_at=CASE WHEN integration_jobs.state='canceled' AND integration_jobs.error_code='policy_changed' THEN excluded.due_at WHEN integration_jobs.kind='calendar' AND integration_jobs.state='delivered' AND integration_jobs.updated_at<=? THEN excluded.next_at WHEN integration_jobs.due_at<>excluded.due_at THEN excluded.due_at ELSE integration_jobs.next_at END,
        state=CASE WHEN integration_jobs.kind='calendar' AND integration_jobs.state='delivered' AND integration_jobs.updated_at<=? THEN 'queued' WHEN integration_jobs.state='canceled' AND integration_jobs.error_code='policy_changed' THEN 'queued' ELSE integration_jobs.state END
      WHERE integration_jobs.state IN ('queued','retry','blocked') OR (integration_jobs.state='canceled' AND integration_jobs.error_code='policy_changed') OR (integration_jobs.kind='calendar' AND integration_jobs.state='delivered')`)
      .bind(jobId,id,spec.cycle,spec.kind,spec.recipient,spec.hash||null,spec.due,spec.expires,spec.due,now,id,s.state.version,now-p.reconcileMinutes*60000,now-p.reconcileMinutes*60000));
  }
  statements.push(env.DB.prepare(`UPDATE integration_jobs SET state='canceled',error_code='policy_changed',updated_at=? WHERE booking_id=? AND cycle_id=? AND kind<>'resolution' AND state IN ('queued','retry','blocked') AND id NOT IN (${requiredIds.map(()=>'?').join(',')}) AND ${gate}`).bind(now,id,cycle,...requiredIds,id,s.state.version));
  statements.push(env.DB.prepare(`INSERT INTO integration_plans (booking_id,booking_version,cycle_id,calendar_hash,policy_hash,required_job_ids,planned_at) SELECT ?,?,?,?,?,?,? WHERE ${gate}
    ON CONFLICT(booking_id) DO UPDATE SET booking_version=excluded.booking_version,cycle_id=excluded.cycle_id,calendar_hash=excluded.calendar_hash,policy_hash=excluded.policy_hash,required_job_ids=excluded.required_job_ids,planned_at=excluded.planned_at WHERE integration_plans.booking_version<=excluded.booking_version RETURNING booking_version`).bind(id,s.state.version,cycle,hash,policyHash,JSON.stringify(requiredIds),now,id,s.state.version));
  const result=await env.DB.batch<{booking_version:number}>(statements);
  if(result.some(r=>!r.success))throw new Error('Planning failed');
  const applied=result.at(-1)!.results.length===1;
  if(applied)await planResolutions(env,id,now);
  return applied;
}
export async function planResolutions(env:IntegrationEnv,id:string,now:number){
  const rows=(await env.DB.batch<{cycle_id:string;recipient:Recipient;target_key:string;channel:'email'|'sms'}>([env.DB.prepare(`SELECT DISTINCT j.cycle_id,j.recipient,j.target_key,j.channel FROM integration_jobs j JOIN integration_cycles c ON c.id=j.cycle_id
    WHERE j.booking_id=? AND c.state='resolved' AND j.kind IN ('twenty_four_hours','escalation_2','escalation_3','escalation_4') AND j.accepted_at IS NOT NULL AND j.target_key IS NOT NULL`).bind(id)]))[0].results;
  for(const row of rows){const jobId=await digest(env.INTAKE_HMAC_SECRET!,`resolved:${row.cycle_id}:${row.recipient}:${row.target_key}:${row.channel}`);
    await env.DB.batch([env.DB.prepare(`INSERT INTO integration_jobs (id,booking_id,cycle_id,kind,recipient,target_key,channel,due_at,expires_at,next_at,state,updated_at) VALUES (?,?,?,'resolution',?,?,?,?,?,?,'queued',?) ON CONFLICT(id) DO NOTHING`).bind(jobId,id,row.cycle_id,row.recipient,row.target_key,row.channel,quietAdjusted(now,policy(env)),NEVER,quietAdjusted(now,policy(env)),now)]);
  }
}
export async function acknowledge(env:IntegrationEnv,id:string,cycle:string,principal:Principal,now:number){
  if(principal.role!=='santa')throw new HqError(403,'santa_acknowledgment_required');
  await stableHashKey(env);
  const s=await snapshot(env.DB,id);const expected=s?.state.status==='confirmed'?await cycleId(s,env.INTAKE_HMAC_SECRET!):null;
  const current=await env.DB.prepare('SELECT * FROM integration_cycles WHERE id=? AND booking_id=?').bind(cycle,id).first<Cycle>();
  if(!current||expected!==cycle)throw new HqError(409,'appointment_changed');
  if(current.acknowledged_at!==null){await planResolutions(env,id,now);return {acknowledged:true};}
  if(current.state!=='active'||current.ack_due===null||now<current.ack_due)throw new HqError(409,'acknowledgment_not_due');
  await env.DB.batch([
    env.DB.prepare(`UPDATE integration_cycles SET acknowledged_at=?,acknowledged_by=?,state='resolved',resolved_reason='acknowledged' WHERE id=? AND state='active' AND ${gate}`).bind(now,principal.sub,cycle,id,s!.state.version),
    env.DB.prepare(`INSERT INTO integration_acknowledgments (cycle_id,actor_sub,occurred_at) SELECT id,?,? FROM integration_cycles WHERE id=? AND acknowledged_at IS NOT NULL ON CONFLICT(cycle_id) DO NOTHING`).bind(principal.sub,now,cycle),
    env.DB.prepare(`UPDATE integration_jobs SET state='canceled',error_code='acknowledged',updated_at=? WHERE cycle_id=? AND kind IN ('twenty_four_hours','escalation_2','escalation_3','escalation_4') AND state IN ('queued','retry','blocked') AND EXISTS(SELECT 1 FROM integration_cycles WHERE id=? AND acknowledged_at IS NOT NULL)`).bind(now,cycle,cycle),
  ]);
  const done=await env.DB.prepare('SELECT acknowledged_at FROM integration_cycles WHERE id=?').bind(cycle).first<{acknowledged_at:number|null}>();
  if(!done?.acknowledged_at)throw new HqError(409,'appointment_changed');
  await planResolutions(env,id,now);
  return {acknowledged:true};
}
