/** Approved monetary values live here once; public labels are derived below. */
export type MarketingCategoryId = "home-visits" | "photography" | "dj-parties" | "photo-booth" | "off-season";
export type ServiceRate = Readonly<{
  name: string;
  categoryId: MarketingCategoryId;
  basePriceCents: number;
  currency: "USD";
  pricingBasis: "visit" | "hour" | "session" | "package";
  durationMinutes: number | null;
}>;
export const CATALOG_VERSION = 1;
export const serviceRates = {
  "home-visits": { name: "Santa Makes House Calls!", categoryId: "home-visits", basePriceCents: 15000, currency: "USD", pricingBasis: "visit", durationMinutes: 30 },
  "photography": { name: "Photographer Studio Day", categoryId: "photography", basePriceCents: 150000, currency: "USD", pricingBasis: "package", durationMinutes: 480 },
  "dj-parties": { name: "DJ Santa / MC", categoryId: "dj-parties", basePriceCents: 75000, currency: "USD", pricingBasis: "package", durationMinutes: 240 },
  "photo-booth": { name: "Staffed Santa Photo Booth", categoryId: "photo-booth", basePriceCents: 80000, currency: "USD", pricingBasis: "package", durationMinutes: 240 },
  "complete-party": { name: "Complete SantaBlizard Christmas Party", categoryId: "dj-parties", basePriceCents: 155000, currency: "USD", pricingBasis: "package", durationMinutes: 240 },
  "meet-greet": { name: "Santa Meet & Greet", categoryId: "off-season", basePriceCents: 20000, currency: "USD", pricingBasis: "hour", durationMinutes: null },
  "trivia": { name: "Santa-Hosted Trivia", categoryId: "off-season", basePriceCents: 30000, currency: "USD", pricingBasis: "session", durationMinutes: null },
} as const satisfies Record<string, ServiceRate>;
export type ServiceId = keyof typeof serviceRates;
export function isServiceId(value: unknown): value is ServiceId {
  return typeof value === "string" && Object.hasOwn(serviceRates, value);
}
export function usd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}
function hours(minutes: number): number { return minutes / 60; }

export const santaNote = "I've been making Christmas memories for a long, long time, and I believe every family deserves a little extra joy. That's why I offer visits for different budgets, with clear prices and no surprises—well, except the one at your front door! Ho Ho Ho!";

const marketingContent = [
  {
    id: "home-visits", title: "Santa Makes House Calls!", kind: "home",
    headline: "The Best Christmas Surprise Might Just Knock on Your Door.",
    description: "Imagine their faces when Santa himself comes knocking! Stories, laughter, Christmas wishes, presents from his sack, and family photographs they'll treasure for years.",
    cta: "Invite Santa Over",
    story: "The doorbell rings. A little face peeks around the door—and there stands Santa, ready to step into your family's Christmas story. There is time for laughter, a story, whispered Christmas wishes, and family photographs. This is a personal visit to your own home, and a memory to carry into Christmases to come.",
    includes: ["Stories, laughter, and Christmas wishes", "Time for family photographs", "Santa handing out presents supplied by your family"],
    note: "Visits are approximately 30 minutes. Please supply any gifts Santa will hand out. Santa travels from Blooming Grove, NY; travel fees may apply outside the local visiting area.",
  },
  {
    id: "photography", title: "Santa & Photography", kind: "photography",
    headline: "Make the Experience as Memorable as the Photograph.",
    description: "Give your clients more than a Christmas portrait. Bring their holiday sessions to life with a Santa who knows how to make little personalities shine.",
    cta: "Book Santa for Your Studio",
    story: "Photographers and studio owners: build your holiday sessions around a warm welcome, authentic conversation, and little moments of wonder. SantaBlizard brings personality and patient interaction to help your clients relax and let their own personalities shine. Create a memorable experience to complement your premium studio offerings.",
    includes: ["SantaBlizard for an eight-hour studio booking", "Authentic Santa interaction during your holiday sessions"],
    note: "The photographer supplies all photography services, editing, and image delivery. We'll agree on the studio's schedule and requirements before confirming the day.",
  },
  {
    id: "dj-parties", title: "DJ Santa & Christmas Parties", kind: "music",
    headline: "Wait a Minute… SANTA'S the DJ?!",
    description: "Forty years of professional DJ experience, a booming Santa laugh, and a Christmas party nobody saw coming. Professional sound, lighting, music, and merriment!",
    cta: "Let's Get This Party Started",
    story: "Behind that Santa laugh are more than 40 years of professional DJ experience throughout the Hudson Valley. SantaBlizard owns professional DJ equipment and lighting and brings the experience to keep a celebration moving. From office holiday parties and restaurant events to private celebrations, give your guests an entertainer with a few surprises up his velvet sleeve.",
    includes: ["SantaBlizard as DJ and MC for four event hours", "Professional DJ sound and lighting", "Music, humor, and holiday entertainment"],
    note: "Tell us about your venue, event schedule, and equipment logistics so we can confirm the right arrangement for your celebration.",
  },
  {
    id: "photo-booth", title: "Santa Photo Booth", kind: "camera",
    headline: "Say Cheese! Or Better Yet… Say HO HO HO!",
    description: "Festive props, a Christmas backdrop, and printed photographs your guests can take home. Smile for the camera!",
    cta: "Explore the Photo Booth",
    story: "Gather your favorite people, choose a festive prop, and make a keepsake together. Our physical photo booth brings a little Christmas fun to corporate events, family parties, restaurants, breweries, and holiday celebrations—with printed photographs guests receive immediately.",
    includes: ["A physical photo booth for four hours", "Christmas-themed backdrop and festive props", "A photo booth attendant", "Immediate printed photo keepsakes"],
    note: "A standalone photo booth booking does not automatically include a Santa appearance. An attendant is required; staffing and availability must be verified before confirmation.",
  },
  {
    id: "off-season", title: "Santa's Off-Season Adventures", kind: "summer",
    headline: "Who Says Santa Only Works One Night a Year?",
    description: "Christmas in July, brewery visits, trivia nights, festivals, birthdays, and surprise appearances. Santa's always looking for an excuse to get out of the workshop!",
    cta: "See Where Santa's Going",
    story: "Who says the workshop door has to stay shut until December? Invite Santa to your business or gathering and give visitors something to talk about. Dream up a Christmas in July celebration, a lively trivia night, or a surprise welcome for your customers—Santa is always happy to hear a creative idea.",
    includes: ["Christmas in July", "Santa-hosted trivia", "Breweries and restaurants", "Community festivals and holiday markets", "Birthdays and private parties", "Promotional events and business meet-and-greets"],
    note: `Standard appearances and Santa Meet & Greet visits have a base price of ${usd(serviceRates["meet-greet"].basePriceCents)}/hour. Santa-hosted trivia is ${usd(serviceRates.trivia.basePriceCents)}/session; duration and event requirements must be agreed upon before confirmation.`,
  },
] as const;

export const completeParty = {
  ...serviceRates["complete-party"],
  headline: "We Bring the Whole Christmas Party!",
  price: `${usd(serviceRates["complete-party"].basePriceCents)} · ${hours(serviceRates["complete-party"].durationMinutes)} hours`,
  description: `One convenient entertainment package: ${usd(serviceRates["dj-parties"].basePriceCents)} DJ + ${usd(serviceRates["photo-booth"].basePriceCents)} photo booth, with no separate charge for games or guest interaction.`,
  includes: ["SantaBlizard as DJ and MC", "Professional DJ sound and lighting", "Staffed photo booth", "Christmas-themed backdrop and props", "Immediate printed photo keepsakes", "Santa's personality, humor, and entertainment throughout the event"],
} as const;

function marketingPrice(id: MarketingCategoryId): string {
  switch (id) {
    case "home-visits": return `${usd(serviceRates[id].basePriceCents)} · ${serviceRates[id].durationMinutes}-minute visit`;
    case "photography": return `${usd(serviceRates[id].basePriceCents)} · ${hours(serviceRates[id].durationMinutes)}-hour studio day`;
    case "dj-parties": return `${usd(serviceRates[id].basePriceCents)} · ${hours(serviceRates[id].durationMinutes)}-hour DJ / MC`;
    case "photo-booth": return `${usd(serviceRates[id].basePriceCents)} · ${hours(serviceRates[id].durationMinutes)}-hour staffed booth`;
    case "off-season": return `Appearances from ${usd(serviceRates["meet-greet"].basePriceCents)}/hour · Trivia ${usd(serviceRates.trivia.basePriceCents)}/session`;
  }
}
/** Existing five-category presentation and URLs stay intact. */
export const services = marketingContent.map(category => ({ ...category, price: marketingPrice(category.id) }));
function category(id: MarketingCategoryId) {
  return services.find(item => item.id === id)!;
}
function bookable<S extends ServiceId>(id: S) {
  const rate = serviceRates[id];
  const content = category(rate.categoryId);
  return {
    id, ...rate, catalogVersion: CATALOG_VERSION,
    description: id === "complete-party" ? completeParty.description : id === "meet-greet" ? `Standard appearances and Santa Meet & Greet visits have a base price of ${usd(serviceRates["meet-greet"].basePriceCents)}/hour.` : id === "trivia" ? `Santa-hosted trivia is ${usd(serviceRates.trivia.basePriceCents)}/session; duration and event requirements must be agreed upon before confirmation.` : content.description,
    story: content.story,
    includes: id === "complete-party" ? completeParty.includes : id === "meet-greet" ? ["Santa Meet & Greet"] : id === "trivia" ? ["Santa-hosted trivia"] : content.includes,
  } as const;
}
export const bookableServices = {
  "home-visits": bookable("home-visits"), photography: bookable("photography"),
  "dj-parties": bookable("dj-parties"), "photo-booth": bookable("photo-booth"),
  "complete-party": bookable("complete-party"), "meet-greet": bookable("meet-greet"), trivia: bookable("trivia"),
} as const;
