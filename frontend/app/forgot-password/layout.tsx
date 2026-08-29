import type { Metadata } from "next";
import { privatePageMetadata } from "@/lib/seo";

/**
 * Account recovery step — not indexable.
 */
export const metadata: Metadata = privatePageMetadata("Reset Password");

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
