import type { BookingRequest, Issue } from "./request.ts";
/** Future server-only adapter contract. No implementation or network operation exists yet. */
export interface BookingRequestRepository {
  /** Must atomically deduplicate the key and save a requested booking for Santa HQ. */
  saveRequested(request: BookingRequest, idempotencyKey: string): Promise<{ requestId: string; receivedAt: number }>;
}
export type SubmissionResult =
  | { kind: "received"; requestId: string; receivedAt: number }
  | { kind: "invalid"; issues: Issue[] }
  | { kind: "unavailable"; reason: "secure_persistence_not_configured" };
/** Fail closed. No request payload is accepted, stored, logged, or transmitted. */
export function bookingSubmissionAvailability(): SubmissionResult {
  return { kind: "unavailable", reason: "secure_persistence_not_configured" };
}
