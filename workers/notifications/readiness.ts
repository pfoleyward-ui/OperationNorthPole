import type {ProviderEnv} from './providers.ts';
export const TEST_EMAIL_SUBJECT='Staging email delivery test';
export const TEST_EMAIL_TEXT='This is a controlled staging email test. No action is required.\nhttps://staging.santablizard.com/hq';
type Env=ProviderEnv&{HQ_ORIGIN?:string;STAGING_TEST_RECIPIENT?:string};
/** Private service-binding diagnostic: fixed read-only provider URLs, sanitized output only. */
export async function resendReadiness(request:Request,env:Env,fetcher:typeof fetch=fetch){
 const url=new URL(request.url),headers={'Cache-Control':'no-store'};
 if(url.origin!=='https://notify.internal'||url.pathname!=='/readiness/resend'||url.search||env.HQ_ORIGIN!=='https://staging.santablizard.com'||!env.STAGING_TEST_RECIPIENT)return Response.json({error:'not_found'},{status:404,headers});
 if(request.method!=='GET')return Response.json({error:'method_not_allowed'},{status:405,headers});
 if(!env.RESEND_API_KEY)return Response.json({error:'unavailable'},{status:503,headers});
 const get=(path:string)=>fetcher('https://api.resend.com/'+path,{headers:{Authorization:'Bearer '+env.RESEND_API_KEY},redirect:'manual',signal:AbortSignal.timeout(5000)});
 try{
  const list=await get('domains');if(!list.ok)return Response.json({authenticationSucceeded:false,providerHttpStatus:list.status},{headers});
  const data=await list.json() as {data?:{id?:string;name?:string}[]};const domain=data.data?.find(d=>d.name==='mail.santablizard.com');
  if(!domain?.id||!/^[A-Za-z0-9_-]{1,100}$/.test(domain.id))return Response.json({authenticationSucceeded:true,domainFound:false},{headers});
  const response=await get('domains/'+encodeURIComponent(domain.id));if(!response.ok)return Response.json({authenticationSucceeded:true,domainFound:true,domainReadHttpStatus:response.status},{headers});
  const details=await response.json() as {name?:string;status?:string;open_tracking?:boolean;click_tracking?:boolean};
  return Response.json({authenticationSucceeded:true,domainFound:true,domainVerified:details.name==='mail.santablizard.com'&&details.status==='verified',openTracking:typeof details.open_tracking==='boolean'?details.open_tracking:null,clickTracking:typeof details.click_tracking==='boolean'?details.click_tracking:null},{headers});
 }catch{return Response.json({error:'provider_readiness_unavailable'},{status:503,headers});}
}
