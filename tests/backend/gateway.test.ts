import test from 'node:test';
import assert from 'node:assert/strict';
import {gatewayFixture,operationalMessage} from './gateway-fixture.ts';
import {testNow,syntheticRequest} from './hq-fixture.ts';
import {handleBooking} from '../../workers/booking/index.ts';
import {customerEmailState,customerEmailText} from '../../workers/booking/customer-email.ts';
import {snapshot} from '../../workers/booking/integration-plan.ts';

test('durable email acceptance, concurrent duplicate suppression, payload conflict, and delivery reconciliation',async()=>{
 const f=await gatewayFixture();try{const m=operationalMessage();
 const results=await Promise.all(Array.from({length:5},()=>f.gatewayCall(m.idempotencyKey,m)));assert.ok(results.every(r=>r.status===200));assert.equal(f.email.calls,1);
 assert.equal((await f.gatewayCall(m.idempotencyKey,{...m,subject:'A Gentle Jingle'})).status,409);
 f.setNow(testNow+60001);await f.poll();assert.equal((await(await f.gatewayCall(m.idempotencyKey)).json()).status,'delivered');assert.equal(f.email.calls,1);
 }finally{await f.dispose();}
});
test('known rate rejection retries once; lost provider response is uncertain and never blindly resent',async()=>{
 const f=await gatewayFixture();try{const m=operationalMessage();f.email.rateLimit=true;assert.equal((await f.gatewayCall(m.idempotencyKey,m)).status,503);
 assert.equal((await f.gatewayCall(m.idempotencyKey,m)).status,503);f.setNow(testNow+60001);assert.equal((await f.gatewayCall(m.idempotencyKey,m)).status,200);assert.equal(f.email.sent.size,1);
 const other=operationalMessage();f.email.loseResponse=true;assert.equal((await(await f.gatewayCall(other.idempotencyKey,other)).json()).status,'uncertain');
 await f.gatewayCall(other.idempotencyKey,other);assert.equal(f.email.calls,3);assert.equal(f.email.sent.size,2);
 }finally{await f.dispose();}
});
test('email-only allowlist, generic copy, private routes, deadline and disabled delivery fail closed',async()=>{
 const f=await gatewayFixture();try{for(const edit of [{channel:'sms'},{recipientKey:'unapproved'},{subject:'Child personal details'},{text:'DO_NOT_EXPORT child notes'},{expiresAt:testNow-1}]){
 const m={...operationalMessage(),...edit};assert.ok((await f.gatewayCall(m.idempotencyKey,m)).status>=400);}
 f.gatewayEnv.GATEWAY_DELIVERY_ENABLED='false';const m=operationalMessage();assert.equal((await f.gatewayCall(m.idempotencyKey,m)).status,503);assert.equal(f.email.calls,0);
 }finally{await f.dispose();}
});
test('protected staging intake requires verified Santa identity even with public intake off',async()=>{
 const f=await gatewayFixture();try{
 const env={...f.env,STAGING_INTAKE_ENABLED:'true',PUBLIC_INTAKE_ENABLED:'false',BOOKING_ORIGIN:f.env.HQ_ORIGIN,TURNSTILE_SECRET:'synthetic-only'};
 const fetcher:typeof fetch=async(url,init)=>String(url).includes('siteverify')?Response.json({success:true,hostname:'hq.example.test',action:'booking'}):f.jwksFetch(url,init);
 const submit=(token?:string)=>handleBooking(new Request(f.env.HQ_ORIGIN+'/api/bookings',{method:'POST',headers:{Origin:f.env.HQ_ORIGIN!,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1','Idempotency-Key':'synthetic-staging-key',...(token?{'CF-Access-Jwt-Assertion':token}:{})},body:JSON.stringify({request:syntheticRequest(),botToken:'synthetic-proof'})}),env,fetcher,testNow);
 assert.equal((await submit()).status,403);assert.equal((await submit(await f.token('backup-subject'))).status,403);const result=await submit(f.signed);assert.equal(result.status,200);assert.equal((await result.json()).status,'pending');
 }finally{await f.dispose();}
});
test('customer destination comes only from private booking; templates and state must match',async()=>{
 const f=await gatewayFixture();try{const id=await f.ready();await f.mutate(id,'confirm',{beforeMinutes:0,afterMinutes:0});const s=(await snapshot(f.env.DB,id))!;
 const m={...operationalMessage(),recipientKey:'customer_'+id,subject:'An update about your SantaBlizard booking',text:customerEmailText(s),customerState:customerEmailState(s)};
 assert.equal((await f.gatewayCall(m.idempotencyKey,{...m,text:'Private child details'})).status,410);
 assert.equal((await f.gatewayCall(m.idempotencyKey,m)).status,200);const body=[...f.email.sent.values()][0].body;assert.deepEqual(body.to,['sample@example.test']);assert.ok(!String(body.text).includes('/hq'));
 const next={...m,idempotencyKey:crypto.randomUUID()};await f.mutate(id,'cancel');assert.equal((await f.gatewayCall(next.idempotencyKey,next)).status,410);
 }finally{await f.dispose();}
});

test('signed receipt recovers a lost provider ID, rejects forgery/replay/stale timestamp, and never resends',async()=>{
 const f=await gatewayFixture();try{
 const {handleWebhook}=await import('../../workers/notifications/index.ts');
 const secret='synthetic-webhook-key-at-least-32-bytes';f.gatewayEnv.RESEND_WEBHOOK_SECRET='whsec_'+btoa(secret);
 const m=operationalMessage();f.email.loseResponse=true;await f.gatewayCall(m.idempotencyKey,m);
 const provider=[...f.email.sent.values()][0];
 const raw=JSON.stringify({type:'email.delivered',data:{email_id:provider.id,tags:{onp_delivery:m.idempotencyKey}}});
 const id='synthetic-svix-event',time=String(Math.floor(testNow/1000));
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signed=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(id+'.'+time+'.'+raw)))));
 const request=(signature=signed)=>new Request('https://staging.example.test/webhooks/resend',{method:'POST',headers:{'svix-id':id,'svix-timestamp':time,'svix-signature':'v1,'+signature},body:raw});
 assert.equal((await handleWebhook(request('forged'),f.gatewayEnv,testNow)).status,403);
 assert.equal((await handleWebhook(request(),f.gatewayEnv,testNow+300001)).status,403);
 assert.equal((await handleWebhook(request(),f.gatewayEnv,testNow)).status,200);assert.equal((await handleWebhook(request(),f.gatewayEnv,testNow)).status,200);
 assert.equal((await(await f.gatewayCall(m.idempotencyKey)).json()).status,'delivered');assert.equal(f.email.calls,1);
 assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM gateway_webhook_receipts').first<{n:number}>())!.n,1);
 }finally{await f.dispose();}
});

test('slow gateway preparation cannot cross quiet hours or the delivery deadline',async()=>{
 const f=await gatewayFixture();try{
  const {handleGateway}=await import('../../workers/notifications/index.ts');
  const m=operationalMessage();
  const request=()=>new Request('https://notify.internal/deliveries/'+m.idempotencyKey,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':m.idempotencyKey},body:JSON.stringify(m)});
  assert.equal((await handleGateway(request(),f.gatewayEnv,f.provider,testNow,()=>m.expiresAt)).status,410);
  const other=operationalMessage();const r=new Request('https://notify.internal/deliveries/'+other.idempotencyKey,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':other.idempotencyKey},body:JSON.stringify(other)});
  assert.equal((await handleGateway(r,f.gatewayEnv,f.provider,testNow,()=>Date.parse('2026-11-03T02:00:00Z'))).status,503);assert.equal(f.email.calls,0);
 }finally{await f.dispose();}
});


test('real staging test mode restricts both operational and customer mail to the approved inbox and labels subjects',async()=>{
 const f=await gatewayFixture();try{
 f.gatewayEnv.HQ_ORIGIN='https://staging.santablizard.com';
 const message=()=>{const m=operationalMessage();return {...m,text:m.text.replace('https://hq.example.test','https://staging.santablizard.com')}};
 let m=message();assert.equal((await f.gatewayCall(m.idempotencyKey,m)).status,503);assert.equal(f.email.calls,0);
 f.gatewayEnv.STAGING_TEST_RECIPIENT='santa@example.test';m=message();assert.equal((await f.gatewayCall(m.idempotencyKey,m)).status,200);assert.equal(f.email.calls,1);
 const sent=[...f.email.sent.values()][0].body;assert.deepEqual(sent.to,['santa@example.test']);assert.equal(sent.subject,'[STAGING TEST] A new letter has arrived!');
 m={...message(),recipientKey:'mrs-test'};assert.equal((await f.gatewayCall(m.idempotencyKey,m)).status,403);assert.equal(f.email.calls,1);
 const id=await f.ready();await f.mutate(id,'confirm',{beforeMinutes:0,afterMinutes:0});const booking=(await snapshot(f.env.DB,id))!;
 const customer={...message(),recipientKey:'customer_'+id,subject:'An update about your SantaBlizard booking',text:customerEmailText(booking),customerState:customerEmailState(booking)};
 assert.equal((await f.gatewayCall(customer.idempotencyKey,customer)).status,403);assert.equal(f.email.calls,1);
 }finally{await f.dispose();}
});
