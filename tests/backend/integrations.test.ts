import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {integrationFixture} from './integration-fixture.ts';
import {syntheticRequest,syntheticQuote,testNow} from './hq-fixture.ts';
import {planBooking,acknowledge,type Job,type Cycle} from '../../workers/booking/integration-plan.ts';
import {processJob,runIntegrations} from '../../workers/booking/integration-runner.ts';
import {approvedPolicy,policy,quietAdjusted,wall} from '../../workers/booking/integration-config.ts';
import {seal,unseal,GOOGLE_SCOPE} from '../../workers/booking/google.ts';

let f:Awaited<ReturnType<typeof integrationFixture>>;
before(async()=>{f=await integrationFixture();});
beforeEach(async()=>{await f.clear();f.gateway.receipts.clear();f.gateway.messages.clear();f.gateway.posts=0;f.gateway.lookups=0;f.gateway.failLookup=false;f.gateway.loseResponse=false;f.gateway.onPost=undefined;f.gateway.rejectPostOnce=false;f.gateway.bodies=[];f.google.calendar=null;f.google.events.clear();f.google.tombstones.clear();f.google.createCalls=0;f.google.eventWrites=0;f.google.deletes=0;f.google.refreshes=0;f.google.fail=false;f.google.loseEventResponse=false;f.google.loseCalendarResponse=false;f.google.tokenScope=GOOGLE_SCOPE;});
after(async()=>{await f?.dispose();});
async function jobs(id:string,kind?:string):Promise<Job[]>{return (await f.db.prepare('SELECT * FROM integration_jobs WHERE booking_id=?'+(kind?' AND kind=?':'')+' ORDER BY due_at').bind(...(kind?[id,kind]:[id])).all<Job>()).results;}
async function job(id:string,kind:string){const result=(await jobs(id,kind))[0];assert.ok(result,'Expected '+kind);return result;}
async function ready(){const id=await f.ready();assert.equal((await f.mutate(id,'confirm',{beforeMinutes:0,afterMinutes:0})).status,200);await planBooking(f.env,id,testNow);return id;}
async function cycle(id:string){return (await f.db.prepare('SELECT * FROM integration_cycles WHERE booking_id=? ORDER BY confirmed_at DESC').bind(id).first<Cycle>())!;}
async function process(id:string,kind:string,at?:number){const j=await job(id,kind);await processJob(f.env,j.id,at??j.due_at,f.fetcher);return job(id,kind);}

test('approved configurable defaults, DST-aware morning, quiet hours, and early-event skip',async()=>{
  assert.deepEqual(policy(f.env),approvedPolicy);
  assert.equal(new Date(wall('2027-03-14','08:00')!).toISOString(),'2027-03-14T12:00:00.000Z');
  assert.equal(new Date(wall('2027-11-07','08:00')!).toISOString(),'2027-11-07T13:00:00.000Z');
  assert.equal(quietAdjusted(Date.parse('2027-03-14T03:00Z'),policy(f.env)),wall('2027-03-14','08:00'));
  assert.throws(()=>policy({...f.env,REMINDER_POLICY_JSON:'{"escalationMinutes":[0,20,10,30]}'}));
  const id=await f.ready({...syntheticRequest(),timing:{date:'2027-12-20',time:'07:00'}},{...syntheticQuote(),time:'07:00'});await f.mutate(id,'confirm',{beforeMinutes:0,afterMinutes:0});await planBooking(f.env,id,testNow);
  assert.equal((await jobs(id,'morning')).length,0);const c=await cycle(id);assert.equal(c.ack_due,wall('2027-12-19','08:00'));
});
test('planner is durable/idempotent, schedules all offsets once, and never syncs Pending',async()=>{
  const pending=(await f.create()).id;await planBooking(f.env,pending,testNow);assert.equal((await jobs(pending,'calendar')).length,0);
  const id=await ready();await Promise.all([planBooking(f.env,id,testNow),planBooking(f.env,id,testNow)]);
  const rows=await jobs(id);assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);assert.equal(rows.length,10);
  const c=await cycle(id);assert.equal((await job(id,'escalation_2')).due_at,c.ack_due!+120*60000);assert.equal((await job(id,'escalation_3')).due_at,c.ack_due!+240*60000);assert.equal((await job(id,'escalation_4')).due_at,c.ack_due!+360*60000);
});
test('past offsets are not backfilled, and no morning/reminder/escalation is sent after start',async()=>{
  const id=await f.ready({...syntheticRequest(),timing:{date:'2026-11-02',time:'14:00'}},{...syntheticQuote(),date:'2026-11-02',time:'14:00',expiryDate:'2026-11-02',expiryTime:'13:00'});await f.mutate(id,'confirm',{beforeMinutes:0,afterMinutes:0});await planBooking(f.env,id,testNow);
  assert.equal((await jobs(id,'twenty_four_hours')).length,0);assert.equal((await jobs(id,'seven_days')).length,0);assert.equal((await jobs(id,'morning')).length,0);
  const c=await cycle(id);const conf=await job(id,'confirmation');await processJob(f.env,conf.id,c.start_at,f.fetcher);assert.equal((await job(id,'confirmation')).state,'expired');assert.equal(f.gateway.posts,0);
});
test('disabled planner/delivery/calendar gates make zero provider calls',async()=>{
  assert.deepEqual(await runIntegrations({...f.env,INTEGRATION_PLANNER_ENABLED:'false'},testNow,f.fetcher),{disabled:true,processed:0});
  const id=await ready();const n=await job(id,'new_request'),g=await job(id,'calendar');
  await processJob({...f.env,NOTIFICATION_DELIVERY_ENABLED:'false'},n.id,testNow,f.fetcher);await processJob({...f.env,CALENDAR_SYNC_ENABLED:'false'},g.id,testNow,f.fetcher);
  assert.equal(f.gateway.lookups,0);assert.equal(f.gateway.posts,0);assert.equal(f.google.eventWrites,0);assert.equal((await job(id,'calendar')).state,'blocked');
});
test('lost delivery response is reconciled by the same key without a second message',async()=>{
  const id=await ready();f.gateway.loseResponse=true;const first=await process(id,'new_request');assert.equal(first.state,'unknown');assert.equal(f.gateway.posts,1);
  await processJob(f.env,first.id,first.next_at,f.fetcher);assert.equal((await job(id,'new_request')).state,'delivered');assert.equal(f.gateway.posts,1);assert.equal(f.gateway.messages.size,1);
});
test('overlapping cron claims and replayed jobs do not duplicate delivery',async()=>{
  const id=await ready(),j=await job(id,'new_request');await Promise.all(Array.from({length:5},()=>processJob(f.env,j.id,testNow,f.fetcher)));
  assert.equal(f.gateway.posts,1);assert.equal((await job(id,'new_request')).state,'delivered');await processJob(f.env,j.id,testNow+10000,f.fetcher);assert.equal(f.gateway.posts,1);
});
test('quiet-hours retry defers, including DST changes, and does not send a catch-up burst',async()=>{
  const id=await ready(),j=await job(id,'new_request');const late=Date.parse('2026-11-08T03:00Z');await processJob(f.env,j.id,late,f.fetcher);
  const deferred=await job(id,'new_request');assert.equal(deferred.state,'retry');assert.equal(deferred.next_at,wall('2026-11-08','08:00'));assert.equal(f.gateway.posts,0);
  await processJob(f.env,j.id,deferred.next_at,f.fetcher);assert.equal(f.gateway.posts,1);
});
test('four timed levels require consent and no acknowledgment; resolution targets alerted recipients',async()=>{
  const id=await ready();let c=await cycle(id);assert.ok(c.ack_due);
  const notDue=await job(id,'escalation_3');await processJob(f.env,notDue.id,notDue.due_at-1,f.fetcher);assert.equal((await job(id,'escalation_3')).state,'queued');
  assert.equal((await process(id,'twenty_four_hours')).state,'delivered');assert.equal((await process(id,'escalation_2')).state,'delivered');
  const mrs=await job(id,'escalation_3');await processJob({...f.env,MRS_CLAUS_CONSENT_JSON:'{}'},mrs.id,mrs.due_at+60000,f.fetcher);assert.equal((await job(id,'escalation_3')).state,'blocked');
  await processJob(f.env,mrs.id,mrs.due_at+120000,f.fetcher);assert.equal((await job(id,'escalation_3')).state,'delivered');
  assert.equal((await process(id,'escalation_4',(await job(id,'escalation_4')).due_at+120000)).state,'delivered');
  c=await cycle(id);await acknowledge(f.env,id,c.id,{sub:'santa-subject',role:'santa'},c.ack_due!+7*3600000);
  const resolved=await jobs(id,'resolution');assert.equal(resolved.length,3);assert.deepEqual(resolved.map(j=>j.recipient).sort(),['mrs_claus','santa','technical_admin']);
  for(const r of resolved)await processJob(f.env,r.id,Math.max(r.due_at,c.ack_due!+7*3600000),f.fetcher);
  assert.equal(f.gateway.messages.size,7); // Four levels + one resolution per recipient.
  assert.equal((await f.db.prepare('SELECT status FROM hq_bookings WHERE booking_id=?').bind(id).first())!.status,'confirmed');
});
test('acknowledgment during in-flight escalation stops later levels and resolves the late receipt',async()=>{
  const id=await ready();const c=await cycle(id);await process(id,'twenty_four_hours');
  f.gateway.onPost=async()=>{f.gateway.onPost=undefined;f.gateway.rejectPostOnce=false;f.gateway.bodies=[];await acknowledge(f.env,id,c.id,{sub:'santa-subject',role:'santa'},c.ack_due!+120*60000);};
  await process(id,'escalation_2');assert.equal((await job(id,'escalation_3')).state,'canceled');assert.equal((await job(id,'escalation_4')).state,'canceled');
  assert.equal((await jobs(id,'resolution')).length,1);assert.equal(f.gateway.posts,2);
  await acknowledge(f.env,id,c.id,{sub:'santa-subject',role:'santa'},c.ack_due!+130*60000);assert.equal((await jobs(id,'resolution')).length,1);
  await f.db.prepare("DELETE FROM integration_jobs WHERE booking_id=? AND kind='resolution'").bind(id).run();
  await acknowledge(f.env,id,c.id,{sub:'santa-subject',role:'santa'},c.ack_due!+140*60000);assert.equal((await jobs(id,'resolution')).length,1);
});
test('authenticated Got It rejects anonymous/backup/early/stale requests and never changes booking state',async()=>{
  const id=await ready(),c=await cycle(id),path='/hq/api/bookings/'+id+'/reminders/ack';
  assert.equal((await f.call(path,{cycleId:c.id},{token:''})).status,401);
  assert.equal((await f.call(path,{cycleId:c.id})).status,409);
  const at=c.ack_due!,backup=await f.token('backup-subject',{},at);assert.equal((await f.call(path,{cycleId:c.id},{env:{...f.env,BACKUP_ESCALATION_ENABLED:'true'},token:backup,now:at})).status,403);
  const token=await f.token('santa-subject',{},at);const before=await f.db.prepare('SELECT * FROM hq_bookings WHERE booking_id=?').bind(id).first();
  assert.equal((await f.call(path,{cycleId:c.id},{token,now:at})).status,200);assert.equal((await f.call(path,{cycleId:c.id},{token,now:at})).status,200);
  assert.deepEqual(await f.db.prepare('SELECT * FROM hq_bookings WHERE booking_id=?').bind(id).first(),before);
});
test('reschedule/cancel invalidate old unsent reminders and keep Google event id stable',async()=>{
  await f.connect();const id=await ready();await process(id,'calendar');const eventId=[...f.google.events.keys()][0];
  await f.mutate(id,'propose_reschedule',{quote:{...syntheticQuote(),time:'16:00'}});await f.mutate(id,'share_reschedule',{channel:'phone',quoteCommunicated:true});await f.mutate(id,'record_change_agreement',{channel:'phone',customerAgreed:true});await f.mutate(id,'apply_reschedule',{beforeMinutes:0,afterMinutes:0});await planBooking(f.env,id,testNow+1);
  const current=(await jobs(id,'calendar')).find(j=>j.state==='queued')!;await processJob(f.env,current.id,testNow+1,f.fetcher);assert.equal(f.google.events.size,1);assert.ok(f.google.events.has(eventId));
  const old=await jobs(id,'twenty_four_hours');assert.equal(old.filter(j=>j.state==='canceled').length,1);
  await f.mutate(id,'cancel');await planBooking(f.env,id,testNow+2);const remove=(await jobs(id,'calendar')).find(j=>j.state==='queued')!;await processJob(f.env,remove.id,testNow+2,f.fetcher);assert.equal(f.google.events.size,0);assert.equal(f.google.deletes,1);
});
test('calendar timeout/retry and reconciliation repair remote drift with no duplicate event or private notes',async()=>{
  await f.connect();const id=await ready();const row=await f.db.prepare('SELECT request_json FROM booking_requests WHERE id=?').bind(id).first<{request_json:string}>();
  await f.db.prepare('UPDATE booking_requests SET request_json=? WHERE id=?').bind(JSON.stringify({...JSON.parse(row!.request_json),instructions:'DO_NOT_EXPORT private child information',answers:{privateNotes:'DO_NOT_EXPORT'}}),id).run();
  f.google.loseEventResponse=true;let first=await process(id,'calendar');assert.equal(first.state,'retry');assert.equal(f.google.events.size,1);
  await processJob(f.env,first.id,first.next_at,f.fetcher);assert.equal((await job(id,'calendar')).state,'delivered');assert.equal(f.google.events.size,1);
  const event=[...f.google.events.values()][0];event.summary='Remote drift';await planBooking(f.env,id,testNow+20*60000);await processJob(f.env,first.id,testNow+20*60000,f.fetcher);assert.notEqual([...f.google.events.values()][0].summary,'Remote drift');
  assert.ok(!JSON.stringify([...f.google.events.values()]).includes('DO_NOT_EXPORT'));await process(id,'new_request');assert.ok(!JSON.stringify([...f.gateway.messages.values()]).includes('DO_NOT_EXPORT'));
});
test('OAuth uses PKCE, single-use subject-bound state, minimum scope, and encrypted restricted tokens',async()=>{
  const auth=await f.connect();assert.equal(auth.searchParams.get('scope'),GOOGLE_SCOPE);assert.equal(auth.searchParams.get('include_granted_scopes'),'false');
  const stored=await f.db.prepare('SELECT encrypted_tokens FROM integration_google').first<{encrypted_tokens:string}>();assert.ok(!stored!.encrypted_tokens.includes('synthetic-access-token'));assert.ok(!stored!.encrypted_tokens.includes('synthetic-refresh-token'));
  const replay=await f.call('/hq/oauth/google/callback?state='+auth.searchParams.get('state')+'&code=synthetic-code');assert.equal(replay.status,409);
  const status=await f.call('/hq/api/integrations/status');assert.ok(!JSON.stringify(await status.json()).includes('encrypted_tokens'));
  assert.equal((await f.call('/hq/api/integrations/google/start',{}, {token:''})).status,401);
  assert.equal((await f.call('/hq/api/integrations/google/start',{}, {env:{...f.env,GOOGLE_OAUTH_ENABLED:'false'}})).status,503);
  const backup=await f.token('backup-subject');assert.equal((await f.call('/hq/api/integrations/google/start',{}, {token:backup,env:{...f.env,BACKUP_ESCALATION_ENABLED:'true'}})).status,403);
});
test('AES-GCM key rotation and AAD/tamper failures do not expose tokens',async()=>{
  const encrypted=await seal(f.env,{secret:'synthetic-token'},'connection-a');assert.deepEqual(await unseal(f.env,encrypted,'connection-a'),{secret:'synthetic-token'});await assert.rejects(unseal(f.env,encrypted,'connection-b'));
  const ring=JSON.parse(f.env.GOOGLE_TOKEN_KEYS!);const rotated={...f.env,GOOGLE_TOKEN_ACTIVE_KEY:'next',GOOGLE_TOKEN_KEYS:JSON.stringify({...ring,next:btoa('1'.repeat(32))})};assert.deepEqual(await unseal(rotated,encrypted,'connection-a'),{secret:'synthetic-token'});
  const lost={...rotated,GOOGLE_TOKEN_KEYS:JSON.stringify({next:btoa('1'.repeat(32))})};await assert.rejects(unseal(lost,encrypted,'connection-a'));
});
test('uncertain calendar creation never automatically creates a second calendar; verified recovery works',async()=>{
  await f.connect(false);f.google.loseCalendarResponse=true;assert.equal((await f.call('/hq/api/integrations/google/calendar',{})).status,409);assert.equal((await f.call('/hq/api/integrations/google/calendar',{})).status,409);assert.equal(f.google.createCalls,1);
  assert.equal((await f.call('/hq/api/integrations/google/calendar',{calendarId:'primary'})).status,400);
  assert.equal((await f.call('/hq/api/integrations/google/calendar',{calendarId:'synthetic-calendar@app-created.test'})).status,200);assert.equal(f.google.createCalls,1);
});
test('token refresh is encrypted and disconnect revokes without deleting the calendar',async()=>{
  await f.connect();const id=await ready();const later=testNow+2*3600000;await processJob(f.env,(await job(id,'calendar')).id,later,f.fetcher);assert.equal(f.google.refreshes,1);
  assert.equal((await f.call('/hq/api/integrations/google/disconnect',{})).status,200);assert.equal(f.google.revokes,1);assert.ok(f.google.calendar);assert.equal((await f.db.prepare('SELECT encrypted_tokens FROM integration_google').first())!.encrypted_tokens,null);
});
test('outbox consumption and paged reconciliation repair missing plans without duplicate notifications',async()=>{
  const id=(await f.create()).id;await runIntegrations(f.env,testNow,f.fetcher);await runIntegrations(f.env,testNow+1,f.fetcher);assert.equal((await jobs(id,'new_request')).length,1);assert.equal(f.gateway.posts,1);
  await f.db.prepare('DELETE FROM integration_jobs WHERE booking_id=?').bind(id).run();await runIntegrations(f.env,testNow+2,f.fetcher);assert.equal((await jobs(id,'new_request')).length,1);assert.equal(f.gateway.posts,1); // Gateway lookup deduplicates even after restored job data.
});
test('provider outages back off to an uncertain state and never blindly post',async()=>{
  const id=await ready();f.gateway.failLookup=true;let j=await job(id,'new_request');
  for(let i=0;i<8;i++){await processJob(f.env,j.id,i?j.next_at:testNow,f.fetcher);j=await job(id,'new_request');}
  assert.equal(j.state,'uncertain');assert.equal(f.gateway.posts,0);assert.ok(j.error_code);assert.equal(j.attempts,8);
});
test('slow provider lookup cannot send across quiet hours or the event-start deadline',async()=>{
  const id=await ready(),j=await job(id,'new_request');
  const beforeQuiet=wall('2026-11-02','20:59')!,afterQuiet=wall('2026-11-02','21:01')!;
  await processJob(f.env,j.id,beforeQuiet,f.fetcher,()=>afterQuiet);assert.equal(f.gateway.posts,0);assert.equal((await job(id,'new_request')).next_at,wall('2026-11-03','08:00'));
  const reminder=await job(id,'three_hours'),c=await cycle(id);
  await processJob(f.env,reminder.id,reminder.due_at,f.fetcher,()=>c.start_at+1);assert.equal((await job(id,'three_hours')).state,'expired');assert.equal(f.gateway.posts,0);
});
test('a tombstoned owned event is recreated under one durable successor id',async()=>{
  await f.connect();const id=await ready();await process(id,'calendar');const old=[...f.google.events.keys()][0];
  f.google.events.delete(old);f.google.tombstones.add(old);
  await planBooking(f.env,id,testNow+20*60000);await processJob(f.env,(await job(id,'calendar')).id,testNow+20*60000,f.fetcher);
  assert.equal(f.google.events.size,1);assert.ok(!f.google.events.has(old));
  const mapping=await f.db.prepare('SELECT event_id,incarnation FROM integration_calendar WHERE booking_id=?').bind(id).first();assert.equal(mapping!.incarnation,1);assert.ok(f.google.events.has(mapping!.event_id as string));
});
test('Google ownership mismatch prevents overwriting an unrelated event',async()=>{
  await f.connect();const id=await ready();await process(id,'calendar');const event=[...f.google.events.values()][0];
  event.extendedProperties={private:{onp_booking_id:'other',onp_installation:'other'}};
  const writes=f.google.eventWrites;await planBooking(f.env,id,testNow+20*60000);await processJob(f.env,(await job(id,'calendar')).id,testNow+20*60000,f.fetcher);
  assert.equal((await job(id,'calendar')).state,'blocked');assert.equal(f.google.eventWrites,writes);
});
test('OAuth flows supersede older states, reject broadened scope, and preserve existing calendar binding',async()=>{
  const first=await f.call('/hq/api/integrations/google/start',{});const a=new URL(((await first.json()) as {authorizationUrl:string}).authorizationUrl);
  await f.call('/hq/api/integrations/google/start',{});
  assert.equal((await f.call('/hq/oauth/google/callback?state='+a.searchParams.get('state')+'&code=synthetic-code')).status,409);
  f.google.tokenScope=GOOGLE_SCOPE+' https://www.googleapis.com/auth/calendar';
  const second=await f.call('/hq/api/integrations/google/start',{});const b=new URL(((await second.json()) as {authorizationUrl:string}).authorizationUrl);
  assert.equal((await f.call('/hq/oauth/google/callback?state='+b.searchParams.get('state')+'&code=synthetic-code')).status,503);assert.equal(await f.db.prepare('SELECT id FROM integration_google').first(),null);
});
test('acknowledgment rollback is atomic and an old-cycle link cannot stop a rescheduled check',async()=>{
  const id=await ready(),c=await cycle(id);
  await f.db.prepare("CREATE TRIGGER fail_ack BEFORE INSERT ON integration_acknowledgments BEGIN SELECT RAISE(ABORT,'synthetic_ack_failure'); END").run();
  try{await assert.rejects(acknowledge(f.env,id,c.id,{sub:'santa-subject',role:'santa'},c.ack_due!));assert.equal((await cycle(id)).acknowledged_at,null);assert.equal((await job(id,'escalation_2')).state,'queued');}
  finally{await f.db.prepare('DROP TRIGGER fail_ack').run();}
  await f.mutate(id,'propose_reschedule',{quote:{...syntheticQuote(),time:'16:00'}});await f.mutate(id,'share_reschedule',{channel:'phone',quoteCommunicated:true});await f.mutate(id,'record_change_agreement',{channel:'phone',customerAgreed:true});await f.mutate(id,'apply_reschedule',{beforeMinutes:0,afterMinutes:0});await planBooking(f.env,id,testNow+1);
  await assert.rejects(acknowledge(f.env,id,c.id,{sub:'santa-subject',role:'santa'},c.ack_due!));
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM integration_cycles WHERE booking_id=? AND state=\'active\' AND acknowledged_at IS NULL').bind(id).first())!.n,1);
});
test('failed Santa delivery cannot suppress the later Mrs. Claus and technical fallback attempts',async()=>{
  const id=await ready();f.gateway.onPost=async(key,body)=>{if(body.recipientKey==='santa-test')f.gateway.receipts.set(key,{idempotencyKey:key,status:'failed',providerId:'synthetic-failed'});};
  assert.equal((await process(id,'twenty_four_hours')).state,'failed');assert.equal((await process(id,'escalation_2')).state,'failed');
  assert.equal((await process(id,'escalation_3')).state,'delivered');assert.equal((await process(id,'escalation_4')).state,'delivered');
  const c=await cycle(id);await acknowledge(f.env,id,c.id,{sub:'santa-subject',role:'santa'},c.ack_due!+7*3600000);
  assert.deepEqual((await jobs(id,'resolution')).map(j=>j.recipient).sort(),['mrs_claus','technical_admin']);
});
test('reminder offset overrides are configuration and do not reset an existing acknowledgment',async()=>{
  const env={...f.env,REMINDER_POLICY_JSON:JSON.stringify({morningTime:'09:00',acknowledgmentHours:12,finalReminderHours:2,sevenDayHours:120,escalationMinutes:[0,30,60,90]})};
  const id=await f.ready();await f.mutate(id,'confirm',{beforeMinutes:0,afterMinutes:0});await planBooking(env,id,testNow);const c=await cycle(id);
  assert.equal(c.ack_due,quietAdjusted(c.start_at-12*3600000,policy(env)));assert.equal((await job(id,'three_hours')).due_at,quietAdjusted(c.start_at-2*3600000,policy(env)));
  await acknowledge(env,id,c.id,{sub:'santa-subject',role:'santa'},c.ack_due!);await planBooking(env,id,c.ack_due!+1);assert.ok((await cycle(id)).acknowledged_at);assert.equal((await job(id,'escalation_2')).state,'canceled');
});
test('changing the stable HMAC key fails closed instead of resetting acknowledgment or delivery identities',async()=>{
  const id=await ready();const before=await jobs(id);
  const changed={...f.env,INTAKE_HMAC_SECRET:'different-synthetic-hmac-key-at-least-32-chars'};
  await assert.rejects(runIntegrations(changed,testNow,f.fetcher),/integration_hash_key_changed/);
  await assert.rejects(planBooking(changed,id,testNow),/integration_hash_key_changed/);
  assert.deepEqual(await jobs(id),before);assert.equal(f.gateway.posts,0);
});
test('steady-state reconciliation does not rewrite every future reminder',async()=>{
  const id=await ready();await f.db.prepare("INSERT INTO integration_control (key,value) VALUES ('test_job_updates','0')").run();
  await f.db.prepare("CREATE TRIGGER count_job_updates AFTER UPDATE ON integration_jobs BEGIN UPDATE integration_control SET value=CAST(value AS INTEGER)+1 WHERE key='test_job_updates'; END").run();
  try{await planBooking(f.env,id,testNow+1);await planBooking(f.env,id,testNow+60000);assert.equal((await f.db.prepare("SELECT value FROM integration_control WHERE key='test_job_updates'").first())!.value,'0');}
  finally{await f.db.prepare('DROP TRIGGER count_job_updates').run();}
});
test('configuration changes remove old unsent checks and can safely re-enable them',async()=>{
  const id=await f.ready({...syntheticRequest(),timing:{date:'2026-11-03',time:'14:00'}},{...syntheticQuote(),date:'2026-11-03',time:'14:00',expiryDate:'2026-11-03',expiryTime:'13:00'});
  await f.mutate(id,'confirm',{beforeMinutes:0,afterMinutes:0});await planBooking(f.env,id,testNow);let j=await job(id,'twenty_four_hours');
  f.gateway.failLookup=true;await processJob(f.env,j.id,j.due_at,f.fetcher);j=await job(id,'twenty_four_hours');assert.equal(j.state,'unknown');
  const changed={...f.env,REMINDER_POLICY_JSON:'{"acknowledgmentHours":48}'};await planBooking(changed,id,testNow+1);f.gateway.failLookup=false;
  await processJob(changed,j.id,j.next_at,f.fetcher);assert.equal((await job(id,'twenty_four_hours')).state,'canceled');assert.equal(f.gateway.posts,0);
  await planBooking(f.env,id,testNow+2);j=await job(id,'twenty_four_hours');assert.equal(j.state,'queued');assert.equal(j.next_at,j.due_at);
  await processJob(f.env,j.id,j.due_at,f.fetcher);assert.equal((await job(id,'twenty_four_hours')).state,'delivered');
});
test('a retry preserves the identical message and recipient route after a failed handoff',async()=>{
  const id=await ready();f.gateway.rejectPostOnce=true;const before=await process(id,'new_request');assert.equal(before.state,'unknown');
  const targets=JSON.parse(f.env.NOTIFICATION_TARGETS_JSON!);targets.santa.recipientKey='changed-route';
  await processJob({...f.env,NOTIFICATION_TARGETS_JSON:JSON.stringify(targets)},before.id,before.next_at,f.fetcher);
  assert.deepEqual(f.gateway.bodies.at(-1),f.gateway.bodies.at(-2));assert.equal((await job(id,'new_request')).state,'delivered');assert.equal(f.gateway.messages.size,1);
});
