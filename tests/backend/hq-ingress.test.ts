import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hqFixture,testNow} from './hq-fixture.ts';
import {SignJWT} from 'jose';
import {routeHqIngress} from '../../workers/hq-ingress.ts';
test('private production HQ ingress is default-off and cannot proxy other hosts or non-HQ routes',async()=>{
 let calls=0;const env={HQ_INGRESS_ENABLED:'true',HQ_ORIGIN:'https://hq.santablizard.com',BOOKING:{fetch:async()=>{calls++;return new Response('must-not-forward');}}};
 assert.equal((await routeHqIngress(new Request('https://hq.santablizard.com/hq'),{})).status,503);
 for(const path of ['/api/bookings','/elf-notes','/webhooks/resend','/hq/%2f..','/review'])assert.equal((await routeHqIngress(new Request(env.HQ_ORIGIN+path),env)).status,404);
 assert.equal((await routeHqIngress(new Request('https://attacker.test/hq'),env)).status,404);assert.equal((await routeHqIngress(new Request(env.HQ_ORIGIN+'/hq'),env)).status,401);assert.equal(calls,0);
});
test('private production HQ requires a signed enrolled audience and strips cookies and claimed actor headers',async()=>{
 const f=await hqFixture();try{
  const origin='https://hq.santablizard.com';let forwarded:Request|undefined;
  const env={...f.env,HQ_INGRESS_ENABLED:'true',HQ_ORIGIN:origin,BOOKING:{fetch:async(r:Request)=>{forwarded=r;return new Response('private',{headers:{'Cache-Control':'public'}});}}};
  const r=new Request(origin+'/hq/api/session',{headers:{'cf-access-jwt-assertion':f.signed,Cookie:'must-not-forward=1','x-actor':'santa'}});const result=await routeHqIngress(r,env,f.jwksFetch,testNow);assert.equal(result.status,200);assert.match(result.headers.get('cache-control')!,/no-store/);assert.equal(forwarded!.headers.get('cookie'),null);assert.equal(forwarded!.headers.get('x-actor'),null);assert.equal(forwarded!.headers.get('cf-access-jwt-assertion'),f.signed);
  assert.equal((await routeHqIngress(new Request(origin+'/hq',{headers:{'cf-access-jwt-assertion':'forged'}}),env,f.jwksFetch,testNow)).status,401);
  const wrong=await new SignJWT({email:'synthetic@example.test'}).setProtectedHeader({alg:'RS256',kid:f.jwk.kid}).setIssuer('https://synthetic-team.cloudflareaccess.com').setAudience('wrong-application').setSubject('santa-subject').setIssuedAt(testNow/1000-1).setExpirationTime(testNow/1000+3600).sign(f.keys.privateKey);
  assert.equal((await routeHqIngress(new Request(origin+'/hq',{headers:{'cf-access-jwt-assertion':wrong}}),env,f.jwksFetch,testNow)).status,401);
 }finally{await f.dispose();}
});
