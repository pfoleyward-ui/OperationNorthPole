import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { handleBooking, type Env } from '../../workers/booking/index.ts';
import { type Database } from '../../workers/booking/repository.ts';

let mf: Miniflare;
let db: Awaited<ReturnType<Miniflare['getD1Database']>>;
const now = Date.parse('2026-11-02T17:00:00Z');
const payload = () => ({ serviceId: 'home-visits', timing: { date: '2027-12-20', time: '14:00' }, customer: { name: 'Sample Adult', email: 'sample@example.test', phone: '202-555-0100' }, location: 'Synthetic venue', eventType: 'Sample visit', sensoryFriendly: true, answers: { childrenCount: 3, familyGifts: true } });
const key = 'test-attempt-00000001';
const bot: typeof fetch = async () => Response.json({ success: true, hostname: 'booking.example.test', action: 'booking' });
const env = (): Env => ({ DB: db as unknown as Database, PUBLIC_INTAKE_ENABLED: 'true', BOOKING_ORIGIN: 'https://booking.example.test', TURNSTILE_SECRET: 'synthetic-test-only', INTAKE_HMAC_SECRET: 'synthetic-test-key-at-least-32-characters' });
function request(data: unknown = payload(), attempt = key, ip = '192.0.2.1') {
  return new Request('https://booking.example.test/api/bookings', { method: 'POST', headers: { Origin: 'https://booking.example.test', 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, 'Idempotency-Key': attempt }, body: JSON.stringify({ request: data, botToken: 'fresh-proof' }) });
}
const send = (data: unknown = payload(), attempt = key, ip = '192.0.2.1', at = now) => handleBooking(request(data, attempt, ip), env(), bot, at);
async function count(table = 'booking_requests') { return (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n; }
before(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'booking-test', modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-11-02', d1Databases: ['DB'] }] }));
  db = await mf.getD1Database('DB');
  const migration = await readFile(new URL('../../migrations/0001_booking_intake.sql', import.meta.url), 'utf8');
  for (const sql of migration.replace(/--[^\n]*/g, '').split(';').filter(s => s.trim())) await db.prepare(sql).run();
});
beforeEach(async () => { await db.batch(['DELETE FROM booking_outbox', 'DELETE FROM booking_requests', 'DELETE FROM intake_rate_limits'].map(sql => db.prepare(sql))); });
after(async () => { await mf?.dispose(); });

test('durable pending receipt, private data minimization, and outbox in actual D1 runtime', async () => {
  const response = await send(); assert.equal(response.status, 200);
  const receipt = await response.json() as Record<string, unknown>;
  assert.equal(receipt.status, 'pending'); assert.equal(receipt.message, 'Your Letter Is on Its Way to Santa!');
  assert.match(receipt.requestId as string, /^[0-9a-f-]{36}$/); assert.equal(receipt.receivedAt, now);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(!JSON.stringify(receipt).includes('sample@example.test'));
  const row = await db.prepare('SELECT * FROM booking_requests').first();
  assert.equal(row!.status, 'pending'); assert.equal(row!.version, 1);
  assert.equal((JSON.parse(row!.request_json as string)).sensoryFriendly, true);
  assert.ok(!JSON.stringify(row).includes(key)); assert.equal(await count('booking_outbox'), 1);
});
test('same key and payload replays original receipt, including after event date', async () => {
  const original = await (await send()).json();
  const reordered = Object.fromEntries(Object.entries(payload()).reverse());
  assert.deepEqual(await (await send(reordered)).json(), original);
  assert.deepEqual(await (await send(payload(), key, '192.0.2.1', Date.parse('2028-01-01T00:00Z'))).json(), original);
  assert.equal(await count(), 1); assert.equal(await count('booking_outbox'), 1);
});
test('concurrent identical requests commit exactly one request and outbox', async () => {
  const responses = await Promise.all(Array.from({ length: 5 }, () => send()));
  assert.deepEqual(responses.map(r => r.status), [200, 200, 200, 200, 200]);
  const receipts = await Promise.all(responses.map(r => r.json()));
  for (const receipt of receipts) assert.deepEqual(receipt, receipts[0]);
  assert.equal(await count(), 1); assert.equal(await count('booking_outbox'), 1);
});
test('key reused for changed data conflicts, without altering original', async () => {
  await send(); assert.equal((await send({ ...payload(), location: 'Other venue' })).status, 409);
  assert.equal((await send({ ...payload(), instructions: 'Changed information' })).status, 409);
  assert.equal(await count(), 1); assert.equal(await count('booking_outbox'), 1);
});
test('SQL-looking text is bound as data, never executed', async () => {
  const location = "Synthetic venue'); DROP TABLE booking_requests; --";
  assert.equal((await send({ ...payload(), location })).status, 200);
  assert.equal(await count(), 1);
  const row = await db.prepare('SELECT request_json FROM booking_requests').first<{ request_json: string }>();
  assert.equal(JSON.parse(row!.request_json).location, location);
});
test('concurrent conflicting key creates only one booking', async () => {
  const responses = await Promise.all([send(), send({ ...payload(), location: 'Other venue' })]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]); assert.equal(await count(), 1);
});
test('similar or identical events with separate keys remain separate pending requests', async () => {
  assert.equal((await send()).status, 200); assert.equal((await send(payload(), 'test-attempt-00000002')).status, 200);
  assert.equal(await count(), 2); // No date reservation or scheduling conflict on pending requests.
});
test('outbox failure rolls back booking and idempotency state; retry succeeds', async () => {
  await db.prepare("CREATE TRIGGER fail_outbox BEFORE INSERT ON booking_outbox BEGIN SELECT RAISE(ABORT, 'injected failure'); END").run();
  try { assert.equal((await send()).status, 503); assert.equal(await count(), 0); assert.equal(await count('booking_outbox'), 0); }
  finally { await db.prepare('DROP TRIGGER fail_outbox').run(); }
  assert.equal((await send()).status, 200); assert.equal(await count(), 1);
});
test('atomic rate limit permits five attempts per IP/minute, then recovers; raw IP not stored', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await send()).status, 200);
  const limited = await send(); assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '60');
  assert.equal((await send(payload(), key, '192.0.2.2')).status, 200);
  assert.equal((await send(payload(), key, '192.0.2.1', now + 60000)).status, 200);
  const rows = await db.prepare('SELECT * FROM intake_rate_limits').all(); assert.ok(!JSON.stringify(rows.results).includes('192.0.2.'));
  await send(payload(), key, '192.0.2.1', now + 180000);
  assert.equal(await count('intake_rate_limits'), 1);
});
test('concurrent rate requests cannot exceed five', async () => {
  const responses = await Promise.all(Array.from({ length: 12 }, () => send()));
  assert.equal(responses.filter(r => r.status === 200).length, 5); assert.equal(responses.filter(r => r.status === 429).length, 7);
});
test('disabled or missing configuration fails before body/database access', async () => {
  for (const config of [{}, { PUBLIC_INTAKE_ENABLED: 'false' }, { PUBLIC_INTAKE_ENABLED: 'true' }]) {
    assert.equal((await handleBooking(request(), config as Env, bot, now)).status, 503);
  }
  assert.equal(await count(), 0);
});
test('disabled gate does not inspect body or database', async () => {
  const req = request();
  Object.defineProperty(req, 'body', { get() { assert.fail('Body accessed while disabled'); } });
  const config = { PUBLIC_INTAKE_ENABLED: 'false' } as Env;
  Object.defineProperty(config, 'DB', { get() { assert.fail('DB accessed while disabled'); } });
  assert.equal((await handleBooking(req, config, bot, now)).status, 503);
});
test('no public reads, admin writes, or cross-origin access', async () => {
  for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    assert.equal((await handleBooking(new Request('https://booking.example.test/api/bookings', { method }), env(), bot, now)).status, 405);
  }
  assert.equal((await handleBooking(new Request('https://booking.example.test/api/admin/bookings'), env(), bot, now)).status, 404);
  const cross = request(); cross.headers.set('origin', 'https://attacker.example'); assert.equal((await handleBooking(cross, env(), bot, now)).status, 403);
  const noIP = request(); noIP.headers.delete('cf-connecting-ip'); assert.equal((await handleBooking(noIP, env(), bot, now)).status, 403);
  assert.equal(await count(), 0);
});
test('bot failure, wrong hostname/action, provider error and timeout never issue receipts', async () => {
  for (const result of [{ success: false }, { success: true, hostname: 'attacker.example', action: 'booking' }, { success: true, hostname: 'booking.example.test', action: 'other' }]) {
    assert.equal((await handleBooking(request(), env(), async () => Response.json(result), now)).status, 403);
  }
  assert.equal((await handleBooking(request(), env(), async () => { throw new Error('provider down'); }, now)).status, 503);
  assert.equal((await handleBooking(request(), env(), async () => { throw new DOMException('Timed out', 'TimeoutError'); }, now)).status, 503);
  assert.equal(await count(), 0);
});
test('invalid input and forbidden fields never persist', async () => {
  const cases = [
    { ...payload(), status: 'confirmed' }, { ...payload(), price: 1 },
    { ...payload(), timing: { date: '2027-12-24', time: '14:00' } },
    { ...payload(), customer: { ...payload().customer, email: 'invalid' } },
    ...['elfNotes', 'secretElfNotes', 'diagnosis', 'medicalDetails', 'birthdate', 'school', 'childName', 'instructions', 'flexibility'].map(k => ({ ...payload(), [k]: 'not accepted' })),
    { ...payload(), answers: { diagnosis: 'not accepted' } },
    { ...payload(), sensoryFriendly: { diagnosis: 'not accepted' } },
  ];
  for (let i = 0; i < cases.length; i++) assert.equal((await send(cases[i], key, `192.0.2.${i + 1}`)).status, 400);
  assert.equal(await count(), 0);
});
test('streamed payload limits, malformed JSON, wrong type and invalid keys fail closed', async () => {
  const oversized = request({ ...payload(), location: 'x'.repeat(32768) });
  assert.equal((await handleBooking(oversized, env(), bot, now)).status, 413);
  const malformed = new Request(request(), { body: '{' }); assert.equal((await handleBooking(malformed, env(), bot, now)).status, 400);
  const wrongType = request(); wrongType.headers.set('content-type', 'text/plain'); assert.equal((await handleBooking(wrongType, env(), bot, now)).status, 415);
  assert.equal((await send(payload(), 'bad')).status, 400); assert.equal(await count(), 0);
});
test('database outage cannot produce a success receipt', async () => {
  const broken = { ...env(), DB: { prepare() { throw new Error('DB down'); } } as unknown as Database };
  assert.equal((await handleBooking(request(), broken, bot, now)).status, 503);
});
test('future controlled deletion can remove request and associated outbox together', async () => {
  const receipt = await (await send()).json() as { requestId: string };
  await db.prepare('DELETE FROM booking_requests WHERE id = ?').bind(receipt.requestId).run();
  assert.equal(await count(), 0); assert.equal(await count('booking_outbox'), 0);
});
