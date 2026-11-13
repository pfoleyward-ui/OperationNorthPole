import test from 'node:test';
import assert from 'node:assert/strict';
import {resendReadiness,TEST_EMAIL_SUBJECT,FRESH_TEST_EMAIL_SUBJECT,TEST_EMAIL_TEXT} from '../../workers/notifications/readiness.ts';
import {gatewayFixture} from './gateway-fixture.ts';
import {handleGateway} from '../../workers/notifications/index.ts';
import {runEmailReadiness} from '../../workers/email-readiness-test.ts';
import {testNow} from './hq-fixture.ts';
const origin='https://staging.santablizard.com';
test('provider diagnostic is private staging-only, read-only and never echoes credentials/provider bodies',async()=>{
 const env={HQ_ORIGIN:origin,STAGING_TEST_RECIPIENT:'santa@example.test',RESEND_API_KEY:'synthetic-secret'};let calls=0;
 const failed=async()=>{calls++;return Response.json({secret:'must-not-echo'},{status:401})};
 assert.equal((await resendReadiness(new Request('https://public.test/readiness/resend'),env,failed)).status,404);
 assert.equal((await resendReadiness(new Request('https://notify.internal/readiness/resend'),{...env,HQ_ORIGIN:'https://production.test'},failed)).status,404);
 assert.equal((await resendReadiness(new Request('https://notify.internal/readiness/resend',{method:'POST'}),env,failed)).status,405);assert.equal(calls,0);
 const response=await resendReadiness(new Request('https://notify.internal/readiness/resend'),env,failed);assert.deepEqual(await response.json(),{authenticationSucceeded:false,providerHttpStatus:401});
 const good=await resendReadiness(new Request('https://notify.internal/readiness/resend'),env,async(url,init)=>{assert.equal(init?.redirect,'manual');return Response.json(String(url).endsWith('/domains')?{data:[{id:'domain-test',name:'mail.santablizard.com'}]}:{name:'mail.santablizard.com',status:'verified',open_tracking:false,click_tracking:false})});assert.deepEqual(await good.json(),{authenticationSucceeded:true,domainFound:true,domainVerified:true,openTracking:false,clickTracking:false});
});
async function fixture(){
 const f=await gatewayFixture();Object.assign(f.gatewayEnv,{HQ_ORIGIN:origin,STAGING_TEST_RECIPIENT:'santa@example.test',GATEWAY_RECIPIENTS_JSON:JSON.stringify({'santa-stage':{channel:'email',destination:'santa@example.test'}})});
 const provider:typeof fetch=async(url,init)=>String(url)==='https://api.resend.com/domains'?Response.json({data:[{id:'domain-test',name:'mail.santablizard.com'}]}):String(url)==='https://api.resend.com/domains/domain-test'?Response.json({name:'mail.santablizard.com',status:'verified',open_tracking:false,click_tracking:false}):f.provider(url,init);
 const runner={DB:f.db,NOTIFY:{fetch:(r:Request)=>handleGateway(r,f.gatewayEnv,provider,testNow)},STAGING_EMAIL_TEST_ENABLED:'true',MODE:'send',RUN_ID:'synthetic-email-smoke-test-v1',EXPIRES_AT:String(testNow+600000)};
 return {...f,runner};
}
test('fixed test template cannot become arbitrary mail and one-shot runner never repeats the send',async()=>{
 const f=await fixture();try{
 const key=crypto.randomUUID();const invalid={idempotencyKey:key,recipientKey:'santa-stage',channel:'email',subject:TEST_EMAIL_SUBJECT,text:TEST_EMAIL_TEXT+' extra content',expiresAt:testNow+600000};assert.equal((await f.gatewayCall(key,invalid)).status,400);assert.equal(f.email.calls,0);
 await runEmailReadiness(f.runner,testNow);await runEmailReadiness(f.runner,testNow+1000);assert.equal(f.email.calls,1);const body=[...f.email.sent.values()][0].body;assert.equal(body.subject,'[STAGING TEST] '+TEST_EMAIL_SUBJECT);assert.equal(body.text,TEST_EMAIL_TEXT);assert.deepEqual(body.to,['santa@example.test']);
 }finally{await f.dispose();}
});
test('uncertain one-shot handoff and preflight-only mode do not authorize a replacement message',async()=>{
 const f=await fixture();try{
 await runEmailReadiness({...f.runner,MODE:'preflight',RUN_ID:'synthetic-email-preflight-test'},testNow);assert.equal(f.email.calls,0);
 f.email.loseResponse=true;await runEmailReadiness(f.runner,testNow);await runEmailReadiness(f.runner,testNow+1000);assert.equal(f.email.calls,1);assert.equal((await f.db.prepare('SELECT state FROM gateway_deliveries WHERE id=?').bind(f.runner.RUN_ID).first())?.state,'uncertain');
 }finally{await f.dispose();}
});

test('receipt audit reads only the approved test receipt, sanitizes metadata and cannot send another message',async()=>{
 const f=await fixture();try{
 await runEmailReadiness(f.runner,testNow);assert.equal(f.email.calls,1);
 const env={...f.runner,MODE:'receipt',RUN_ID:'synthetic-email-receipt-audit',AUDIT_DELIVERY_KEY:f.runner.RUN_ID,NOTIFY:{fetch:(r:Request)=>handleGateway(r,f.gatewayEnv,async(url,init)=>{
 assert.ok(String(url).startsWith('https://api.resend.com/emails/'));assert.notEqual(init?.method,'POST');
 return Response.json({id:'email-0',to:['santa@example.test'],from:f.gatewayEnv.EMAIL_FROM,reply_to:[f.gatewayEnv.EMAIL_REPLY_TO],subject:'[STAGING TEST] '+TEST_EMAIL_SUBJECT,last_event:'delivered',created_at:'2026-11-13T20:00:00Z',text:'must-not-return'});
 },testNow)}};
 await runEmailReadiness(env,testNow);assert.equal(f.email.calls,1);
 const row=await f.db.prepare('SELECT report FROM synthetic_email_evidence WHERE id=?').bind(env.RUN_ID).first<{report:string}>();const metadata=JSON.parse(row!.report);assert.equal(metadata.recipientMatchesApproved,true);assert.equal(metadata.providerIdentityMatches,true);assert.equal(metadata.fromMatchesConfigured,true);assert.equal(metadata.replyToMatchesConfigured,true);assert.equal(metadata.lastEvent,'delivered');assert.ok(!row!.report.includes('must-not-return'));
 f.gatewayEnv.STAGING_TEST_RECIPIENT='different@example.test';const response=await f.runner.NOTIFY.fetch(new Request('https://notify.internal/readiness/resend/receipts/'+f.runner.RUN_ID));assert.equal(response.status,404);assert.equal(f.email.calls,1);
 }finally{await f.dispose();}
});


test('explicit fresh check uses its fixed distinct subject and still sends at most once',async()=>{
 const f=await fixture();try{const env={...f.runner,RUN_ID:'synthetic-fresh-delivery-test-v2',FRESH_DELIVERY_CHECK:'true'};await runEmailReadiness(env,testNow);await runEmailReadiness(env,testNow+1000);assert.equal(f.email.calls,1);assert.equal([...f.email.sent.values()][0].body.subject,'[STAGING TEST] '+FRESH_TEST_EMAIL_SUBJECT);}finally{await f.dispose();}
});
