/** Local-only synthetic demonstration. Provider APIs and Turnstile are mocked;
 * real application handlers, JWTs, migrations and D1 transactions are exercised. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,type Page} from 'playwright-core';
import {integrationFixture} from '../tests/backend/integration-fixture.ts';
import {gatewayFixture} from '../tests/backend/gateway-fixture.ts';
import {testNow} from '../tests/backend/hq-fixture.ts';
import {handleBooking,type Env} from '../workers/booking/index.ts';
import {handleHq} from '../workers/booking/hq.ts';
import {runIntegrations} from '../workers/booking/integration-runner.ts';
const f=await integrationFixture(),g=await gatewayFixture();
const output=process.env.VISUAL_OUTPUT_DIR||'/tmp/santablizard-staging-review';await mkdir(output,{recursive:true});
const nextPort=Number(process.env.STAGING_NEXT_PORT||3118);
const next=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(nextPort)],{env:{...process.env,CUSTOMER_BOOKING_MODE:'staging',TURNSTILE_SITE_KEY:'synthetic-site-key'},stdio:['ignore','pipe','pipe']});
let nextLog='';next.stdout?.on('data',v=>{nextLog+=v;});next.stderr?.on('data',v=>{nextLog+=v;});
let now=testNow,base='',last:Page|undefined;let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
const env:Env={...f.env,NOTIFY:g.gateway,CUSTOMER_EMAIL_ENABLED:'true',STAGING_INTAKE_ENABLED:'true',PUBLIC_INTAKE_ENABLED:'false',BOOKING_ORIGIN:f.env.HQ_ORIGIN,TURNSTILE_SECRET:'synthetic-secret'};
g.gatewayEnv.BOOKING_DB=f.env.DB;
const fetcher:typeof fetch=async(url,init)=>String(url).includes('turnstile/v0/siteverify')?Response.json({success:true,hostname:new URL(env.BOOKING_ORIGIN!).hostname,action:'booking'}):f.fetcher(url,init);
const server=createServer(async(req,res)=>{
 try{
  const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const headers=new Headers();for(const[k,v]of Object.entries(req.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(','):v);
  if(headers.get('origin')===base)headers.set('origin',env.HQ_ORIGIN!);
  headers.set('cf-connecting-ip','192.0.2.10');
  const path=req.url||'/';const init={method:req.method,headers,...(['GET','HEAD'].includes(req.method!)?{}:{body:Buffer.concat(chunks)})};
  const request=new Request(env.HQ_ORIGIN+path,init);
  let result:Response;
  if(path.startsWith('/api/bookings'))result=await handleBooking(request,env,fetcher,now);
  else if(path.startsWith('/hq'))result=await handleHq(request,env,fetcher,now);
  else result=await fetch('http://127.0.0.1:'+nextPort+path,{method:req.method,redirect:'manual'});
  const out=new Headers(result.headers);out.delete('content-length');out.delete('content-encoding');out.delete('transfer-encoding');
  res.writeHead(result.status,Object.fromEntries(out));res.end(Buffer.from(await result.arrayBuffer()));
 }catch{res.writeHead(500);res.end('Synthetic staging harness failure');}
});
const reports:object[]=[];
try{
 let ready=false;for(let i=0;i<120;i++){if(next.exitCode!==null)throw new Error('Next exited: '+nextLog);try{ready=(await fetch('http://127.0.0.1:'+nextPort+'/book')).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,250));}assert.ok(ready,'Next startup failed: '+nextLog);
 await f.connect();env.GOOGLE_OAUTH_ENABLED='false';
 server.listen(0,'127.0.0.1');await once(server,'listening');base='http://127.0.0.1:'+(server.address() as {port:number}).port;
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const anonymous=await browser.newContext();assert.equal((await anonymous.request.get(base+'/hq/api/bookings')).status(),401);assert.equal((await anonymous.request.post(base+'/api/bookings',{data:{}})).status(),403);await anonymous.close();
 for(const width of [390,430,768,1024,1440,1920]){
  now=testNow;g.setNow(now);await f.clear();f.google.events.clear();await f.connect();
  const context=await browser.newContext({viewport:{width,height:1000},isMobile:width<=430,hasTouch:width<=430,reducedMotion:'reduce',extraHTTPHeaders:{'cf-access-jwt-assertion':f.signed}});const page=await context.newPage();last=page;const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  // Official challenge requests are replaced only in this synthetic test browser.
  await context.route('https://challenges.cloudflare.com/turnstile/v0/api.js*',route=>route.fulfill({contentType:'application/javascript',body:`window.turnstile={render(node,o){window.__syntheticChallenge=o;queueMicrotask(()=>o.callback(crypto.randomUUID()));return 'synthetic-widget';},reset(){queueMicrotask(()=>window.__syntheticChallenge.callback(crypto.randomUUID()));},remove(){}};`}));
  await page.goto(base+'/book?service=home-visits',{waitUntil:'networkidle'});await page.getByText('Protected staging — synthetic adult details only.').waitFor();
  await page.getByLabel('I prefer a sensory-friendly interaction (optional)').check();await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByLabel('Preferred date',{exact:true}).fill('2027-12-20');await page.getByLabel('Preferred time',{exact:true}).fill('14:00');await page.getByLabel('Event location',{exact:true}).fill('Synthetic Hudson Valley venue');await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByLabel('Adult organizer name',{exact:true}).fill('Synthetic Adult '+width);await page.getByLabel('Email',{exact:true}).fill('sample@example.test');await page.getByLabel('Phone',{exact:true}).fill('202-555-0100');await page.getByLabel('Event type',{exact:true}).fill('Synthetic visit');await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Send request to Santa',exact:true}).waitFor();await page.screenshot({path:output+'/customer-review-'+width+'.jpg',fullPage:true});
  const keys:string[]=[];let lost=false;
  await page.route('**/api/bookings',async route=>{keys.push(route.request().headers()['idempotency-key']);const response=await route.fetch();if(width===390&&!lost){lost=true;assert.equal(response.status(),200);await route.abort('failed');}else await route.fulfill({response});});
  await page.getByRole('button',{name:'Send request to Santa',exact:true}).click();
  if(width===390){await page.getByRole('alert').filter({hasText:'We could not confirm receipt.'}).waitFor();await page.getByRole('button',{name:'Send request to Santa',exact:true}).click();assert.equal(keys[0],keys[1]);}
  await page.getByRole('heading',{name:'Your Letter Is on Its Way to Santa!',exact:true}).waitFor();
  const rows=await f.db.prepare('SELECT id,status,request_json FROM booking_requests').all<{id:string;status:string;request_json:string}>();assert.equal(rows.results.length,1);const id=rows.results[0].id;assert.equal(rows.results[0].status,'pending');assert.equal(JSON.parse(rows.results[0].request_json).sensoryFriendly,true);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM hq_reservations').first<{n:number}>())!.n,0);
  await runIntegrations(env,now,fetcher);assert.ok([...g.email.sent.values()].some(v=>(v.body.to as string[])[0]==='santa@example.test'));assert.equal(f.google.events.size,0);
  await page.screenshot({path:output+'/customer-receipt-'+width+'.jpg',fullPage:true});
  await page.goto(base+'/hq?booking='+id);await page.getByRole('heading',{name:'Booking correspondence',exact:true}).waitFor();
  await page.getByRole('button',{name:'Review request',exact:true}).click();await page.getByLabel('Quote expiry date — Santa’s choice (New York)',{exact:true}).fill('2027-12-01');await page.getByLabel('Quote expiry time (New York)',{exact:true}).fill('12:00');await page.getByRole('button',{name:'Save proposal',exact:true}).click();
  await page.getByLabel('I have shared these exact quote terms with the customer outside this dashboard.',{exact:true}).check();await page.getByRole('button',{name:'Record quote shared',exact:true}).click();await page.getByLabel('I have the customer’s agreement to this exact quote, price, and appointment.',{exact:true}).check();await page.getByRole('button',{name:'Record exact agreement',exact:true}).click();
  await page.getByLabel('Agreed buffer before (minutes; enter 0 if none)',{exact:true}).fill('0');await page.getByLabel('Agreed buffer after (minutes; enter 0 if none)',{exact:true}).fill('0');await page.getByRole('button',{name:'Confirm booking',exact:true}).click();await page.getByText('Confirmed',{exact:true}).waitFor();
  await runIntegrations(env,now,fetcher);assert.equal(f.google.events.size,1);assert.ok([...g.email.sent.values()].some(v=>(v.body.to as string[])[0]==='sample@example.test'));
  now=Date.parse('2027-12-19T19:00:00Z');g.setNow(now);await context.setExtraHTTPHeaders({'cf-access-jwt-assertion':await f.token('santa-subject',{},now)});
  await runIntegrations(env,now,fetcher);await g.poll();await runIntegrations(env,now+60001,fetcher);
  await page.goto(base+'/hq?booking='+id+'#reminders');await page.reload();const got=page.getByRole('button',{name:'Got It!',exact:true});await got.waitFor();const bounds=await got.boundingBox();assert.ok(bounds&&bounds.height>=44&&bounds.width>=44);await got.click();await page.getByText(/^Got It! recorded /).waitFor();
  await runIntegrations(env,now+120001,fetcher);assert.equal((await f.db.prepare('SELECT status FROM hq_bookings WHERE booking_id=?').bind(id).first<{status:string}>())!.status,'confirmed');
  await page.locator('#reminders summary').click();await page.screenshot({path:output+'/hq-acknowledged-'+width+'.jpg',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);assert.deepEqual(errors,[]);
  reports.push({width,customerInput:true,pendingPersistence:true,idempotentNetworkRecovery:width===390?'verified':'covered at 390',santaEmail:true,authenticatedHQConfirmation:true,customerEmail:true,calendar:true,reminders:true,gotIt:true,noOverflow:true,realMessagesSent:0});console.log('PASS '+width+'px: customer → Pending/D1 → email gateway → HQ confirmation → calendar → reminders → Got It');await context.close();
 }
 await writeFile(output+'/staging-report.json',JSON.stringify({syntheticOnly:true,realMessagesSent:0,provider:'Mocked Resend API via real durable email gateway',checks:reports},null,2)+'\n');
}catch(error){if(last&&!last.isClosed())await last.screenshot({path:output+'/failure.jpg',fullPage:true});throw error;}
finally{await browser?.close();if(server.listening)await new Promise<void>(r=>server.close(()=>r()));next.kill('SIGTERM');await f.dispose();await g.dispose();}
