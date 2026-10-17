import type { Metadata } from "next";
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
