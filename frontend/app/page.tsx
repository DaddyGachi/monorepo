import type { Metadata } from "next";
import { DEFAULT_TITLE, buildPageMetadata } from "@/lib/seo";
import HomeClient from "./HomeClient";

/**
 * Server entry point for `/`. The page itself is a client component, and
 * metadata exported from a `"use client"` module is invisible to crawlers and
 * link unfurlers — so the route file stays a server component and owns it.
 */
export const metadata: Metadata = {
  ...buildPageMetadata({
    title: DEFAULT_TITLE,
    description:
      "Stop stressing about annual rent payments. Shelterflex helps you split your rent into affordable monthly installments across Nigeria.",
    path: "/",
  }),
  // `title.absolute` keeps the homepage off the "%s | Shelterflex" template,
  // which would otherwise render "Shelterflex - Rent Now, Pay Later | Shelterflex".
  title: { absolute: DEFAULT_TITLE },
};

export default function HomePage() {
  return <HomeClient />;
}
