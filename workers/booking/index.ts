import type { IntegrationEnv } from './integration-config.ts';
import { handleHq } from './hq.ts';
import { authenticate } from './auth.ts';
import type { AccessEnv } from './auth.ts';
import { handleElf, type ElfEnv } from './elf-notes.ts';
import { canonical, digest, bodyText } from './shared.ts';
export { canonical } from './shared.ts';
import { validateBookingRequest, record } from '../../src/domain/booking/request.ts';
import { D1BookingRepository, IdempotencyConflict, type Database } from './repository.ts';

export interface Env extends AccessEnv, IntegrationEnv, ElfEnv {
  DB: Database;
  /** Deliberate deployment gate. Omitted/false in committed configuration. */
  PUBLIC_INTAKE_ENABLED?: string;
  STAGING_INTAKE_ENABLED?: string;
  BOOKING_ORIGIN?: string;
  TURNSTILE_SECRET?: string;
  INTAKE_HMAC_SECRET?: string;
}
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const reply = (status: number, body: object) => Response.json(body, { status, headers });

async function verifyBot(token: string, ip: string, env: Env, fetcher: typeof fetch): Promise<boolean> {
  const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET!, response: token, remoteip: ip }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) return false;
  const result = await response.json() as { success?: boolean; hostname?: string; action?: string };
  return result.success === true && result.hostname === new URL(env.BOOKING_ORIGIN!).hostname && result.action === 'booking';
}

export async function handleBooking(request: Request, env: Env, fetcher: typeof fetch = fetch, now = Date.now()): Promise<Response> {
  if (new URL(request.url).pathname !== '/api/bookings') return reply(404, { error: 'not_found' });
  // Before reading body or touching D1; the practice wizard remains entirely disconnected.
  if (env.PUBLIC_INTAKE_ENABLED !== 'true') {
    if (env.STAGING_INTAKE_ENABLED !== 'true') return reply(503, { error: 'intake_disabled' });
    try { if ((await authenticate(request, env, fetcher, now)).role !== 'santa') return reply(403, { error: 'forbidden' }); }
    catch { return reply(403, { error: 'forbidden' }); }
  }
  if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
  if (!env.DB || !env.BOOKING_ORIGIN || !env.TURNSTILE_SECRET || !env.INTAKE_HMAC_SECRET || env.INTAKE_HMAC_SECRET.length < 32) return reply(503, { error: 'unavailable' });
  try {
    const origin = new URL(env.BOOKING_ORIGIN);
    if (origin.protocol !== 'https:' || origin.origin !== env.BOOKING_ORIGIN) return reply(503, { error: 'unavailable' });
    if (request.headers.get('origin') !== origin.origin) return reply(403, { error: 'forbidden' });
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return reply(415, { error: 'json_required' });
    // CF-Connecting-IP is trusted only on the Cloudflare Worker edge, never in Next.js.
    const ip = request.headers.get('cf-connecting-ip');
    if (!ip) return reply(403, { error: 'forbidden' });
    const bucket = Math.floor(now / 60000);
    const rateKey = await digest(env.INTAKE_HMAC_SECRET, `rate:${bucket}:${ip}`);
    const rateResult = await env.DB.batch<{ attempts: number }>([
      env.DB.prepare('DELETE FROM intake_rate_limits WHERE expires_at <= ?').bind(now),
      env.DB.prepare(`INSERT INTO intake_rate_limits (key, attempts, expires_at) VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1 WHERE attempts < 5 RETURNING attempts`)
        .bind(rateKey, (bucket + 2) * 60000),
    ]);
    if (rateResult.length !== 2 || rateResult.some(r => !r.success)) throw new Error('Rate limit unavailable');
    const rate = rateResult[1].results[0];
    if (!rate) return new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429, headers: { ...headers, 'Content-Type': 'application/json', 'Retry-After': String(60 - Math.floor(now / 1000) % 60) } });
    let input: unknown;
    try { input = JSON.parse(await bodyText(request)); }
    catch (error) { return reply(error instanceof RangeError ? 413 : 400, { error: 'invalid_body' }); }
    if (!record(input) || Object.keys(input).some(k => !['request', 'botToken'].includes(k)) || !record(input.request)) return reply(400, { error: 'invalid_body' });
    const key = request.headers.get('idempotency-key');
    if (!key || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) return reply(400, { error: 'invalid_idempotency_key' });
    if (typeof input.botToken !== 'string' || !input.botToken || input.botToken.length > 2048) return reply(403, { error: 'bot_verification_failed' });
    if (!await verifyBot(input.botToken, ip, env, fetcher)) return reply(403, { error: 'bot_verification_failed' });
    const keyHash = await digest(env.INTAKE_HMAC_SECRET, `key:${key}`);
    const payloadHash = await digest(env.INTAKE_HMAC_SECRET, `payload:${canonical(input.request)}`);
    const repository = new D1BookingRepository(env.DB);
    // Replays remain valid even after the requested event date passes. Each replay
    // still needs a fresh Turnstile proof and is subject to the rate limit.
    const existing = await repository.find(keyHash, payloadHash);
    if (existing) return reply(200, { ...existing, message: 'Your Letter Is on Its Way to Santa!' });
    // Initial intake has no unstructured preparation-note channel. Keep optional
    // free-text planning answers deferred until privacy guidance is approved.
    if (Object.hasOwn(input.request, 'instructions') || Object.hasOwn(input.request, 'flexibility') ||
      (record(input.request.answers) && Object.values(input.request.answers).some(v => typeof v === 'string'))) {
      return reply(400, { error: 'private_notes_not_accepted' });
    }
    const validated = validateBookingRequest(input.request, now);
    // Do not echo user-controlled field names or values into responses/logs.
    if (!validated.ok) return reply(400, { error: 'invalid_booking' });
    const receipt = await repository.save(validated.value, keyHash, payloadHash, now);
    return reply(200, { ...receipt, message: 'Your Letter Is on Its Way to Santa!' });
  } catch (error) {
    if (error instanceof IdempotencyConflict) return reply(409, { error: 'idempotency_conflict' });
    // Includes DB, bot provider, timeout, and misconfiguration failures. No PII logs.
    return reply(503, { error: 'unavailable' });
  }
}
export default { fetch: (request: Request, env: Env) => new URL(request.url).pathname.startsWith('/elf-notes') ? handleElf(request, env) : new URL(request.url).pathname.startsWith('/hq') ? handleHq(request, env) : handleBooking(request, env) };
