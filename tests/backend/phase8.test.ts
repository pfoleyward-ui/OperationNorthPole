import test from 'node:test';
import assert from 'node:assert/strict';
import {integrationFixture} from './integration-fixture.ts';
import {gatewayFixture} from './gateway-fixture.ts';
import {testNow,syntheticQuote} from './hq-fixture.ts';
import {runIntegrations} from '../../workers/booking/integration-runner.ts';
import {routeSite} from '../../workers/site-router.ts';
import {target} from '../../workers/booking/integration-config.ts';

test('customer confirmation/reschedule/cancellation emails and native popup use real gateway, private destinations and deduplication',async()=>{
 const f=await integrationFixture(),g=await gatewayFixture();try{
  g.gatewayEnv.BOOKING_DB=f.env.DB;f.env.NOTIFY=g.gateway;f.env.CUSTOMER_EMAIL_ENABLED='true';f.env.NATIVE_CALENDAR_REMINDER_MINUTES='10';f.google.nativeReminderMinutes=10;
  await f.connect();const id=await f.ready();await f.mutate(id,'confirm',{beforeMinutes:0,afterMinutes:0});
  await runIntegrations(f.env,testNow,f.fetcher);assert.equal(f.google.events.size,1);
  const customer=()=>[...g.email.sent.values()].filter(v=>(v.body.to as string[]).includes('sample@example.test'));
  assert.equal(customer().length,1);assert.match(String(customer()[0].body.text),/confirmed your booking/);
  await runIntegrations(f.env,testNow+1,f.fetcher);assert.equal(customer().length,1);
  await f.mutate(id,'prepare_elf_invitation');await runIntegrations(f.env,testNow+2,f.fetcher);assert.equal(customer().length,1);
  for(const [action,data]of [['propose_reschedule',{quote:{...syntheticQuote(),date:'2027-12-21',time:'15:00'}}],['share_reschedule',{channel:'email',quoteCommunicated:true}],['record_change_agreement',{channel:'email',customerAgreed:true}],['apply_reschedule',{beforeMinutes:0,afterMinutes:0}]] as const){assert.equal((await f.mutate(id,action,data)).status,200);if(action==='share_reschedule')await runIntegrations(f.env,testNow+3,f.fetcher);}
  await runIntegrations(f.env,testNow+4,f.fetcher);assert.equal(customer().length,3);assert.match(String(customer()[1].body.text),/proposal/);assert.match(String(customer()[2].body.text),/Tuesday, December 21, 2027/);
  await f.mutate(id,'cancel');await runIntegrations(f.env,testNow+5,f.fetcher);assert.equal(customer().length,4);assert.match(String(customer()[3].body.text),/canceled/);assert.equal(f.google.events.size,0);
  for(const value of g.email.sent.values()){assert.ok(!JSON.stringify(value.body).includes('Synthetic Hudson Valley venue'));assert.ok(!JSON.stringify(value.body).includes('Sample Adult'));assert.ok(!JSON.stringify(value.body).includes('sensory'));}
 }finally{await f.dispose();await g.dispose();}
});
test('site stages protect HTML and assets with verified Access, proxy only booking/HQ, and reject legacy SMS routes',async()=>{
 const f=await integrationFixture();try{
  const env={...f.env,CUSTOMER_BOOKING_MODE:'staging',SITE_STAGING_ENABLED:'true',BOOKING:{fetch:async()=>new Response('private-booking')}};
  const site={fetch:async()=>new Response('protected-site')};
  for(const path of ['/book','/_next/static/test.js','/hq','/api/bookings']){
   assert.equal((await routeSite(new Request(env.HQ_ORIGIN+path),env,{},site,f.fetcher,testNow)).status,401);
   const response=await routeSite(new Request(env.HQ_ORIGIN+path,{headers:{'cf-access-jwt-assertion':f.signed}}),env,{},site,f.fetcher,testNow);assert.equal(response.status,200);
  }
  assert.equal((await routeSite(new Request(env.HQ_ORIGIN+'/book'),{...env,SITE_STAGING_ENABLED:'false'},{},site,f.fetcher,testNow)).status,503);
  assert.equal(target({...f.env,NOTIFICATION_TARGETS_JSON:'{"mrs_claus":{"recipientKey":"old","channel":"sms"}}'},'mrs_claus'),null);
 }finally{await f.dispose();}
});

test('additive booking migration preserves historical delivery identities and receipts',async()=>{
 const {hqFixture}=await import('./hq-fixture.ts');const {readFile}=await import('node:fs/promises');
 const f=await hqFixture(false);try{
  const booking=await f.create();
  await f.db.prepare(`INSERT INTO integration_jobs(id,booking_id,kind,recipient,due_at,expires_at,next_at,state,provider_id,payload_json,updated_at) VALUES(?,?,'new_request','santa',?,?,?,'accepted',?,?,?)`).bind('historical-delivery',booking.id,testNow,testNow+86400000,testNow+60000,'original-provider-id','{"frozen":"unchanged"}',testNow).run();
  const before=await f.db.prepare('SELECT * FROM integration_jobs').all();
  const sql=await readFile(new URL('../../migrations/0004_customer_email.sql',import.meta.url),'utf8');
  await f.db.batch(sql.replace(/--[^\n]*/g,'').split(';').filter(s=>s.trim()).map(s=>f.db.prepare(s)));
  assert.deepEqual((await f.db.prepare('SELECT * FROM integration_jobs').all()).results,before.results);
  await f.db.prepare(`INSERT INTO integration_jobs(id,booking_id,kind,recipient,due_at,expires_at,next_at,state,updated_at) VALUES(?,?,'customer_update','customer',?,?,?,'queued',?)`).bind('new-customer-delivery',booking.id,testNow,testNow+86400000,testNow,testNow).run();
 }finally{await f.dispose();}
});

test('native calendar alerts skip quiet hours and collisions with approved email reminders',async()=>{
 const {nativeReminders}=await import('../../workers/booking/google.ts');const {wall}=await import('../../workers/booking/integration-config.ts');
 const f=await integrationFixture();try{
  const env={...f.env,NATIVE_CALENDAR_REMINDER_MINUTES:'10'};
  assert.deepEqual(nativeReminders(env,wall('2027-12-20','14:00')!),[{method:'popup',minutes:10}]);
  assert.deepEqual(nativeReminders(env,wall('2027-12-20','06:30')!),[]);
  assert.deepEqual(nativeReminders(env,wall('2027-12-20','08:10')!),[]);
  assert.deepEqual(nativeReminders({...env,NATIVE_CALENDAR_REMINDER_MINUTES:'180'},wall('2027-12-20','14:00')!),[]);
 }finally{await f.dispose();}
});
