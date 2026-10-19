/** Web-standard Intl/Date only: no Node, database, or provider dependencies. */
export const BOOKING_TIME_ZONE = "America/New_York" as const;
export type Disambiguation = "earlier" | "later";
const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BOOKING_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
export function localParts(instant: number) {
  const parts = Object.fromEntries(formatter.formatToParts(instant).map(p => [p.type, p.value]));
  return { date: `${parts.year.padStart(4, "0")}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const instant = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(instant) && new Date(instant).toISOString().slice(0, 10) === value;
}
export function validTime(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}
export function isChristmasBlackout(date: string): boolean {
  return date.slice(5) === "12-24" || date.slice(5) === "12-25";
}
export type WallTimeResolution =
  | { kind: "invalid" | "nonexistent"; candidates: readonly number[] }
  | { kind: "valid" | "ambiguous"; candidates: readonly number[] };
export function resolveWallTime(date: unknown, time: unknown): WallTimeResolution {
  if (!validDate(date) || !validTime(time)) return { kind: "invalid", candidates: [] };
  const wall = Date.parse(`${date}T${time}:00Z`);
  // Sample both sides of a DST transition to discover possible NY offsets.
  const offsets = new Set<number>();
  for (const delta of [-36, -12, 0, 12, 36]) {
    const sample = wall + delta * 3600000;
    const local = localParts(sample);
    const offset = Date.parse(`${local.date}T${local.time}:00Z`) - sample;
    if (Number.isFinite(offset)) offsets.add(offset);
  }
  const candidates = [...offsets].map(offset => wall - offset).filter(candidate => {
    const local = localParts(candidate);
    return local.date === date && local.time === time;
  }).sort((a, b) => a - b);
  return { kind: candidates.length === 0 ? "nonexistent" : candidates.length > 1 ? "ambiguous" : "valid", candidates };
}
export function selectInstant(date: string, time: string, choice?: Disambiguation): number {
  if (choice !== undefined && choice !== "earlier" && choice !== "later") throw new Error("Invalid disambiguation");
  const result = resolveWallTime(date, time);
  if (result.kind === "invalid" || result.kind === "nonexistent") throw new Error(`Invalid local time: ${result.kind}`);
  if (result.kind === "ambiguous" && !choice) throw new Error("Ambiguous local time requires earlier/later choice");
  return result.candidates[choice === "later" ? result.candidates.length - 1 : 0];
}
/** Half-open intervals: finishing at midnight does not occupy the next day. */
export function intervalTouchesBlackout(start: number, end: number): boolean {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end > 253402300799999 || end <= start || end - start > 366 * 86400000) return true;
  // Sample at most 12h apart, including each occupied endpoint, so no local day is skipped.
  for (let at = start; at < end; at += 12 * 3600000) {
    if (isChristmasBlackout(localParts(at).date)) return true;
  }
  return isChristmasBlackout(localParts(end - 1).date);
}
