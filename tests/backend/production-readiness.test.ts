import {test} from 'node:test';import assert from 'node:assert/strict';
import {productionResendReadiness} from '../../workers/notifications/production-readiness.ts';
const env={HQ_ORIGIN:'https://hq.santablizard.com',RESEND_API_KEY:'re_synthetic-secret'};const url='https://notify.internal/readiness/production/resend';
test('production provider preflight is private GET-only with fixed URLs and sanitized results',async()=>{
 let calls=0;const provider:typeof fetch=async(input,init)=>{calls++;assert.equal(init?.redirect,'manual');assert.equal(init?.method,undefined);const path=String(input);assert.ok(['https://api.resend.com/domains','https://api.resend.com/domains/domain-test','https://api.resend.com/webhooks'].includes(path));return Response.json(path.endsWith('/domains')?{data:[{name:'mail.santablizard.com',id:'domain-test'}]}:path.endsWith('/webhooks')?{data:[{endpoint:'https://webhooks.santablizard.com/webhooks/resend',status:'enabled',events:['email.delivered','secret-field'],signing_secret:'never-echo'}]}:{name:'mail.santablizard.com',status:'verified',open_tracking:false,click_tracking:false,secret:'never-echo'});};
 for(const request of [new Request(url,{method:'POST'}),new Request(url+'?x=1'),new Request('https://public.test/readiness/production/resend')])assert.ok((await productionResendReadiness(request,env,provider)).status>=400);
 assert.equal((await productionResendReadiness(new Request(url),{...env,HQ_ORIGIN:'https://staging.santablizard.com'},provider)).status,404);assert.equal(calls,0);
 const result=await productionResendReadiness(new Request(url),env,provider);const body=await result.text();assert.equal(calls,3);assert.ok(!body.includes('never-echo'));assert.ok(!body.includes('synthetic-secret'));assert.equal(JSON.parse(body).webhookEnabled,true);assert.deepEqual(JSON.parse(body).events,['email.delivered']);
});
test('production provider rejection does not disclose upstream response or attempt sending',async()=>{
 const response=await productionResendReadiness(new Request(url),env,async()=>Response.json({secret:'never-echo'},{status:401}));assert.deepEqual(await response.json(),{authenticationSucceeded:false,providerHttpStatus:401});
});

test('wrong-service credentials are refused before any provider request',async()=>{
 let calls=0;const response=await productionResendReadiness(new Request(url),{...env,RESEND_API_KEY:'GOCSPX-synthetic-test-only'},async()=>{calls++;throw Error('must_not_call');});assert.equal(calls,0);assert.deepEqual(await response.json(),{error:'invalid_api_key_format'});
});

import {providerConfigured,send,poll} from '../../workers/notifications/providers.ts';
test('production send configuration rejects wrong-service keys without forwarding credentials',async()=>{
 const wrong={...env,EMAIL_FROM:'Santa <test@example.test>',RESEND_API_KEY:'GOCSPX-synthetic-test-only'};let calls=0;assert.equal(providerConfigured('email',wrong),false);const response=await send({idempotencyKey:'synthetic-operation-only',recipientKey:'test',channel:'email',subject:'test',text:'test',expiresAt:Date.now()+60000},'test@example.test',wrong,async()=>{calls++;throw Error('must_not_call');});assert.equal(calls,0);assert.equal(response.code,'provider_not_configured');const receipt=await poll('email','synthetic-provider-id',wrong,async()=>{calls++;throw Error('must_not_call');});assert.equal(receipt.code,'provider_not_configured');assert.equal(calls,0);
});
