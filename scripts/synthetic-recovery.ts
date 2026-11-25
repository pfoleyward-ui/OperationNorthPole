/** Synthetic-only recovery fixtures. Never reads an account database or sends mail. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {integrationFixture} from '../tests/backend/integration-fixture.ts';
import {gatewayFixture,operationalMessage} from '../tests/backend/gateway-fixture.ts';
import {testNow} from '../tests/backend/hq-fixture.ts';
import {runIntegrations} from '../workers/booking/integration-runner.ts';
import {handleElf,elfHq} from '../workers/booking/elf-notes.ts';
import {unseal} from '../workers/booking/google.ts';
import {D1BookingRepository,type Database} from '../workers/booking/repository.ts';
import {getBooking} from '../workers/booking/hq-service.ts';
import {handleGateway,type GatewayEnv} from '../workers/notifications/index.ts';
type DB=Awaited<ReturnType<Miniflare['getD1Database']>>;
type Row=Record<string,string|number|null>;
type Snapshot={schema:{type:string;name:string;sql:string}[];tables:Record<string,{dependencies:string[];rows:Row[]}>};
const quote=(name:string)=>'"'+name.replaceAll('"','""')+'"';
async function snapshot(db:DB,only?:string[]):Promise<Snapshot>{
 const schema:Snapshot['schema']=(await db.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name").all<{type:string;name:string;sql:string}>()).results;
 const tables:Snapshot['tables']={};
 for(const row of schema.filter(x=>x.type==='table'&&(!only||only.includes(x.name)))){
  const foreign:{table:string}[]=(await db.prepare('PRAGMA foreign_key_list('+quote(row.name)+')').all<{table:string}>()).results;
  tables[row.name]={dependencies:[...new Set(foreign.map(x=>x.table))],rows:(await db.prepare('SELECT * FROM '+quote(row.name)).all<Row>()).results};
 }
 return {schema:schema.filter(x=>!only||only.includes(x.name)||(x.type==='index'&&x.name==='gateway_receipt_poll')),tables};
}
async function restore(db:DB,s:Snapshot){
 for(const x of s.schema.filter(x=>x.type==='table'))await db.prepare(x.sql).run();
 const done=new Set<string>();
 while(done.size<Object.keys(s.tables).length){
  let progress=false;
  for(const [name,table]of Object.entries(s.tables)){
   if(done.has(name)||table.dependencies.some(d=>d!==name&&!done.has(d)))continue;
   for(const row of table.rows){const columns=Object.keys(row);await db.prepare('INSERT INTO '+quote(name)+' ('+columns.map(quote).join(',')+') VALUES ('+columns.map(()=>'?').join(',')+')').bind(...columns.map(c=>row[c])).run();}
   done.add(name);progress=true;
  }
  assert.ok(progress,'Foreign-key dependency cycle needs an explicit restore order');
 }
 for(const x of s.schema.filter(x=>x.type!=='table'))await db.prepare(x.sql).run();
 assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
}
await mkdir('work',{recursive:true});
if(process.argv[2]==='prepare'){
 const f=await integrationFixture(),g=await gatewayFixture();
 try{
  Object.assign(f.env,{ELF_NOTES_ENABLED:'true',ELF_ORIGIN:f.env.HQ_ORIGIN,ELF_TOKEN_SECRET:'synthetic-recovery-private-key-32-characters',ELF_ACTIVE_KEY:'test',ELF_ENCRYPTION_KEYS:JSON.stringify({test:btoa('R'.repeat(32))}),CUSTOMER_EMAIL_ENABLED:'true',NOTIFY:g.gateway});
  g.gatewayEnv.BOOKING_DB=f.env.DB;await f.connect();const id=await f.ready();assert.equal((await f.mutate(id,'confirm',{beforeMinutes:0,afterMinutes:0})).status,200);
  await runIntegrations(f.env,testNow,f.fetcher);
  const invitation=await elfHq(f.env,'/hq/api/bookings/'+id+'/elf/invite',{}, {sub:'santa-subject',role:'santa'},testNow) as {invitationUrl:string};
  const token=new URL(invitation.invitationUrl).hash.slice(1);
  const saved=await handleElf(new Request(f.env.HQ_ORIGIN+'/elf-notes/save',{method:'POST',headers:{Origin:f.env.HQ_ORIGIN!,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({version:0,guardianConsent:true,children:[{firstName:'Synthetic Recovery Child',interests:'Synthetic stars'}]})}),f.env,testNow);assert.equal(saved.status,200);
  const uncertainKey='synthetic-recovery-uncertain-key';const message=operationalMessage(uncertainKey);g.email.loseResponse=true;
  const uncertain=await g.gatewayCall(uncertainKey,message);assert.equal((await uncertain.json() as {status:string}).status,'uncertain');
  const booking=await snapshot(f.db),email=await snapshot(g.db,['gateway_deliveries','gateway_webhook_receipts']);
  assert.equal(booking.tables.booking_requests.rows.length,1);assert.equal(booking.tables.elf_notes.rows.length,1);assert.ok(!String(booking.tables.elf_notes.rows[0].ciphertext).includes('Synthetic Recovery Child'));
  const payload={syntheticOnly:true,source:'local application handlers with synthetic fixtures',booking,email,reference:{bookingId:id,uncertainKey,message,elfKey:btoa('R'.repeat(32)),googleKey:btoa('0'.repeat(32))}};
  await writeFile('work/synthetic-recovery-source.json',JSON.stringify(payload),{mode:0o600});
  console.log(JSON.stringify({synthetic_fixture:'prepared',booking_tables:Object.keys(booking.tables).length,email_tables:Object.keys(email.tables).length,real_messages_sent:0}));
 }finally{await f.dispose();await g.dispose();}
}else if(process.argv[2]==='verify'){
 const input=JSON.parse(await readFile('work/synthetic-recovery-restored.json','utf8')) as {booking:Snapshot;email:Snapshot;reference:{bookingId:string;uncertainKey:string;message:unknown;elfKey:string;googleKey:string}};
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'recovery-verifier',modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-11-08',d1Databases:['DB','EMAIL_DB']}]}));
 try{
  const db=await mf.getD1Database('DB'),emailDb=await mf.getD1Database('EMAIL_DB');await restore(db,input.booking);await restore(emailDb,input.email);
  const record=input.booking.tables.booking_requests.rows[0];const receipt=await new D1BookingRepository(db as unknown as Database).find(String(record.idempotency_hash),String(record.payload_hash));assert.equal(receipt?.requestId,input.reference.bookingId);
  const detail=await getBooking(db as unknown as Database,input.reference.bookingId);assert.equal(detail.state.status,'confirmed');assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM hq_reservations').first<{n:number}>())?.n,1);
  const env={DB:db as unknown as Database,ELF_NOTES_ENABLED:'true',ELF_ORIGIN:'https://hq.example.test',ELF_TOKEN_SECRET:'synthetic-recovery-private-key-32-characters',ELF_ACTIVE_KEY:'test',ELF_ENCRYPTION_KEYS:JSON.stringify({test:input.reference.elfKey})};
  const notes=await elfHq(env,'/hq/api/bookings/'+input.reference.bookingId+'/elf/read',{}, {sub:'santa-subject',role:'santa'},testNow) as {notes:{children:{firstName:string}[]}};assert.equal(notes.notes.children[0].firstName,'Synthetic Recovery Child');
  const google=await db.prepare('SELECT encrypted_tokens FROM integration_google').first<{encrypted_tokens:string}>();assert.ok(google);const tokens=await unseal({DB:env.DB,GOOGLE_TOKEN_ACTIVE_KEY:'test-key',GOOGLE_TOKEN_KEYS:JSON.stringify({'test-key':input.reference.googleKey})},google.encrypted_tokens,'google:tokens') as {accessToken:string};assert.equal(tokens.accessToken,'synthetic-access-token');
  let sends=0;const provider:typeof fetch=async()=>{sends++;throw Error('Recovery must not resend an uncertain handoff');};
  const gateway:GatewayEnv={DB:emailDb as unknown as Database,BOOKING_DB:env.DB,GATEWAY_DELIVERY_ENABLED:'true',GATEWAY_HMAC_SECRET:'synthetic-gateway-hmac-at-least-32-characters',HQ_ORIGIN:'https://hq.example.test'};
  const request=new Request('https://notify.internal/deliveries/'+input.reference.uncertainKey,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':input.reference.uncertainKey},body:JSON.stringify(input.reference.message)});
  const replay=await handleGateway(request,gateway,provider,testNow);assert.equal(replay.status,200);assert.equal((await replay.json() as {status:string}).status,'uncertain');assert.equal(sends,0);
  const report={application_recovery:'passed',checks:['original receipt preserved','confirmed booking preserved','reservation preserved','encrypted optional notes decrypt with original key','encrypted OAuth tokens decrypt with original key','uncertain email receipt preserved','replay sends no replacement email','foreign keys valid'],provider_mode:'synthetic only',real_messages_sent:0};
  await writeFile('work/synthetic-recovery-application-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await mf.dispose();}
}else throw Error('Expected prepare or verify');
