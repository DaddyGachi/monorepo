# Page Metadata Convention

Helpers live in [`lib/seo.ts`](lib/seo.ts). Site-wide defaults — `metadataBase`,
the `%s | Shelterflex` title template, default OpenGraph and Twitter cards —
are set once in [`app/layout.tsx`](app/layout.tsx).

## Configuration

Set `NEXT_PUBLIC_SITE_URL` per environment (e.g. `https://shelterflex.com`). It
is the canonical origin, and `metadataBase` resolves every relative OpenGraph
and canonical URL against it. Without it the build falls back to
`http://localhost:3000`, which is fine locally and wrong in production.

## Metadata must be server-rendered

Crawlers and link unfurlers read the initial HTML. Metadata set from a client
component is invisible to both, and Next.js rejects a `metadata` export from a
`"use client"` module outright.

Where a route's UI is a client component, the route file stays a server
component and delegates:

```
app/properties/page.tsx            // server: exports metadata, renders <PropertiesClient />
app/properties/PropertiesClient.tsx // "use client": the actual UI
```

`/`, `/properties`, `/landlords`, `/wallet`, and `/properties/[id]` all follow
this shape.

## Public routes

Use `buildPageMetadata` — it emits the canonical URL, OpenGraph, and Twitter
card together, so they cannot drift apart:

```tsx
export const metadata: Metadata = buildPageMetadata({
  title: "Browse Rental Properties in Nigeria",
  description: "Search verified rentals across Lagos, Abuja, ...",
  path: "/properties",
});
```

Titles omit the site name — the root template appends `| Shelterflex`. Pass
`title: { absolute: ... }` for the homepage, where the suffix would repeat.

Canonical URLs are the bare route path. `/properties` encodes filters, sorting,
and pagination in the query string, and each combination would otherwise look
like a separate page with near-identical content.

## Property detail pages

[`app/properties/[id]/page.tsx`](app/properties/[id]/page.tsx) fetches the
listing in `generateMetadata` and builds a per-listing title
(`42 Admiralty Way, Lekki Phase 1, Lagos`), a description from the listing's own
copy — truncated to the ~160 characters unfurlers and search results show — and
an absolute OpenGraph image from the listing's first photo. With a photo the
card is `summary_large_image`; without one it degrades to `summary` on the site
icon.

The same route emits `Residence` JSON-LD with address, bedroom and bathroom
counts, and an `Offer` carrying the annual rent in NGN. This was judged
worthwhile: rental listings are the content type search engines surface with
rich results, the data is already fetched server-side for the metadata, and
every field maps onto an existing field on the listing record — nothing is
invented. It is emitted only when the fetch succeeds.

## Private and token-based routes

Use `privatePageMetadata(title)`, or spread `NO_INDEX` into an existing metadata
object. Coverage is by route segment, via a `layout.tsx`, so new pages inside a
private segment inherit the exclusion instead of needing to remember it:

`/admin`, `/dashboard`, `/wallet`, `/messages`, `/onboarding`, `/pre-screen`,
`/report`, `/staking`, `/tenant`, `/verify-otp`, `/forgot-password`, `/offline`,
`/whistleblower/dashboard`, `/whistleblower/earnings`, `/rating-card/[token]`,
and `/public/tenant-rating/[token]`.

`NO_INDEX` sets `noarchive` and `nosnippet` alongside `noindex`, which matters
most for the two token routes: the token is the only access control there, so a
cached copy or a search snippet would outlive its revocation and expose a named
tenant's payment history.

[`app/robots.ts`](app/robots.ts) repeats the same list at the crawler level, so
well-behaved crawlers do not fetch those URLs at all. It is deliberately an
exclusion list, not a sitemap or robots overhaul.

## Verifying

```bash
NEXT_PUBLIC_SITE_URL=https://shelterflex.example pnpm run build
NEXT_PUBLIC_SITE_URL=https://shelterflex.example pnpm start

curl -s http://localhost:3000/properties/<id> | grep -E 'og:|twitter:|canonical|<title>'
curl -s http://localhost:3000/rating-card/<token> | grep 'name="robots"'
curl -s http://localhost:3000/robots.txt
```

Because the tags are in the server-rendered HTML, the same output is what the
Facebook Sharing Debugger, the X Card Validator, and LinkedIn's Post Inspector
will read once the site is publicly reachable.
