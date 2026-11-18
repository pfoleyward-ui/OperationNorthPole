import { CATALOG_VERSION, basePriceForDuration } from '../../src/config/services.ts';
import { acceptQuote, transitionBooking, validateQuote, type Booking, type Quote, type QuoteAcceptance } from '../../src/domain/booking/lifecycle.ts';
import { record, validateBookingRequest, type BookingRequest } from '../../src/domain/booking/request.ts';
import { occupiedInterval, requiredResources, type Resource } from '../../src/domain/booking/scheduling.ts';
import { resolveWallTime, validDate } from '../../src/domain/booking/time.ts';
import { canonical, digest } from './shared.ts';
import type { Principal } from './auth.ts';
import type { Database, Statement } from './repository.ts';

export class HqError extends Error {
  status: number;
  constructor(status: number, code: string) { super(code); this.status = status; }
}
export type HqState = Booking & { change?: { quote: Quote; shared: boolean; acceptance?: QuoteAcceptance } };
export type BookingDetail = { request: BookingRequest; state: HqState; source: string; receivedAt: number; elfInvitationPrepared: boolean; staffing: { quote_id: string; quote_revision: number; attendant_ref: string }[] };
type Stored = { id: string; request_json: string; state_json: string | null; source: string | null; received_at: number; elf_prepared: number };
const detailSQL = `SELECT b.id,b.request_json,b.received_at,h.state_json,h.source,
  EXISTS(SELECT 1 FROM hq_elf_invitation_plans n WHERE n.booking_id=b.id) AS elf_prepared
  FROM booking_requests b LEFT JOIN hq_bookings h ON h.booking_id=b.id`;
function check(condition: unknown, code = 'invalid_action', status = 400): asserts condition { if (!condition) throw new HqError(status, code); }
function fields(value: unknown, allowed: string[]): asserts value is Record<string, unknown> {
  check(record(value) && Object.keys(value).every(k => allowed.includes(k)), 'unknown_or_invalid_fields');
}
function unpack(row: Stored): BookingDetail {
  const request = JSON.parse(row.request_json) as BookingRequest;
  return { request, state: row.state_json ? JSON.parse(row.state_json) as HqState : { id: row.id, serviceId: request.serviceId, status: 'pending', version: 1 }, source: row.source || 'customer', receivedAt: row.received_at, elfInvitationPrepared: row.elf_prepared === 1, staffing: [] };
}
export async function getBooking(db: Database, id: string): Promise<BookingDetail> {
  const row = await db.prepare(`${detailSQL} WHERE b.id=?`).bind(id).first<Stored>();
  check(row, 'not_found', 404);
  const result = unpack(row);
  result.staffing = (await db.batch<BookingDetail['staffing'][number]>([db.prepare('SELECT quote_id,quote_revision,attendant_ref FROM hq_staffing WHERE booking_id=?').bind(id)]))[0].results;
  return result;
}
export async function listBookings(db: Database, view: string, date: string, cursor?: string): Promise<{ bookings: BookingDetail[]; nextCursor: string | null }> {
  check(['new', 'today', 'calendar'].includes(view), 'invalid_view');
  check(validDate(date), 'invalid_date');
  let condition = "COALESCE(h.status,'pending') IN ('pending','under_review','alternative_proposed','awaiting_customer_acceptance')";
  const values: (string | number)[] = [];
  if (view !== 'new') {
    const start = instant(date, '00:00');
    const nextDate = new Date(Date.parse(`${date}T00:00Z`) + 86400000).toISOString().slice(0, 10);
    const end = instant(nextDate, '00:00');
    const quoteStart = "json_extract(h.state_json,'$.quote.start')";
    const quoteEnd = "json_extract(h.state_json,'$.quote.end')";
    condition = view === 'today'
      ? `h.status IN ('confirmed','completed') AND ${quoteStart} < ? AND ${quoteEnd} > ?`
      : `COALESCE(h.status,'pending') NOT IN ('declined','canceled') AND ((h.status IN ('confirmed','completed') AND ${quoteStart} < ? AND ${quoteEnd} > ?) OR (COALESCE(h.status,'pending') NOT IN ('confirmed','completed') AND json_extract(b.request_json,'$.timing.date')=?))`;
    values.push(end, start);
    if (view === 'calendar') values.push(date);
  }
  if (cursor) {
    const match = /^(\d{1,15})_([0-9a-f-]{36})$/.exec(cursor);
    check(match, 'invalid_cursor');
    condition += ' AND (b.received_at < ? OR (b.received_at = ? AND b.id < ?))';
    values.push(Number(match[1]), Number(match[1]), match[2]);
  }
  const rows = (await db.batch<Stored>([db.prepare(`${detailSQL} WHERE (${condition}) ORDER BY b.received_at DESC,b.id DESC LIMIT 26`).bind(...values)]))[0].results;
  const shown = rows.slice(0, 25);
  const last = shown.at(-1);
  return { bookings: shown.map(unpack), nextCursor: rows.length > 25 && last ? `${last.received_at}_${last.id}` : null };
}
function instant(date: unknown, time: unknown, choice?: unknown): number {
  check(choice === undefined || choice === 'earlier' || choice === 'later', 'invalid_dst_choice');
  const result = resolveWallTime(date, time);
  check(result.kind === 'valid' || result.kind === 'ambiguous', 'invalid_or_nonexistent_time');
  check(result.kind !== 'ambiguous' || choice !== undefined, 'dst_choice_required');
  return result.candidates[choice === 'later' ? result.candidates.length - 1 : 0];
}
function makeQuote(input: unknown, state: HqState, now: number): Quote {
  fields(input, ['date','time','disambiguation','durationMinutes','totalCents','expiryDate','expiryTime','expiryDisambiguation','adjustmentReason']);
  check(Number.isSafeInteger(input.durationMinutes) && (input.durationMinutes as number) > 0 && (input.durationMinutes as number) <= 527040, 'invalid_duration');
  const minutes = input.durationMinutes as number;
  let base: number;
  try { base = basePriceForDuration(state.serviceId, minutes); } catch { throw new HqError(400, 'invalid_duration'); }
  const start = instant(input.date, input.time, input.disambiguation);
  const previous = state.change?.quote ?? state.quote;
  const quote: Quote = {
    id: previous?.id || crypto.randomUUID(), bookingId: state.id, serviceId: state.serviceId,
    revision: (previous?.revision || 0) + 1, catalogVersion: CATALOG_VERSION,
    currency: 'USD', totalCents: input.totalCents === undefined ? base : input.totalCents as number,
    start, end: start + minutes * 60000, createdAt: now,
    expiresAt: instant(input.expiryDate, input.expiryTime, input.expiryDisambiguation),
    ...(input.adjustmentReason === undefined ? {} : { adjustmentReason: input.adjustmentReason as string }),
  };
  check(validateQuote(quote).ok, 'invalid_quote');
  return quote;
}
async function operation(db: Database, key: string, hash: string, principal: Principal): Promise<HqState | null> {
  const existing = await db.prepare('SELECT command_hash,response_json,actor_sub FROM hq_operations WHERE operation_id=?').bind(key).first<{ command_hash: string; response_json: string; actor_sub: string }>();
  if (!existing) return null;
  check(existing.command_hash === hash && existing.actor_sub === principal.sub, 'idempotency_conflict', 409);
  return JSON.parse(existing.response_json) as HqState;
}
export async function createManual(db: Database, input: unknown, principal: Principal, key: string, secret: string, now: number): Promise<HqState> {
  fields(input, ['request','source']);
  check(['phone','text','facebook'].includes(input.source as string), 'invalid_source');
  fields(input.request, ['serviceId','timing','alternative','durationMinutes','customer','location','eventType','guestCount','answers','sensoryFriendly']);
  check(!record(input.request.answers) || Object.values(input.request.answers).every(v => typeof v !== 'string'), 'private_notes_not_accepted');
  const hash = await digest(secret, canonical(input));
  const replay = await operation(db, key, hash, principal); if (replay) return replay;
  const validated = validateBookingRequest(input.request, now); check(validated.ok, 'invalid_booking');
  const id = crypto.randomUUID();
  const state: HqState = { id, serviceId: validated.value.serviceId, status: 'pending', version: 1 };
  const body = JSON.stringify(state);
  const result = await db.batch<never>([
    db.prepare('INSERT INTO booking_requests (id,idempotency_hash,payload_hash,request_json,received_at) VALUES (?,?,?,?,?)').bind(id, `hq:${key}`, hash, JSON.stringify(validated.value), now),
    db.prepare('INSERT INTO hq_bookings (booking_id,status,version,state_json,source,last_operation) VALUES (?,?,?,?,?,?)').bind(id,'pending',1,body,input.source as string,key),
    db.prepare('INSERT INTO hq_operations (operation_id,command_hash,booking_id,actor_sub,actor_role,action,response_json,occurred_at) VALUES (?,?,?,?,?,?,?,?)').bind(key,hash,id,principal.sub,principal.role,'manual_create',body,now),
    db.prepare("INSERT INTO hq_event_outbox (operation_id,booking_id,kind,created_at) VALUES (?,?,'booking_changed',?)").bind(key,id,now),
  ]).catch(async (error: unknown) => { const concurrent = await operation(db, key, hash, principal); if (concurrent) return null; throw error; });
  if (result === null) return (await operation(db, key, hash, principal))!;
  check(result.every(r => r.success), 'persistence_unavailable', 503);
  return state;
}
function agreement(quote: Quote | undefined, now: number): QuoteAcceptance {
  check(quote, 'quote_required');
  const result = acceptQuote(quote, quote.revision, now, 'recorded_offline');
  check(result.ok, 'invalid_or_expired_quote');
  return result.value;
}
const channels = ['phone','text','facebook','in_person','email'];
export async function mutateBooking(db: Database, id: string, input: unknown, principal: Principal, key: string, secret: string, now: number): Promise<HqState> {
  fields(input, ['action','expectedVersion','quote','channel','customerAgreed','quoteCommunicated','beforeMinutes','afterMinutes','attendantRef']);
  check(typeof input.action === 'string' && Number.isSafeInteger(input.expectedVersion), 'invalid_action');
  const hash = await digest(secret, canonical({ id, input }));
  const replay = await operation(db, key, hash, principal); if (replay) return replay;
  const detail = await getBooking(db, id);
  const current = detail.state;
  if (current.version !== input.expectedVersion) {
    const concurrent = await operation(db,key,hash,principal); if (concurrent) return concurrent;
    throw new HqError(409, 'stale_booking');
  }
  let next: HqState = { ...current, version: current.version + 1 };
  let staffingQuote: Quote | undefined;
  let swapReservations = false;
  let prepareElf = false;
  const action = input.action;
  // Enforce per-action field allowlists, so hidden client flags have no effect.
  const actionFields: Record<string, string[]> = {
    review: [], decline: [], cancel: [], complete: [],
    propose: ['quote'], share_quote: ['channel','quoteCommunicated'],
    record_agreement: ['channel','customerAgreed'], confirm: ['beforeMinutes','afterMinutes'],
    verify_staffing: ['attendantRef'],
    propose_reschedule: ['quote'], share_reschedule: ['channel','quoteCommunicated'],
    record_change_agreement: ['channel','customerAgreed'], apply_reschedule: ['beforeMinutes','afterMinutes'],
    discard_reschedule: [], prepare_elf_invitation: [],
  };
  check(Object.hasOwn(actionFields, action), 'unknown_action');
  fields(input, ['action','expectedVersion',...actionFields[action]]);
  if (action.startsWith('share_')) check(input.quoteCommunicated === true && channels.includes(input.channel as string), 'offline_communication_required');
  if (action === 'record_agreement' || action === 'record_change_agreement') check(input.customerAgreed === true && channels.includes(input.channel as string), 'customer_agreement_required');
  const transition = (target: Booking['status'], quote?: Quote) => {
    const result = transitionBooking(current, target, { actor: 'santa', now, expectedVersion: current.version,
      ...(quote ? { quote } : {}),
      ...(target === 'confirmed' ? { scheduleCheck: { bookingVersion: current.version, checkedAt: now, conflictFree: true, staffingVerified: true } } : {}),
    });
    if (result.ok === false) throw new HqError(400, result.issues[0].code);
    next = result.value;
  };
  switch (action) {
    case 'review': transition('under_review'); break;
    case 'decline': transition('declined'); break;
    case 'cancel': transition('canceled'); swapReservations = true; break;
    case 'complete': transition('completed'); swapReservations = true; break;
    case 'propose': transition('alternative_proposed', makeQuote(input.quote, current, now)); break;
    case 'share_quote': transition('awaiting_customer_acceptance'); break;
    case 'record_agreement':
      check(current.status === 'awaiting_customer_acceptance', 'agreement_not_allowed');
      next = { ...next, acceptance: agreement(current.quote, now) }; break;
    case 'confirm': transition('confirmed'); swapReservations = true; break;
    case 'verify_staffing':
      check(['alternative_proposed','awaiting_customer_acceptance','confirmed'].includes(current.status), 'staffing_not_allowed');
      staffingQuote = current.status === 'confirmed' ? current.change?.quote : current.quote;
      check(staffingQuote && requiredResources(current.serviceId).includes('booth-attendant'), 'staffing_not_needed');
      check(typeof input.attendantRef === 'string' && /^[\p{L}\p{N} ._-]{1,100}$/u.test(input.attendantRef.trim()), 'invalid_attendant_reference');
      break;
    case 'propose_reschedule':
      check(current.status === 'confirmed', 'confirmed_booking_required');
      next = { ...next, change: { quote: makeQuote(input.quote, current, now), shared: false } }; break;
    case 'share_reschedule':
      check(current.status === 'confirmed' && current.change && validateQuote(current.change.quote).ok && current.change.quote.expiresAt > now, 'current_change_required');
      next = { ...next, change: { ...current.change, shared: true } }; break;
    case 'record_change_agreement':
      check(current.status === 'confirmed' && current.change?.shared, 'shared_change_required');
      next = { ...next, change: { ...current.change, acceptance: agreement(current.change.quote, now) } }; break;
    case 'apply_reschedule': {
      check(current.status === 'confirmed' && current.change?.shared && current.change.acceptance, 'agreed_change_required');
      const change = current.change;
      const valid = agreement(change.quote, now);
      check(canonical(valid.terms) === canonical(change.acceptance!.terms) && change.acceptance!.quoteId === change.quote.id && change.acceptance!.revision === change.quote.revision && change.acceptance!.source === 'recorded_offline' && Number.isSafeInteger(change.acceptance!.acceptedAt) && change.acceptance!.acceptedAt <= now && change.acceptance!.acceptedAt >= change.quote.createdAt && change.acceptance!.acceptedAt < change.quote.expiresAt, 'invalid_change_agreement');
      next = { id: current.id, serviceId: current.serviceId, status: 'confirmed', version: next.version, quote: change.quote, acceptance: change.acceptance };
      swapReservations = true; break;
    }
    case 'discard_reschedule': check(current.status === 'confirmed' && current.change, 'change_required'); delete next.change; break;
    case 'prepare_elf_invitation':
      check(current.status === 'confirmed' && current.serviceId === 'home-visits', 'elf_invitation_ineligible'); prepareElf = true; break;
  }
  const stateJSON = JSON.stringify(next);
  const statements: Statement[] = [
    db.prepare(`INSERT INTO hq_bookings (booking_id,status,version,state_json,source,last_operation) VALUES (?,?,?,?,?,'initial') ON CONFLICT(booking_id) DO NOTHING`).bind(id,current.status,current.version,JSON.stringify(current),detail.source),
    db.prepare('UPDATE hq_bookings SET status=?,version=?,state_json=?,last_operation=? WHERE booking_id=? AND version=? RETURNING version').bind(next.status,next.version,stateJSON,key,id,current.version),
  ];
  const owned = 'EXISTS(SELECT 1 FROM hq_bookings WHERE booking_id=? AND last_operation=?)';
  if (staffingQuote) statements.push(db.prepare(`INSERT INTO hq_staffing (booking_id,quote_id,quote_revision,start,end,attendant_ref,verified_by)
    SELECT ?,?,?,?,?,?,? WHERE ${owned} ON CONFLICT(booking_id,quote_id,quote_revision) DO UPDATE SET attendant_ref=excluded.attendant_ref,verified_by=excluded.verified_by`)
    .bind(id,staffingQuote.id,staffingQuote.revision,staffingQuote.start,staffingQuote.end,(input.attendantRef as string).trim(),principal.sub,id,key));
  if (swapReservations) {
    statements.push(db.prepare(`DELETE FROM hq_reservations WHERE booking_id=? AND ${owned}`).bind(id,id,key));
    if (next.status === 'confirmed') {
      check([input.beforeMinutes,input.afterMinutes].every(v => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 527040), 'explicit_buffers_required');
      for (const resource of requiredResources(next.serviceId)) {
        const interval = occupiedInterval(id, resource, next.quote!.start, next.quote!.end, input.beforeMinutes as number, input.afterMinutes as number);
        statements.push(db.prepare(`INSERT INTO hq_reservations (booking_id,resource,start,end) SELECT ?,?,?,? WHERE ${owned}`).bind(id,resource,interval.start,interval.end,id,key));
      }
    }
  }
  if (prepareElf) statements.push(db.prepare(`INSERT INTO hq_elf_invitation_plans (booking_id,prepared_at,prepared_by) SELECT ?,?,? WHERE ${owned} ON CONFLICT(booking_id) DO NOTHING`).bind(id,now,principal.sub,id,key));
  statements.push(
    db.prepare(`INSERT INTO hq_operations (operation_id,command_hash,booking_id,actor_sub,actor_role,action,channel,response_json,occurred_at)
      SELECT ?,?,?,?,?,?,?,?,? WHERE ${owned}`).bind(key,hash,id,principal.sub,principal.role,action,(input.channel as string) || '',stateJSON,now,id,key),
    db.prepare(`INSERT INTO hq_event_outbox (operation_id,booking_id,kind,created_at) SELECT ?,?,?,? WHERE ${owned}`).bind(key,id,prepareElf ? 'elf_invitation_prepared' : 'booking_changed',now,id,key),
  );
  let result;
  try { result = await db.batch<{ version: number }>(statements); }
  catch (error) {
    const concurrent = await operation(db,key,hash,principal); if (concurrent) return concurrent;
    const message = String(error);
    if (message.includes('hq_resource_conflict')) throw new HqError(409, 'resource_unavailable');
    if (message.includes('hq_staffing_required')) throw new HqError(409, 'staffing_required');
    throw error;
  }
  check(result.every(r => r.success), 'persistence_unavailable', 503);
  if (result[1].results.length !== 1) {
    const concurrent = await operation(db,key,hash,principal); if (concurrent) return concurrent;
    throw new HqError(409, 'stale_booking');
  }
  return next;
}

export async function setUnavailable(db: Database, input: unknown, principal: Principal, key: string, secret: string, now: number): Promise<void> {
  fields(input, ['action','id','resource','date','time','disambiguation','durationMinutes']);
  check(typeof input.id === 'string' && /^[0-9a-f-]{36}$/.test(input.id), 'invalid_id');
  const action = input.action ?? 'block';
  check(action === 'block' || action === 'release', 'invalid_action');
  const hash = await digest(secret, canonical(input));
  const replay = async () => {
    const op = await db.prepare('SELECT command_hash,actor_sub FROM hq_resource_operations WHERE operation_id=?').bind(key).first<{command_hash:string;actor_sub:string}>();
    if (!op) return false;
    check(op.command_hash === hash && op.actor_sub === principal.sub, 'idempotency_conflict', 409);
    return true;
  };
  if (await replay()) return;
  const statements: Statement[] = [];
  if (action === 'release') {
    fields(input,['action','id']);
    const existing = await db.prepare('SELECT id FROM hq_unavailable WHERE id=?').bind(input.id).first();
    if (!existing && await replay()) return;
    check(existing,'not_found',404);
    statements.push(db.prepare('DELETE FROM hq_unavailable WHERE id=?').bind(input.id));
  } else {
    check(['santa','photo-booth','booth-attendant'].includes(input.resource as Resource), 'invalid_resource');
    check(Number.isSafeInteger(input.durationMinutes) && (input.durationMinutes as number) > 0 && (input.durationMinutes as number) <= 527040, 'invalid_duration');
    const start = instant(input.date,input.time,input.disambiguation);
    const end = start + (input.durationMinutes as number) * 60000;
    statements.push(db.prepare('INSERT INTO hq_unavailable (id,resource,start,end,actor_sub) VALUES (?,?,?,?,?)').bind(input.id,input.resource as string,start,end,principal.sub));
  }
  statements.push(db.prepare('INSERT INTO hq_resource_operations (operation_id,command_hash,resource_block_id,actor_sub,actor_role,action,occurred_at) VALUES (?,?,?,?,?,?,?)').bind(key,hash,input.id,principal.sub,principal.role,action,now));
  try {
    const result = await db.batch(statements);
    check(result.every(r=>r.success),'persistence_unavailable',503);
  } catch (error) {
    if (await replay()) return;
    if (String(error).includes('hq_resource_conflict')) throw new HqError(409, 'existing_booking_conflict');
    if (String(error).includes('UNIQUE constraint')) throw new HqError(409, 'block_already_exists');
    throw error;
  }
}
