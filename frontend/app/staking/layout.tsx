import type { Metadata } from "next";
import { privatePageMetadata } from "@/lib/seo";

/**
 * Wallet-connected staking surface — not indexable.
 */
export const metadata: Metadata = privatePageMetadata("Staking");

export default function StakingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
