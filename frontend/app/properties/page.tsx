import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import PropertiesClient from "./PropertiesClient";

export const dynamic = "force-dynamic";

/**
 * Server entry point for `/properties` — see the note in `app/page.tsx` on why
 * the route file is not the client component.
 *
 * The canonical URL is the bare `/properties` path deliberately: the browsing
 * UI encodes every filter and page in the query string, and each combination
 * would otherwise look like a separate page with near-identical content.
 */
export const metadata: Metadata = buildPageMetadata({
  title: "Browse Rental Properties in Nigeria",
  description:
    "Search verified rentals across Lagos, Abuja, Port Harcourt, Ibadan, and Enugu. Filter by price, bedrooms, and location, and split the rent into monthly installments.",
  path: "/properties",
});

export default function PropertiesPage() {
  return <PropertiesClient />;
}
