import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {turnstileReadiness} from '../../workers/turnstile-readiness.ts';
import {routeSite,type SiteEnv} from '../../workers/site-router.ts';
const origin='https://staging.santablizard.com',path='/launch-readiness/turnstile';
const env={SITE_STAGING_ENABLED:'true',TURNSTILE_READINESS_ENABLED:'true',TURNSTILE_SITE_KEY:'0xSynthetic',TURNSTILE_SECRET:'synthetic-secret'};
const request=(proof:unknown='synthetic-proof',headers:Record<string,string>={})=>new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify({proof})});
test('readiness check is unavailable outside explicitly protected staging and enforces CSRF/body/method boundaries',async()=>{
 let calls=0;const provider=async()=>{calls++;return Response.json({success:true})};
 for(const flags of [{SITE_STAGING_ENABLED:'false'},{TURNSTILE_READINESS_ENABLED:undefined}])assert.equal((await turnstileReadiness(request(),{...env,...flags},provider)).status,404);
 assert.equal((await turnstileReadiness(new Request('https://santablizard.com'+path),env,provider)).status,404);
 assert.equal((await turnstileReadiness(request('x',{origin:'https://attacker.test'}),env,provider)).status,403);
 assert.equal((await turnstileReadiness(request('x',{'content-type':'text/plain'}),env,provider)).status,415);
 for(const proof of ['',123,'x'.repeat(2049)])assert.equal((await turnstileReadiness(request(proof),env,provider)).status,400);
 assert.equal((await turnstileReadiness(new Request(origin+path,{method:'DELETE'}),env,provider)).status,405);
 assert.equal((await turnstileReadiness(request('x'.repeat(40000)),env,provider)).status,413);
 assert.equal(calls,0);
});
test('siteverify requires success and exact staging hostname/action; rejected/replayed proofs fail',async()=>{
 for(const result of [{success:false,'error-codes':['timeout-or-duplicate']},{success:true,hostname:'attacker.test',action:'launch_readiness'},{success:true,hostname:'staging.santablizard.com',action:'booking'}])assert.equal((await turnstileReadiness(request(),env,async()=>Response.json(result))).status,403);
 const result=await turnstileReadiness(request(),env,async(url,init)=>{assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');assert.equal(init?.redirect,'manual');assert.equal((init?.body as URLSearchParams).get('secret'),'synthetic-secret');return Response.json({success:true,hostname:'staging.santablizard.com',action:'launch_readiness'})});
 assert.equal(result.status,200);assert.deepEqual(await result.json(),{result:'verified'});assert.match(result.headers.get('cache-control')!,/no-store/);
 for(const provider of [async()=>new Response(null,{status:302,headers:{location:'https://attacker.test'}}),async()=>{throw new Error('outage')}])assert.equal((await turnstileReadiness(request(),env,provider)).status,503);
});
test('check page exposes only public site key, uses CSP, and has no booking submission',async()=>{
 const response=await turnstileReadiness(new Request(origin+path),env);const html=await response.text();assert.match(html,/launch_readiness/);assert.match(html,/Verify security check/);assert.ok(!html.includes(env.TURNSTILE_SECRET));assert.ok(!html.includes('/api/bookings'));assert.match(response.headers.get('content-security-policy')!,/frame-ancestors 'none'/);
});
test('site router requires a signed enrolled Santa identity before readiness page or provider calls; public website denies it',async()=>{
 const keys=await generateKeyPair('RS256'),jwk={...await exportJWK(keys.publicKey),kid:'readiness-test',alg:'RS256'};const now=Date.now();let providerCalls=0;
 const fetcher=async(url:Parameters<typeof fetch>[0])=>{if(String(url).endsWith('/cdn-cgi/access/certs'))return Response.json({keys:[jwk]});providerCalls++;return Response.json({success:false})};
 const config:SiteEnv={...env,HQ_ENABLED:'true',ACCESS_TEAM_DOMAIN:'synthetic-team.cloudflareaccess.com',ACCESS_AUDIENCE:'synthetic-readiness',SANTA_SUBJECTS:JSON.stringify(['santa'])};const site={fetch:async()=>new Response('not readiness')};
 assert.equal((await routeSite(request(),config,{},site,fetcher,now)).status,401);
 const token=async(sub:string)=>new SignJWT({email:'synthetic@example.test'}).setProtectedHeader({alg:'RS256',kid:jwk.kid}).setIssuer('https://synthetic-team.cloudflareaccess.com').setAudience('synthetic-readiness').setSubject(sub).setIssuedAt(Math.floor(now/1000)-1).setExpirationTime(Math.floor(now/1000)+300).sign(keys.privateKey);
 for(const [sub,status] of [['stranger',401],['santa',403]] as const){const req=request();req.headers.set('cf-access-jwt-assertion',await token(sub));assert.equal((await routeSite(req,config,{},site,fetcher,now)).status,status)}
 assert.equal(providerCalls,1);
 assert.equal((await routeSite(new Request('https://santablizard.com'+path),{...config,PUBLIC_WEBSITE_ONLY:'true',SITE_STAGING_ENABLED:'false',HQ_ENABLED:'false',CUSTOMER_BOOKING_MODE:'disabled'},{},site,fetcher,now)).status,404);
});
