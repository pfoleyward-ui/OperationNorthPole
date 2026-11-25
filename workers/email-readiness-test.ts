/** Temporary, unrouted staging runner. No Resend key or public trigger. */
import type {Database} from './booking/repository.ts';
import {TEST_EMAIL_SUBJECT,FRESH_TEST_EMAIL_SUBJECT,RECOVERY_TEST_EMAIL_SUBJECT,TEST_EMAIL_TEXT} from './notifications/readiness.ts';
interface Env {DB:Database;NOTIFY:{fetch(request:Request):Promise<Response>};STAGING_EMAIL_TEST_ENABLED?:string;MODE?:string;RUN_ID?:string;EXPIRES_AT?:string;AUDIT_DELIVERY_KEY?:string;FRESH_DELIVERY_CHECK?:string;RECEIPT_RECOVERY_CHECK?:string}
export async function runEmailReadiness(env:Env,now=Date.now()){
 if(env.STAGING_EMAIL_TEST_ENABLED!=='true')return;
 if(!env.DB||!env.NOTIFY||!env.RUN_ID||!/^[A-Za-z0-9_-]{16,100}$/.test(env.RUN_ID)||!['preflight','send','receipt','replay'].includes(env.MODE||''))throw new Error('Invalid test configuration');
 const runId=env.RUN_ID;
 await env.DB.batch([env.DB.prepare('CREATE TABLE IF NOT EXISTS synthetic_email_evidence (id TEXT PRIMARY KEY,status TEXT NOT NULL,report TEXT NOT NULL,updated_at INTEGER NOT NULL)')]);
 const save=async(status:string,report:object)=>env.DB.batch([env.DB.prepare('INSERT INTO synthetic_email_evidence(id,status,report,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,report=json_patch(synthetic_email_evidence.report,excluded.report),updated_at=excluded.updated_at').bind(runId,status,JSON.stringify(report),now)]);
 if(env.MODE==='receipt'){
  if(!env.AUDIT_DELIVERY_KEY||!/^[A-Za-z0-9_-]{16,100}$/.test(env.AUDIT_DELIVERY_KEY))throw new Error('Invalid receipt key');
  const response=await env.NOTIFY.fetch(new Request('https://notify.internal/readiness/resend/receipts/'+env.AUDIT_DELIVERY_KEY));
  await save('receipt_audit',await response.json() as object);return;
 }
 if(env.MODE==='replay'){
  if(!env.AUDIT_DELIVERY_KEY||!/^[A-Za-z0-9_-]{16,100}$/.test(env.AUDIT_DELIVERY_KEY))throw new Error('Invalid replay key');
  const stored=await env.DB.prepare("SELECT payload_json FROM gateway_deliveries WHERE id=? AND state='delivered'").bind(env.AUDIT_DELIVERY_KEY).first<{payload_json:string}>();if(!stored)throw new Error('Replay requires a delivered test receipt');
  const message=JSON.parse(stored.payload_json) as {subject?:string;recipientKey?:string;text?:string};if(![TEST_EMAIL_SUBJECT,FRESH_TEST_EMAIL_SUBJECT,RECOVERY_TEST_EMAIL_SUBJECT].includes(message.subject||'')||message.recipientKey!=='santa-stage'||message.text!==TEST_EMAIL_TEXT)throw new Error('Not an approved test template');
  const claim=await env.DB.prepare("INSERT INTO synthetic_email_evidence(id,status,report,updated_at) VALUES(?,'replay_started','{}',?) ON CONFLICT(id) DO NOTHING RETURNING id").bind(runId,now).first();if(!claim)return;
  const response=await env.NOTIFY.fetch(new Request('https://notify.internal/deliveries/'+env.AUDIT_DELIVERY_KEY,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':env.AUDIT_DELIVERY_KEY},body:stored.payload_json}));
  const receipt=await response.json() as {status?:string};await save('replay_done',{gatewayHttpStatus:response.status,deliveryStatus:receipt.status||null,new_send_authorized:false});return;
 }
 const observe=async()=>{
  const response=await env.NOTIFY.fetch(new Request('https://notify.internal/deliveries/'+runId));
  const receipt=await response.json() as {status?:string;error?:string};
  await save(receipt.status||'not_accepted',{gatewayHttpStatus:response.status,deliveryStatus:receipt.status||null,error:receipt.error||null,replacement_send_authorized:false});
 };
 if(env.MODE==='send'&&await env.DB.prepare('SELECT id FROM synthetic_email_evidence WHERE id=?').bind(runId).first()){await observe();return;}
 const ready=await env.NOTIFY.fetch(new Request('https://notify.internal/readiness/resend'));const preflight=await ready.json() as {authenticationSucceeded?:boolean;domainVerified?:boolean;openTracking?:boolean;clickTracking?:boolean};
 if(env.MODE==='preflight'){await save('preflight',preflight);return;}
 if(!ready.ok||!preflight.authenticationSucceeded||!preflight.domainVerified||preflight.openTracking!==false||preflight.clickTracking!==false){await save('blocked',{reason:'provider_preflight_not_ready',preflight});return;}
 const expiresAt=Number(env.EXPIRES_AT);if(!Number.isSafeInteger(expiresAt)||expiresAt<=now||expiresAt>now+3600000){await save('blocked',{reason:'test_window_expired'});return;}
 // Claim before the handoff. Future cron invocations only read the same receipt;
 // a crash or uncertain outcome can never authorize a replacement email.
 const claim=await env.DB.prepare("INSERT INTO synthetic_email_evidence(id,status,report,updated_at) VALUES(?,'handoff_started','{}',?) ON CONFLICT(id) DO NOTHING RETURNING id").bind(env.RUN_ID,now).first();
 let response:Response;
 if(claim){
  // Separate the two provider preflight reads from the send request's rate window.
  await new Promise(resolve=>setTimeout(resolve,1100));
  const body={idempotencyKey:env.RUN_ID,recipientKey:'santa-stage',channel:'email',subject:env.RECEIPT_RECOVERY_CHECK==='true'?RECOVERY_TEST_EMAIL_SUBJECT:env.FRESH_DELIVERY_CHECK==='true'?FRESH_TEST_EMAIL_SUBJECT:TEST_EMAIL_SUBJECT,text:TEST_EMAIL_TEXT,expiresAt};
  try{response=await env.NOTIFY.fetch(new Request('https://notify.internal/deliveries/'+env.RUN_ID,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':env.RUN_ID},body:JSON.stringify(body)}));}
  catch{await save('uncertain',{reason:'handoff_response_unavailable',replacement_send_authorized:false});return;}
 }else response=await env.NOTIFY.fetch(new Request('https://notify.internal/deliveries/'+env.RUN_ID));
 const receipt=await response.json() as {status?:string;error?:string;stagingFaultInjectionApplied?:boolean};
 await save(receipt.status||'not_accepted',{gatewayHttpStatus:response.status,initialGatewayDeliveryStatus:claim?receipt.status||null:undefined,stagingFaultInjectionApplied:receipt.stagingFaultInjectionApplied===true,deliveryStatus:receipt.status||null,error:receipt.error||null,replacement_send_authorized:false});
}
export default {fetch(){return new Response('Not found',{status:404});},scheduled(_event:unknown,env:Env,ctx:{waitUntil(p:Promise<unknown>):void}){ctx.waitUntil(runEmailReadiness(env).catch(()=>undefined));}};
