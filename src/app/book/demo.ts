import { serviceQuestions } from "../../domain/booking/questions";
import type { ServiceId } from "../../config/services";
/** Fixed synthetic fixtures only until secure server-side persistence is ready. */
export const demoCustomer = { name: "Sample Adult", email: "sample@example.test", phone: "202-555-0100" } as const;
export const demoGuestCount = 10;
export const demoFlexibility = "Sample: afternoon timing is flexible";
export const demoInstructions = "Sample: venue access will be discussed with Santa";
export const demoLocation = "Sample venue — no real address";
export function demoAnswers(service: ServiceId): Record<string, string | number | boolean> {
  return Object.fromEntries(serviceQuestions[service].map(q => [q.key, q.type === "count" ? 2 : q.type === "boolean" ? true : "Sample event details — no personal information"]));
}
