import {test} from 'node:test';import assert from 'node:assert/strict';
import {integrationFixture} from './integration-fixture.ts';import {testNow} from './hq-fixture.ts';
import {calendarHealth} from '../../workers/booking/google.ts';
import {checkProductionCalendar} from '../../workers/production-calendar-check.ts';
test('calendar health reads only the bound calendar and reports ownership without identifiers or tokens',async()=>{
 const f=await integrationFixture();try{await f.connect();const before={writes:f.google.eventWrites,creates:f.google.createCalls};const health=await calendarHealth(f.env,f.fetcher,testNow);assert.deepEqual(health,{connected:true,calendarReachable:true,calendarIdentityMatches:true,calendarNameMatches:true,calendarOwnershipMatches:true});assert.equal(f.google.eventWrites,before.writes);assert.equal(f.google.createCalls,before.creates);assert.ok(!JSON.stringify(health).includes('synthetic-access-token'));
 f.google.calendar!.description='unrelated';assert.equal((await calendarHealth(f.env,f.fetcher,testNow)).calendarOwnershipMatches,false);
 }finally{await f.dispose();}
});
test('production calendar runner defaults off, refuses active launch gates, and sanitizes outages',async()=>{
 const f=await integrationFixture();try{await f.connect();let calls=0;const fetcher:typeof fetch=async()=>{calls++;throw Error('secret-must-not-echo');};const env={...f.env,INTEGRATION_INSTALLATION_ID:'santablizard-production-20261110',PRODUCTION_CALENDAR_CHECK:'true',INTEGRATION_PLANNER_ENABLED:'false',CALENDAR_SYNC_ENABLED:'false',NOTIFICATION_DELIVERY_ENABLED:'false',CUSTOMER_EMAIL_ENABLED:'false',ELF_NOTES_ENABLED:'false',ELF_RETENTION_APPROVED:'false'};
 await checkProductionCalendar({...env,PRODUCTION_CALENDAR_CHECK:undefined},testNow,fetcher);await checkProductionCalendar({...env,CALENDAR_SYNC_ENABLED:'true'},testNow,fetcher);assert.equal(calls,0);await checkProductionCalendar(env,testNow,fetcher);assert.equal(calls,1);const row=await f.db.prepare("SELECT value FROM integration_control WHERE key='production-calendar-health-20261125-v1'").first<{value:string}>();assert.ok(row);assert.ok(!row.value.includes('secret-must-not-echo'));assert.deepEqual(JSON.parse(row.value),{error:'calendar_health_unavailable'});await checkProductionCalendar(env,testNow,fetcher);assert.equal(calls,1);
 }finally{await f.dispose();}
});
