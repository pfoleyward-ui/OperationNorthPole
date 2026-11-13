import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, type Page } from 'playwright-core';
import { hqFixture, syntheticRequest, syntheticQuote, testNow } from '../tests/backend/hq-fixture.ts';
import { handleHq } from '../workers/booking/hq.ts';

// Synthetic-only loopback harness. No test bypass exists in the production Worker.
const fixture = await hqFixture();
const output = process.env.VISUAL_OUTPUT_DIR || '/tmp/santablizard-hq-review';
await mkdir(output,{recursive:true});
let base = '';
const server = createServer(async(req,res)=>{
  try {
    const chunks: Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
    const headers=new Headers();for(const[k,v]of Object.entries(req.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(','):v);
    // Translate only this harness's own loopback Origin, modeling the deployed
    // HTTPS same-origin request. Foreign origins remain foreign and fail CSRF.
    if(headers.get('origin')===base)headers.set('origin',fixture.env.HQ_ORIGIN!);
    const response=await handleHq(new Request(fixture.env.HQ_ORIGIN!+(req.url||'/hq'),{method:req.method,headers,...(['GET','HEAD'].includes(req.method!)?{}:{body:Buffer.concat(chunks)})}),fixture.env,fixture.jwksFetch,testNow);
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end('Synthetic test harness error');}
});
server.listen(0,'127.0.0.1');await once(server,'listening');
base='http://127.0.0.1:'+(server.address() as {port:number}).port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const report:object[]=[];
let lastPage: Page | undefined;
try {
  await fixture.create({...syntheticRequest(),customer:{...syntheticRequest().customer,name:'Sample <img src=x onerror=alert(1)> Adult'}});
  const today=await fixture.ready({...syntheticRequest(),timing:{date:'2026-11-02',time:'14:00'},customer:{...syntheticRequest().customer,name:'Sample Today'}},{...syntheticQuote(),date:'2026-11-02',time:'14:00',expiryDate:'2026-11-02',expiryTime:'13:00'});
  assert.equal((await fixture.mutate(today,'confirm',{beforeMinutes:0,afterMinutes:0})).status,200);
  const anonymous=await browser.newContext();const denied=await anonymous.request.get(base+'/hq');assert.equal(denied.status(),401);await anonymous.close();
  for(const width of [390,430,768,1024,1440,1920]){
    const context=await browser.newContext({viewport:{width,height:1000},isMobile:width<=430,hasTouch:width<=430,reducedMotion:'reduce',extraHTTPHeaders:{'cf-access-jwt-assertion':fixture.signed}});
    const page=await context.newPage();lastPage=page;const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.goto(base+'/hq',{waitUntil:'networkidle'});
    await page.getByRole('heading',{name:'New Requests',exact:true}).waitFor();
    await page.getByRole('button',{name:'Open booking for Sample <img src=x onerror=alert(1)> Adult',exact:true}).waitFor();
    assert.equal(await page.locator('main img').count(),0,'User markup must stay text');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    for(const b of await page.locator('nav button').all()){const box=await b.boundingBox();assert.ok(box&&box.height>=44&&box.width>=44);}
    await page.screenshot({path:output+'/new-requests-'+width+'.jpg',fullPage:true});
    await page.getByRole('button',{name:'Today’s Events',exact:true}).click();await page.getByRole('button',{name:'Open booking for Sample Today',exact:true}).waitFor();
    await page.getByRole('button',{name:'Open booking for Sample Today',exact:true}).click();await page.getByRole('heading',{name:'Booking correspondence'}).waitFor();
    assert.equal(await page.getByRole('link',{name:'Call customer'}).getAttribute('href'),'tel:2025550100');
    assert.equal(await page.getByRole('link',{name:'Navigate to event'}).getAttribute('rel'),'noreferrer noopener');
    if(await page.getByRole('button',{name:'Prepare optional invitation plan',exact:true}).count())await page.getByRole('button',{name:'Prepare optional invitation plan',exact:true}).click();
    await page.getByText('Invitation plan prepared. Nothing sent; no notes collected.',{exact:true}).waitFor();
    assert.equal(await page.locator('textarea').count(),0);
    await page.screenshot({path:output+'/confirmed-home-'+width+'.jpg',fullPage:true});
    await page.getByRole('button',{name:'Add Booking',exact:true}).click();
    await page.getByLabel('Request received by',{exact:true}).selectOption('facebook');
    if(width===390){await page.getByLabel('Service',{exact:true}).selectOption('meet-greet');await page.getByLabel('Agreed duration (minutes)',{exact:true}).fill('90');}
    await page.getByLabel('Preferred date (New York)',{exact:true}).fill('2027-12-21');await page.getByLabel('Preferred time (New York)',{exact:true}).fill('10:00');
    await page.getByLabel('Adult organizer name',{exact:true}).fill('Sample Caller '+width);await page.getByLabel('Adult email',{exact:true}).fill('caller@example.test');await page.getByLabel('Adult phone',{exact:true}).fill('202-555-0100');
    await page.getByLabel('Event location',{exact:true}).fill('Synthetic Hudson Valley venue');await page.getByLabel('Event type',{exact:true}).fill('Synthetic event');await page.getByLabel('Sensory-friendly interaction requested (optional; no reason or medical details)',{exact:true}).check();
    await page.screenshot({path:output+'/manual-booking-'+width+'.jpg',fullPage:true});
    await page.getByRole('button',{name:'Save as Pending',exact:true}).click();await page.getByRole('heading',{name:'Sample Caller '+width,exact:true}).waitFor();
    if(width===390){
      await page.getByRole('button',{name:'Review request',exact:true}).click();
      await page.getByLabel('Quote expiry date — Santa’s choice (New York)',{exact:true}).fill('2027-12-01');await page.getByLabel('Quote expiry time (New York)',{exact:true}).fill('12:00');
      await page.getByLabel('Custom total (USD; blank uses approved duration price)',{exact:true}).fill('350');await page.getByLabel('Explain a custom price adjustment (no private child details)',{exact:true}).fill('Agreed travel logistics');
      await page.getByRole('button',{name:'Save proposal',exact:true}).click();
      await page.getByLabel('I have shared these exact quote terms with the customer outside this dashboard.',{exact:true}).check();await page.getByRole('button',{name:'Record quote shared',exact:true}).click();
      await page.getByLabel('I have the customer’s agreement to this exact quote, price, and appointment.',{exact:true}).check();await page.getByRole('button',{name:'Record exact agreement',exact:true}).click();
      await page.getByLabel('Agreed buffer before (minutes; enter 0 if none)',{exact:true}).fill('0');await page.getByLabel('Agreed buffer after (minutes; enter 0 if none)',{exact:true}).fill('0');await page.getByRole('button',{name:'Confirm booking',exact:true}).click();
      await page.getByText('Confirmed',{exact:true}).waitFor();
      await page.getByLabel('Proposed date (New York)',{exact:true}).fill('2027-12-22');await page.getByLabel('Proposed time (New York)',{exact:true}).fill('11:00');
      await page.getByLabel('Quote expiry date — Santa’s choice (New York)',{exact:true}).fill('2027-12-01');await page.getByLabel('Quote expiry time (New York)',{exact:true}).fill('12:00');await page.getByRole('button',{name:'Save proposal',exact:true}).click();
      await page.getByLabel('I have shared these exact quote terms with the customer outside this dashboard.',{exact:true}).check();await page.getByRole('button',{name:'Record change shared',exact:true}).click();
      await page.getByLabel('I have the customer’s agreement to this exact quote, price, and appointment.',{exact:true}).check();await page.getByRole('button',{name:'Record change agreement',exact:true}).click();
      await page.getByLabel('Agreed buffer before (minutes; enter 0 if none)',{exact:true}).fill('0');await page.getByLabel('Agreed buffer after (minutes; enter 0 if none)',{exact:true}).fill('0');await page.getByRole('button',{name:'Apply reschedule securely',exact:true}).click();
      await page.getByRole('heading',{name:'Propose a reschedule — keep the current booking',exact:true}).waitFor();
      await page.getByRole('button',{name:'Cancel booking',exact:true}).click();await page.getByText('Canceled',{exact:true}).waitFor();
    }
    await page.getByRole('button',{name:'Calendar',exact:true}).click();await page.getByLabel('Calendar date',{exact:true}).fill('2027-12-22');
    await page.getByRole('heading',{name:'Resource unavailability',exact:true}).waitFor();await page.waitForLoadState('networkidle');await page.getByLabel('Unavailable start (New York)',{exact:true}).waitFor();assert.equal(await page.getByLabel('Unavailable start (New York)',{exact:true}).count(),1,'Rapid calendar navigation must not duplicate resource forms');
    if(width===390){
      await page.getByLabel('Unavailable start (New York)',{exact:true}).fill('11:00');await page.getByLabel('Unavailable duration (minutes)',{exact:true}).fill('120');await page.getByRole('button',{name:'Save unavailable time',exact:true}).click();
      await page.getByRole('button',{name:'Release santa block',exact:true}).click();await page.getByText('Resource block released.',{exact:true}).waitFor();
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
    await page.screenshot({path:output+'/calendar-'+width+'.jpg',fullPage:true});
    await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement!==document.body));
    assert.deepEqual(errors,[]);report.push({width,passed:true,overflow:false,anonymousDenied:true,manualPending:true,elfCollectionDisabled:true,...(width===390?{quoteAgreementConfirmationRescheduleCancel:true,resourceBlockRelease:true}:{})});
    console.log('PASS '+width+'px: protected dashboard, today, manual booking, calendar, contact shortcuts, disabled Elf collection, keyboard, no overflow or browser storage');await context.close();
  }
  await writeFile(output+'/hq-report.json',JSON.stringify({createdAt:new Date().toISOString(),syntheticOnly:true,checks:report},null,2)+'\n');
}catch(error){if(lastPage&&!lastPage.isClosed()){await lastPage.screenshot({path:output+'/failure.jpg',fullPage:true});console.error('Synthetic HQ failure message:',await lastPage.locator('#message').innerText());console.error('Synthetic HQ validation:',await lastPage.locator('input:invalid').evaluateAll(inputs=>inputs.map(i=>({label:i.id,message:(i as HTMLInputElement).validationMessage}))));}throw error;}finally{await browser.close();await new Promise<void>((resolve)=>server.close(()=>resolve()));await fixture.dispose();}
