import type { Metadata } from "next";

/**
 * Site-wide SEO helpers.
 *
 * Everything here runs on the server so crawlers and link unfurlers see the
 * output in the initial HTML. Metadata set from a client component is invisible
 * to both, so per-route metadata must live in a `page.tsx`/`layout.tsx` export
 * rather than inside a `"use client"` component.
 */

export const SITE_NAME = "Shelterflex";

export const DEFAULT_TITLE = "Shelterflex - Rent Now, Pay Later";

export const DEFAULT_DESCRIPTION =
  "The smarter way to pay your rent. Split your rent payments into affordable monthly installments.";

/** Fallback share image, used when a route has nothing more specific. */
export const DEFAULT_OG_IMAGE = "/icon.svg";

/**
 * Canonical origin. Configure `NEXT_PUBLIC_SITE_URL` per environment; the
 * localhost default keeps `next build` working without extra setup, and
 * `metadataBase` resolves every relative URL below against it.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
).replace(/\/+$/, "");

/** Turns a route path into an absolute URL for canonical and OpenGraph tags. */
export function absoluteUrl(path = "/"): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Robots directives for anything behind auth or reachable by a shared token.
 *
 * `noarchive` and `nosnippet` matter as much as `noindex` here: the rating-card
 * routes are addressable by anyone holding the link, and a cached copy or a
 * search snippet would leak a tenant's payment record even after the token is
 * revoked.
 */
export const NO_INDEX: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: false,
  nocache: true,
  noarchive: true,
  nosnippet: true,
  googleBot: {
    index: false,
    follow: false,
    noimageindex: true,
  },
};

export interface PageMetadataInput {
  title: string;
  description: string;
  /** Route path, e.g. `/properties`. Becomes the canonical URL. */
  path: string;
  images?: Array<{ url: string; width?: number; height?: number; alt?: string }>;
  /** Set for anything private or token-addressed. */
  noIndex?: boolean;
  type?: "website" | "article" | "profile";
}

/**
 * Builds a complete per-route Metadata object: canonical URL, OpenGraph, and
 * Twitter card, all consistent with each other.
 */
export function buildPageMetadata({
  title,
  description,
  path,
  images,
  noIndex = false,
  type = "website",
}: PageMetadataInput): Metadata {
  const url = absoluteUrl(path);
  const ogImages = images?.length
    ? images
    : [{ url: DEFAULT_OG_IMAGE, alt: SITE_NAME }];

  return {
    title,
    description,
    alternates: { canonical: url },
    ...(noIndex ? { robots: NO_INDEX } : {}),
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type,
      images: ogImages,
    },
    twitter: {
      card: ogImages[0]?.url === DEFAULT_OG_IMAGE ? "summary" : "summary_large_image",
      title,
      description,
      images: ogImages.map((image) => image.url),
    },
  };
}

/** Convenience wrapper for private routes that still want a sensible title. */
export function privatePageMetadata(title: string, description?: string): Metadata {
  return {
    title,
    description: description ?? DEFAULT_DESCRIPTION,
    robots: NO_INDEX,
  };
}
