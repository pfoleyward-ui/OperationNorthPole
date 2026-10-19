import { isServiceId, type ServiceId } from "../../config/services.ts";
export type Resource = "santa" | "photo-booth" | "booth-attendant";
export type OccupiedInterval = Readonly<{ id: string; resource: Resource; start: number; end: number }>;
export function requiredResources(service: ServiceId): readonly Resource[] {
  if (!isServiceId(service)) throw new Error("Unknown service");
  return service === "complete-party" ? ["santa", "photo-booth", "booth-attendant"] : service === "photo-booth" ? ["photo-booth", "booth-attendant"] : ["santa"];
}
/** Caller supplies agreed buffers. This does not calculate travel or query availability. */
export function occupiedInterval(id: string, resource: Resource, start: number, end: number, beforeMinutes: number, afterMinutes: number): OccupiedInterval {
  if (!id || !["santa", "photo-booth", "booth-attendant"].includes(resource) || ![start, end, beforeMinutes, afterMinutes].every(Number.isSafeInteger) || start < 0 || end <= start || beforeMinutes < 0 || afterMinutes < 0) throw new Error("Invalid occupied interval");
  const occupiedStart = start - beforeMinutes * 60000;
  const occupiedEnd = end + afterMinutes * 60000;
  if (!Number.isSafeInteger(occupiedStart) || !Number.isSafeInteger(occupiedEnd) || occupiedStart < 0 || occupiedEnd > 253402300799999) throw new Error("Invalid buffered interval");
  return { id, resource, start: occupiedStart, end: occupiedEnd };
}
export function overlaps(a: OccupiedInterval, b: OccupiedInterval): boolean {
  // Reject malformed snapshots rather than describing them as conflict-free.
  occupiedInterval(a.id, a.resource, a.start, a.end, 0, 0);
  occupiedInterval(b.id, b.resource, b.start, b.end, 0, 0);
  return a.resource === b.resource && a.start < b.end && b.start < a.end;
}
