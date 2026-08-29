import type { Metadata } from "next";
import { privatePageMetadata } from "@/lib/seo";

/**
 * Service-worker offline fallback; has no standalone content to index.
 */
export const metadata: Metadata = privatePageMetadata("Offline");

export default function OfflineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
