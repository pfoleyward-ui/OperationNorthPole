import type {ProviderEnv} from './providers.ts';
/** Private, fixed GET-only provider checks. Never returns provider bodies or credentials. */
export async function productionResendReadiness(request:Request,env:ProviderEnv&{HQ_ORIGIN?:string},fetcher:typeof fetch=fetch):Promise<Response>{
 const url=new URL(request.url),headers={'Cache-Control':'no-store'};
 if(url.origin!=='https://notify.internal'||url.pathname!=='/readiness/production/resend'||url.search||env.HQ_ORIGIN!=='https://hq.santablizard.com')return Response.json({error:'not_found'},{status:404,headers});
 if(request.method!=='GET')return Response.json({error:'method_not_allowed'},{status:405,headers});
 if(!env.RESEND_API_KEY)return Response.json({error:'unavailable'},{status:503,headers});
 if(!env.RESEND_API_KEY.startsWith('re_'))return Response.json({error:'invalid_api_key_format'},{status:503,headers});
 const get=(path:string)=>fetcher('https://api.resend.com/'+path,{headers:{Authorization:'Bearer '+env.RESEND_API_KEY},redirect:'manual',signal:AbortSignal.timeout(7000)});
 try{
  const list=await get('domains');if(!list.ok)return Response.json({authenticationSucceeded:false,providerHttpStatus:list.status},{headers});
  const data=await list.json() as {data?:{id?:string;name?:string}[]};const domain=data.data?.find(d=>d.name==='mail.santablizard.com');
  if(!domain?.id||!/^[A-Za-z0-9_-]{1,100}$/.test(domain.id))return Response.json({authenticationSucceeded:true,domainFound:false},{headers});
  const response=await get('domains/'+domain.id);if(!response.ok)return Response.json({authenticationSucceeded:true,domainReadHttpStatus:response.status},{headers});
  const detail=await response.json() as {name?:string;status?:string;open_tracking?:boolean;click_tracking?:boolean};
  const hooks=await get('webhooks');let webhookConfigured=false,webhookEnabled=false,events:string[]=[];
  if(hooks.ok){const body=await hooks.json() as {data?:{endpoint?:string;status?:string;events?:string[]}[]};const hook=body.data?.find(h=>h.endpoint==='https://webhooks.santablizard.com/webhooks/resend');webhookConfigured=!!hook;webhookEnabled=hook?.status==='enabled';events=(hook?.events||[]).filter(e=>['email.sent','email.delivered','email.bounced','email.complained','email.failed','email.suppressed'].includes(e));}
  return Response.json({authenticationSucceeded:true,domainVerified:detail.name==='mail.santablizard.com'&&detail.status==='verified',openTracking:detail.open_tracking??null,clickTracking:detail.click_tracking??null,webhookReadHttpStatus:hooks.status,webhookConfigured,webhookEnabled,events},{headers});
 }catch{return Response.json({error:'provider_readiness_unavailable'},{status:503,headers});}
}
