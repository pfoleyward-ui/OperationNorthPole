import type {Database} from '../booking/repository.ts';
import type {ProviderEnv} from './providers.ts';
export const TEST_EMAIL_SUBJECT='Staging email delivery test';
export const FRESH_TEST_EMAIL_SUBJECT='Fresh staging email delivery check 2';
export const TEST_EMAIL_TEXT='This is a controlled staging email test. No action is required.\nhttps://staging.santablizard.com/hq';
type Env=ProviderEnv&{DB?:Database;HQ_ORIGIN?:string;STAGING_TEST_RECIPIENT?:string};
/** Private service-binding diagnostic: fixed read-only provider URLs, sanitized output only. */
export async function resendReadiness(request:Request,env:Env,fetcher:typeof fetch=fetch){
 const url=new URL(request.url),headers={'Cache-Control':'no-store'};
 const receiptKey=/^\/readiness\/resend\/receipts\/([A-Za-z0-9_-]{16,100})$/.exec(url.pathname)?.[1];
 if(url.origin!=='https://notify.internal'||(url.pathname!=='/readiness/resend'&&!receiptKey)||url.search||env.HQ_ORIGIN!=='https://staging.santablizard.com'||!env.STAGING_TEST_RECIPIENT)return Response.json({error:'not_found'},{status:404,headers});
 if(request.method!=='GET')return Response.json({error:'method_not_allowed'},{status:405,headers});
 if(!env.RESEND_API_KEY)return Response.json({error:'unavailable'},{status:503,headers});
 const get=(path:string)=>fetcher('https://api.resend.com/'+path,{headers:{Authorization:'Bearer '+env.RESEND_API_KEY},redirect:'manual',signal:AbortSignal.timeout(5000)});
 try{
  if(receiptKey){
   const stored=await env.DB?.prepare('SELECT provider_id FROM gateway_deliveries WHERE id=? AND destination=?').bind(receiptKey,env.STAGING_TEST_RECIPIENT!).first<{provider_id:string|null}>();
   if(!stored?.provider_id||!/^[A-Za-z0-9_-]{1,100}$/.test(stored.provider_id))return Response.json({error:'receipt_not_found'},{status:404,headers});
   const response=await get('emails/'+encodeURIComponent(stored.provider_id));if(!response.ok)return Response.json({providerHttpStatus:response.status},{headers});
   const details=await response.json() as {id?:string;to?:string[];from?:string;reply_to?:string[]|string;subject?:string;last_event?:string;created_at?:string};
   const recipientMatches=Array.isArray(details.to)&&details.to.length===1&&details.to[0].toLowerCase()===env.STAGING_TEST_RECIPIENT!.toLowerCase();
   const replies=typeof details.reply_to==='string'?[details.reply_to]:details.reply_to;
   return Response.json({providerHttpStatus:response.status,providerMessageId:stored.provider_id,providerIdentityMatches:details.id===stored.provider_id,recipientMatchesApproved:recipientMatches,approvedRecipient:recipientMatches?env.STAGING_TEST_RECIPIENT:null,fromMatchesConfigured:details.from===env.EMAIL_FROM,replyToMatchesConfigured:Array.isArray(replies)&&replies.length===1&&replies[0]===env.EMAIL_REPLY_TO,subjectMatchesExpected:[TEST_EMAIL_SUBJECT,FRESH_TEST_EMAIL_SUBJECT].some(subject=>details.subject==='[STAGING TEST] '+subject),lastEvent:['sent','delivered','delivery_delayed','failed','bounced','complained','suppressed','opened','clicked','scheduled','canceled'].includes(details.last_event||'')?details.last_event:'unknown',createdAt:typeof details.created_at==='string'&&Number.isFinite(Date.parse(details.created_at))?details.created_at:null},{headers});
  }
  const list=await get('domains');if(!list.ok)return Response.json({authenticationSucceeded:false,providerHttpStatus:list.status},{headers});
  const data=await list.json() as {data?:{id?:string;name?:string}[]};const domain=data.data?.find(d=>d.name==='mail.santablizard.com');
  if(!domain?.id||!/^[A-Za-z0-9_-]{1,100}$/.test(domain.id))return Response.json({authenticationSucceeded:true,domainFound:false},{headers});
  const response=await get('domains/'+encodeURIComponent(domain.id));if(!response.ok)return Response.json({authenticationSucceeded:true,domainFound:true,domainReadHttpStatus:response.status},{headers});
  const details=await response.json() as {name?:string;status?:string;open_tracking?:boolean;click_tracking?:boolean};
  return Response.json({authenticationSucceeded:true,domainFound:true,domainVerified:details.name==='mail.santablizard.com'&&details.status==='verified',openTracking:typeof details.open_tracking==='boolean'?details.open_tracking:null,clickTracking:typeof details.click_tracking==='boolean'?details.click_tracking:null},{headers});
 }catch{return Response.json({error:'provider_readiness_unavailable'},{status:503,headers});}
}
