import type { Metadata } from "next";
import { privatePageMetadata } from "@/lib/seo";

/**
 * Internal operator tooling. Excluded from indexing for the whole /admin segment.
 */
export const metadata: Metadata = privatePageMetadata("Admin");

export default function AdminSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
