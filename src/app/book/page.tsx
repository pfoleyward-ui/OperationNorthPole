import type { Metadata } from "next";
import { isServiceId } from "../../config/services";
import { BookingWizard } from "./BookingWizard";
export const metadata: Metadata = { title: "Plan a Visit | SantaBlizard", robots: { index: false, follow: false } };
export default async function BookPage({ searchParams }: { searchParams: Promise<{ service?: string | string[] }> }) {
  const query = await searchParams;
  return <BookingWizard initialService={isServiceId(query.service) ? query.service : "home-visits"} staging={process.env.CUSTOMER_BOOKING_MODE === "staging"} siteKey={process.env.TURNSTILE_SITE_KEY ?? ""} unknownService={query.service !== undefined && !isServiceId(query.service)} />;
}
