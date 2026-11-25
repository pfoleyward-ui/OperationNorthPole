import {calendarHealth} from './booking/google.ts';
import {IntegrationError,type IntegrationEnv} from './booking/integration-config.ts';
const key='production-calendar-health-20261125-v1';
/** Temporary private scheduled check: no event writes, email, or public trigger. */
export async function checkProductionCalendar(env:IntegrationEnv&{PRODUCTION_CALENDAR_CHECK?:string;ELF_NOTES_ENABLED?:string;ELF_RETENTION_APPROVED?:string},now=Date.now(),fetcher:typeof fetch=fetch){
 if(env.PRODUCTION_CALENDAR_CHECK!=='true'||env.INTEGRATION_INSTALLATION_ID!=='santablizard-production-20261110'||[env.INTEGRATION_PLANNER_ENABLED,env.CALENDAR_SYNC_ENABLED,env.NOTIFICATION_DELIVERY_ENABLED,env.CUSTOMER_EMAIL_ENABLED,env.ELF_NOTES_ENABLED,env.ELF_RETENTION_APPROVED].some(v=>v!=='false'))return;
 if(await env.DB.prepare('SELECT value FROM integration_control WHERE key=?').bind(key).first())return;
 let result:Record<string,unknown>;
 try{result=await calendarHealth(env,fetcher,now);}catch(error){result={error:error instanceof IntegrationError?error.code:'calendar_health_unavailable'};}
 await env.DB.batch([env.DB.prepare('INSERT INTO integration_control(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING').bind(key,JSON.stringify(result))]);
}
export default {fetch(){return new Response('Not found',{status:404});},scheduled(_event:unknown,env:Parameters<typeof checkProductionCalendar>[0],ctx:{waitUntil(p:Promise<unknown>):void}){ctx.waitUntil(checkProductionCalendar(env));}};
