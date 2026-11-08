import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { readFile } from 'node:fs/promises';
import { handleHq, type HqEnv } from '../../workers/booking/hq.ts';
import type { Database } from '../../workers/booking/repository.ts';

export const testNow = Date.parse('2026-11-02T17:00:00Z');
export const syntheticRequest = () => ({ serviceId: 'home-visits', timing: { date: '2027-12-20', time: '14:00' }, customer: { name: 'Sample Adult', email: 'sample@example.test', phone: '202-555-0100' }, location: 'Synthetic Hudson Valley venue', eventType: 'Sample visit', sensoryFriendly: true, answers: {} });
export const syntheticQuote = () => ({ date: '2027-12-20', time: '14:00', durationMinutes: 30, expiryDate: '2027-12-01', expiryTime: '12:00' });
export async function hqFixture() {
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'hq-test', modules: true, script: 'export default { fetch(){ return new Response("test"); } }', compatibilityDate: '2026-11-02', d1Databases: ['DB'] }] }));
  const db = await mf.getD1Database('DB');
  for (const file of ['0001_booking_intake.sql','0002_santa_hq.sql','0003_integrations.sql']) {
    const sql = (await readFile(new URL('../../migrations/'+file,import.meta.url),'utf8')).replace(/--[^\n]*/g,'');
    let pending = '', trigger = false;
    for (const line of sql.split('\n')) {
      if (!pending.trim()) trigger = /^CREATE TRIGGER/i.test(line.trim());
      pending += line+'\n';
      if (line.trim().endsWith(';') && (!trigger || line.trim() === 'END;')) {
        await db.prepare(pending).run(); pending=''; trigger=false;
      }
    }
    if (pending.trim()) throw new Error('Incomplete test migration');
  }
  const keys = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...await exportJWK(keys.publicKey), kid: 'synthetic-key', alg: 'RS256', use: 'sig' };
  const issuer = 'https://synthetic-team.cloudflareaccess.com';
  const token = async (sub = 'santa-subject', claims: Record<string, unknown> = {}, at = testNow) => new SignJWT({ email: 'synthetic@example.test', ...claims }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setIssuer(issuer).setAudience('synthetic-hq-audience').setSubject(sub).setIssuedAt(Math.floor(at/1000)-1).setExpirationTime(Math.floor(at/1000)+3600).sign(keys.privateKey);
  const signed = await token();
  const env: HqEnv = { DB: db as unknown as Database, HQ_ENABLED: 'true', HQ_ORIGIN: 'https://hq.example.test', ACCESS_TEAM_DOMAIN: 'synthetic-team.cloudflareaccess.com', ACCESS_AUDIENCE: 'synthetic-hq-audience', SANTA_SUBJECTS: '["santa-subject"]', BACKUP_SUBJECTS: '["backup-subject"]', BACKUP_ESCALATION_ENABLED: 'false', INTAKE_HMAC_SECRET: 'synthetic-only-hmac-key-at-least-32-chars' };
  const jwksFetch: typeof fetch = async (url) => {
    if (String(url) !== issuer+'/cdn-cgi/access/certs') throw new Error('Unexpected JWKS destination');
    return Response.json({ keys: [jwk] });
  };
  async function call(path: string, body?: unknown, options: { token?: string; key?: string; headers?: Record<string,string>; method?: string; env?: HqEnv; now?: number; fetcher?: typeof fetch } = {}) {
    const headers: Record<string,string> = { 'cf-access-jwt-assertion': options.token ?? signed, ...options.headers };
    if (body !== undefined) Object.assign(headers, { origin: env.HQ_ORIGIN!, 'content-type': 'application/json', 'idempotency-key': options.key || crypto.randomUUID(), ...options.headers });
    return handleHq(new Request(env.HQ_ORIGIN+path, { method: options.method || (body === undefined ? 'GET' : 'POST'), headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), options.env || env, options.fetcher || jwksFetch, options.now ?? testNow);
  }
  async function create(input = syntheticRequest(), source = 'phone') {
    const response = await call('/hq/api/bookings',{request:input,source});
    if (response.status !== 200) throw new Error('Fixture create failed: '+await response.text());
    return await response.json() as { id: string; version: number; status: string };
  }
  async function mutate(id: string, action: string, extras: Record<string,unknown> = {}, expectedVersion?: number, key?: string) {
    const current = await db.prepare('SELECT version FROM hq_bookings WHERE booking_id=?').bind(id).first<{version:number}>();
    return call('/hq/api/bookings/'+id+'/actions',{action,expectedVersion:expectedVersion ?? current?.version ?? 1,...extras},{key});
  }
  async function ready(input = syntheticRequest(), quote: Record<string,unknown> = syntheticQuote()) {
    const created = await create(input);
    for (const [action,extra] of [['review',{}],['propose',{quote}],['share_quote',{channel:'phone',quoteCommunicated:true}],['record_agreement',{channel:'phone',customerAgreed:true}]] as const) {
      const response = await mutate(created.id,action,extra);
      if (response.status !== 200) throw new Error('Fixture action '+action+' failed: '+await response.text());
    }
    return created.id;
  }
  async function clear() {
    await db.batch(['DELETE FROM integration_oauth_states','DELETE FROM integration_google','DELETE FROM integration_leases','DELETE FROM integration_control','DELETE FROM hq_unavailable','DELETE FROM hq_resource_operations','DELETE FROM booking_requests','DELETE FROM intake_rate_limits'].map(sql=>db.prepare(sql)));
  }
  return { mf,db,env,keys,jwk,token,signed,jwksFetch,call,create,mutate,ready,clear,dispose:()=>mf.dispose() };
}
