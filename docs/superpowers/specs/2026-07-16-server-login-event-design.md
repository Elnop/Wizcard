# Server-Side Login Event — Design

**Date:** 2026-07-16
**Status:** Approved (brainstorming) — pending implementation plan
**Scope:** Emit the `login` analytics event when a user authenticates via the server-side callback (magic link / PKCE / OTP token_hash), not only via the client OTP form.
**Depends on:** the analytics feature (branch `feat/analytics-observability`) — extends `trackServer` and the existing event catalogue.

## Problem

The `login` event is only emitted by the client OTP path (`verifyEmailOtpClient` in `src/lib/supabase/auth/auth-client.ts`, called from `LoginForm.tsx`). Users who authenticate via the **magic link** land on `src/app/[locale]/auth/confirm/route.ts` (server), which verifies the session via `exchangeCodeForSession` (PKCE) or `verifyEmailOtp` (token_hash) and emits nothing. Result: those logins never reach PostHog, and the activation funnel's `login` step under-counts.

## Decisions (from brainstorming)

| Topic                              | Decision                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How to emit server-side            | Via the existing `trackServer` helper (its intended use).                                                                                                                                                                                                                                                                                      |
| Identity linkage                   | Read the browser's PostHog `distinct_id` from the request cookie so PostHog can later merge the login into the user's identity (via the client's consent-gated `identify()`). This satisfies the rule "server events tied to a known user identify that user" — through the existing identify mechanism, WITHOUT the server bypassing consent. |
| No cookie (user not yet consented) | **Emit with a temporary anonymous distinctId** (`crypto.randomUUID()`). The funnel still counts the login; these events are "orphan" (never linked to a user). Data-first choice.                                                                                                                                                              |
| Client OTP path                    | Unchanged — `verifyEmailOtpClient` already emits `login`. Both paths will now emit.                                                                                                                                                                                                                                                            |

### Why this respects consent

- **Consented user** (PostHog cookie present): the server `login` carries the browser `distinct_id`. When the client next runs `identify(user.id)` (consent-gated, in `useAnalyticsAuthSync`), PostHog merges the anonymous history — including this login — into the account. The server never identifies anyone directly.
- **Non-consented user** (no cookie): server emits `login` with a throwaway anonymous id. Counted in the funnel, never linked. No identity leak.

## Changes

### 1. `trackServer` — optional distinctId with anonymous fallback

`src/lib/analytics/server/track-server.ts`. Current signature:

```ts
export async function trackServer(event: AnalyticsEvent, distinctId: string): Promise<void>;
```

New signature (backward-compatible — the existing single caller passes a string):

```ts
export async function trackServer(event: AnalyticsEvent, distinctId?: string): Promise<void>;
```

Body: if `distinctId` is undefined, generate `crypto.randomUUID()` as the distinctId. Everything else (null-guard, capture, shutdown, never-throws) is unchanged.

### 2. `getPosthogDistinctId(request)` helper

New function in `src/lib/analytics/server/track-server.ts` (same file — it is a small server-only helper, keeps the analytics server surface together; no barrel).

```ts
// Extracts the PostHog browser distinct_id from the request cookie, so a
// server-emitted event can be attributed to the same person the browser is.
// Returns undefined when no PostHog cookie exists (user hasn't consented →
// PostHog is in-memory, no cookie). The cookie name is `ph_phc_<token>_posthog`
// and its value is URL-encoded JSON containing `distinct_id`.
export function getPosthogDistinctId(cookieHeader: string | null): string | undefined;
```

- Input is the raw `Cookie` header string (from `request.headers.get('cookie')`), keeping the helper pure/testable and framework-light.
- Match `ph_phc_..._posthog=<value>`; `decodeURIComponent` the value; `JSON.parse`; return `parsed.distinct_id` if a non-empty string.
- Any failure (no match, parse error) → return `undefined`. Never throws.

### 3. Emit `login` in the confirm route

`src/app/[locale]/auth/confirm/route.ts`. On BOTH success branches (PKCE `code` and OTP `token_hash`), before the redirect:

```ts
await trackServer(
	{ name: 'login', props: { method: 'email' } },
	getPosthogDistinctId(request.headers.get('cookie'))
);
```

- `getPosthogDistinctId` returns the browser id if the cookie is present, else `undefined` → `trackServer` falls back to a temporary anonymous id (decision).
- The route already `await`s server calls; adding one `await` before each redirect is fine.

## Files Touched

**Modified:**

- `src/lib/analytics/server/track-server.ts` — optional distinctId + `getPosthogDistinctId` helper.
- `src/app/[locale]/auth/confirm/route.ts` — emit `login` on both success paths.

**Unchanged (intentionally):**

- `src/lib/supabase/auth/auth-client.ts` — client OTP login emission stays.

## Verification

No test framework (`project_no_test_framework`); verify via `npm run check` + runtime.

- `npm run check` (tsc + eslint) — `no-restricted-imports` stays green (the route uses `trackServer`/`getPosthogDistinctId`, never posthog directly). Gate on "no NEW problems" (`project_check_red_baseline`).
- **Runtime**: log in via the **magic link** (click the email link, not the OTP code) → confirm a `login` event arrives in PostHog → Activity, and the activation funnel's login step increments. Also re-confirm the client OTP path still emits (no regression).

## Non-Goals (YAGNI)

- No `signup` distinction (still deferred — OTP/PKCE can't reliably detect new-user here).
- No change to the server-error anonymity decision (errors stay `'server'`; this is only about the `login` event).
- No cookie-based consent gating on the server (the consent gate remains client-side via `identify()`; the server emits anonymously and lets the client link).
