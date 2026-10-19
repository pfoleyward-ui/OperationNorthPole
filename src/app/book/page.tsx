import type { Metadata } from "next";
import { isServiceId } from "../../config/services";
import { BookingWizard } from "./BookingWizard";
export const metadata: Metadata = { title: "Booking Preview | SantaBlizard", robots: { index: false, follow: false } };
export default async function BookPage({ searchParams }: { searchParams: Promise<{ service?: string | string[] }> }) {
  const query = await searchParams;
  return <BookingWizard initialService={isServiceId(query.service) ? query.service : "home-visits"} unknownService={query.service !== undefined && !isServiceId(query.service)} />;
}
