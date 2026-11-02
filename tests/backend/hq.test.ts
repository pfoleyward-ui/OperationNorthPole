import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT, generateKeyPair } from 'jose';
import { hqFixture, syntheticRequest, syntheticQuote, testNow } from './hq-fixture.ts';
import { handleHq } from '../../workers/booking/hq.ts';
import { D1BookingRepository, type Database } from '../../workers/booking/repository.ts';
import { validateBookingRequest } from '../../src/domain/booking/request.ts';

let f: Awaited<ReturnType<typeof hqFixture>>;
before(async()=>{f=await hqFixture();});
beforeEach(async()=>{await f.clear();});
after(async()=>{await f?.dispose();});
const actionPath = (id:string)=>'/hq/api/bookings/'+id+'/actions';
async function stored(id:string){return f.db.prepare('SELECT * FROM hq_bookings WHERE booking_id=?').bind(id).first<{version:number;status:string;state_json:string}>();}
async function reservations(id:string){return (await f.db.prepare('SELECT * FROM hq_reservations WHERE booking_id=? ORDER BY resource').bind(id).all()).results;}

test('signed Access token and subject ACL required on HTML, assets, data, and writes',async()=>{
  for(const path of ['/hq','/hq/app.js','/hq/style.css','/hq/api/session','/hq/api/bookings']) assert.equal((await f.call(path,undefined,{token:''})).status,401);
  assert.equal((await f.call('/hq/api/bookings',{request:syntheticRequest(),source:'phone'},{token:''})).status,401);
  assert.equal((await f.call('/hq/api/session',undefined,{token:await f.token('stranger',{role:'santa',actor:'santa'})})).status,401);
  assert.equal((await f.call('/hq/api/session')).status,200);
  assert.equal((await f.call('/hq/api/session',undefined,{headers:{'cf-access-authenticated-user-email':'santa@example.test'},token:''})).status,401);
});
test('forged, expired, wrong audience/issuer, and noninteractive tokens fail closed',async()=>{
  const now=Math.floor(testNow/1000);
  const sign=async(overrides:Record<string,unknown>)=>new SignJWT({iss:'https://synthetic-team.cloudflareaccess.com',aud:'synthetic-hq-audience',sub:'santa-subject',email:'synthetic@example.test',iat:now-1,exp:now+1000,...overrides}).setProtectedHeader({alg:'RS256',kid:f.jwk.kid}).sign(f.keys.privateKey);
  for(const claims of [{exp:now-1},{aud:'other'},{iss:'https://attacker.example'},{iat:now+100},{email:undefined}]) assert.equal((await f.call('/hq',undefined,{token:await sign(claims)})).status,401);
  const attacker=await generateKeyPair('RS256');
  const forged=await new SignJWT({iss:'https://synthetic-team.cloudflareaccess.com',aud:'synthetic-hq-audience',sub:'santa-subject',email:'x@example.test',iat:now-1,exp:now+100}).setProtectedHeader({alg:'RS256',kid:f.jwk.kid}).sign(attacker.privateKey);
  assert.equal((await f.call('/hq',undefined,{token:forged})).status,401);
});
test('backup has no ordinary access; explicit escalation enables audited backup role',async()=>{
  const token=await f.token('backup-subject');
  assert.equal((await f.call('/hq/api/session',undefined,{token})).status,401);
  const env={...f.env,BACKUP_ESCALATION_ENABLED:'true'};
  const response=await f.call('/hq/api/bookings',{request:syntheticRequest(),source:'text'},{token,env});
  assert.equal(response.status,200);
  assert.equal((await f.db.prepare('SELECT actor_role FROM hq_operations').first())!.actor_role,'backup');
});
test('disabled HQ, missing configuration, and JWKS failure expose no customer data',async()=>{
  for(const env of [{...f.env,HQ_ENABLED:'false'},{...f.env,INTAKE_HMAC_SECRET:''}]) assert.equal((await f.call('/hq',undefined,{env})).status,503);
  const req=new Request(f.env.HQ_ORIGIN+'/hq',{headers:{'cf-access-jwt-assertion':f.signed}});
  assert.equal((await handleHq(req,f.env,async()=>{throw new Error('JWKS unavailable');},testNow)).status,401);
  const r=await f.call('/hq');assert.match(r.headers.get('cache-control')!,/no-store/);assert.match(r.headers.get('content-security-policy')!,/frame-ancestors 'none'/);assert.equal(r.headers.get('referrer-policy'),'no-referrer');
});
test('cross-origin, non-JSON, supplied actor, and large body writes rejected',async()=>{
  assert.equal((await f.call('/hq/api/bookings',{request:syntheticRequest(),source:'phone'},{headers:{origin:'https://attacker.example'}})).status,403);
  assert.equal((await f.call('/hq/api/bookings',{request:syntheticRequest(),source:'phone'},{headers:{'content-type':'text/plain'}})).status,415);
  assert.equal((await f.call('/hq/api/bookings',{request:syntheticRequest(),source:'phone',actor:'santa'})).status,400);
  assert.equal((await f.call('/hq/api/bookings',{request:{...syntheticRequest(),location:'x'.repeat(32768)},source:'phone'})).status,413);
});
test('manual phone/text/Facebook bookings start Pending and retry without duplicate rows',async()=>{
  for(const source of ['phone','text','facebook']){
    const key=crypto.randomUUID(),body={request:syntheticRequest(),source};
    const response=await f.call('/hq/api/bookings',body,{key});assert.equal(response.status,200);const state=await response.json();
    assert.equal((state as {status:string}).status,'pending');assert.deepEqual(await(await f.call('/hq/api/bookings',body,{key})).json(),state);
    assert.equal((await f.call('/hq/api/bookings',{...body,source:'other'},{key})).status,400);
    assert.equal((await f.call('/hq/api/bookings',{...body,request:{...syntheticRequest(),location:'Different'}},{key})).status,409);
  }
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM booking_requests').first())!.n,3);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM hq_reservations').first())!.n,0);
});
test('existing Phase 5 receipt appears in HQ and can be reviewed without changing immutable receipt',async()=>{
  const request=validateBookingRequest(syntheticRequest(),testNow);assert.ok(request.ok);if(!request.ok)return;
  const receipt=await new D1BookingRepository(f.env.DB).save(request.value,'synthetic-key','synthetic-hash',testNow);
  const list=await(await f.call('/hq/api/bookings?view=new&date=2026-11-02')).json() as {bookings:{state:{id:string}}[]};assert.equal(list.bookings[0].state.id,receipt.requestId);
  assert.equal((await f.mutate(receipt.requestId,'review')).status,200);
  assert.equal((await f.db.prepare('SELECT status,version FROM booking_requests WHERE id=?').bind(receipt.requestId).first())!.status,'pending');
});
test('quote, offline communication, exact agreement, then atomic confirmation are separate steps',async()=>{
  const created=await f.create();assert.equal((await f.mutate(created.id,'confirm',{beforeMinutes:0,afterMinutes:0})).status,400);
  await f.mutate(created.id,'review');await f.mutate(created.id,'propose',{quote:syntheticQuote()});
  assert.equal((await f.mutate(created.id,'share_quote',{channel:'phone',quoteCommunicated:false})).status,400);
  await f.mutate(created.id,'share_quote',{channel:'text',quoteCommunicated:true});
  assert.equal((await f.mutate(created.id,'record_agreement',{channel:'text',customerAgreed:false})).status,400);
  await f.mutate(created.id,'record_agreement',{channel:'text',customerAgreed:true});
  assert.equal((await f.mutate(created.id,'confirm')).status,400);
  assert.equal((await f.mutate(created.id,'confirm',{beforeMinutes:0,afterMinutes:0})).status,200);
  assert.equal((await stored(created.id))!.status,'confirmed');assert.equal((await reservations(created.id)).length,1);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM hq_event_outbox').first())!.n,6);
});
test('concurrent conflicting confirmations: exactly one wins; losing status/version rolls back',async()=>{
  const a=await f.ready(),b=await f.ready();const version=(await stored(a))!.version;
  const responses=await Promise.all([f.mutate(a,'confirm',{beforeMinutes:0,afterMinutes:0}),f.mutate(b,'confirm',{beforeMinutes:0,afterMinutes:0})]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  const rows=await f.db.prepare('SELECT status,version FROM hq_bookings').all();
  assert.equal(rows.results.filter((r:Record<string,unknown>)=>r.status==='confirmed').length,1);assert.equal(rows.results.filter((r:Record<string,unknown>)=>r.status==='awaiting_customer_acceptance'&&r.version===version).length,1);
});
test('half-open adjacency succeeds, explicit buffers create conflicts, unavailable resources block',async()=>{
  const a=await f.ready();await f.mutate(a,'confirm',{beforeMinutes:0,afterMinutes:0});
  const b=await f.ready(syntheticRequest(),{...syntheticQuote(),time:'14:30'});
  assert.equal((await f.mutate(b,'confirm',{beforeMinutes:1,afterMinutes:0})).status,409);
  assert.equal((await f.mutate(b,'confirm',{beforeMinutes:0,afterMinutes:0})).status,200);
  assert.equal((await f.call('/hq/api/unavailable',{id:crypto.randomUUID(),resource:'santa',date:'2027-12-20',time:'14:00',durationMinutes:60})).status,409);
});
test('booth confirmation requires verified staffing for the exact revision/time; all resources atomic',async()=>{
  const req={...syntheticRequest(),serviceId:'complete-party'};
  const id=await f.ready(req,{...syntheticQuote(),durationMinutes:240});
  const before=await stored(id);
  assert.equal((await f.mutate(id,'confirm',{beforeMinutes:0,afterMinutes:0})).status,409);
  assert.deepEqual(await stored(id),before);assert.equal((await reservations(id)).length,0);
  await f.mutate(id,'verify_staffing',{attendantRef:'Attendant A'});
  assert.equal((await f.mutate(id,'confirm',{beforeMinutes:0,afterMinutes:0})).status,200);
  assert.equal((await reservations(id)).length,3);
});
test('quote revisions invalidate agreement and require staffing for new terms',async()=>{
  const req={...syntheticRequest(),serviceId:'photo-booth'};
  const id=await f.ready(req,{...syntheticQuote(),durationMinutes:240});
  await f.mutate(id,'verify_staffing',{attendantRef:'Attendant A'});
  await f.mutate(id,'propose',{quote:{...syntheticQuote(),durationMinutes:240,time:'15:00'}});
  await f.mutate(id,'share_quote',{channel:'phone',quoteCommunicated:true});
  assert.equal((await f.mutate(id,'confirm',{beforeMinutes:0,afterMinutes:0})).status,400);
  await f.mutate(id,'record_agreement',{channel:'phone',customerAgreed:true});
  assert.equal((await f.mutate(id,'confirm',{beforeMinutes:0,afterMinutes:0})).status,409);
});
test('versions and idempotent operation keys protect concurrent Santa screens',async()=>{
  const {id}=await f.create();const key=crypto.randomUUID();
  const responses=await Promise.all([f.mutate(id,'review',{},1,key),f.mutate(id,'review',{},1,key)]);
  assert.deepEqual(responses.map(r=>r.status),[200,200]);assert.deepEqual(await responses[0].json(),await responses[1].json());
  assert.equal((await f.mutate(id,'cancel',{},1)).status,409);
  assert.equal((await f.mutate(id,'cancel',{},2,key)).status,409);
  assert.equal((await stored(id))!.version,2);
});
test('confirmed reschedule preserves original reservation until exact changed agreement; conflicts roll back',async()=>{
  const id=await f.ready();await f.mutate(id,'confirm',{beforeMinutes:0,afterMinutes:0});const original=await reservations(id);
  const other=await f.ready(syntheticRequest(),{...syntheticQuote(),time:'15:00'});await f.mutate(other,'confirm',{beforeMinutes:0,afterMinutes:0});
  await f.mutate(id,'propose_reschedule',{quote:{...syntheticQuote(),time:'15:00'}});
  assert.deepEqual(await reservations(id),original);
  assert.equal((await f.mutate(id,'apply_reschedule',{beforeMinutes:0,afterMinutes:0})).status,400);
  await f.mutate(id,'share_reschedule',{channel:'phone',quoteCommunicated:true});await f.mutate(id,'record_change_agreement',{channel:'phone',customerAgreed:true});
  const before=await stored(id);assert.equal((await f.mutate(id,'apply_reschedule',{beforeMinutes:0,afterMinutes:0})).status,409);
  assert.deepEqual(await stored(id),before);assert.deepEqual(await reservations(id),original);
  await f.mutate(id,'propose_reschedule',{quote:{...syntheticQuote(),time:'16:00'}});
  await f.mutate(id,'share_reschedule',{channel:'text',quoteCommunicated:true});await f.mutate(id,'record_change_agreement',{channel:'text',customerAgreed:true});
  assert.equal((await f.mutate(id,'apply_reschedule',{beforeMinutes:0,afterMinutes:0})).status,200);
  assert.notDeepEqual(await reservations(id),original);assert.equal((await stored(id))!.status,'confirmed');
});
test('cancel atomically releases resources; terminal states cannot reopen or reschedule',async()=>{
  const id=await f.ready();await f.mutate(id,'confirm',{beforeMinutes:0,afterMinutes:0});await f.mutate(id,'cancel');
  assert.equal((await reservations(id)).length,0);
  for(const action of ['review','confirm','propose_reschedule']) assert.equal((await f.mutate(id,action,action==='propose_reschedule'?{quote:syntheticQuote()}:{})).status,400);
});
test('audit/outbox failure rolls back operational state and reservation changes',async()=>{
  const id=await f.ready();const before=await stored(id);
  await f.db.prepare("CREATE TRIGGER fail_hq_outbox BEFORE INSERT ON hq_event_outbox BEGIN SELECT RAISE(ABORT,'test_failure'); END").run();
  try{assert.equal((await f.mutate(id,'confirm',{beforeMinutes:0,afterMinutes:0})).status,503);assert.deepEqual(await stored(id),before);assert.equal((await reservations(id)).length,0);}
  finally{await f.db.prepare('DROP TRIGGER fail_hq_outbox').run();}
});
test('custom duration price, fixed service durations, holidays, and DST are independently validated',async()=>{
  const id=(await f.create({...syntheticRequest(),serviceId:'meet-greet'})).id;await f.mutate(id,'review');
  assert.equal((await f.mutate(id,'propose',{quote:{...syntheticQuote(),durationMinutes:75}})).status,400);
  assert.equal((await f.mutate(id,'propose',{quote:{...syntheticQuote(),durationMinutes:90,totalCents:35000}})).status,400);
  const r=await f.mutate(id,'propose',{quote:{...syntheticQuote(),durationMinutes:90,totalCents:35000,adjustmentReason:'Agreed travel logistics'}});assert.equal(r.status,200);
  assert.equal(((await r.json()) as {quote:{totalCents:number}}).quote.totalCents,35000);
  await f.mutate(id,'review');assert.equal((await f.mutate(id,'propose',{quote:{...syntheticQuote(),date:'2027-12-24',durationMinutes:90}})).status,400);
  assert.equal((await f.mutate(id,'propose',{quote:{...syntheticQuote(),date:'2027-03-14',time:'02:30',expiryDate:'2027-03-01',durationMinutes:90}})).status,400);
});
test('Elf invitation metadata only for confirmed home visits, voluntary and never collecting/sending',async()=>{
  const home=await f.ready();assert.equal((await f.mutate(home,'prepare_elf_invitation')).status,400);
  await f.mutate(home,'confirm',{beforeMinutes:0,afterMinutes:0});assert.equal((await f.mutate(home,'prepare_elf_invitation')).status,200);
  assert.equal((await f.db.prepare('SELECT collection_enabled FROM hq_elf_invitation_plans').first())!.collection_enabled,0);
  const session=await(await f.call('/hq/api/session')).json() as {elfCollectionEnabled:boolean;notificationsEnabled:boolean};assert.equal(session.elfCollectionEnabled,false);assert.equal(session.notificationsEnabled,false);
  assert.equal((await f.call('/hq/api/elf-notes',{childName:'rejected'})).status,404);
  const other=await f.ready({...syntheticRequest(),serviceId:'trivia'},{...syntheticQuote(),durationMinutes:60,time:'16:00'});await f.mutate(other,'confirm',{beforeMinutes:0,afterMinutes:0});assert.equal((await f.mutate(other,'prepare_elf_invitation')).status,400);
});
test('private child fields, free-text planning notes and forged lifecycle fields cannot enter manual requests',async()=>{
  for(const patch of [{elfNotes:'no'},{diagnosis:'no'},{birthdate:'no'},{school:'no'},{instructions:'no'},{answers:{triviaPlan:'no'}},{sensoryFriendly:{medical:'no'}},{status:'confirmed'}]) assert.equal((await f.call('/hq/api/bookings',{source:'phone',request:{...syntheticRequest(),...patch}})).status,400);
});
test('database outage fails without leaking query or customer details',async()=>{
  const env={...f.env,DB:{prepare(){throw new Error('private SQL and contact details');}} as unknown as Database};
  const r=await f.call('/hq/api/bookings',undefined,{env});assert.equal(r.status,503);assert.equal(await r.text(),'{"error":"hq_unavailable"}');
});
test('resource blocks are enforced at confirmation and releases are audited/idempotent',async()=>{
  const id=await f.ready();const blockId=crypto.randomUUID(),key=crypto.randomUUID();
  const block={id:blockId,resource:'santa',date:'2027-12-20',time:'14:00',durationMinutes:60};
  assert.equal((await f.call('/hq/api/unavailable',block,{key})).status,200);
  assert.equal((await f.call('/hq/api/unavailable',block,{key})).status,200);
  assert.equal((await f.call('/hq/api/unavailable',{...block,time:'16:00'},{key})).status,409);
  assert.equal((await f.mutate(id,'confirm',{beforeMinutes:0,afterMinutes:0})).status,409);
  const releaseKey=crypto.randomUUID();
  assert.equal((await f.call('/hq/api/unavailable',{action:'release',id:blockId},{key:releaseKey})).status,200);
  assert.equal((await f.call('/hq/api/unavailable',{action:'release',id:blockId},{key:releaseKey})).status,200);
  assert.equal((await f.mutate(id,'confirm',{beforeMinutes:0,afterMinutes:0})).status,200);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM hq_resource_operations').first())!.n,2);
});
test('Today uses server New York day and confirmed appointment; calendar follows applied reschedule',async()=>{
  const id=await f.ready({...syntheticRequest(),timing:{date:'2026-11-02',time:'14:00'}},{...syntheticQuote(),date:'2026-11-02',time:'14:00',expiryDate:'2026-11-02',expiryTime:'13:00'});
  await f.mutate(id,'confirm',{beforeMinutes:0,afterMinutes:0});
  const today=await(await f.call('/hq/api/bookings?view=today&date=2027-12-20')).json() as {bookings:{state:{id:string}}[]};assert.equal(today.bookings.length,1);assert.equal(today.bookings[0].state.id,id);
  const calendar=await(await f.call('/hq/api/bookings?view=calendar&date=2026-11-03')).json() as {bookings:unknown[]};assert.equal(calendar.bookings.length,0);
});
test('incoming actor, acceptance, and schedule flags cannot override authorization/lifecycle',async()=>{
  const id=(await f.create()).id;
  assert.equal((await f.mutate(id,'confirm',{actor:'santa',acceptance:{},scheduleCheck:{conflictFree:true,staffingVerified:true},beforeMinutes:0,afterMinutes:0})).status,400);
  assert.equal((await stored(id))!.status,'pending');
});
test('booth reschedule needs new staffing; old reservations survive failure',async()=>{
  const id=await f.ready({...syntheticRequest(),serviceId:'photo-booth'},{...syntheticQuote(),durationMinutes:240});
  await f.mutate(id,'verify_staffing',{attendantRef:'Attendant A'});await f.mutate(id,'confirm',{beforeMinutes:0,afterMinutes:0});
  const old=await reservations(id);
  await f.mutate(id,'propose_reschedule',{quote:{...syntheticQuote(),time:'16:00',durationMinutes:240}});
  await f.mutate(id,'share_reschedule',{channel:'phone',quoteCommunicated:true});await f.mutate(id,'record_change_agreement',{channel:'phone',customerAgreed:true});
  assert.equal((await f.mutate(id,'apply_reschedule',{beforeMinutes:0,afterMinutes:0})).status,409);assert.deepEqual(await reservations(id),old);
  await f.mutate(id,'verify_staffing',{attendantRef:'Attendant B'});
  assert.equal((await f.mutate(id,'apply_reschedule',{beforeMinutes:0,afterMinutes:0})).status,200);assert.notDeepEqual(await reservations(id),old);
});
