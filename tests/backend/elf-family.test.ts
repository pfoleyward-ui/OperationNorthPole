import {test} from 'node:test';
import assert from 'node:assert/strict';
import {routeFamily} from '../../workers/elf-family.ts';
import {hqFixture,testNow} from './hq-fixture.ts';
import {handleElf} from '../../workers/booking/elf-notes.ts';
const origin='https://notes-staging.santablizard.com';
const token='a'.repeat(64);
const request=(path='/elf-notes/read',extra:RequestInit={})=>new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+token,'CF-Connecting-IP':'192.0.2.1'},body:'{}',...extra});
test('family ingress is default-off and blocks non-family routes, foreign origins, writes and missing invitations',async()=>{
 let calls=0;const env={ELF_FAMILY_ENABLED:'true',ELF_FAMILY_ORIGIN:origin,BOOKING:{fetch:async()=>{calls++;return new Response('test');}}};
 assert.equal((await routeFamily(request(),{})).status,503);
 for(const path of ['/hq','/api/bookings','/webhooks/resend','/elf-notes/../hq','/elf-notes/%2fhq','/elf-notes/read?token=secret'])assert.equal((await routeFamily(request(path),env)).status,404,path);
 assert.equal((await routeFamily(new Request(origin+'/elf-notes',{method:'POST'}),env)).status,405);
 assert.equal((await routeFamily(request('/elf-notes/read',{headers:{Origin:'https://attacker.test'}}),env)).status,403);
 assert.equal((await routeFamily(request('/elf-notes/read',{headers:{Origin:origin,'Content-Type':'application/json'}}),env)).status,401);
 assert.equal(calls,0);
});
test('family ingress strips identity/cookies, bounds streams, preserves invitation authorization and refuses redirects',async()=>{
 let forwarded:Request|undefined;const env={ELF_FAMILY_ENABLED:'true',ELF_FAMILY_ORIGIN:origin,BOOKING:{fetch:async(r:Request)=>{forwarded=r;return new Response('{}',{headers:{'Content-Type':'application/json','Set-Cookie':'must-not-forward=1'}});}}};
 const r=request();r.headers.set('Cookie','Santa-session=must-not-forward');r.headers.set('cf-access-jwt-assertion','forged');r.headers.set('x-actor','santa');
 const response=await routeFamily(r,env);assert.equal(response.status,200);assert.match(response.headers.get('cache-control')!,/no-store/);assert.equal(response.headers.get('set-cookie'),null);assert.equal(forwarded!.headers.get('authorization'),'Bearer '+token);for(const k of ['cookie','cf-access-jwt-assertion','x-actor'])assert.equal(forwarded!.headers.get(k),null);assert.equal(await forwarded!.text(),'{}');
 assert.equal((await routeFamily(request('/elf-notes/save',{body:'x'.repeat(32769)}),env)).status,413);
 assert.equal((await routeFamily(request(),{...env,BOOKING:{fetch:async()=>new Response(null,{status:302,headers:{Location:'https://attacker.test'}})}})).status,502);
});
test('separate family origin reaches real invitation checks without granting any Santa/HQ identity',async()=>{
 const f=await hqFixture();try{
  Object.assign(f.env,{ELF_NOTES_ENABLED:'true',ELF_ORIGIN:origin,ELF_TOKEN_SECRET:'synthetic-token-key-32-characters-long',ELF_ACTIVE_KEY:'test',ELF_ENCRYPTION_KEYS:JSON.stringify({test:btoa('e'.repeat(32))})});
  const id=await f.ready();assert.equal((await f.mutate(id,'confirm',{beforeMinutes:0,afterMinutes:0})).status,200);
  const invite=await(await f.call('/hq/api/bookings/'+id+'/elf/invite',{})).json() as {invitationUrl:string};assert.equal(new URL(invite.invitationUrl).origin,origin);
  const env={ELF_FAMILY_ENABLED:'true',ELF_FAMILY_ORIGIN:origin,BOOKING:{fetch:(r:Request)=>handleElf(r,f.env,testNow)}};
  assert.equal((await routeFamily(request(),env)).status,401);
  const req=request('/elf-notes/save',{body:JSON.stringify({version:0,guardianConsent:true,children:[{firstName:'Synthetic'}]})});req.headers.set('Authorization','Bearer '+new URL(invite.invitationUrl).hash.slice(1));assert.equal((await routeFamily(req,env)).status,200);
  assert.equal((await routeFamily(new Request(origin+'/hq'),env)).status,404);
 }finally{await f.dispose();}
});
