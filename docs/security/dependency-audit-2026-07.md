# Dependency Vulnerability Audit — July 2026

Point-in-time audit of all three dependency trees. **No dependencies were
changed in this pass** — see [Why nothing was upgraded here](#why-nothing-was-upgraded-here).

| Workspace    | Tool          | Result |
| ------------ | ------------- | ------ |
| `contracts/` | `cargo audit` | **0 vulnerabilities**, 6 informational warnings |
| `backend/`   | `npm audit`   | 59 (6 critical, 18 high, 34 moderate, 1 low) |
| `frontend/`  | `pnpm audit`  | 66 (1 critical, 32 high, 28 moderate, 5 low) |

Advisory databases move; re-run before acting on this.

---

## 1. contracts/ — priority workspace

A vulnerable crate compiled into on-chain code cannot be patched after
deployment, so this workspace was audited first.

```
$ cargo audit
    Loaded 1173 security advisories
    Scanning Cargo.lock for vulnerabilities (235 crate dependencies)
warning: 6 allowed warnings found
```

**Zero vulnerabilities.** The six warnings are unmaintained / unsound / yanked
notices, not CVEs:

| Crate | ID | Class |
| --- | --- | --- |
| `derivative` 2.2.0 | RUSTSEC-2024-0388 | unmaintained |
| `paste` 1.0.15 | RUSTSEC-2024-0436 | unmaintained |
| `anyhow` 1.0.102 | RUSTSEC-2026-0190 | unsound (`Error::downcast_mut()`) |
| `rand` 0.8.5 | RUSTSEC-2026-0097 | unsound (custom logger + `rand::rng()`) |
| `rand` 0.9.2 | RUSTSEC-2026-0097 | unsound |
| `spin` 0.9.8 | — | yanked |

### Triage: none of these reach on-chain code

All six arrive through `soroban-env-host` (via `soroban-sdk` →
`soroban-ledger-snapshot`), which is the **host-side test environment** — the
emulator `cargo test --workspace` runs against. It is not compiled into the
`wasm32-unknown-unknown` artifact that gets deployed.

```
derivative v2.2.0 (proc-macro)
└── ark-ec v0.4.2
    └── ark-bls12-381 v0.4.0
        └── soroban-env-host v22.1.3
            └── soroban-ledger-snapshot v22.0.10
                └── soroban-sdk v22.0.10 → (all contracts)
```

`derivative` is additionally a proc-macro — it runs at compile time and emits no
runtime code at all.

**Exposure: none for deployed contracts.** The residual risk is confined to the
local/CI test host. `anyhow`'s unsoundness needs a `downcast_mut()` call the
contracts do not make; `rand`'s needs a custom logger the test harness does not
install.

**Action: none required.** These clear when `soroban-sdk` bumps its own
dependencies. Pinning them ourselves would mean overriding the SDK's transitive
versions — more risk than the warnings carry.

---

## 2. backend/ — payments and personal data

```
$ npm audit
59 vulnerabilities (1 low, 34 moderate, 18 high, 6 critical)
```

Direct dependencies with advisories, triaged by **actual exposure** rather than
by severity label:

| Severity | Package | Ships to prod? | Real exposure |
| --- | --- | --- | --- |
| CRITICAL | `vitest`, `@vitest/ui` | **No** — devDependency | Arbitrary file read/exec *only while the Vitest UI server is listening*. Never runs in production, never in `npm run test:ci`. **Lowest real urgency on this list despite the label.** |
| CRITICAL | `@redocly/cli` | **No** — devDependency | Via OpenTelemetry transitives. Used by `npm run openapi:validate` in CI only. Not a runtime path. |
| HIGH | `multer` | **Yes** | DoS via deeply nested field names and via incomplete cleanup of aborted uploads. This is a **request path** on any upload endpoint — reachable by an unauthenticated client. **Highest real priority in this workspace.** |
| HIGH | `ws` | **Yes** (via `ethers`) | Uninitialized memory disclosure + memory-exhaustion DoS. Reachable if the backend opens outbound websockets to an RPC provider. Memory disclosure is the concerning half. |
| HIGH | `@opentelemetry/*` | Yes | Telemetry path, not request-handling. Lower exposure than the label. |
| MODERATE | `express` (via `qs`) | **Yes** | Query-string parsing sits in front of **every** request. Moderate label, broad reach — treat above the OpenTelemetry highs. |
| MODERATE | `morgan` | Yes | Log forging via unneutralized control characters in `:remote-user`. Affects log integrity, not the service. Matters here because logs are the audit trail for payment activity. |
| MODERATE | `express-rate-limit` (via `ip-address`) | **Yes** | Rate limiting is a control the payment endpoints rely on; a parsing flaw there is a bypass risk, not just a crash risk. |
| MODERATE | `resend` (via `svix`) | Yes | Outbound email. Exposure depends on webhook-signature verification usage. |
| MODERATE | `ethers` (via `ws`) | Yes | Same `ws` root cause. |

**Ranking by real exposure**, which differs sharply from the severity ordering:
`multer` → `express`/`qs` → `express-rate-limit` → `ws`/`ethers` → `morgan` →
OpenTelemetry → `@redocly/cli` → `vitest`/`@vitest/ui`.

The two loudest findings (critical, in dev-only tooling) are the two least
urgent. The most urgent is a `high` and a `moderate` sitting in the request path.

`npm audit` reports fixes available for all of the above; `ws` needs
`--force` because the resolution falls outside `ethers`' stated range.

---

## 3. frontend/ — wallet interaction and auth tokens

```
$ pnpm audit
66 vulnerabilities found
Severity: 5 low | 28 moderate | 32 high | 1 critical
```

Dominated by **`next` — roughly 30 of the 66 advisories are Next.js itself**,
across middleware/proxy bypass, SSRF in Server Actions and rewrites, cache
poisoning, and image-optimizer DoS. Patched in `>= 16.2.5`.

| Severity | Package | Ships? | Real exposure |
| --- | --- | --- | --- |
| HIGH | `next` (middleware / proxy bypass, ×5) | **Yes** | The one class that matters most here. If any auth or route protection is enforced in middleware, a bypass is an auth bypass. Warrants checking whether this app gates anything in `middleware.ts`. |
| HIGH | `next` (SSRF in Server Actions / rewrites) | **Yes** | Server-side request forgery from a Next.js app that also talks to a wallet/RPC backend is a genuine pivot. |
| MODERATE | `next` (null origin bypasses Server Actions CSRF) | **Yes** | CSRF on an authenticated session. |
| HIGH | `sharp` (libvips CVEs) | Yes | Image processing. Exposure depends on whether user-supplied images are processed server-side. |
| MODERATE | `next-intl` (open redirect, prototype pollution) | **Yes** | In active use — `next.config.mjs` wires `createNextIntlPlugin`. Open redirect on a login flow is a phishing primitive. |
| HIGH | `postcss`, `js-yaml`, `brace-expansion`, `fast-uri` | Build-time | Toolchain, not shipped runtime. Real urgency well below the label. |
| CRITICAL | `vitest` | **No** — dev | Same reasoning as the backend. Not urgent. |
| HIGH | `vite`, MODERATE `esbuild` | **No** — dev server | `esbuild` "any website can send requests to the dev server" needs a running dev server. Not a production exposure. |
| HIGH | `lodash` (`_.template` code injection) | Depends | Only exploitable if `_.template` is called on attacker input — worth confirming rather than assuming. |

The `next` findings are the ones that carry actual user risk. Most of the rest
of the count is build tooling inflating the total.

### Lockfile state — `frontend/` carries two lockfiles

`frontend/package-lock.json` (503 KB) sits alongside `frontend/pnpm-lock.yaml`
(360 KB). CI installs with `pnpm install --frozen-lockfile`, so
**`pnpm-lock.yaml` is what ships** and `package-lock.json` describes a tree that
is never built.

This is an auditing hazard specifically: `npm audit` in `frontend/` reads
`package-lock.json` and reports on the wrong tree — findings that do not apply,
and worse, silence about ones that do. Anyone auditing this workspace must use
`pnpm audit`.

Recommend deleting `frontend/package-lock.json`. Not done here — it is a
lockfile change and belongs in its own PR where a full install and build can be
verified against it. (Note the repository root also has both a
`package-lock.json` and a `pnpm-lock.yaml`; same question, separate scope.)

---

## Existing tooling — `security-scan/`

`security-scan/` already exists with a scanner/orchestrator/aggregator
structure. Anything durable from this audit should extend that rather than
duplicate it, so results land in the same report pipeline. This document is a
point-in-time snapshot, not a replacement for it.

---

## Why nothing was upgraded here

Every remediation available in the two Node workspaces is either a
`next` major-line move, an `npm audit fix --force` that resolves outside a
dependency's stated range (`ws` under `ethers`), or a transitive bump under
`soroban-sdk`.

Per the issue's own guidance — a dependency upgrade that silently changes
behaviour in a payment path is worse than the advisory it resolved. `next`
`16.0.x → 16.2.5` touches middleware, Server Actions and caching in an app whose
auth and wallet flows depend on exactly those. `ws` under `ethers` outside its
stated range touches RPC connectivity.

These are maintainer calls, not contributor calls. Recommended order if the
maintainers want them taken:

1. **`next` → `>= 16.2.5`** — clears ~30 advisories including the middleware
   bypasses. Highest value, needs a full manual pass over auth and wallet flows.
2. **`multer`** — request-path DoS, small and self-contained.
3. **`express` / `express-rate-limit`** — patch-level, low risk.
4. **`ws` / `ethers`** — needs `--force`; verify RPC connectivity after.
5. **Dev tooling** (`vitest`, `vite`, `@redocly/cli`) — no production exposure;
   batch whenever convenient.

### Residual risk if nothing is done

- Frontend: middleware/proxy bypass and Server Action SSRF remain live against
  an app handling wallet interaction and auth tokens. **This is the largest
  single item in this report.**
- Backend: unauthenticated upload DoS via `multer`; memory disclosure via `ws`
  on outbound RPC websockets.
- Contracts: none. The deployed WASM is unaffected by all six warnings.
