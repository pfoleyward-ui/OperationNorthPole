import { authenticate, AccessDenied, type AccessEnv } from './auth.ts';
import { bodyText, digest } from './shared.ts';
import { createManual, getBooking, HqError, listBookings, mutateBooking, setUnavailable } from './hq-service.ts';
import { bookableServices } from '../../src/config/services.ts';
import { localParts, validDate } from '../../src/domain/booking/time.ts';
import type { Database } from './repository.ts';
import { hqHTML, hqCSS, hqJS } from './hq-ui.ts';

export interface HqEnv extends AccessEnv { DB: Database; INTAKE_HMAC_SECRET?: string }
const safeHeaders = {
  'Cache-Control': 'no-store, private', 'Vary': 'CF-Access-Jwt-Assertion, Cookie',
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: safeHeaders });
export async function handleHq(request: Request, env: HqEnv, fetcher?: typeof fetch, now = Date.now()): Promise<Response> {
  if (env.HQ_ENABLED !== 'true') return json({ error: 'hq_disabled' }, 503);
  try {
    if (!env.HQ_ORIGIN || !env.DB || !env.INTAKE_HMAC_SECRET || env.INTAKE_HMAC_SECRET.length < 32) return json({ error: 'hq_not_configured' }, 503);
    const url = new URL(request.url);
    const origin = new URL(env.HQ_ORIGIN);
    if (origin.protocol !== 'https:' || origin.origin !== env.HQ_ORIGIN || url.origin !== origin.origin) return json({ error: 'invalid_hq_origin' }, 503);
    const principal = await authenticate(request, env, fetcher, now);
    if (request.method === 'GET') {
      const asset = url.pathname === '/hq' || url.pathname === '/hq/' ? [hqHTML, 'text/html'] : url.pathname === '/hq/app.js' ? [hqJS, 'application/javascript'] : url.pathname === '/hq/style.css' ? [hqCSS, 'text/css'] : null;
      if (asset) return new Response(asset[0], { headers: { ...safeHeaders, 'Content-Type': `${asset[1]}; charset=utf-8` } });
      if (url.pathname === '/hq/api/session') return json({ role: principal.role, today: localParts(now).date, services: bookableServices, intakeEnabled: false, notificationsEnabled: false, elfCollectionEnabled: false });
      if (url.pathname === '/hq/api/bookings') {
        const view = url.searchParams.get('view') || 'new';
        const date = view === 'today' ? localParts(now).date : url.searchParams.get('date') || localParts(now).date;
        return json(await listBookings(env.DB, view, date, url.searchParams.get('cursor') || undefined));
      }
      const match = /^\/hq\/api\/bookings\/([0-9a-f-]{36})$/.exec(url.pathname);
      if (match) return json(await getBooking(env.DB, match[1]));
      if (url.pathname === '/hq/api/unavailable') {
        const date = url.searchParams.get('date');
        if (!validDate(date)) throw new HqError(400, 'invalid_date');
        // A bounded window; display blocks that touch the selected NY day.
        const { resolveWallTime } = await import('../../src/domain/booking/time.ts');
        const start = resolveWallTime(date,'00:00').candidates[0];
        const next = new Date(Date.parse(`${date}T00:00Z`) + 86400000).toISOString().slice(0,10);
        const end = resolveWallTime(next,'00:00').candidates[0];
        return json((await env.DB.batch([env.DB.prepare('SELECT id,resource,start,end FROM hq_unavailable WHERE start < ? AND end > ? ORDER BY start LIMIT 100').bind(end,start)]))[0].results);
      }
      return json({ error: 'not_found' }, 404);
    }
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    if (request.headers.get('origin') !== origin.origin || request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'forbidden_origin' }, 403);
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return json({ error: 'json_required' }, 415);
    const attempt = request.headers.get('idempotency-key');
    if (!attempt || !/^[A-Za-z0-9_-]{16,128}$/.test(attempt)) throw new HqError(400, 'invalid_operation_key');
    const key = await digest(env.INTAKE_HMAC_SECRET, `hq:${principal.sub}:${attempt}`);
    let input: unknown;
    try { input = JSON.parse(await bodyText(request)); }
    catch (error) { return json({ error: 'invalid_body' }, error instanceof RangeError ? 413 : 400); }
    if (url.pathname === '/hq/api/bookings') return json(await createManual(env.DB,input,principal,key,env.INTAKE_HMAC_SECRET,now));
    const match = /^\/hq\/api\/bookings\/([0-9a-f-]{36})\/actions$/.exec(url.pathname);
    if (match) return json(await mutateBooking(env.DB,match[1],input,principal,key,env.INTAKE_HMAC_SECRET,now));
    if (url.pathname === '/hq/api/unavailable') { await setUnavailable(env.DB,input,principal,key,env.INTAKE_HMAC_SECRET,now); return json({ saved: true }); }
    // No Elf Notes collection or notification-delivery endpoint exists.
    return json({ error: 'not_found' }, 404);
  } catch (error) {
    if (error instanceof AccessDenied) return json({ error: 'authentication_required' }, 401);
    if (error instanceof HqError) return json({ error: error.message }, error.status);
    return json({ error: 'hq_unavailable' }, 503);
  }
}
