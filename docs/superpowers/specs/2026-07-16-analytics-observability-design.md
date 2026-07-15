# Analytics & Observability — Design

**Date:** 2026-07-16
**Status:** Approved (brainstorming) — pending implementation plan
**Scope:** Product & web analytics for Wizcard via a vendor-decoupled adapter layer, with PostHog Cloud (EU) as the initial provider.

## Goal

Give the maintainer a complete view of site usage — pageviews, product events across every domain (collection, decks, import, wishlist, search, auth), funnels, retention, session replay (later), and application error tracking — through a single analytics dashboard, at **zero cost** on the current stack.

**Hard constraint:** PostHog must be replaceable by rewriting a single, well-bounded set of files. No application code outside the analytics module may import a PostHog SDK. This is the primary design driver.

## Non-Goals (YAGNI)

- **No multi-provider registry.** Only one provider exists; a plugin/registry abstraction is dead weight until a real migration happens. The decoupling is achieved by a typed port + an ESLint import boundary, not by runtime provider selection.
- **No coupling to the app's sync queue.** PostHog queues offline events and retries on reconnect natively; we build nothing.
- **No server-side infra for logs.** Supabase infra logs (Postgres/GoTrue/PostgREST) are consulted separately via Coolify on demand — explicitly out of scope for the analytics dashboard (they are a different data nature; PostHog does not ingest infra logs).
- **Session replay is wired but disabled at launch** (CSP prepared to support it; enable later to preserve quota).
- **No feature flags / A-B testing** in this iteration (SDK supports it later without refactor).

## Decisions (from brainstorming)

| Topic            | Decision                                                                                                                                                                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider         | PostHog Cloud, **EU region**, reverse-proxied through Next.js rewrites                                                                                                                                                                             |
| Consent          | **Anonymous-in-memory until consent**, then persistent. `unknown` → `persistence: 'memory'` (aggregate anonymous data, new ephemeral `distinct_id` per reload); `granted` → `localStorage+cookie`; `denied` → stays in memory (not a full opt-out) |
| Client vs server | **Both.** `posthog-js` (browser) + `posthog-node` (server), same typed `track()` contract, both confined to the analytics module                                                                                                                   |
| Events           | **Exhaustive typed catalogue** across all 4 domains + PostHog **autocapture** as a safety net                                                                                                                                                      |
| Offline          | **Handled by PostHog natively** (queue + retry/backoff)                                                                                                                                                                                            |
| Architecture     | **Approach A** — typed port (`AnalyticsClient` interface) + single PostHog adapter, boundary enforced by ESLint `no-restricted-imports`                                                                                                            |
| No token         | Falls back to **noop-client** (dev/tests silent, no network, no config required)                                                                                                                                                                   |

## Architecture — Approach A (Ports & Adapters)

The `src/lib/analytics/` module is the **only** place aware of PostHog. It follows `AGENTS.md` rules (feature > sub-feature > resource; no barrel exports; a folder only when ≥2 files of a kind).

```
src/lib/analytics/
├── analytics-events.ts          # Typed event catalogue (discriminated union). ZERO PostHog import.
├── analytics-client.ts          # AnalyticsClient interface (the "port"). ZERO PostHog import.
├── providers/
│   ├── posthog-client.ts        # Browser adapter — SOLE import of posthog-js
│   ├── posthog-server.ts        # Server adapter — SOLE import of posthog-node
│   └── noop-client.ts           # No-op adapter (key absent / dev / tests). ZERO deps.
├── context/
│   └── AnalyticsContext.tsx     # React provider: exposes useAnalytics(); wires consent + auth sync; exports getAnalytics() singleton
├── components/
│   ├── AnalyticsPageView.tsx    # App Router pageview capture (usePathname/useSearchParams in <Suspense>)
│   └── ConsentBanner/           # Cookie consent banner (≥2 files → folder): ConsentBanner.tsx + .module.css
├── hooks/
│   └── useAnalytics.ts          # Typed access to track()/identify() from components
├── server/
│   └── track-server.ts          # trackServer(event, distinctId) for Server Actions / route handlers
└── consent/
    └── consent-store.ts         # Consent state persisted in localStorage; SSR-safe read
```

### The decoupling boundary (mechanically enforced)

An ESLint `no-restricted-imports` rule forbids importing `posthog-js` and `posthog-node` **everywhere except** `src/lib/analytics/providers/`. If any other file imports a PostHog SDK, `npm run check` fails. This is what turns "good principle" into a verified invariant — and is the single most important test for this feature (no test framework exists in this repo; see `project_no_test_framework`).

**Replacing PostHog** = rewrite `providers/posthog-client.ts` + `providers/posthog-server.ts`. The event catalogue, the interface, all calling code, the provider, and the consent banner remain untouched.

## The Typed Contract

### `analytics-events.ts`

Discriminated union, one entry per business action. **No PII in props** — IDs and categories only, never email/name/`purchase_price` (the latter is already RLS-protected from `anon`; analytics must not reopen that door).

```ts
export type AnalyticsEvent =
	// Collection
	| {
			name: 'card_added';
			props: { scryfallId: string; isFoil: boolean; source: 'search' | 'import' | 'manual' };
	  }
	| { name: 'card_removed'; props: { scryfallId: string } }
	| { name: 'card_edited'; props: { rowId: string; fields: string[] } }
	| { name: 'print_changed'; props: { oracleId: string } }
	| { name: 'collection_cleared'; props: { count: number } }
	// Decks
	| { name: 'deck_created'; props: { deckId: string } }
	| { name: 'deck_deleted'; props: { deckId: string } }
	| { name: 'card_added_to_deck'; props: { deckId: string; scryfallId: string } }
	| { name: 'deck_exported'; props: { deckId: string; format: 'pdf' } }
	| { name: 'sample_hand_drawn'; props: { deckId: string } }
	| { name: 'deck_stats_viewed'; props: { deckId: string } }
	// Import / Wishlist
	| { name: 'import_started'; props: { format: string } }
	| { name: 'import_completed'; props: { format: string; cardCount: number } }
	| { name: 'import_failed'; props: { format: string; reason: string } }
	| { name: 'wishlist_toggled'; props: { scryfallId: string; added: boolean } }
	| { name: 'wishlist_moved_to_collection'; props: { scryfallId: string } }
	// Search / Auth / Nav
	| { name: 'search_performed'; props: { hasFilters: boolean } }
	| { name: 'filter_applied'; props: { filterType: string } }
	| { name: 'signup'; props: { method: 'email' } }
	| { name: 'login'; props: { method: 'email' } }
	| { name: 'profile_viewed'; props: { isOwnProfile: boolean } };

export type EventName = AnalyticsEvent['name'];
```

The catalogue above is the launch set; it is intended to be exhaustive across the four domains and extended by adding a union member (which the compiler then requires callers to satisfy).

### `analytics-client.ts` — the port

```ts
export interface AnalyticsClient {
	track<E extends AnalyticsEvent>(event: E): void;
	identify(userId: string, traits?: Record<string, string | number | boolean>): void;
	reset(): void; // on logout
	setConsent(granted: boolean): void; // toggle memory ↔ persistent
}
```

**Two invariants of every adapter:**

1. **`track()` never throws.** Analytics is non-critical; a blocked/down provider must not break the app. Adapters wrap everything in a silent try/catch (`console.debug` in dev only).
2. **Object form `track({ name, props })`** (not `track(name, props)`) so the discriminated union types `props` against `name`.

## Data Flow & Lifecycle

### Client init — `instrumentation-client.ts` (repo root under `src/`, Next.js 16 auto-loads it)

Delegates to the adapter (does **not** import PostHog directly, to preserve the ESLint boundary):

```
posthog.init(token, {
  api_host: '/relay-xY7',              // reverse proxy (see Infra)
  ui_host: 'https://eu.posthog.com',
  persistence: 'memory',                // ANONYMOUS by default
  person_profiles: 'identified_only',   // no person profile until identify()
  capture_pageview: false,              // handled manually (App Router)
  defaults: '2026-05-30',
})
```

If `NEXT_PUBLIC_POSTHOG_KEY` is absent, init is a no-op and `useAnalytics()` returns the **noop-client** — dev/tests make zero network calls with no config.

### Event flow

```
Component / store
  └─ track({ name: 'deck_created', props: { deckId } })
       └─ active client (posthog | noop)
            └─ adapter.track() → try { posthog.capture('deck_created', props) } catch {}
```

Callers depend only on the local `useAnalytics()` / `getAnalytics()` contract — never on PostHog.

### Auth lifecycle (wired to existing `AuthContext`)

| Auth transition | Analytics action    |
| --------------- | ------------------- |
| `SIGNED_IN`     | `identify(user.id)` |
| `SIGNED_OUT`    | `reset()`           |

Implemented by an internal hook `useAnalyticsAuthSync()` mounted **inside** the auth tree, observing `useAuth()`. The `AnalyticsProvider` itself sits **above `AuthProvider`** (it depends on nothing). This respects the load-bearing provider order and the `AGENTS.md` rule: **do not insert a provider between `SyncQueueRunner` and `CollectionProvider`**.

### Server flow (Server Actions / route handlers)

```
await trackServer({ name: 'signup', props: { method: 'email' } }, userId)
  └─ new PostHog(token, { flushAt: 1, flushInterval: 0 })
       capture({ distinctId: userId, event, properties })
       await posthog.shutdown()   // flush immediately (ephemeral server functions)
```

Server-side has no browser-consent notion (no cookie); it only emits explicit server events the maintainer triggers, so no passive-tracking GDPR concern.

## Consent & Anonymous Phase

### `consent-store.ts`

```ts
type ConsentState = 'unknown' | 'granted' | 'denied';
// localStorage key: 'wizcard-analytics-consent'  (matches existing wizcard-* keys)
```

- SSR-safe: returns `'unknown'` on the server; reads `localStorage` on client mount.
- `'unknown'` → PostHog stays in `persistence: 'memory'` (init default).
- `'granted'` → `setConsent(true)` → `posthog.set_config({ persistence: 'localStorage+cookie' })`.
- `'denied'` → stays in `memory` (keeps aggregate anonymous data; not a full opt-out, per decision).

**Consequence of memory phase:** each page reload yields a new ephemeral `distinct_id`. Before consent you get **aggregate, anonymous** pageviews and actions (how many decks created, which pages viewed) but **no individual journey** or retention. This is the intended compromise.

### `ConsentBanner/`

- Renders only when `consent === 'unknown'`.
- Two actions: "Accept" (`granted`) / "Refuse" (`denied`).
- i18n via `next-intl` (keys in existing message files).
- CSS Module, glassmorphism consistent with the `Modal` design system.
- Placed under `AnalyticsProvider` so it is visible on all pages.

### Sequence

```
1. Load          → init memory (anonymous)          → banner ('unknown') visible
2a. Accept       → setConsent(true) → persistent     → banner hidden
2b. Refuse       → setConsent(false) → stays memory  → banner hidden
3. Login (later) → identify(user.id)
```

**Legal note (in scope for architecture, not adjudication):** `memory` mode without a cookie is _generally_ outside strict cookie-consent scope, but PostHog "anonymous" is not legally absolute anonymity (the IP transits). Final compliance (privacy policy, legal notice) remains a product responsibility; the architecture is built to support it.

## Infra — Reverse Proxy, CSP, Config

### Reverse proxy (rewrites in `next.config.ts`, inside the `withNextIntl`-wrapped object)

Non-obvious path to evade ad-blockers (not `/analytics`, `/posthog`, `/tracking`):

```ts
async rewrites() {
  return [
    { source: '/relay-xY7/static/:path*', destination: 'https://eu-assets.i.posthog.com/static/:path*' },
    { source: '/relay-xY7/:path*',        destination: 'https://eu.i.posthog.com/:path*' },
  ];
},
skipTrailingSlashRedirect: true,   // else Next breaks PostHog endpoints like /e/
```

### `next-intl` matcher interaction (a real pitfall in this repo)

`src/proxy.ts` runs `next-intl` first, which prefixes paths with a locale. `/relay-xY7` **must not** be locale-prefixed (else `/fr/relay-xY7` → 404). Add `relay-xY7` to the `proxy.ts` matcher exclusion — exactly as `wasm` had to be excluded for sql.js. Documented here so the plan doesn't miss it.

### CSP

Current `Content-Security-Policy-Report-Only` has `connect-src 'self' <supabase> https://api.scryfall.com`. Because all PostHog traffic transits through `/relay-xY7` (same origin), `connect-src 'self'` **already covers events** — no `connect-src` change needed. Adjustments:

- Add `worker-src 'self' blob:` (PostHog uses a web worker for the recorder).
- `blob:` is already present in `img-src`; verify remaining directives when session replay is later enabled.

CSP stays **Report-Only** at launch (per decision) — observe violations before enforcing, zero risk of breakage in prod.

### Environment variables (`.env`)

```
NEXT_PUBLIC_POSTHOG_KEY=phc_xxx          # project token (public, client-safe)
NEXT_PUBLIC_POSTHOG_HOST=/relay-xY7      # relative proxy path
POSTHOG_SERVER_KEY=phc_xxx               # same token, server-side use
```

Absent `NEXT_PUBLIC_POSTHOG_KEY` → noop-client (silent dev/tests).

## Event Instrumentation

### Two layers

1. **Explicit business events** (the typed catalogue) — placed at the mutation point closest to business logic (store/hook), **not** in UI components, so one action = one emission (no double-fire from two buttons). Examples:
   - `card_added` → in the `collection-store` add flow.
   - `deck_created` → in the `deck-store`.
   - `import_completed` → in the import hook at resolution.
   - `search_performed` → debounced in the search hook.
2. **PostHog autocapture** (safety net) — generic clicks/forms + `$pageview` for anything not explicitly named. Covers the "track everything" goal without hand-instrumenting every button.

### Zustand stores are outside React

`collection-store` / `deck-store` cannot call `useAnalytics()` (a hook). **Decision:** `AnalyticsContext` exports a `getAnalytics()` **singleton** returning the active client (posthog or noop) for non-React access. Stores call `getAnalytics().track(...)`. This keeps instrumentation inside the boundary and out of the UI, and is the only clean way to track at the store level.

## Verification

No test framework exists (`project_no_test_framework`); verify via `npm run check` + runtime.

- **`npm run check`** (tsc + eslint + prettier). The **ESLint `no-restricted-imports` rule is the key test** — it mechanically proves the decoupling.
- Gate on **"no NEW problems"** via `npx eslint` on changed files — the baseline `npm run check` is red (~60 pre-existing problems; `project_check_red_baseline`).
- Runtime: dev server + PostHog **Activity / Live events** view → events arrive live.
- Consent: DevTools → Application → localStorage (`wizcard-analytics-consent`) + Network (no PostHog cookie before "Accept").
- Noop: run without `NEXT_PUBLIC_POSTHOG_KEY` → zero network calls.

## Files Touched (summary)

**New:**

- `src/lib/analytics/**` (module above)
- `src/instrumentation-client.ts`
- Consent banner i18n message keys

**Modified:**

- `next.config.ts` — rewrites + `skipTrailingSlashRedirect` + CSP `worker-src`
- `src/proxy.ts` — matcher exclusion for `relay-xY7`
- `src/contexts/Providers.tsx` — mount `AnalyticsProvider` (above `AuthProvider`) + `useAnalyticsAuthSync` inside the auth tree + `ConsentBanner` + `AnalyticsPageView`
- `src/lib/collection/store/collection-store.ts`, `src/lib/deck/store/*`, import/search/wishlist hooks — `getAnalytics().track(...)` at mutation points
- `eslint` config — `no-restricted-imports` boundary rule
- `.env` / `.env.example` — PostHog vars

## Open Item for Implementation Plan

- Confirm the final autocapture masking config before enabling session replay (out of launch scope but CSP-prepared).
