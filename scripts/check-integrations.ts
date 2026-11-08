import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,type Page} from 'playwright-core';
import {integrationFixture} from '../tests/backend/integration-fixture.ts';
import {syntheticRequest,syntheticQuote,testNow} from '../tests/backend/hq-fixture.ts';
import {handleHq} from '../workers/booking/hq.ts';
import {runIntegrations} from '../workers/booking/integration-runner.ts';

const f=await integrationFixture();
const output=process.env.VISUAL_OUTPUT_DIR||'/tmp/santablizard-integration-review';await mkdir(output,{recursive:true});
let base='';let last:Page|undefined;
const server=createServer(async(req,res)=>{
  try{const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const headers=new Headers();for(const[k,v]of Object.entries(req.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(','):v);
    if(headers.get('origin')===base)headers.set('origin',f.env.HQ_ORIGIN!);
    const result=await handleHq(new Request(f.env.HQ_ORIGIN!+(req.url||'/hq'),{method:req.method,headers,...(['GET','HEAD'].includes(req.method!)?{}:{body:Buffer.concat(chunks)})}),f.env,f.fetcher,testNow);
    res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
  }catch{res.writeHead(500);res.end('Synthetic integration harness error');}
});server.listen(0,'127.0.0.1');await once(server,'listening');base='http://127.0.0.1:'+(server.address() as {port:number}).port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const report:object[]=[];
try{
  await f.connect();f.env.GOOGLE_OAUTH_ENABLED='false'; // No external navigation from the browser harness.
  const id=await f.ready({...syntheticRequest(),timing:{date:'2026-11-03',time:'12:00'}},{...syntheticQuote(),date:'2026-11-03',time:'12:00',expiryDate:'2026-11-03',expiryTime:'10:00'});
  assert.equal((await f.mutate(id,'confirm',{beforeMinutes:0,afterMinutes:0})).status,200);
  await runIntegrations(f.env,testNow,f.fetcher);
  assert.equal(f.google.events.size,1);assert.ok(f.gateway.messages.size>=1);
  const anonymous=await browser.newContext();assert.equal((await anonymous.request.get(base+'/hq/api/integrations/status')).status(),401);await anonymous.close();
  for(const width of [390,430,768,1024,1440,1920]){
    const context=await browser.newContext({viewport:{width,height:1000},isMobile:width<=430,hasTouch:width<=430,reducedMotion:'reduce',extraHTTPHeaders:{'cf-access-jwt-assertion':f.signed}});const page=await context.newPage();last=page;const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/hq?booking='+id+'#reminders',{waitUntil:'networkidle'});await page.getByRole('heading',{name:'Booking correspondence',exact:true}).waitFor();await page.locator('#reminders').getByRole('heading',{name:'Calendar & delivery status',exact:true}).waitFor();
    await page.locator('#reminders summary').click();await page.locator('#reminders').getByRole('heading',{name:'A Gentle Jingle · 24-hour check',exact:true}).waitFor();await page.locator('#reminders summary').click();
    if(width===390){
      const before=await f.db.prepare('SELECT state_json,version FROM hq_bookings WHERE booking_id=?').bind(id).first();
      const got=page.getByRole('button',{name:'Got It!',exact:true});const bounds=await got.boundingBox();assert.ok(bounds&&bounds.height>=44&&bounds.width>=44);
      await page.locator('#reminders').screenshot({path:output+'/acknowledgment-'+width+'.jpg'});await got.click();await page.locator('#reminders').getByText(/^Got It! recorded /).waitFor();
      assert.deepEqual(await f.db.prepare('SELECT state_json,version FROM hq_bookings WHERE booking_id=?').bind(id).first(),before);
    }else await page.locator('#reminders').getByText(/^Got It! recorded /).waitFor();
    assert.equal(await page.getByRole('button',{name:'Got It!',exact:true}).count(),0);
    await page.locator('#reminders').screenshot({path:output+'/delivery-ledger-'+width+'.jpg'});
    await page.getByRole('button',{name:'Calendar & delivery settings',exact:true}).first().click();await page.getByRole('heading',{name:'Calendar & delivery settings',exact:true}).waitFor();
    assert.ok(await page.getByRole('button',{name:'Connect Google securely',exact:true}).isDisabled());assert.equal(await page.locator('textarea').count(),0);
    await page.screenshot({path:output+'/integration-settings-'+width+'.jpg',fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);assert.deepEqual(errors,[]);
    await page.getByRole('button',{name:'New Requests',exact:true}).focus();await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement?.matches('nav button:focus-visible')));
    report.push({width,passed:true,authenticatedDeepLink:true,deliveryLedger:true,acknowledgment:width===390?'recorded without booking mutation':'already recorded',settings:true,noOverflow:true,noBrowserStorage:true,mockedProvidersOnly:true});
    console.log('PASS '+width+'px: protected booking deep link, delivery ledger, Got It, settings, no overflow/storage; mocked providers only');await context.close();
  }
  await writeFile(output+'/integrations-report.json',JSON.stringify({createdAt:new Date().toISOString(),syntheticOnly:true,realMessagesSent:0,checks:report},null,2)+'\n');
}catch(error){if(last&&!last.isClosed()){await last.screenshot({path:output+'/failure.jpg',fullPage:true});console.error('Synthetic integration UI error:',await last.locator('#message').innerText());}throw error;}
finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));await f.dispose();}
