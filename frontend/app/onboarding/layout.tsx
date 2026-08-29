import type { Metadata } from "next";
import { privatePageMetadata } from "@/lib/seo";

/**
 * Authenticated onboarding flow; carries applicant data and is not indexable.
 */
export const metadata: Metadata = privatePageMetadata("Onboarding");

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
