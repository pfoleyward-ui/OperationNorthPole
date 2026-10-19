import type { ServiceId } from "../../config/services.ts";
export type Question = Readonly<{ key: string; label: string; type: "text" | "count" | "boolean" }>;
const question = (key: string, label: string, type: Question["type"] = "text"): Question => ({ key, label, type });
/** Optional planning questions, not new package inclusions or eligibility rules. No child personalization. */
export const serviceQuestions = {
  "home-visits": [question("childrenCount", "Approximately how many children?", "count"), question("familyGifts", "Will your family supply gifts for Santa to hand out?", "boolean")],
  photography: [question("studioName", "Studio name"), question("sessionPlan", "Tell Santa about your studio session schedule")],
  "dj-parties": [question("venueSetup", "Tell Santa about the venue and equipment setup"), question("musicPreferences", "Music and MC preferences")],
  "photo-booth": [question("boothSpace", "Tell us about the photo booth space and access")],
  "complete-party": [question("venueSetup", "Tell Santa about the venue and equipment setup"), question("boothSpace", "Tell us about the photo booth space and access")],
  "meet-greet": [question("appearancePlan", "Tell Santa about the appearance or meet-and-greet")],
  trivia: [question("triviaPlan", "Tell Santa about the trivia format and event requirements")],
} as const satisfies Record<ServiceId, readonly Question[]>;
