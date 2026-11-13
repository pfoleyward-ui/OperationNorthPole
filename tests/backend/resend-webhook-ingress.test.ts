import test from 'node:test';
import assert from 'node:assert/strict';
import {routeWebhookIngress} from '../../workers/resend-webhook.ts';
const origin='https://webhooks-staging.santablizard.com',path='/webhooks/resend';
test('webhook ingress is staging-only, gated, exact-path POST JSON with bounded declared size',async()=>{
 let calls=0;const binding={fetch:async()=>{calls++;return Response.json({received:true})}};const env={RESEND_WEBHOOK_INGRESS_ENABLED:'true',NOTIFY_WEBHOOK:binding};
 for(const url of [origin+'/',origin+'/hq',origin+'/deliveries/example',origin+path+'?x=1','https://staging.santablizard.com'+path,'https://santablizard.com'+path])assert.equal((await routeWebhookIngress(new Request(url),env)).status,404);
 assert.equal((await routeWebhookIngress(new Request(origin+path),{...env,RESEND_WEBHOOK_INGRESS_ENABLED:'false'})).status,404);
 assert.equal((await routeWebhookIngress(new Request(origin+path),env)).status,405);
 assert.equal((await routeWebhookIngress(new Request(origin+path,{method:'POST',body:'{}'}),env)).status,415);
 assert.equal((await routeWebhookIngress(new Request(origin+path,{method:'POST',headers:{'content-type':'application/json','content-length':'40000'},body:'{}'}),env)).status,413);assert.equal(calls,0);
});
test('raw webhook bytes and signatures reach private verifier; no unsigned acceptance or send API',async()=>{
 const raw='{ "type": "email.delivered", "data": {} }';let calls=0;
 const response=await routeWebhookIngress(new Request(origin+path,{method:'POST',headers:{'content-type':'application/json','svix-id':'synthetic-id','svix-timestamp':'1','svix-signature':'synthetic-invalid'},body:raw}),{RESEND_WEBHOOK_INGRESS_ENABLED:'true',NOTIFY_WEBHOOK:{fetch:async request=>{calls++;assert.equal(request.url,'https://notify.internal/webhooks/resend');assert.equal(await request.text(),raw);assert.equal(request.headers.get('svix-signature'),'synthetic-invalid');return Response.json({error:'invalid_signature'},{status:401,headers:{'set-cookie':'must-not-forward'}})}}});
 assert.equal(calls,1);assert.equal(response.status,401);assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('cache-control'),'no-store');
 const broken=await routeWebhookIngress(new Request(origin+path,{method:'POST',headers:{'content-type':'application/json'},body:raw}),{RESEND_WEBHOOK_INGRESS_ENABLED:'true',NOTIFY_WEBHOOK:{fetch:async()=>{throw new Error('failure')}}});assert.equal(broken.status,503);
});
