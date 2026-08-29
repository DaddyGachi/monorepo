import type { Metadata } from "next";
import { privatePageMetadata } from "@/lib/seo";

/**
 * Authenticated earnings record — not indexable.
 */
export const metadata: Metadata = privatePageMetadata("Whistleblower Earnings");

export default function WhistleblowerEarningsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
