import type { Metadata } from "next";
import { privatePageMetadata } from "@/lib/seo";

// Server component — owns the route segment config
export const dynamic = "force-dynamic";

/** Shows the signed-in user's balances and ledger; never indexable. */
export const metadata: Metadata = privatePageMetadata("Wallet");

export { default } from "./WalletClient";
