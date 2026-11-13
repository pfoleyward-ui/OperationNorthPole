import {test} from 'node:test';
import assert from 'node:assert/strict';
import {send,poll} from '../../workers/notifications/providers.ts';
test('provider requests use Workers-supported manual redirects and reject redirected receipts',async()=>{
 let calls=0;
 const fetcher:typeof fetch=async(url,init)=>{calls++;assert.equal(new URL(String(url)).hostname,'api.resend.com');assert.equal(init?.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://untrusted.example.test'}});};
 const env={RESEND_API_KEY:'synthetic',EMAIL_FROM:'santa@example.test'};
 const message={idempotencyKey:'synthetic-redirect-test',recipientKey:'santa-test',channel:'email' as const,subject:'Synthetic',text:'Synthetic',expiresAt:Date.now()+60000};
 assert.equal((await send(message,'santa@example.test',env,fetcher)).state,'uncertain');
 assert.equal((await poll('email','synthetic-id',env,fetcher)).code,'receipt_lookup_retry');assert.equal(calls,2);
});
