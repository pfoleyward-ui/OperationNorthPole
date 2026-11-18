import type { Database } from './repository.ts';
import { record } from '../../src/domain/booking/request.ts';
import { localParts, resolveWallTime, validTime } from '../../src/domain/booking/time.ts';
import { digest } from './shared.ts';

export type Recipient = 'santa' | 'mrs_claus' | 'technical_admin' | 'customer';
export type Kind = 'calendar' | 'new_request' | 'confirmation' | 'seven_days' | 'twenty_four_hours' | 'three_hours' | 'morning' | 'escalation_2' | 'escalation_3' | 'escalation_4' | 'resolution' | 'customer_update';
export type Target = { recipientKey: string; channel: 'email' };
export interface IntegrationEnv {
  DB: Database;
  HQ_ORIGIN?: string;
  INTAKE_HMAC_SECRET?: string;
  INTEGRATION_PLANNER_ENABLED?: string;
  CALENDAR_SYNC_ENABLED?: string;
  NOTIFICATION_DELIVERY_ENABLED?: string;
  GOOGLE_OAUTH_ENABLED?: string;
  NATIVE_CALENDAR_REMINDER_MINUTES?: string;
  CUSTOMER_EMAIL_ENABLED?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_TOKEN_KEYS?: string;
  GOOGLE_TOKEN_ACTIVE_KEY?: string;
  INTEGRATION_INSTALLATION_ID?: string;
  REMINDER_POLICY_JSON?: string;
  NOTIFICATION_TARGETS_JSON?: string;
  MRS_CLAUS_CONSENT_JSON?: string;
  NOTIFY?: { fetch(request: Request): Promise<Response> };
}
export class IntegrationError extends Error {
  code: string;
  constructor(code: string) { super(code); this.code=code; }
}
export type Policy = { timeZone: 'America/New_York'; morningTime: string; quietStart: string; quietEnd: string; escalationMinutes: [number,number,number,number]; reconcileMinutes: number; sevenDayHours:number; acknowledgmentHours:number; finalReminderHours:number };
/** Owner-approved defaults; all values remain configurable. No recipient is inferred. */
export const approvedPolicy: Policy = { timeZone:'America/New_York',morningTime:'08:00',quietStart:'21:00',quietEnd:'08:00',escalationMinutes:[0,120,240,360],reconcileMinutes:15,sevenDayHours:168,acknowledgmentHours:24,finalReminderHours:3 };
export function policy(env: IntegrationEnv): Policy {
  let input: unknown;
  try { input = env.REMINDER_POLICY_JSON ? JSON.parse(env.REMINDER_POLICY_JSON) : approvedPolicy; } catch { throw new IntegrationError('invalid_reminder_policy'); }
  if (!record(input) || Object.keys(input).some(k=>!Object.hasOwn(approvedPolicy,k))) throw new IntegrationError('invalid_reminder_policy');
  const p={...approvedPolicy,...input} as Policy;
  if([p.sevenDayHours,p.acknowledgmentHours,p.finalReminderHours].some(v=>!Number.isSafeInteger(v)||v<1||v>8784))throw new IntegrationError('invalid_reminder_policy');
  if (p.timeZone!=='America/New_York' || !validTime(p.morningTime) || !validTime(p.quietStart) || !validTime(p.quietEnd) || p.quietStart<=p.quietEnd || !Array.isArray(p.escalationMinutes) || p.escalationMinutes.length!==4 || p.escalationMinutes[0]!==0 || p.escalationMinutes.some((v,i,a)=>!Number.isSafeInteger(v)||v<0||v>10080||(i>0&&v<=a[i-1])) || !Number.isSafeInteger(p.reconcileMinutes)||p.reconcileMinutes<1||p.reconcileMinutes>1440) throw new IntegrationError('invalid_reminder_policy');
  return p;
}
export function addDays(date:string,days:number):string { return new Date(Date.parse(date+'T12:00Z')+days*86400000).toISOString().slice(0,10); }
export function wall(date:string,time:string):number|null {
  const r=resolveWallTime(date,time);return r.kind==='valid'||r.kind==='ambiguous'?r.candidates[0]:null;
}
export function quietAdjusted(at:number,p:Policy):number {
  const local=localParts(at);
  if(local.time>=p.quietStart) return wall(addDays(local.date,1),p.quietEnd)!;
  if(local.time<p.quietEnd) return wall(local.date,p.quietEnd)!;
  return at;
}
export function target(env:IntegrationEnv,recipient:Recipient):Target|null {
  try {
    const all:unknown=JSON.parse(env.NOTIFICATION_TARGETS_JSON||'{}');
    if(!record(all))return null;const t=all[recipient];
    if(!record(t)||typeof t.recipientKey!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(t.recipientKey)||!['email'].includes(t.channel as string))return null;
    if(recipient==='mrs_claus'&&t.channel!=='email')return null;
    return {recipientKey:t.recipientKey,channel:t.channel as Target['channel']};
  }catch{return null;}
}
export function mrsConsent(env:IntegrationEnv,key:string,now:number):boolean {
  try{const c:unknown=JSON.parse(env.MRS_CLAUS_CONSENT_JSON||'{}');return record(c)&&c.granted===true&&c.recipientKey===key&&typeof c.reference==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(c.reference)&&Number.isSafeInteger(c.grantedAt)&&(c.grantedAt as number)<=now&&(c.grantedAt as number)>0;}catch{return false;}
}
export function origin(env:IntegrationEnv):string {
  try{const u=new URL(env.HQ_ORIGIN!);if(u.protocol==='https:'&&u.origin===env.HQ_ORIGIN)return u.origin;}catch{}
  throw new IntegrationError('hq_origin_not_configured');
}
export async function lease(db:Database,key:string,now:number):Promise<string|null>{
  const owner=crypto.randomUUID();
  const row=await db.prepare(`INSERT INTO integration_leases (key,owner,expires_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE expires_at<=? RETURNING owner`).bind(key,owner,now+120000,now).first<{owner:string}>();
  return row?.owner===owner?owner:null;
}
export async function release(db:Database,key:string,owner:string){await db.batch([db.prepare('DELETE FROM integration_leases WHERE key=? AND owner=?').bind(key,owner)]);}
export async function stableHashKey(env:IntegrationEnv){
  if(!env.INTAKE_HMAC_SECRET||env.INTAKE_HMAC_SECRET.length<32)throw new IntegrationError('integration_hash_secret_required');
  const fingerprint=await digest(env.INTAKE_HMAC_SECRET,'integration-hmac-key-check');
  let saved=await env.DB.prepare("SELECT value FROM integration_control WHERE key='integration_hash_fingerprint'").first<{value:string}>();
  if(!saved){
    await env.DB.batch([env.DB.prepare("INSERT INTO integration_control (key,value) VALUES ('integration_hash_fingerprint',?) ON CONFLICT(key) DO NOTHING").bind(fingerprint)]);
    saved=await env.DB.prepare("SELECT value FROM integration_control WHERE key='integration_hash_fingerprint'").first<{value:string}>();
  }
  if(saved?.value!==fingerprint)throw new IntegrationError('integration_hash_key_changed_migration_required');
}
