import { bookableServices, CATALOG_VERSION, isServiceId, type ServiceId } from "../../config/services.ts";
import { record, validAppointment, type Result } from "./request.ts";
export type Quote = Readonly<{
  id: string; bookingId: string; serviceId: ServiceId; revision: number; catalogVersion: number;
  currency: "USD"; totalCents: number; start: number; end: number;
  createdAt: number; expiresAt: number; adjustmentReason?: string;
}>;
export type QuoteAcceptance = Readonly<{ quoteId: string; revision: number; acceptedAt: number; source: "customer" | "recorded_offline" }>;
export function validateQuote(input: unknown): Result<Quote> {
  const fail = (code: string): Result<Quote> => ({ ok: false, issues: [{ path: "quote", code }] });
  if (!record(input) || !isServiceId(input.serviceId)) return fail("invalid_quote");
  const allowed = ["id", "bookingId", "serviceId", "revision", "catalogVersion", "currency", "totalCents", "start", "end", "createdAt", "expiresAt", "adjustmentReason"];
  if (Object.keys(input).some(key => !allowed.includes(key))) return fail("unknown_quote_field");
  if (![input.id, input.bookingId].every(value => typeof value === "string" && value.trim().length > 0 && value.length <= 200)) return fail("invalid_identity");
  if (input.currency !== "USD" || input.catalogVersion !== CATALOG_VERSION || !Number.isSafeInteger(input.revision) || (input.revision as number) < 1) return fail("invalid_quote_version");
  if (!Number.isSafeInteger(input.totalCents) || (input.totalCents as number) <= 0) return fail("invalid_total");
  if (!validAppointment(input.start as number, input.end as number, input.serviceId)) return fail("invalid_appointment");
  if (![input.createdAt, input.expiresAt].every(Number.isSafeInteger) || (input.createdAt as number) < 0 || (input.expiresAt as number) <= (input.createdAt as number) || (input.expiresAt as number) > (input.start as number) || (input.createdAt as number) >= (input.start as number)) return fail("invalid_quote_expiry");
  if (input.adjustmentReason !== undefined && (typeof input.adjustmentReason !== "string" || !input.adjustmentReason.trim() || input.adjustmentReason.length > 2000)) return fail("invalid_adjustment_reason");
  // No travel calculator, discounts, or hourly rounding policy. A manual total must be disclosed.
  if (input.totalCents !== bookableServices[input.serviceId].basePriceCents && input.adjustmentReason === undefined) return fail("adjustment_reason_required");
  return { ok: true, value: input as unknown as Quote };
}
function sameQuote(a: Quote, b: Quote): boolean {
  return ["id", "bookingId", "serviceId", "revision", "catalogVersion", "currency", "totalCents", "start", "end", "createdAt", "expiresAt", "adjustmentReason"].every(key => a[key as keyof Quote] === b[key as keyof Quote]);
}
export function acceptQuote(quote: Quote, revision: number, now: number, source: QuoteAcceptance["source"]): Result<QuoteAcceptance> {
  if (!validateQuote(quote).ok || revision !== quote.revision || !Number.isSafeInteger(now) || now < quote.createdAt || now >= quote.expiresAt || (source !== "customer" && source !== "recorded_offline")) return { ok: false, issues: [{ path: "acceptance", code: "invalid_or_expired_proposal" }] };
  return { ok: true, value: { quoteId: quote.id, revision, acceptedAt: now, source } };
}
export const bookingStatuses = ["requested", "under_review", "alternative_proposed", "awaiting_customer_acceptance", "confirmed", "declined", "canceled", "completed"] as const;
export type BookingStatus = typeof bookingStatuses[number];
export type Booking = Readonly<{
  id: string; serviceId: ServiceId; status: BookingStatus; version: number;
  quote?: Quote; acceptance?: QuoteAcceptance;
}>;
const transitions: Record<BookingStatus, readonly BookingStatus[]> = {
  requested: ["under_review", "declined", "canceled"],
  under_review: ["alternative_proposed", "awaiting_customer_acceptance", "declined", "canceled"],
  alternative_proposed: ["under_review", "awaiting_customer_acceptance", "declined", "canceled"],
  awaiting_customer_acceptance: ["under_review", "alternative_proposed", "confirmed", "declined", "canceled"],
  confirmed: ["canceled", "completed"], declined: [], canceled: [], completed: [],
};
export type TransitionContext = {
  actor: "santa" | "customer"; now: number; expectedVersion: number;
  quote?: Quote; acceptance?: QuoteAcceptance;
  /** Evidence supplied by a future transactional scheduling layer, not an availability calculation. */
  scheduleCheck?: { bookingVersion: number; checkedAt: number; conflictFree: boolean; staffingVerified: boolean };
};
/** Pure transition guard. Persistence must atomically compare version and reserve resources. */
export function transitionBooking(booking: Booking, target: BookingStatus, context: TransitionContext): Result<Booking> {
  const fail = (code: string): Result<Booking> => ({ ok: false, issues: [{ path: "transition", code }] });
  if (!record(booking) || typeof booking.id !== "string" || !booking.id.trim() || !isServiceId(booking.serviceId) || !Object.hasOwn(transitions, booking.status) || !Number.isSafeInteger(booking.version) || booking.version < 1 || !record(context) || !Number.isSafeInteger(context.now) || context.now < 0 || context.expectedVersion !== booking.version) return fail("invalid_or_stale_transition");
  if (!transitions[booking.status].includes(target)) return fail("invalid_transition");
  if (context.actor !== "santa") return fail("santa_action_required");
  if (context.quote && (!validateQuote(context.quote).ok || context.quote.bookingId !== booking.id || context.quote.serviceId !== booking.serviceId || (target !== "awaiting_customer_acceptance" && target !== "alternative_proposed"))) return fail("invalid_proposal_edit");
  if (booking.quote && !validateQuote(booking.quote).ok) return fail("invalid_stored_quote");
  if (context.quote && booking.quote && (context.quote.id !== booking.quote.id || context.quote.revision < booking.quote.revision || (context.quote.revision === booking.quote.revision && !sameQuote(context.quote, booking.quote)))) return fail("quote_revision_required");
  const quote = context.quote ?? booking.quote;
  const acceptance = context.acceptance ?? booking.acceptance;
  if (target === "awaiting_customer_acceptance" || target === "confirmed") {
    if (!quote || !validateQuote(quote).ok || quote.bookingId !== booking.id || quote.serviceId !== booking.serviceId || quote.createdAt > context.now || quote.expiresAt <= context.now || quote.start <= context.now) return fail("current_quote_required");
  }
  if (target === "confirmed") {
    if (!booking.quote || (context.quote && !sameQuote(context.quote, booking.quote))) return fail("sent_quote_required");
    if (!acceptance || !quote || acceptance.quoteId !== quote.id || acceptance.revision !== quote.revision || (acceptance.source !== "customer" && acceptance.source !== "recorded_offline") || !Number.isSafeInteger(acceptance.acceptedAt) || acceptance.acceptedAt < quote.createdAt || acceptance.acceptedAt >= quote.expiresAt || acceptance.acceptedAt > context.now) return fail("customer_agreement_required");
    const check = context.scheduleCheck;
    if (!check || check.bookingVersion !== booking.version || check.checkedAt !== context.now || check.conflictFree !== true) return fail("schedule_verification_required");
    if ((booking.serviceId === "photo-booth" || booking.serviceId === "complete-party") && check.staffingVerified !== true) return fail("staffing_verification_required");
  }
  if (target === "completed" && (!booking.quote || context.now < booking.quote.end)) return fail("event_not_finished");
  // Proposal edits/review invalidate old acceptance. Acknowledgment cannot change booking state.
  const next: Booking = { id: booking.id, serviceId: booking.serviceId, status: target, version: booking.version + 1,
    ...(quote ? { quote } : {}), ...(target === "confirmed" && acceptance ? { acceptance } : {}) };
  return { ok: true, value: next };
}
