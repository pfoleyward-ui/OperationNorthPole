import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hqFixture,testNow} from './hq-fixture.ts';
import {gatewayFixture} from './gateway-fixture.ts';
import {runBackendReadiness} from '../../workers/backend-readiness-test.ts';
test('isolated notes/reminder/ack rehearsal has no operational data access and sends only three generic messages',async()=>{
 const f=await hqFixture(),g=await gatewayFixture();let now=testNow;
 try{
  await f.db.prepare('CREATE TABLE synthetic_isolation_guard(database_id TEXT)').run();await f.db.prepare('INSERT INTO synthetic_isolation_guard VALUES(?)').bind('synthetic-database').run();
  Object.assign(g.gatewayEnv,{HQ_ORIGIN:'https://staging.santablizard.com',STAGING_TEST_RECIPIENT:'santablizard@gmail.com',GATEWAY_RECIPIENTS_JSON:JSON.stringify({'santa-stage':{channel:'email',destination:'santablizard@gmail.com'}})});
  const env={DB:f.env.DB,NOTIFY:g.gateway,BACKEND_READINESS_ENABLED:'true',TEST_DATABASE_ID:'synthetic-database',RUN_ID:'synthetic-backend-readiness-test',EXPIRES_AT:String(now+600000)};
  await runBackendReadiness(env,now,()=>now);
  const read=async()=>JSON.parse((await f.db.prepare('SELECT report FROM synthetic_backend_evidence').first<{report:string}>())!.report);
  let report=await read();assert.equal(report.phase,'waiting_for_real_due_time',JSON.stringify(report));assert.equal(g.email.calls,1);
  now=report.dueAt+1000;g.setNow(now);await runBackendReadiness(env,now,()=>now);report=await read();assert.equal(report.phase,'awaiting_signed_delivery',JSON.stringify(report));assert.equal(g.email.calls,3);
  now+=60001;g.setNow(now);await g.poll();await runBackendReadiness(env,now,()=>now);report=await read();assert.equal(report.phase,'passed',JSON.stringify(report));await runBackendReadiness(env,now,()=>now);assert.equal(g.email.calls,3);
  const messages=JSON.stringify([...g.email.sent.values()]);assert.ok(!messages.includes('Synthetic Readiness A'));assert.ok(!messages.includes('Synthetic Readiness B'));assert.match(messages,/A Gentle Jingle/);assert.match(messages,/The sleigh check is resolved/);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM elf_notes').first<{n:number}>())!.n,0);
 }finally{await f.dispose();await g.dispose();}
});
test('readiness runner is default-off and rejects operational database IDs before queries',async()=>{
 let calls=0;const env={DB:{prepare(){calls++;throw Error('must_not_query');},batch:async()=>[]},NOTIFY:{fetch:async()=>new Response('must_not_send')}};
 await runBackendReadiness(env);assert.equal(calls,0);
 await assert.rejects(runBackendReadiness({...env,BACKEND_READINESS_ENABLED:'true',RUN_ID:'synthetic-guard-test',TEST_DATABASE_ID:'4db01c7d-9271-4b68-9839-323bb6887c6f'}),/unsafe_test_binding/);assert.equal(calls,0);
});
