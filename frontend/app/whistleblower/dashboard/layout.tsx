import type { Metadata } from "next";
import { privatePageMetadata } from "@/lib/seo";

/**
 * Authenticated reporter dashboard — not indexable.
 */
export const metadata: Metadata = privatePageMetadata("Whistleblower Dashboard");

export default function WhistleblowerDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
