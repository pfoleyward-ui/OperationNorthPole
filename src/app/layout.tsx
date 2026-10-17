import type { Metadata } from "next";
import "@fontsource/berkshire-swash/latin-400.css";
import "@fontsource/cormorant-garamond/latin-400.css";
import "@fontsource/cormorant-garamond/latin-500.css";
import "@fontsource/cormorant-garamond/latin-600.css";
import "@fontsource/cormorant-garamond/latin-700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "SantaBlizard | Hudson Valley, New York",
  description:
    "Christmas experiences with SantaBlizard in the Hudson Valley, New York.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
