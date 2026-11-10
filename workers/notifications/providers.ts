/** Transactional email only. Provider keys and approved routes never reach browsers. */
export interface ProviderEnv { RESEND_WEBHOOK_SECRET?:string; RESEND_API_KEY?: string; EMAIL_FROM?: string; EMAIL_REPLY_TO?: string }
export type Message = { idempotencyKey:string; recipientKey:string; channel:'email'; subject:string; text:string; expiresAt:number; customerState?:string };
export type ProviderResult = { state:'accepted'|'delivered'|'failed'|'retry'|'uncertain'; id?:string; code?:string };
export function providerConfigured(_channel:Message['channel'],env:ProviderEnv){return Boolean(env.RESEND_API_KEY&&env.EMAIL_FROM&&!/[\r\n]/.test(env.EMAIL_FROM)&&(!env.EMAIL_REPLY_TO||!/\s/.test(env.EMAIL_REPLY_TO)));}
export async function send(message:Message,destination:string,env:ProviderEnv,fetcher:typeof fetch):Promise<ProviderResult>{
  try{
    // Workers supports manual/follow only. Never forward provider credentials to redirects.
    const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':message.idempotencyKey},body:JSON.stringify({from:env.EMAIL_FROM,to:[destination],subject:message.subject,text:message.text,tags:[{name:"onp_delivery",value:message.idempotencyKey}],...(env.EMAIL_REPLY_TO?{reply_to:env.EMAIL_REPLY_TO}:{})}),signal:AbortSignal.timeout(6000),redirect:'manual'});
    if(response.status===429)return {state:'retry',code:'provider_rate_limited'};
    if(response.status>=400&&response.status<500)return {state:'failed',code:'provider_rejected'};
    if(!response.ok)return {state:'uncertain',code:'provider_outcome_unknown'};
    const value=await response.json() as {id?:string};
    if(typeof value.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(value.id))return {state:'uncertain',code:'provider_receipt_invalid'};
    return {state:'accepted',id:value.id};
  }catch{return {state:'uncertain',code:'provider_outcome_unknown'};}
}
export async function poll(_channel:Message['channel'],id:string,env:ProviderEnv,fetcher:typeof fetch):Promise<ProviderResult>{
  try{
    const response=await fetcher('https://api.resend.com/emails/'+encodeURIComponent(id),{headers:{Authorization:'Bearer '+env.RESEND_API_KEY},signal:AbortSignal.timeout(6000),redirect:'manual'});
    if(!response.ok)return {state:'accepted',id,code:'receipt_lookup_retry'};
    const value=await response.json() as {id?:string;last_event?:string};
    if(value.id!==id)return {state:'accepted',id,code:'receipt_identity_mismatch'};
    if(['delivered','opened','clicked'].includes(value.last_event||''))return {state:'delivered',id};
    if(['failed','bounced','complained','suppressed'].includes(value.last_event||''))return {state:'failed',id,code:'provider_delivery_failed'};
    return {state:'accepted',id};
  }catch{return {state:'accepted',id,code:'receipt_lookup_retry'};}
}
