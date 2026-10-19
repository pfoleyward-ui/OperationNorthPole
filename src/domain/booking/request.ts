import { bookableServices, isServiceId, type ServiceId } from "../../config/services.ts";
import { serviceQuestions } from "./questions.ts";
import { BOOKING_TIME_ZONE, intervalTouchesBlackout, isChristmasBlackout, localParts, resolveWallTime, validDate, validTime, type Disambiguation } from "./time.ts";
export type Issue = { path: string; code: string };
export type Result<T> = { ok: true; value: T } | { ok: false; issues: Issue[] };
export type TimingInput = { date: string; time: string; latestTime?: string; disambiguation?: Disambiguation; latestDisambiguation?: Disambiguation };
export type ValidatedTiming = TimingInput & { earliestStart: number; latestStart: number; durationMinutes: number | null; timeZone: typeof BOOKING_TIME_ZONE };
export type BookingRequest = {
  serviceId: ServiceId; catalogVersion: number;
  timing: ValidatedTiming; alternative?: ValidatedTiming;
  customer: { name: string; email: string; phone: string };
  location: string; eventType: string; guestCount?: number; flexibility?: string; instructions?: string;
  answers: Record<string, string | number | boolean>;
};
export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function unknownKeys(value: Record<string, unknown>, allowed: readonly string[], path: string, issues: Issue[]) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) issues.push({ path: `${path}.${key}`, code: "unknown_field" });
}
function text(value: unknown, path: string, issues: Issue[], required = true, max = 2000): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
    issues.push({ path, code: "invalid_text" }); return undefined;
  }
  return value.trim();
}
function timing(value: unknown, duration: number | null, now: number, path: string, issues: Issue[]): ValidatedTiming | undefined {
  if (!record(value)) { issues.push({ path, code: "invalid_timing" }); return; }
  unknownKeys(value, ["date", "time", "latestTime", "disambiguation", "latestDisambiguation"], path, issues);
  const valid = validDate(value.date) && validTime(value.time);
  if (!valid) { issues.push({ path, code: "invalid_date_or_time" }); return; }
  const date = value.date as string;
  if (isChristmasBlackout(date)) issues.push({ path, code: "christmas_unavailable" });
  const resolve = (time: unknown, choice: unknown, field: string): number | undefined => {
    if (choice !== undefined && choice !== "earlier" && choice !== "later") { issues.push({ path: `${path}.${field}`, code: "invalid_disambiguation" }); return; }
    const result = resolveWallTime(date, time);
    if (result.kind === "invalid" || result.kind === "nonexistent") { issues.push({ path: `${path}.${field}`, code: result.kind }); return; }
    if (result.kind === "ambiguous" && choice === undefined) { issues.push({ path: `${path}.${field}`, code: "ambiguous_time" }); return; }
    return result.candidates[choice === "later" ? result.candidates.length - 1 : 0];
  };
  const first = resolve(value.time, value.disambiguation, "time");
  const last = value.latestTime === undefined ? first : resolve(value.latestTime, value.latestDisambiguation, "latestTime");
  if (value.latestTime === undefined && value.latestDisambiguation !== undefined) issues.push({ path, code: "choice_without_window" });
  if (first === undefined || last === undefined) return;
  if (first <= now) issues.push({ path, code: "past_time" });
  if (last < first) issues.push({ path, code: "reversed_window" });
  if (duration !== null) {
    const end = last + duration * 60000;
    if (!Number.isFinite(end) || end > 253402300799999 || intervalTouchesBlackout(first, end)) issues.push({ path, code: "unavailable_interval" });
  }
  return { date, time: value.time as string, ...(value.latestTime === undefined ? {} : { latestTime: value.latestTime as string }), ...(value.disambiguation === undefined ? {} : { disambiguation: value.disambiguation as Disambiguation }), ...(value.latestDisambiguation === undefined ? {} : { latestDisambiguation: value.latestDisambiguation as Disambiguation }), earliestStart: first, latestStart: last, durationMinutes: duration, timeZone: BOOKING_TIME_ZONE };
}
/** No persistence or availability claim. `now` must be supplied by the caller. */
export function validateBookingRequest(input: unknown, now: number): Result<BookingRequest> {
  const issues: Issue[] = [];
  if (!Number.isSafeInteger(now) || now < 0 || now > 253402300799999) return { ok: false, issues: [{ path: "now", code: "invalid_clock" }] };
  if (!record(input)) return { ok: false, issues: [{ path: "request", code: "invalid_request" }] };
  unknownKeys(input, ["serviceId", "timing", "alternative", "durationMinutes", "customer", "location", "eventType", "guestCount", "flexibility", "instructions", "answers"], "request", issues);
  if (!isServiceId(input.serviceId)) return { ok: false, issues: [...issues, { path: "serviceId", code: "unknown_service" }] };
  const service = bookableServices[input.serviceId];
  let duration: number | null = service.durationMinutes;
  if (input.durationMinutes !== undefined) {
    // A one-year technical input bound prevents unbounded interval processing; not a marketed service duration.
    if (!Number.isSafeInteger(input.durationMinutes) || (input.durationMinutes as number) <= 0 || (input.durationMinutes as number) > 527040) issues.push({ path: "durationMinutes", code: "invalid_duration" });
    else if (duration !== null && input.durationMinutes !== duration) issues.push({ path: "durationMinutes", code: "fixed_duration" });
    else duration = input.durationMinutes as number;
  }
  const preferred = timing(input.timing, duration, now, "timing", issues);
  const alternative = input.alternative === undefined ? undefined : timing(input.alternative, duration, now, "alternative", issues);
  const customer = record(input.customer) ? input.customer : {};
  unknownKeys(customer, ["name", "email", "phone"], "customer", issues);
  const name = text(customer.name, "customer.name", issues, true, 200);
  const email = text(customer.email, "customer.email", issues, true, 254);
  const phone = text(customer.phone, "customer.phone", issues, true, 50);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) issues.push({ path: "customer.email", code: "invalid_email" });
  if (phone && !/^\+?[\d\s().-]+$/.test(phone)) issues.push({ path: "customer.phone", code: "invalid_phone" });
  if (phone && (phone.replace(/\D/g, "").length < 7 || phone.replace(/\D/g, "").length > 15)) issues.push({ path: "customer.phone", code: "invalid_phone" });
  const location = text(input.location, "location", issues);
  const eventType = text(input.eventType, "eventType", issues, true, 200);
  const flexibility = text(input.flexibility, "flexibility", issues, false);
  const instructions = text(input.instructions, "instructions", issues, false);
  if (input.guestCount !== undefined && (!Number.isSafeInteger(input.guestCount) || (input.guestCount as number) < 0)) issues.push({ path: "guestCount", code: "invalid_count" });
  const answers: Record<string, string | number | boolean> = {};
  if (input.answers !== undefined && !record(input.answers)) issues.push({ path: "answers", code: "invalid_answers" });
  if (record(input.answers)) {
    const questions = serviceQuestions[input.serviceId];
    for (const [key, value] of Object.entries(input.answers)) {
      const question = questions.find(q => q.key === key);
      if (!question) { issues.push({ path: `answers.${key}`, code: "unknown_question" }); continue; }
      if (question.type === "text") { const clean = text(value, `answers.${key}`, issues); if (clean) answers[key] = clean; }
      else if (question.type === "boolean" && typeof value === "boolean") answers[key] = value;
      else if (question.type === "count" && Number.isSafeInteger(value) && (value as number) >= 0) answers[key] = value as number;
      else issues.push({ path: `answers.${key}`, code: "invalid_answer" });
    }
  }
  if (issues.length) return { ok: false, issues };
  return { ok: true, value: { serviceId: input.serviceId, catalogVersion: service.catalogVersion, timing: preferred!, ...(alternative ? { alternative } : {}), customer: { name: name!, email: email!, phone: phone! }, location: location!, eventType: eventType!, ...(input.guestCount === undefined ? {} : { guestCount: input.guestCount as number }), ...(flexibility ? { flexibility } : {}), ...(instructions ? { instructions } : {}), answers } };
}
/** Confirmed appointment intervals must be concrete, not unresolved start windows. */
export function validAppointment(start: number, end: number, serviceId: ServiceId): boolean {
  if (!isServiceId(serviceId) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end > 253402300799999 || end <= start || end - start > 366 * 86400000) return false;
  const fixed = bookableServices[serviceId].durationMinutes;
  return (fixed === null || end - start === fixed * 60000) && !intervalTouchesBlackout(start, end) && !isChristmasBlackout(localParts(start).date);
}
