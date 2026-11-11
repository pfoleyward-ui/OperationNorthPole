import {readFile} from 'node:fs/promises';
import {hqFixture,testNow} from './hq-fixture.ts';
import {handleGateway,reconcileGateway,type GatewayEnv} from '../../workers/notifications/index.ts';
import type {Database} from '../../workers/booking/repository.ts';
export class MockEmail {
  sent=new Map<string,{id:string;body:Record<string,unknown>;status:string}>();calls=0;lookups=0;rateLimit=false;loseResponse=false;failLookup=false;
  async fetch(url:RequestInfo|URL,init?:RequestInit){
    if(String(url)==='https://api.resend.com/emails'){
      this.calls++;
      if(this.rateLimit){this.rateLimit=false;return new Response(null,{status:429});}
      const key=new Headers(init?.headers).get('idempotency-key')!;
      const body=JSON.parse(String(init?.body));
      if(!this.sent.has(key))this.sent.set(key,{id:'email-'+this.sent.size,body,status:'delivered'});
      if(this.loseResponse){this.loseResponse=false;throw new Error('Synthetic response lost after acceptance');}
      return Response.json({id:this.sent.get(key)!.id});
    }
    if(this.failLookup)throw new Error('Synthetic receipt outage');this.lookups++;
    const record=[...this.sent.values()].find(v=>String(url)==='https://api.resend.com/emails/'+v.id);
    return record?Response.json({id:record.id,last_event:record.status}):new Response(null,{status:404});
  }
}
export async function gatewayFixture(){
  const f=await hqFixture();
  const sql=await readFile(new URL('../../migrations/gateway/0001_notification_gateway.sql',import.meta.url),'utf8');
  for(const stmt of sql.replace(/--[^\n]*/g,'').split(';').filter(v=>v.trim()))await f.db.prepare(stmt).run();
  const email=new MockEmail();
  const env:GatewayEnv={DB:f.db as unknown as Database,BOOKING_DB:f.env.DB,GATEWAY_DELIVERY_ENABLED:'true',GATEWAY_HMAC_SECRET:'synthetic-gateway-hmac-at-least-32-characters',HQ_ORIGIN:f.env.HQ_ORIGIN,RESEND_API_KEY:'synthetic-not-a-real-provider-key',EMAIL_FROM:'Synthetic Santa <santa@example.test>',EMAIL_REPLY_TO:'santa@example.test',GATEWAY_RECIPIENTS_JSON:JSON.stringify({'santa-test':{channel:'email',destination:'santa@example.test'},'mrs-test':{channel:'email',destination:'mrs@example.test'},'admin-test':{channel:'email',destination:'admin@example.test'}})};
  let now=testNow;
  const provider:typeof fetch=(url,init)=>email.fetch(url,init);
  const call=(key:string,body?:unknown,headers:Record<string,string>={})=>handleGateway(new Request('https://notify.internal/deliveries/'+key,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','Idempotency-Key':key,...headers},...(body?{body:JSON.stringify(body)}:{})}),env,provider,now);
  return {...f,email,gatewayEnv:env,provider,gatewayCall:call,setNow:(at:number)=>{now=at;},gateway:{fetch:(request:Request)=>handleGateway(request,env,provider,now)},poll:()=>reconcileGateway(env,provider,now)};
}
export const operationalMessage=(key:string=crypto.randomUUID())=>({idempotencyKey:key,recipientKey:'santa-test',channel:'email',subject:'A new letter has arrived!',text:'A little Christmas planning is ready for your attention. Open the secure desk for details.\nhttps://hq.example.test/hq?booking=00000000-0000-0000-0000-000000000001#reminders',expiresAt:testNow+86400000});
