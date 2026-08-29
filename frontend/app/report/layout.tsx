import type { Metadata } from "next";
import { privatePageMetadata } from "@/lib/seo";

/**
 * Authenticated reporting flow — not indexable.
 */
export const metadata: Metadata = privatePageMetadata("Report");

export default function ReportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
