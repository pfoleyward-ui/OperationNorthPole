/** Loopback-only synthetic browser test. Never deploy this bridge. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {hqFixture,testNow} from '../tests/backend/hq-fixture.ts';
import {handleElf} from '../workers/booking/elf-notes.ts';
import {handleHq} from '../workers/booking/hq.ts';
const f=await hqFixture();const output=process.env.VISUAL_OUTPUT_DIR||'work/elf-review';await mkdir(output,{recursive:true});
Object.assign(f.env,{ELF_NOTES_ENABLED:'true',ELF_ORIGIN:f.env.HQ_ORIGIN,ELF_TOKEN_SECRET:'synthetic-only-elf-key-at-least-32-characters',ELF_ACTIVE_KEY:'test',ELF_ENCRYPTION_KEYS:JSON.stringify({test:btoa('e'.repeat(32))})});
let base='';let browserNow=testNow;
const server=createServer(async(req,res)=>{
 try{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const headers=new Headers();for(const[k,v]of Object.entries(req.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(','):v);if(headers.get('origin')===base)headers.set('origin',f.env.HQ_ORIGIN!);const request=new Request(f.env.HQ_ORIGIN!+(req.url||'/'),{method:req.method,headers,...(['GET','HEAD'].includes(req.method!)?{}:{body:Buffer.concat(chunks)})});const result=req.url?.startsWith('/hq')?await handleHq(request,f.env,f.jwksFetch,browserNow):await handleElf(request,f.env,browserNow);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));}catch{res.writeHead(500);res.end('Synthetic bridge failure');}
});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const report:object[]=[];
try{
 server.listen(0,'127.0.0.1');await once(server,'listening');base='http://127.0.0.1:'+(server.address() as {port:number}).port;
 for(const width of [390,768,1440]){
  browserNow=testNow;f.env.ELF_NOTES_ENABLED='true';await f.clear();const id=await f.ready();assert.equal((await f.mutate(id,'confirm',{beforeMinutes:0,afterMinutes:0})).status,200);
  const invite=await(await f.call('/hq/api/bookings/'+id+'/elf/invite',{})).json() as {invitationUrl:string};const fragment=new URL(invite.invitationUrl).hash;
  const context=await browser.newContext({viewport:{width,height:1000}});const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/elf-notes'+fragment);await page.getByLabel('First name (optional)',{exact:true}).waitFor();assert.equal(new URL(page.url()).hash,'');
  await page.getByLabel('First name (optional)',{exact:true}).fill('Synthetic Child A');await page.getByLabel('Interests (optional)',{exact:true}).fill('Synthetic trains');await page.getByRole('button',{name:'Add another child',exact:true}).click();await page.getByLabel('First name (optional)',{exact:true}).nth(1).fill('Synthetic Child B');
  const consent=page.getByRole('checkbox');await consent.check();await page.getByRole('button',{name:'Save optional notes',exact:true}).click();await page.getByText('Optional notes saved privately.',{exact:true}).waitFor();
  assert.equal((await context.request.get(base+'/hq')).status(),401);
  assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:output+'/elf-family-'+width+'.png',fullPage:true});
  const santa=await browser.newContext({viewport:{width,height:1000},extraHTTPHeaders:{'cf-access-jwt-assertion':f.signed}});const desk=await santa.newPage();await desk.goto(base+'/hq?booking='+id);await desk.getByRole('button',{name:'Read Elf Notes',exact:true}).click();await desk.getByText('firstName: Synthetic Child A',{exact:true}).waitFor();await desk.screenshot({path:output+'/elf-hq-'+width+'.png',fullPage:true});await santa.close();
  await page.getByLabel('Favorite toys (optional)',{exact:true}).first().fill('Synthetic blocks');await page.getByRole('button',{name:'Save optional notes',exact:true}).click();await page.getByText('Optional notes saved privately.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Delete all my notes',exact:true}).click();await page.getByText('All optional notes deleted.',{exact:true}).waitFor();assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM elf_notes').first<{n:number}>())?.n,0);assert.deepEqual(errors,[]);
  // Separate synthetic save to exercise Santa's manual privacy review with collection off.
  await page.getByLabel('First name (optional)',{exact:true}).fill('Synthetic Retention');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Save optional notes',exact:true}).click();await page.getByText('Optional notes saved privately.',{exact:true}).waitFor();
  const end=(await f.db.prepare("SELECT json_extract(state_json,'$.quote.end') AS e FROM hq_bookings WHERE booking_id=?").bind(id).first<{e:number}>())!.e;
  browserNow=end+29*86400000;f.env.ELF_NOTES_ENABLED='false';
  const review=await browser.newContext({viewport:{width,height:1000},extraHTTPHeaders:{'cf-access-jwt-assertion':await f.token('santa-subject',{},browserNow)}});const privacy=await review.newPage();await privacy.goto(base+'/hq');await privacy.getByRole('button',{name:'Elf Notes privacy review',exact:true}).click();await privacy.getByText('Upcoming deletion',{exact:true}).waitFor();assert.ok(!(await privacy.locator('body').innerText()).includes('Synthetic Retention'));assert.ok(await privacy.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await privacy.screenshot({path:output+'/elf-retention-'+width+'.png',fullPage:true});
  await privacy.getByRole('button',{name:'Delete optional notes permanently',exact:true}).click();assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM elf_notes').first<{n:number}>())?.n,1);
  await privacy.getByRole('checkbox').check();await privacy.getByRole('button',{name:'Delete optional notes permanently',exact:true}).click();await privacy.getByText('No optional notes are due for deletion within the next seven days.',{exact:true}).waitFor();assert.equal((await f.db.prepare('SELECT status FROM hq_bookings WHERE booking_id=?').bind(id).first<{status:string}>())?.status,'confirmed');await review.close();
  report.push({width,result:'passed',checks:['multi-child consent/save','private fragment removal','authenticated HQ read','update/delete','manual metadata-only retention review','explicit deletion with collection off','no browser storage','no horizontal overflow','no JavaScript errors']});await context.close();console.log('PASS '+width+'px: private optional notes, guardian consent, multiple children, Santa read, update/delete');
 }
 await writeFile(output+'/report.json',JSON.stringify(report,null,2));
}finally{await browser.close();server.close();await f.dispose();}
