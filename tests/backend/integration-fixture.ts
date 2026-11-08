import assert from 'node:assert/strict';
import { hqFixture,testNow } from './hq-fixture.ts';
import { GOOGLE_SCOPE } from '../../workers/booking/google.ts';
import type { HqEnv } from '../../workers/booking/hq.ts';

export type Receipt={idempotencyKey:string;status:'accepted'|'delivered'|'failed';providerId:string};
export class MockGateway {
  receipts=new Map<string,Receipt>();
  messages=new Map<string,Record<string,unknown>>();
  posts=0;lookups=0;failLookup=false;loseResponse=false;
  rejectPostOnce=false;bodies:Record<string,unknown>[]=[];
  onPost?: (key:string,body:Record<string,unknown>)=>Promise<void>;
  async fetch(request:Request):Promise<Response>{
    const key=new URL(request.url).pathname.split('/').at(-1)!;
    if(request.method==='GET'){this.lookups++;if(this.failLookup)throw new Error('Synthetic gateway outage');return Response.json(this.receipts.get(key)||{idempotencyKey:key,status:'not_found'});}
    assert.equal(request.headers.get('idempotency-key'),key);
    const body=await request.json() as Record<string,unknown>;
    assert.equal(body.idempotencyKey,key);assert.ok(!JSON.stringify(body).includes('DO_NOT_EXPORT'));
    this.posts++;
    this.bodies.push(body);
    if(this.rejectPostOnce){this.rejectPostOnce=false;throw new Error('Synthetic failure before acceptance');}
    if(!this.receipts.has(key)){this.messages.set(key,body);this.receipts.set(key,{idempotencyKey:key,status:'delivered',providerId:'synthetic-'+key.slice(0,12)});}
    if(this.onPost)await this.onPost(key,body);
    if(this.loseResponse){this.loseResponse=false;throw new Error('Synthetic lost response after acceptance');}
    return Response.json(this.receipts.get(key));
  }
}
export class MockGoogle {
  calendar:Record<string,unknown>|null=null;
  events=new Map<string,Record<string,unknown>>();
  tombstones=new Set<string>();
  createCalls=0;eventWrites=0;deletes=0;refreshes=0;tokens=0;revokes=0;
  fail=false;loseEventResponse=false;loseCalendarResponse=false;etag=0;
  tokenScope=GOOGLE_SCOPE; nativeReminderMinutes:number|null=null;
  async fetch(url:RequestInfo|URL,init?:RequestInit):Promise<Response>{
    const u=new URL(String(url));const method=init?.method||'GET';
    if(this.fail)throw new Error('Synthetic Google outage');
    if(u.href==='https://oauth2.googleapis.com/token'){
      const data=new URLSearchParams(init?.body as URLSearchParams);assert.ok(data.get('client_secret'));
      if(data.get('grant_type')==='refresh_token')this.refreshes++;else{assert.ok(data.get('code_verifier'));this.tokens++;}
      return Response.json({access_token:'synthetic-access-token',refresh_token:'synthetic-refresh-token',expires_in:3600,token_type:'Bearer',scope:this.tokenScope});
    }
    if(u.href==='https://oauth2.googleapis.com/revoke'){this.revokes++;return new Response(null,{status:200});}
    assert.equal(new Headers(init?.headers).get('authorization'),'Bearer synthetic-access-token');
    const path=u.pathname.replace('/calendar/v3/','');
    if(path==='calendars'&&method==='POST'){
      this.createCalls++;this.calendar={...JSON.parse(init?.body as string),id:'synthetic-calendar@app-created.test'};
      if(this.loseCalendarResponse){this.loseCalendarResponse=false;throw new Error('Synthetic lost calendar response');}
      return Response.json(this.calendar);
    }
    if(/^calendars\/[^/]+$/.test(path))return this.calendar?Response.json(this.calendar):new Response(null,{status:404});
    const parts=path.split('/');assert.equal(parts[2],'events');const id=parts[3];
    if(method==='GET')return this.events.has(id)?Response.json(this.events.get(id)):new Response(null,{status:this.tombstones.has(id)?410:404});
    assert.equal(u.searchParams.get('sendUpdates'),'none');
    if(method==='DELETE'){
      if(!this.events.has(id))return new Response(null,{status:404});
      if(new Headers(init?.headers).get('if-match')!==this.events.get(id)!.etag)return new Response(null,{status:412});
      this.events.delete(id);this.tombstones.add(id);this.deletes++;return new Response(null,{status:204});
    }
    const body=JSON.parse(init?.body as string) as Record<string,unknown>;
    assert.ok(!JSON.stringify(body).includes('DO_NOT_EXPORT'));assert.equal(body.visibility,'private');assert.deepEqual(body.reminders,{useDefault:false,overrides:this.nativeReminderMinutes===null?[]:[{method:'popup',minutes:this.nativeReminderMinutes}]});
    const eventId=id||body.id as string;
    if(method==='POST'&&this.events.has(eventId))return new Response(null,{status:409});
    if(method==='PUT'&&new Headers(init?.headers).get('if-match')!==this.events.get(eventId)?.etag)return new Response(null,{status:412});
    this.eventWrites++;this.events.set(eventId,{...body,id:eventId,etag:'"'+(++this.etag)+'"'});
    if(this.loseEventResponse){this.loseEventResponse=false;throw new Error('Synthetic event response lost');}
    return Response.json(this.events.get(eventId));
  }
}
export async function integrationFixture(){
  const f=await hqFixture(),gateway=new MockGateway(),google=new MockGoogle();
  const env:HqEnv={...f.env,INTEGRATION_PLANNER_ENABLED:'true',CALENDAR_SYNC_ENABLED:'true',NOTIFICATION_DELIVERY_ENABLED:'true',GOOGLE_OAUTH_ENABLED:'true',
    INTEGRATION_INSTALLATION_ID:'synthetic-installation-001',GOOGLE_CLIENT_ID:'synthetic-client',GOOGLE_CLIENT_SECRET:'synthetic-secret',
    GOOGLE_TOKEN_ACTIVE_KEY:'test-key',GOOGLE_TOKEN_KEYS:JSON.stringify({'test-key':btoa('0'.repeat(32))}),NOTIFY:gateway,
    NOTIFICATION_TARGETS_JSON:JSON.stringify({santa:{recipientKey:'santa-test',channel:'email'},mrs_claus:{recipientKey:'mrs-test',channel:'email'},technical_admin:{recipientKey:'admin-test',channel:'email'}}),
    MRS_CLAUS_CONSENT_JSON:JSON.stringify({granted:true,recipientKey:'mrs-test',reference:'synthetic-consent',grantedAt:testNow-1000})};
  const fetcher:typeof fetch=async(url,init)=>String(url).startsWith('https://synthetic-team.cloudflareaccess.com')?f.jwksFetch(url,init):google.fetch(url,init);
  const call=(path:string,body?:unknown,options:Parameters<typeof f.call>[2]={})=>f.call(path,body,{...options,env:options.env||env,fetcher});
  async function connect(create=true){
    const start=await call('/hq/api/integrations/google/start',{});assert.equal(start.status,200);
    const auth=new URL(((await start.json()) as {authorizationUrl:string}).authorizationUrl);
    assert.equal(auth.searchParams.get('scope'),GOOGLE_SCOPE);assert.equal(auth.searchParams.get('code_challenge_method'),'S256');
    const response=await call('/hq/oauth/google/callback?state='+auth.searchParams.get('state')+'&code=synthetic-code');assert.equal(response.status,303);
    if(create)assert.equal((await call('/hq/api/integrations/google/calendar',{})).status,200);
    return auth;
  }
  return {...f,env,call,gateway,google,fetcher,connect};
}
