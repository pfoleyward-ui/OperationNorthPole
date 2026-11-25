import type {Database} from './booking/repository.ts';
const key='production-provider-preflight-20261125-v1';
interface Env {DB:Database;NOTIFY:{fetch(request:Request):Promise<Response>};PRODUCTION_PROVIDER_CHECK?:string;INTEGRATION_INSTALLATION_ID?:string;INTEGRATION_PLANNER_ENABLED?:string;CALENDAR_SYNC_ENABLED?:string;NOTIFICATION_DELIVERY_ENABLED?:string;CUSTOMER_EMAIL_ENABLED?:string;ELF_NOTES_ENABLED?:string;ELF_RETENTION_APPROVED?:string}
/** Temporary scheduled read-only provider check. No public trigger or send operation. */
export async function checkProductionProvider(env:Env){
 if(env.PRODUCTION_PROVIDER_CHECK!=='true'||env.INTEGRATION_INSTALLATION_ID!=='santablizard-production-20261110'||[env.INTEGRATION_PLANNER_ENABLED,env.CALENDAR_SYNC_ENABLED,env.NOTIFICATION_DELIVERY_ENABLED,env.CUSTOMER_EMAIL_ENABLED,env.ELF_NOTES_ENABLED,env.ELF_RETENTION_APPROVED].some(v=>v!=='false'))return;
 if(await env.DB.prepare('SELECT value FROM integration_control WHERE key=?').bind(key).first())return;
 const response=await env.NOTIFY.fetch(new Request('https://notify.internal/readiness/production/resend'));
 const body=await response.json() as Record<string,unknown>;const allowed=['authenticationSucceeded','domainVerified','openTracking','clickTracking','webhookReadHttpStatus','webhookConfigured','webhookEnabled','events','providerHttpStatus','error'];
 const sanitized=Object.fromEntries(Object.entries(body).filter(([name])=>allowed.includes(name)));
 await env.DB.batch([env.DB.prepare('INSERT INTO integration_control(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING').bind(key,JSON.stringify({httpStatus:response.status,...sanitized}))]);
}
export default {fetch(){return new Response('Not found',{status:404});},scheduled(_event:unknown,env:Env,ctx:{waitUntil(p:Promise<unknown>):void}){ctx.waitUntil(checkProductionProvider(env));}};
