/** Unrouted, default-off rehearsal. Bind ONLY a disposable synthetic D1 database.
 * Live Access/collection gates and operational booking data are never modified.
 */
import type {Database} from './booking/repository.ts';
import {createManual,mutateBooking} from './booking/hq-service.ts';
import {elfHq,handleElf,maintainElf,type ElfEnv} from './booking/elf-notes.ts';
import {planBooking,acknowledge,type Cycle} from './booking/integration-plan.ts';
import {processJob} from './booking/integration-runner.ts';
import {localParts} from '../src/domain/booking/time.ts';
interface Bindings {DB:Database;NOTIFY:{fetch(r:Request):Promise<Response>};BACKEND_READINESS_ENABLED?:string;TEST_DATABASE_ID?:string;RUN_ID?:string;EXPIRES_AT?:string}
type Report={checks:string[];bookingId?:string;dueAt?:number;cycleId?:string;deliveryKeys:string[];baseline?:string;phase:string;outcome?:string;errorCode?:string};
const origin='https://staging.santablizard.com';
export async function runBackendReadiness(b:Bindings,now=Date.now(),clock:()=>number=()=>now){
 if(b.BACKEND_READINESS_ENABLED!=='true')return;
 if(!b.RUN_ID||!/^[A-Za-z0-9_-]{16,100}$/.test(b.RUN_ID)||!b.TEST_DATABASE_ID||['4db01c7d-9271-4b68-9839-323bb6887c6f','6ae1f1e9-7014-4cd8-abcb-ba12e2549cf7'].includes(b.TEST_DATABASE_ID))throw Error('unsafe_test_binding');
 const guard=await b.DB.prepare('SELECT database_id FROM synthetic_isolation_guard').first<{database_id:string}>();if(guard?.database_id!==b.TEST_DATABASE_ID)throw Error('isolation_guard_missing');
 await b.DB.batch([b.DB.prepare('CREATE TABLE IF NOT EXISTS synthetic_backend_evidence(id TEXT PRIMARY KEY,report TEXT NOT NULL,updated_at INTEGER NOT NULL)')]);
 const previous=await b.DB.prepare('SELECT report FROM synthetic_backend_evidence WHERE id=?').bind(b.RUN_ID).first<{report:string}>();
 const r:Report=previous?JSON.parse(previous.report):{checks:[],deliveryKeys:[],phase:'prepare'};
 if(['passed','failed'].includes(r.phase))return;
 const save=()=>b.DB.batch([b.DB.prepare('INSERT INTO synthetic_backend_evidence VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET report=excluded.report,updated_at=excluded.updated_at').bind(b.RUN_ID!,JSON.stringify(r),clock())]);
 const check=(name:string,ok:unknown)=>{if(!ok)throw Error(name);if(!r.checks.includes(name))r.checks.push(name);};
 if(!Number.isSafeInteger(Number(b.EXPIRES_AT))||Number(b.EXPIRES_AT)<=now||Number(b.EXPIRES_AT)>now+3600000){r.phase='failed';r.errorCode='bounded_window_expired';await save();return;}
 const principal={sub:'isolated-synthetic-santa',role:'santa' as const};
 const env:ElfEnv={DB:b.DB,HQ_ORIGIN:origin,INTAKE_HMAC_SECRET:'isolated-synthetic-intake-key-at-least-32-chars',INTEGRATION_PLANNER_ENABLED:'true',NOTIFICATION_DELIVERY_ENABLED:'true',CALENDAR_SYNC_ENABLED:'false',CUSTOMER_EMAIL_ENABLED:'false',ELF_NOTES_ENABLED:'true',ELF_RETENTION_APPROVED:'false',ELF_ORIGIN:origin,ELF_TOKEN_SECRET:'isolated-synthetic-note-link-key-32-characters',ELF_ACTIVE_KEY:'synthetic',ELF_ENCRYPTION_KEYS:JSON.stringify({synthetic:btoa('s'.repeat(32))}),NOTIFICATION_TARGETS_JSON:JSON.stringify({santa:{recipientKey:'santa-stage',channel:'email'}}),NOTIFY:{fetch:async request=>{
  if(request.method==='POST'){const key=new URL(request.url).pathname.split('/').at(-1)!;if(!r.deliveryKeys.includes(key))r.deliveryKeys.push(key);await save();}
  return b.NOTIFY.fetch(request);
 }}};
 const baseline=async(id:string)=>JSON.stringify({booking:await b.DB.prepare('SELECT state_json,version FROM hq_bookings WHERE booking_id=?').bind(id).first(),reservations:(await b.DB.batch([b.DB.prepare('SELECT * FROM hq_reservations WHERE booking_id=? ORDER BY resource').bind(id)]))[0].results});
 try{
  if(r.phase==='prepare'){
   const claim=await b.DB.prepare("INSERT INTO synthetic_backend_evidence VALUES(?,?,?) ON CONFLICT(id) DO NOTHING RETURNING id").bind(b.RUN_ID,JSON.stringify({...r,phase:'preparing'}),now).first();if(!claim)return;
   r.phase='preparing';
   check('disposable_database_initially_empty',(await b.DB.prepare('SELECT COUNT(*) AS n FROM booking_requests').first<{n:number}>())?.n===0);
   // Real clock: the normal 24-hour reminder is due two to three minutes later.
   const start=Math.ceil((now+120000)/60000)*60000+86400000;const visit=localParts(start),expiry=localParts(now+12*3600000);
   let state=await createManual(b.DB,{source:'phone',request:{serviceId:'home-visits',timing:{date:visit.date,time:visit.time},customer:{name:'Isolated Synthetic Readiness',email:'synthetic@example.test',phone:'202-555-0100'},location:'Synthetic isolated venue',eventType:'Synthetic readiness only',answers:{}}},principal,crypto.randomUUID(),env.INTAKE_HMAC_SECRET!,now);
   r.bookingId=state.id;await save();
   for(const [action,extra] of [['review',{}],['propose',{quote:{date:visit.date,time:visit.time,durationMinutes:30,expiryDate:expiry.date,expiryTime:expiry.time}}],['share_quote',{channel:'phone',quoteCommunicated:true}],['record_agreement',{channel:'phone',customerAgreed:true}],['confirm',{beforeMinutes:0,afterMinutes:0}]] as const)state=await mutateBooking(b.DB,state.id,{action,expectedVersion:state.version,...extra},principal,crypto.randomUUID(),env.INTAKE_HMAC_SECRET!,now);
   r.baseline=await baseline(state.id);
   const invitation=await elfHq(env,'/hq/api/bookings/'+state.id+'/elf/invite',{},principal,now) as {invitationUrl:string};const token=new URL(invitation.invitationUrl).hash.slice(1);
   const family=(action:string,input:object={},auth=token)=>handleElf(new Request(origin+'/elf-notes/'+action,{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:JSON.stringify(input)}),env,now);
   check('invalid_private_link_denied',(await family('read',{},'0'.repeat(64))).status===401);
   const notes={version:0,guardianConsent:true,children:[{firstName:'Synthetic Readiness A',interests:'Synthetic trains'},{firstName:'Synthetic Readiness B',favoriteToys:'Synthetic blocks'}]};
   check('guardian_consent_required',(await family('save',{...notes,guardianConsent:false})).status===400);
   check('synthetic_multi_child_save',(await family('save',notes)).status===200);
   const stored=await b.DB.prepare('SELECT ciphertext FROM elf_notes WHERE booking_id=?').bind(state.id).first<{ciphertext:string}>();check('encrypted_at_rest',stored&&!stored.ciphertext.includes('Synthetic Readiness A'));
   check('santa_decrypts_synthetic_notes',JSON.stringify(await elfHq(env,'/hq/api/bookings/'+state.id+'/elf/read',{},principal,now)).includes('Synthetic Readiness A'));
   await maintainElf(env,now,clock);check('generic_note_alert_handoff',r.deliveryKeys.length===1);
   check('stale_edit_rejected',(await family('save',notes)).status===409);
   check('family_edit',(await family('save',{...notes,version:1})).status===200);
   await maintainElf({...env,NOTIFICATION_DELIVERY_ENABLED:'false'},now+31*86400000);check('automatic_retention_stays_off',(await b.DB.prepare('SELECT COUNT(*) AS n FROM elf_notes').first<{n:number}>())?.n===1);
   check('family_explicit_delete',(await family('delete')).status===200);
   check('notes_and_pending_alerts_erased',(await b.DB.prepare('SELECT COUNT(*) AS n FROM elf_notes').first<{n:number}>())?.n===0&&(await b.DB.prepare('SELECT COUNT(*) AS n FROM elf_alerts').first<{n:number}>())?.n===0);
   check('notes_never_change_booking_or_reservation',r.baseline===await baseline(state.id));
   await planBooking(env,state.id,now);const cycle=await b.DB.prepare('SELECT * FROM integration_cycles WHERE booking_id=?').bind(state.id).first<Cycle>();check('normal_24_hour_reminder_due_in_future',cycle?.ack_due&&cycle.ack_due>now&&cycle.ack_due<=now+180000);r.cycleId=cycle!.id;r.dueAt=cycle!.ack_due!;r.phase='waiting_for_real_due_time';await save();return;
  }
  if(r.phase==='waiting_for_real_due_time'){
   if(now<r.dueAt!)return;
   const j=await b.DB.prepare("SELECT id FROM integration_jobs WHERE booking_id=? AND kind='twenty_four_hours'").bind(r.bookingId!).first<{id:string}>();check('reminder_exists',j);await processJob(env,j!.id,now,fetch,clock);
   const sent=await b.DB.prepare('SELECT accepted_at,state FROM integration_jobs WHERE id=?').bind(j!.id).first<{accepted_at:number|null;state:string}>();check('real_reminder_handoff_accepted',sent?.accepted_at);
   await acknowledge(env,r.bookingId!,r.cycleId!,principal,clock());await acknowledge(env,r.bookingId!,r.cycleId!,principal,clock());
   check('acknowledgment_idempotent',(await b.DB.prepare('SELECT COUNT(*) AS n FROM integration_acknowledgments WHERE cycle_id=?').bind(r.cycleId!).first<{n:number}>())?.n===1);
   check('ack_stops_all_unsent_escalation',(await b.DB.prepare("SELECT COUNT(*) AS n FROM integration_jobs WHERE booking_id=? AND kind IN ('escalation_2','escalation_3','escalation_4') AND state='canceled'").bind(r.bookingId!).first<{n:number}>())?.n===3);
   const resolution=await b.DB.prepare("SELECT id FROM integration_jobs WHERE booking_id=? AND kind='resolution'").bind(r.bookingId!).first<{id:string}>();check('one_resolution_for_alerted_santa',resolution);await processJob(env,resolution!.id,clock(),fetch,clock);
   check('ack_never_changes_booking_or_reservation',r.baseline===await baseline(r.bookingId!));r.phase='awaiting_signed_delivery';await save();
  }
  if(r.phase==='awaiting_signed_delivery'){
   check('only_three_expected_handoffs',r.deliveryKeys.length===3);
   const receipts=await Promise.all(r.deliveryKeys.map(async key=>(await(await b.NOTIFY.fetch(new Request('https://notify.internal/deliveries/'+key))).json() as {status:string}).status));
   if(receipts.some(status=>status!=='delivered'))return;
   check('all_three_real_gateway_receipts_delivered',true);r.phase='passed';r.outcome='synthetic notes, real-clock reminder, synthetic-principal acknowledgment and real email resolution passed';await save();
  }
 }catch(error){r.phase='failed';r.errorCode=error instanceof Error&&/^[a-z0-9_]+$/.test(error.message)?error.message:'isolated_readiness_failed';await save();}
}
export default {fetch(){return new Response('Not found',{status:404});},scheduled(_event:unknown,b:Bindings,ctx:{waitUntil(p:Promise<unknown>):void}){ctx.waitUntil(runBackendReadiness(b,Date.now(),Date.now));}};
