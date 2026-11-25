import {test} from 'node:test';
import assert from 'node:assert/strict';
import {routeSite,type SiteEnv} from '../../workers/site-router.ts';
import {handleBooking} from '../../workers/booking/index.ts';
const origin='https://santablizard.com';const site={fetch:async()=>new Response('public page')};
const env:SiteEnv={CUSTOMER_BOOKING_MODE:'production',PUBLIC_BOOKING_SITE_ENABLED:'false',HQ_ENABLED:'false',SITE_STAGING_ENABLED:'false'};
test('production storefront preserves public documents but closes customer intake by default and never exposes private routes',async()=>{
 for(const path of ['/','/services','/privacy','/terms','/images/santa-family.jpg'])assert.equal((await routeSite(new Request(origin+path),env,{},site)).status,200);
 for(const path of ['/book','/api/bookings','/hq','/hq/api/bookings','/elf-notes','/webhooks/resend','/review'])for(const method of ['GET','POST'])assert.equal((await routeSite(new Request(origin+path,{method}),env,{},site)).status,404,path);
});
test('opening production storefront intake does not open HQ, notes, webhook, preview or nonmatching hosts',async()=>{
 let forwarded:Request|undefined;const opened={...env,PUBLIC_BOOKING_SITE_ENABLED:'true',TURNSTILE_SITE_KEY:'synthetic-public-sitekey',BOOKING:{fetch:async(r:Request)=>{forwarded=r;return Response.json({status:'pending'});}}};
 assert.equal((await routeSite(new Request(origin+'/book'),opened,{},site)).status,200);
 for(const path of ['/hq','/elf-notes','/webhooks/resend','/review'])assert.equal((await routeSite(new Request(origin+path),opened,{},site)).status,404);
 assert.equal((await routeSite(new Request('https://attacker.test/book'),opened,{},site)).status,404);
 const response=await routeSite(new Request(origin+'/api/bookings',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.5'},body:'{}'}),opened,{},site);assert.equal(response.status,200);assert.equal(forwarded!.headers.get('origin'),origin);assert.equal(forwarded!.headers.get('cf-connecting-ip'),'192.0.2.5');
 assert.equal((await routeSite(new Request(origin+'/api/bookings'),opened,{},site)).status,405);assert.equal((await routeSite(new Request(origin+'/book',{method:'POST'}),opened,{},site)).status,405);
});
test('front opening cannot bypass backend intake gate or missing verification configuration',async()=>{
 const opened={...env,PUBLIC_BOOKING_SITE_ENABLED:'true',TURNSTILE_SITE_KEY:'synthetic-key',BOOKING:{fetch:(r:Request)=>handleBooking(r,{PUBLIC_INTAKE_ENABLED:'false',DB:{prepare(){throw Error('disabled_intake_must_not_query');},async batch(){throw Error('disabled_intake_must_not_query');}}})}};
 assert.equal((await routeSite(new Request(origin+'/api/bookings',{method:'POST',body:'{}'}),opened,{},site)).status,503);
 assert.equal((await routeSite(new Request(origin+'/book'),{...opened,TURNSTILE_SITE_KEY:''},{},site)).status,503);
 assert.equal((await routeSite(new Request(origin+'/'),{...opened,HQ_ENABLED:'true'},{},site)).status,503);
});

test('production public documents preserve production runtime variables for booking links',async()=>{
 const opened={...env,PUBLIC_BOOKING_SITE_ENABLED:'true',TURNSTILE_SITE_KEY:'synthetic-key'};let mode:string|undefined;const renderer={async fetch(_r:Request,runtime:SiteEnv){mode=runtime.CUSTOMER_BOOKING_MODE;return new Response('services');}};assert.equal((await routeSite(new Request(origin+'/services'),opened,{},renderer)).status,200);assert.equal(mode,'production');
});
