import test from 'node:test';
import assert from 'node:assert/strict';
import {routeSite,type SiteEnv} from '../../workers/site-router.ts';
const env={PUBLIC_WEBSITE_ONLY:'true',CUSTOMER_BOOKING_MODE:'disabled',SITE_STAGING_ENABLED:'false',HQ_ENABLED:'false'} as SiteEnv;
const site={fetch:async()=>new Response('approved website')};
test('public release serves only approved read-only documents and static assets',async()=>{
 for(const path of ['/','/services','/_optimized/santa-cutout-750.webp','/_next/static/chunks/home.js','/images/santa-family.jpg'])assert.equal((await routeSite(new Request('https://santablizard.com'+path),env,{},site)).status,200);
 for(const path of ['/book','/book/','/hq','/hq/api/bookings','/api/bookings','/webhooks/resend','/review','/review/homepage-390.jpg','/images/%2e%2e%2fbook'])for(const method of ['GET','POST'])assert.equal((await routeSite(new Request('https://santablizard.com'+path,{method}),env,{},site)).status,404,path);
 assert.equal((await routeSite(new Request('https://santablizard.com/',{method:'POST'}),env,{},site)).status,405);
});
test('www and HTTP canonicalize to the HTTPS apex preserving path/query',async()=>{
 for(const origin of ['https://www.santablizard.com','http://www.santablizard.com','http://santablizard.com']){
  const response=await routeSite(new Request(origin+'/services?source=invite'),env,{},site);assert.equal(response.status,308);assert.equal(response.headers.get('location'),'https://santablizard.com/services?source=invite');
 }
});
test('public release fails closed if staging or HQ is mistakenly enabled',async()=>{
 for(const flags of [{HQ_ENABLED:'true'},{SITE_STAGING_ENABLED:'true'},{CUSTOMER_BOOKING_MODE:'staging'}])assert.equal((await routeSite(new Request('https://santablizard.com'),{...env,...flags},{},site)).status,503);
});
