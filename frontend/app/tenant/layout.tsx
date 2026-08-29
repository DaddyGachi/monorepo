import type { Metadata } from "next";
import { privatePageMetadata } from "@/lib/seo";

/**
 * Authenticated tenant-only pages — not indexable.
 */
export const metadata: Metadata = privatePageMetadata("Tenant");

export default function TenantSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
