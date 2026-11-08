import type { Principal } from './auth.ts';
import type { IntegrationEnv } from './integration-config.ts';
import { policy } from './integration-config.ts';
import { acknowledge,cycleId,planBooking,snapshot,type Cycle } from './integration-plan.ts';
import { beginGoogle,disconnectGoogle,finishGoogle,googleStatus,setupCalendar } from './google.ts';
import { HqError } from './hq-service.ts';
import { record } from '../../src/domain/booking/request.ts';

export async function integrationRead(env:IntegrationEnv,path:string,principal:Principal,now:number):Promise<unknown|undefined>{
  if(path==='/hq/api/integrations/status'){
    const error=await env.DB.prepare("SELECT value FROM integration_control WHERE key='last_runner_error'").first<{value:string}>();
    return {google:await googleStatus(env),plannerEnabled:env.INTEGRATION_PLANNER_ENABLED==='true',notificationDeliveryEnabled:env.NOTIFICATION_DELIVERY_ENABLED==='true',policy:policy(env),runnerError:error?JSON.parse(error.value):null};
  }
  const match=/^\/hq\/api\/bookings\/([0-9a-f-]{36})\/delivery$/.exec(path);
  if(!match)return undefined;
  const s=await snapshot(env.DB,match[1]);if(!s)throw new HqError(404,'not_found');
  const id=s.state.status==='confirmed'&&s.state.quote&&env.INTAKE_HMAC_SECRET?await cycleId(s,env.INTAKE_HMAC_SECRET):null;
  const c=id?await env.DB.prepare('SELECT * FROM integration_cycles WHERE id=?').bind(id).first<Cycle>():null;
  const jobs=(await env.DB.batch([env.DB.prepare(`SELECT id,kind,recipient,channel,state,due_at,attempts,error_code,accepted_at FROM integration_jobs WHERE booking_id=? ORDER BY updated_at DESC,id LIMIT 100`).bind(s.id)]))[0].results;
  return {plannerEnabled:env.INTEGRATION_PLANNER_ENABLED==='true',notificationDeliveryEnabled:env.NOTIFICATION_DELIVERY_ENABLED==='true',calendarSyncEnabled:env.CALENDAR_SYNC_ENABLED==='true',policy:policy(env),
    cycle:c?{id:c.id,ackDue:c.ack_due,acknowledgedAt:c.acknowledged_at,state:c.state,canAcknowledge:principal.role==='santa'&&c.ack_due!==null&&now>=c.ack_due&&c.acknowledged_at===null&&c.state==='active'}:null,jobs};
}
export async function integrationWrite(env:IntegrationEnv,path:string,input:unknown,principal:Principal,fetcher:typeof fetch,now:number):Promise<unknown|undefined>{
  const ack=/^\/hq\/api\/bookings\/([0-9a-f-]{36})\/reminders\/ack$/.exec(path);
  if(ack){if(!record(input)||Object.keys(input).some(k=>k!=='cycleId')||typeof input.cycleId!=='string'||!/^[0-9a-f]{64}$/.test(input.cycleId))throw new HqError(400,'invalid_acknowledgment');return acknowledge(env,ack[1],input.cycleId,principal,now);}
  const retry=/^\/hq\/api\/bookings\/([0-9a-f-]{36})\/delivery\/retry$/.exec(path);
  if(retry){
    if(principal.role!=='santa')throw new HqError(403,'santa_retry_required');
    if(!record(input)||Object.keys(input).some(k=>k!=='jobId')||typeof input.jobId!=='string')throw new HqError(400,'invalid_retry');
    await planBooking(env,retry[1],now);
    const rows=(await env.DB.batch([env.DB.prepare(`UPDATE integration_jobs SET state=CASE WHEN kind='calendar' THEN 'queued' ELSE 'unknown' END,next_at=?,updated_at=?,error_code=NULL WHERE id=? AND booking_id=?
      AND (state IN ('uncertain','unknown','retry','blocked','failed') OR (kind='calendar' AND state='delivered')) RETURNING id`).bind(now,now,input.jobId,retry[1])]))[0].results;
    if(!rows.length)throw new HqError(409,'delivery_not_retryable');return {queuedForCheck:true};
  }
  if(path==='/hq/api/integrations/google/start'){
    if(!record(input)||Object.keys(input).length)throw new HqError(400,'invalid_oauth_start');return beginGoogle(env,principal,now);
  }
  if(path==='/hq/api/integrations/google/calendar')return setupCalendar(env,principal,input,fetcher,now);
  if(path==='/hq/api/integrations/google/disconnect'){
    if(!record(input)||Object.keys(input).length)throw new HqError(400,'invalid_disconnect');return disconnectGoogle(env,principal,fetcher,now);
  }
  return undefined;
}
export { finishGoogle };
