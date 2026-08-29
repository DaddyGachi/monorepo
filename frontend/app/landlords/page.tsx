import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import LandlordsClient from "./LandlordsClient";

/**
 * Server entry point for `/landlords` — see the note in `app/page.tsx` on why
 * the route file is not the client component.
 */
export const metadata: Metadata = buildPageMetadata({
  title: "For Landlords — Get Your Full Rent Upfront",
  description:
    "Partner with Shelterflex and receive your annual rent within 48 hours of tenant move-in, while your tenants pay monthly. List your property for free.",
  path: "/landlords",
});

export default function LandlordsPage() {
  return <LandlordsClient />;
}
