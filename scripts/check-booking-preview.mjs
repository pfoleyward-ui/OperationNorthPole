import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
const base=process.env.VISUAL_BASE_URL||'http://127.0.0.1:3000';
const output=process.env.VISUAL_OUTPUT_DIR||'/tmp/santablizard-booking-review';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const assert=(value,message)=>{if(!value)throw new Error(message);};
const report=[];
async function layout(page){
 assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),'Horizontal overflow');
 assert(await page.locator('main').getByText('Test preview — not accepting booking requests.').isVisible(),'Missing preview notice');
 for(const input of await page.locator('input:not([type="checkbox"]):not([type="date"]):not([type="time"]):not([type="number"])').all())assert(await input.getAttribute('readonly')!==null,'Free-text customer collection enabled');
}
try{
 for(const width of [390,768,1024,1440,1920]){
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
  const errors=[];const writes=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push(r.url());});
  await page.goto(`${base}/book?service=home-visits`,{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  await page.getByLabel('I prefer a sensory-friendly interaction (optional)').check();
  await layout(page);
  await page.screenshot({path:`${output}/booking-experience-${width}.jpg`,fullPage:true});
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByLabel('Preferred date',{exact:true}).fill('2027-12-24');
  await page.getByLabel('Preferred time',{exact:true}).fill('14:00');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  assert((await page.locator('main').getByRole('alert').innerText()).includes('Christmas Eve'),'Holiday accepted');
  await page.getByLabel('Preferred date',{exact:true}).fill('2027-12-20');
  await page.getByLabel('Include an alternative date').check();
  await page.getByLabel('Alternative date',{exact:true}).fill('2027-12-25');
  await page.getByLabel('Alternative time',{exact:true}).fill('15:00');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  assert((await page.locator('main').getByRole('alert').innerText()).includes('Christmas Eve'),'Alternative holiday accepted');
  await page.getByLabel('Alternative date',{exact:true}).fill('2027-12-21');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  assert(await page.getByRole('heading',{name:'Customer Details',exact:true}).isVisible(),'Missing customer step');
  await layout(page);
  assert(await page.locator('input[type="email"]').inputValue()==='sample@example.test','Real contact fixture');
  assert(await page.locator('input[name*="diagnos"],textarea').count()===0,'Unexpected private notes field');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await layout(page);
  assert((await page.locator('dl').innerText()).includes('Yes'),'Sensory preference not preserved');
  await page.screenshot({path:`${output}/booking-review-${width}.jpg`,fullPage:true});
  await page.getByRole('button',{name:'Check practice letter — nothing sent'}).click();
  assert(await page.getByRole('heading',{name:'Practice Letter Complete — Nothing Sent'}).isVisible(),'False or missing preview receipt');
  assert(!writes.length&&!errors.length,JSON.stringify({writes,errors}));
  assert(await page.evaluate(()=>localStorage.length+sessionStorage.length)===0,'Preview persisted browser data');
  report.push({width,passed:true,networkWrites:writes.length,pageErrors:errors.length});
  console.log(`PASS ${width}px: four steps, primary/alternative blackout, sensory preference, locked sample data, no network writes/storage, layout`);
  await page.close();
 }
 const page=await browser.newPage();
 for(const id of ['home-visits','photography','dj-parties','photo-booth','complete-party','meet-greet','trivia']){
  await page.goto(`${base}/book?service=${id}`,{waitUntil:'networkidle'});
  assert(await page.getByLabel('Choose your experience').inputValue()===id,`Wrong preselection ${id}`);
  if(id==='meet-greet'){
   const duration=page.getByLabel('Visit duration (minutes; one-hour minimum, then 30-minute extensions)');
   await duration.fill('90');assert((await page.locator('main').innerText()).includes('$300 starting price'),'Meet price not updated');
   await duration.fill('61');await page.getByRole('button',{name:'Continue',exact:true}).click();assert(await page.locator('main').getByRole('alert').count()===1,'Invalid extension accepted');
  }
  if(id==='trivia'){
   await page.getByLabel('Proposed session duration (minutes; subject to agreement)').fill('90');
   assert((await page.locator('main').innerText()).includes('$300 starting price'),'Trivia price changed with duration');
  }
 }
 await page.goto(`${base}/book?service=not-a-service`,{waitUntil:'networkidle'});
 assert(await page.getByRole('status').count()===1,'Invalid service not explained');
 await page.goto(`${base}/book?service=home-visits`,{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByLabel('Preferred date',{exact:true}).fill('2027-03-14');await page.getByLabel('Preferred time',{exact:true}).fill('02:30');
 await page.getByRole('button',{name:'Continue',exact:true}).click();assert((await page.locator('main').getByRole('alert').innerText()).includes('does not occur'),'DST gap accepted');
 await page.getByLabel('Preferred date',{exact:true}).fill('2027-11-07');await page.getByLabel('Preferred time',{exact:true}).fill('01:30');
 await page.getByRole('button',{name:'Continue',exact:true}).click();assert((await page.locator('main').getByRole('alert').innerText()).includes('occurs twice'),'DST fold silently resolved');
 await page.getByLabel('Preferred repeated time',{exact:true}).selectOption('later');await page.getByRole('button',{name:'Continue',exact:true}).click();
 assert(await page.getByRole('heading',{name:'Customer Details',exact:true}).isVisible(),'Explicit DST choice rejected');
 console.log('PASS all seven service query selections, Meet pricing/increments, fixed Trivia price, invalid service fallback, DST gap/fold');
 for(const route of ['/','/services']){
  await page.goto(base+route,{waitUntil:'networkidle'});
  assert(await page.getByRole('heading',{name:'Sensory-Friendly Santa Visits'}).count()===1,'Sensory content missing');
  const aside=page.getByRole('complementary',{name:'Sensory-Friendly Santa Visits'});
  const content=await aside.innerText();assert(content.includes('no additional charge')&&content.includes('$150')&&content.includes('30 minutes'),'Incorrect sensory price');
  assert(!await page.locator('a[href^="/book"]').count(),'Unfinished public booking link activated');
 }
 await writeFile(`${output}/booking-preview-report.json`,JSON.stringify({createdAt:new Date().toISOString(),checks:report},null,2)+'\n');
}finally{await browser.close();}
