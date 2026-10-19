import { serviceRates, usd } from "./services";
export const sensoryFriendly = {
  title: "Sensory-Friendly Santa Visits",
  introduction: "A little Christmas wonder, at your child's own pace.",
  description: "SantaBlizard has experience working with children with special needs. Visits can be quiet, patient, and child-led, with flexibility for each child's individual comfort. There are no forced hugs or photographs—just a warm welcome, on their terms.",
  priceNote: `Sensory-friendly accommodations are available at no additional charge to the standard house-call price of ${usd(serviceRates["home-visits"].basePriceCents)} for ${serviceRates["home-visits"].durationMinutes} minutes.`,
  privacyNote: "You can indicate a sensory-friendly preference without sharing a diagnosis, medical details, or private information about a child.",
} as const;
