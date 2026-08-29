# Loading, Empty, and Error State Convention

Every asynchronous surface resolves to exactly one of four states. Each has one
component, in [`components/ui/data-state.tsx`](components/ui/data-state.tsx).
Use them rather than hand-rolling per screen — the inconsistency is what made
working screens read as broken.

| State | Component | Looks like | Says |
| --- | --- | --- | --- |
| `loading` | `<LoadingState label>` / `<LoadingAnnouncer>` | Pulsing grey placeholders shaped like the real content | "This is coming" |
| `error` | `<ErrorState onRetry>` | Destructive border and background, alert icon, retry button | "This failed; here's how to try again" |
| `empty` | `<EmptyState>` | Dashed border, muted icon, headline plus a next-step button | "There's nothing here yet; here's how to change that" |
| `ready` | the surface's own markup | — | — |

The three states must never be confusable. A skeleton where an empty state
belongs tells a new user the app is broken; a blank region where an error
belongs makes them wait for content that is not coming.

## Rules

### 1. Never render a monetary value from a fallback

This is the rule that matters most, and the one that is enforced.
`formatNgn(balance ?? 0)` renders "₦0" — indistinguishable from a real zero
balance, and a figure a user may act on. Use `<MoneyValue>`:

```tsx
<MoneyValue
  status={isLoading ? "loading" : error ? "error" : "ready"}
  amount={earnings?.totalEarnings}   // null/undefined stays unknown, never 0
  format={formatNgn}
/>
```

It renders a skeleton while loading, an em dash (with an
`Amount unavailable` label for screen readers) when the amount is unknown or the
fetch failed, and the formatted figure only when given a real number. A genuine
`0` from the server still renders as `0`.

Derive unknown amounts as `null`, not `0`:

```tsx
// Wrong — an unreachable API reports a zero balance.
const totalEarned = earnings?.totalEarnings || 0;

// Right — an unreachable API reports nothing.
const totalEarned = earnings ? earnings.totalEarnings : null;
```

[`lib/__tests__/no-money-fallbacks.test.ts`](lib/__tests__/no-money-fallbacks.test.ts)
scans the whole source tree for money formatters called on a `?? 0` / `|| 0`
fallback and fails the test run if one reappears.

### 2. Error states retry, they do not ask for a page reload

`window.location.reload()` throws away every other section on the page to
recover one, and loses unsaved form state. `<ErrorState>` requires `onRetry`
for that reason. The same guard test fails the build if a reload-based retry
returns outside the service worker and the offline fallback, where reloading
genuinely is the action.

Where the fetch lives in an effect with a cancel-on-unmount guard, a reload
token is the least invasive way to get a real retry:

```tsx
const [reloadToken, setReloadToken] = useState(0);
const retry = useCallback(() => setReloadToken((t) => t + 1), []);
useEffect(() => { /* ...existing fetch... */ }, [deps, reloadToken]);
```

Where the fetch is already a callback, keep the mount path and the retry path
separate — otherwise the React Compiler lint rule flags the synchronous
`setState` the retry needs:

```tsx
const loadStats = useCallback(() => { getStats().then(...).finally(...) }, []);
useEffect(() => { loadStats(); }, [loadStats]);

const retryStats = useCallback(() => {
  setStatsLoading(true);
  setStatsError(null);
  loadStats();
}, [loadStats]);
```

### 3. Empty states point at the next action

An empty list is usually a new user's first impression of the feature, so it
carries the call to action that would fill it. `action` takes either a link or a
callback:

```tsx
<EmptyState
  icon={Heart}
  title="No saved properties yet"
  description="Tap the heart icon on any listing to save it here."
  action={{ label: "Browse properties", href: "/properties" }}
/>
```

Filtered-empty is a different state from genuinely-empty: when filters are
active, offer "Clear filters" instead of the onboarding action.

### 4. Loading is announced, and does not shift the layout

`<LoadingState label>` renders a polite `role="status"` live region and marks
the placeholder shapes `aria-hidden` — the shapes carry no information, and
announcing them adds noise. `Skeleton` itself is `aria-hidden` by default.

Use `<LoadingAnnouncer>` alone when the skeletons cannot be wrapped (direct grid
children, table rows) so the layout is untouched.

Placeholders must match the dimensions of what replaces them. `StatCardSkeleton`
and `ListRowSkeleton` mirror the real stat card and list row for this reason;
`PropertyCardSkeleton` does the same for listings. When a section renders
nothing at all while loading and a block of cards afterwards, that is a layout
shift — render the skeletons in the same grid instead.

## Choosing a placeholder

- Stat / KPI card → `<StatCardSkeleton>`
- List, ledger, or payment row → `<ListRowSkeleton>`
- Property listing → `<PropertyCardSkeleton>`
- Anything else → `<Skeleton className="...">` sized to the real content

## Example

```tsx
{isLoading ? (
  <LoadingState label="Loading payout schedule" className="space-y-4">
    {Array.from({ length: 3 }).map((_, i) => <ListRowSkeleton key={i} />)}
  </LoadingState>
) : error ? (
  <ErrorState
    title="Payout schedule is unavailable"
    description={error}
    onRetry={fetchData}
  />
) : periods.length === 0 ? (
  <EmptyState
    icon={BarChart3}
    title="No payouts scheduled"
    description="Payouts appear here once a tenant pays rent on one of your properties."
    action={{ label: "Set up payouts", href: "/dashboard/landlord/settings/payouts" }}
  />
) : (
  <PayoutList periods={periods} />
)}
```
