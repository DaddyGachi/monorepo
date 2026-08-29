import type { Metadata } from "next";
import { privatePageMetadata } from "@/lib/seo";

/**
 * One-time-code step of the auth flow — not indexable.
 */
export const metadata: Metadata = privatePageMetadata("Verify Code");

export default function VerifyOtpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
