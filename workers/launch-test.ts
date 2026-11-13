/** Private, synthetic-only staging test runner. Never bind production databases.
 * No fetch API, no routes, no external network calls. Delete after evidence capture.
 */
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {handleBooking,type Env} from './booking/index.ts';
import {handleHq} from './booking/hq.ts';
import {handleElf,maintainElf} from './booking/elf-notes.ts';
import {handleGateway,type GatewayEnv} from './notifications/index.ts';
import {runIntegrations} from './booking/integration-runner.ts';
import {GOOGLE_SCOPE} from './booking/google.ts';
import type {Database} from './booking/repository.ts';
type Bindings={DB:Database;EMAIL_DB:Database;BOOKING:{fetch(r:Request):Promise<Response>};NOTIFY:{fetch(r:Request):Promise<Response>};RUN_ID:string};
async function run(bindings:Bindings){
 const db=bindings.DB;const checks:{name:string;passed:boolean}[]=[];const ids:string[]=[];const deliveryKeys=new Set<string>();const diagnostics:unknown[]=[];let phase='start';
 const check=(name:string,condition:unknown)=>{checks.push({name,passed:!!condition});if(!condition)throw Error('check_failed');};
 await db.batch([db.prepare('CREATE TABLE IF NOT EXISTS synthetic_launch_evidence (id TEXT PRIMARY KEY,status TEXT,report TEXT,updated_at INTEGER)')]);
 const claim=await db.prepare("INSERT INTO synthetic_launch_evidence (id,status,report,updated_at) VALUES (?,'running','{}',?) ON CONFLICT(id) DO NOTHING RETURNING id").bind(bindings.RUN_ID,Date.now()).first();
 if(!claim)return;
 const at=Date.parse('2026-11-02T17:00:00Z');let now=at;
 const origin='https://synthetic-staging.invalid';const events=new Map<string,Record<string,unknown>>();const emails=new Map<string,{id:string;body:unknown}>();
 try{
  for(const mode of ['error','manual'] as const){try{new Request('https://notify.internal/probe',{redirect:mode,signal:AbortSignal.timeout(8000)});diagnostics.push({requestRedirect:mode,supported:true});}catch(error){diagnostics.push({requestRedirect:mode,supported:false,message:error instanceof Error?error.message.slice(0,200):'constructor_failed'});}}
  const initial=await db.prepare('SELECT COUNT(*) AS n FROM booking_requests').first<{n:number}>();check('staging_database_initially_empty',initial?.n===0);
  phase='private_service_gates';
  check('deployed_booking_intake_disabled',(await bindings.BOOKING.fetch(new Request(origin+'/api/bookings',{method:'POST'}))).status===503);
  check('deployed_hq_disabled',(await bindings.BOOKING.fetch(new Request(origin+'/hq'))).status===503);
  check('deployed_notes_disabled',(await bindings.BOOKING.fetch(new Request(origin+'/elf-notes'))).status===503);
  check('deployed_gateway_delivery_disabled',(await bindings.NOTIFY.fetch(new Request('https://notify.internal/deliveries/synthetic-private-check',{method:'POST'}))).status===503);
  const pair=await generateKeyPair('RS256',{extractable:true});const jwk={...await exportJWK(pair.publicKey),kid:'synthetic',alg:'RS256'};
  const token=()=>new SignJWT({email:'santa@example.test'}).setProtectedHeader({alg:'RS256',kid:'synthetic'}).setIssuer('https://synthetic-team.cloudflareaccess.com').setAudience('synthetic-only').setSubject('synthetic-santa').setIssuedAt(Math.floor(now/1000)-1).setExpirationTime(Math.floor(now/1000)+3600).sign(pair.privateKey);
  const env:Env={DB:db,HQ_ENABLED:'true',HQ_ORIGIN:origin,BOOKING_ORIGIN:origin,ACCESS_TEAM_DOMAIN:'synthetic-team.cloudflareaccess.com',ACCESS_AUDIENCE:'synthetic-only',SANTA_SUBJECTS:'["synthetic-santa"]',INTAKE_HMAC_SECRET:'synthetic-test-runner-hmac-key-32-characters',STAGING_INTAKE_ENABLED:'true',PUBLIC_INTAKE_ENABLED:'false',TURNSTILE_SECRET:'synthetic',INTEGRATION_PLANNER_ENABLED:'true',CALENDAR_SYNC_ENABLED:'true',GOOGLE_OAUTH_ENABLED:'true',CUSTOMER_EMAIL_ENABLED:'true',NOTIFICATION_DELIVERY_ENABLED:'true',GOOGLE_CLIENT_ID:'synthetic',GOOGLE_CLIENT_SECRET:'synthetic',GOOGLE_TOKEN_ACTIVE_KEY:'test',GOOGLE_TOKEN_KEYS:JSON.stringify({test:btoa('g'.repeat(32))}),INTEGRATION_INSTALLATION_ID:'synthetic-installation-staging',NOTIFICATION_TARGETS_JSON:JSON.stringify({santa:{recipientKey:'santa-test',channel:'email'},mrs_claus:{recipientKey:'mrs-test',channel:'email'},technical_admin:{recipientKey:'admin-test',channel:'email'}}),MRS_CLAUS_CONSENT_JSON:JSON.stringify({granted:true,recipientKey:'mrs-test',reference:'synthetic-consent-only',grantedAt:at-1000}),ELF_NOTES_ENABLED:'true',ELF_ORIGIN:origin,ELF_TOKEN_SECRET:'synthetic-notes-token-secret-32-characters',ELF_ACTIVE_KEY:'test',ELF_ENCRYPTION_KEYS:JSON.stringify({test:btoa('e'.repeat(32))})};
  const gateway:GatewayEnv={DB:bindings.EMAIL_DB,BOOKING_DB:db,GATEWAY_DELIVERY_ENABLED:'true',GATEWAY_HMAC_SECRET:'synthetic-gateway-hmac-key-32-characters',HQ_ORIGIN:origin,RESEND_API_KEY:'synthetic',EMAIL_FROM:'santa@example.test',EMAIL_REPLY_TO:'santa@example.test',GATEWAY_RECIPIENTS_JSON:JSON.stringify({'santa-test':{channel:'email',destination:'santa@example.test'},'mrs-test':{channel:'email',destination:'mrs@example.test'},'admin-test':{channel:'email',destination:'admin@example.test'}})};
  const provider:typeof fetch=async(url,init)=>{
   const u=new URL(String(url));const method=init?.method||'GET';
   if(u.hostname==='synthetic-team.cloudflareaccess.com')return Response.json({keys:[jwk]});
   if(u.hostname==='challenges.cloudflare.com')return Response.json({success:true,hostname:new URL(origin).hostname,action:'booking'});
   if(u.hostname==='oauth2.googleapis.com')return Response.json({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600,token_type:'Bearer',scope:GOOGLE_SCOPE});
   if(u.hostname==='www.googleapis.com'){
    if(u.pathname==='/calendar/v3/calendars'&&method==='POST')return Response.json({...JSON.parse(String(init?.body)),id:'synthetic-calendar'});
    const id=u.pathname.split('/').at(-1)!;
    if(method==='GET')return events.has(id)?Response.json(events.get(id)):new Response(null,{status:404});
    if(method==='DELETE'){events.delete(id);return new Response(null,{status:204});}
    const body=JSON.parse(String(init?.body));const key=body.id||id;events.set(key,{...body,id:key,etag:'"synthetic"'});return Response.json(events.get(key));
   }
   if(u.hostname==='api.resend.com'){
    if(method==='POST'){const key=new Headers(init?.headers).get('idempotency-key')!;deliveryKeys.add(key);if(!emails.has(key))emails.set(key,{id:'synthetic-email-'+emails.size,body:JSON.parse(String(init?.body))});return Response.json({id:emails.get(key)!.id});}
    return Response.json({id:u.pathname.split('/').at(-1),last_event:'delivered'});
   }
   throw Error('external_network_forbidden');
  };
  env.NOTIFY={fetch:async r=>{const response=await handleGateway(r,gateway,provider,now);const body=await response.clone().json() as {error?:string;status?:string};diagnostics.push({gatewayMethod:r.method,httpStatus:response.status,error:body.error,status:body.status});return response;}};
  const call=async(path:string,body?:unknown,authorized=true)=>handleHq(new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{...(authorized?{'cf-access-jwt-assertion':await token()}:{}),Origin:origin,'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},...(body===undefined?{}:{body:JSON.stringify(body)})}),env,provider,now);
  const data=async(r:Response)=>await r.json() as Record<string,any>;
  const mutate=async(id:string,action:string,extra:object={})=>{const row=await db.prepare('SELECT version FROM hq_bookings WHERE booking_id=?').bind(id).first<{version:number}>();return call('/hq/api/bookings/'+id+'/actions',{action,expectedVersion:row?.version||1,...extra});};
  phase='booking';
  check('unsigned_hq_denied',(await call('/hq/api/bookings',undefined,false)).status===401);
  const request={serviceId:'home-visits',timing:{date:'2027-12-20',time:'14:00'},customer:{name:'Synthetic Adult',email:'family@example.test',phone:'202-555-0100'},location:'Synthetic venue',eventType:'Synthetic test',sensoryFriendly:true,answers:{}};
  const key=crypto.randomUUID();const intake=async(req=request)=>handleBooking(new Request(origin+'/api/bookings',{method:'POST',headers:{'cf-access-jwt-assertion':await token(),Origin:origin,'Content-Type':'application/json','Idempotency-Key':key,'cf-connecting-ip':'192.0.2.20'},body:JSON.stringify({request:req,botToken:'synthetic'})}),env,provider,now);
  const receipt=await intake();check('staging_booking_received',receipt.status===200);const id=(await data(receipt)).requestId;ids.push(id);
  check('duplicate_booking_same_receipt',(await data(await intake())).requestId===id);
  check('changed_duplicate_rejected',(await intake({...request,eventType:'Changed synthetic'})).status===409);
  check('pending_does_not_reserve',(await db.prepare('SELECT COUNT(*) AS n FROM hq_reservations WHERE booking_id=?').bind(id).first<{n:number}>())?.n===0);
  await runIntegrations(env,now,provider);check('new_booking_notification',emails.size>0);
  phase='confirmation';
  check('notes_before_confirmation_rejected',(await call('/hq/api/bookings/'+id+'/elf/invite',{})).status===404);
  const prepare=async(bookingId:string)=>{for(const [action,extra] of [['review',{}],['propose',{quote:{date:'2027-12-20',time:'14:00',durationMinutes:30,expiryDate:'2027-12-01',expiryTime:'12:00'}}],['share_quote',{channel:'phone',quoteCommunicated:true}],['record_agreement',{channel:'phone',customerAgreed:true}]] as const)check(action+'_'+(bookingId===id?'primary':'conflict'),(await mutate(bookingId,action,extra)).status===200);};
  await prepare(id);check('confirmation',(await mutate(id,'confirm',{beforeMinutes:0,afterMinutes:0})).status===200);
  const second=await data(await call('/hq/api/bookings',{request,source:'phone'}));ids.push(second.id);await prepare(second.id);check('scheduling_conflict_rejected',(await mutate(second.id,'confirm',{beforeMinutes:0,afterMinutes:0})).status===409);
  phase='calendar_email';
  const auth=new URL((await data(await call('/hq/api/integrations/google/start',{}))).authorizationUrl);
  check('google_callback',(await call('/hq/oauth/google/callback?state='+auth.searchParams.get('state')+'&code=synthetic')).status===303);
  check('app_calendar_created',(await call('/hq/api/integrations/google/calendar',{})).status===200);
  await runIntegrations(env,now,provider);check('confirmed_calendar_event',events.size===1);check('customer_confirmation_email',[...emails.values()].some(e=>JSON.stringify(e.body).includes('family@example.test')));
  phase='elf_notes';
  const invitation=await data(await call('/hq/api/bookings/'+id+'/elf/invite',{}));const privateToken=new URL(invitation.invitationUrl).hash.slice(1);
  const elf=(action:string,body:object={},auth=privateToken)=>handleElf(new Request(origin+'/elf-notes/'+action,{method:'POST',headers:{Authorization:'Bearer '+auth,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}),env,now);
  check('notes_unauthorized_denied',(await elf('read',{},'0'.repeat(64))).status===401);
  const optional={version:0,guardianConsent:true,children:[{firstName:'Synthetic child',interests:'Synthetic trains'},{favoriteToys:'Synthetic blocks'}]};
  check('notes_consent_required',(await elf('save',{...optional,guardianConsent:false})).status===400);
  check('multi_child_notes_saved',(await elf('save',optional)).status===200);
  check('notes_encrypted',!(await db.prepare('SELECT ciphertext FROM elf_notes WHERE booking_id=?').bind(id).first<{ciphertext:string}>())?.ciphertext.includes('Synthetic child'));
  check('santa_read_notes',(await call('/hq/api/bookings/'+id+'/elf/read',{})).status===200);
  check('family_update',(await elf('save',{...optional,version:1})).status===200);
  const normalNotify=env.NOTIFY!;
  env.NOTIFY={fetch:request=>new URL(request.url).pathname.startsWith('/deliveries/elf_')?Promise.reject(new Error('Synthetic optional-notes outage')):normalNotify.fetch(request)};
  await runIntegrations(env,now,provider);
  const notesError=await db.prepare("SELECT value FROM integration_control WHERE key='last_elf_error'").first<{value:string}>();
  const schedulerSuccess=await db.prepare("SELECT value FROM integration_control WHERE key='last_runner_success'").first<{value:string}>();
  check('optional_notes_failure_isolated',!!notesError&&schedulerSuccess?.value===String(now));
  env.NOTIFY=normalNotify;
  await maintainElf(env,now);check('generic_notes_notification',[...emails.values()].some(e=>JSON.stringify(e.body).includes('Optional Elf Notes are ready')));
  check('notes_never_in_email_or_calendar',!JSON.stringify([...emails.values(),...events.values()]).includes('Synthetic child'));
  check('family_delete',(await elf('delete')).status===200);check('notes_deleted',(await db.prepare('SELECT COUNT(*) AS n FROM elf_notes WHERE booking_id=?').bind(id).first<{n:number}>())?.n===0);
  phase='reminders_escalation';
  for(const time of ['2027-12-13T19:00:00Z','2027-12-19T19:00:00Z','2027-12-19T21:00:00Z','2027-12-19T23:00:00Z','2027-12-20T01:00:00Z']){now=Date.parse(time);await runIntegrations(env,now,provider);}
  check('optional_notes_maintenance_recovers',!(await db.prepare("SELECT value FROM integration_control WHERE key='last_elf_error'").first()));
  const jobs=(await db.batch<{kind:string;state:string}>([db.prepare('SELECT kind,state FROM integration_jobs WHERE booking_id=?').bind(id)]))[0].results;
  for(const kind of ['seven_days','twenty_four_hours','escalation_2','escalation_3','escalation_4'])check(kind+'_delivered',jobs.some(j=>j.kind===kind&&['accepted','delivered'].includes(j.state)));
  const cycle=await db.prepare('SELECT id FROM integration_cycles WHERE booking_id=? AND state=\'active\'').bind(id).first<{id:string}>();check('santa_acknowledgment',(await call('/hq/api/bookings/'+id+'/reminders/ack',{cycleId:cycle?.id})).status===200);
  phase='cancellation';check('cancel',(await mutate(id,'cancel')).status===200);await runIntegrations(env,now,provider);check('calendar_cancel_removed',events.size===0);check('reservation_released',(await db.prepare('SELECT COUNT(*) AS n FROM hq_reservations WHERE booking_id=?').bind(id).first<{n:number}>())?.n===0);
 }catch{checks.push({name:'failed_at_'+phase,passed:false});try{diagnostics.push({jobs:(await db.batch([db.prepare('SELECT kind,state,error_code FROM integration_jobs ORDER BY id LIMIT 30')]))[0].results});}catch{}}
 finally{
  try{for(const id of ids){const jobs=(await db.batch<{id:string}>([db.prepare('SELECT id FROM integration_jobs WHERE booking_id=?').bind(id)]))[0].results;for(const j of jobs)deliveryKeys.add(j.id);await db.batch([db.prepare('DELETE FROM booking_requests WHERE id=?').bind(id)]);}for(const key of deliveryKeys)await bindings.EMAIL_DB.batch([bindings.EMAIL_DB.prepare('DELETE FROM gateway_deliveries WHERE id=?').bind(key)]);await db.batch([db.prepare("DELETE FROM integration_google WHERE owner_sub='synthetic-santa'"),db.prepare('DELETE FROM integration_oauth_states WHERE owner_sub=\'synthetic-santa\''),db.prepare("DELETE FROM integration_control WHERE key IN ('integration_hash_fingerprint','google_oauth_active','reconcile_cursor')"),db.prepare('DELETE FROM intake_rate_limits')]);checks.push({name:'synthetic_data_cleanup',passed:true});}catch{checks.push({name:'synthetic_data_cleanup',passed:false});}
  const passed=checks.every(c=>c.passed);await db.batch([db.prepare('UPDATE synthetic_launch_evidence SET status=?,report=?,updated_at=? WHERE id=?').bind(passed?'passed':'failed',JSON.stringify({providerMode:'simulated Google, Turnstile and Resend; real Cloudflare runtime/D1',externalRequests:0,checks,diagnostics}),Date.now(),bindings.RUN_ID)]);
 }
}
export default {fetch(){return new Response('Not found',{status:404});},scheduled(_event:unknown,env:Bindings,ctx:{waitUntil(p:Promise<unknown>):void}){ctx.waitUntil(run(env));}};
