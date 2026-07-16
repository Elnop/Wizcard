# Error Tracking — Design

**Date:** 2026-07-16
**Status:** Approved (brainstorming) — pending implementation plan
**Scope:** Client + server error/exception tracking for Wizcard via PostHog Error Tracking, integrated into the existing vendor-decoupled analytics layer (`src/lib/analytics/`).
**Depends on:** the analytics feature (branch `feat/analytics-observability`) — this extends the same `AnalyticsClient` port and adapters.

## Goal

Capture and surface application errors — unhandled client exceptions, React render errors, and server-side errors — in PostHog Error Tracking, without breaking the vendor-decoupling constraint (PostHog swappable by rewriting only `src/lib/analytics/providers/`).

## Decisions (from brainstorming)

| Topic            | Decision                                                                                                                                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Coverage         | **Complete**: client (autocapture + React error boundaries) **and** server (`onRequestError`)                                                                                                                                                                |
| Server identity  | **Anonymous server errors.** Do NOT read the PostHog cookie or the Supabase user. Capture with a generic `distinctId` (e.g. `'server'`). Consistent with "anonymous until consent"; we still see 100% of server errors, only the error↔user link is dropped. |
| Error content    | **Standard**: capture `error.message` + stack trace as-is (PostHog default). Most useful for debugging. Documented rule: developers must not put PII in error messages.                                                                                      |
| React boundaries | **Root + global + per-domain**, but via ONE shared `AppErrorBoundary` component (DRY). Start with the 4 main domains (`decks`, `collection`, `search`, `wishlist`); other routes fall back to the root boundary.                                             |

## Architecture — extend the existing port

The `AnalyticsClient` interface gains one method. No file outside `src/lib/analytics/providers/` imports a PostHog SDK (the existing ESLint `no-restricted-imports` boundary continues to hold).

### `analytics-client.ts` — port addition

```ts
export interface AnalyticsClient {
	track<E extends AnalyticsEvent>(event: E): void;
	page(url: string): void;
	identify(userId: string, traits?: Record<string, string | number | boolean>): void;
	reset(): void;
	setConsent(granted: boolean): void;
	captureException(error: Error, context?: Record<string, unknown>): void; // NEW
}
```

`captureException` is vendor-neutral — a future Sentry adapter would implement it with `Sentry.captureException`. The decoupling holds.

### Adapter implementations

- **`posthog-client.ts`**: `captureException: (error, context) => safe(() => posthog.captureException(error, undefined, context))` — wrapped in the existing `safe()` helper (never throws).
- **`noop-client.ts`**: `captureException: () => {}`.
- **`initPosthog()`**: add `capture_exceptions: true` to the `posthog.init(...)` config → enables **client-side autocapture of unhandled exceptions** (the bulk of coverage, near-free).

### Server capture — `track-server.ts`

Add a sibling to `trackServer`:

```ts
export async function captureServerException(error: Error): Promise<void> {
	const client = createServerClient();
	if (!client) return;
	try {
		client.captureException(error, 'server');
		await client.shutdown();
	} catch (e) {
		if (process.env.NODE_ENV === 'development') {
			console.debug('[analytics] server captureException failed', e);
		}
	}
}
```

`createServerClient()` (posthog-node) already exists and returns `null` when no key is set → no-op. `'server'` is the generic anonymous distinctId (decision: no cookie/user read).

## React Error Boundaries (client)

One shared component; each `error.tsx` is a 3-line delegation.

### Shared component — `src/lib/analytics/components/AppErrorBoundary/AppErrorBoundary.tsx` (+ `.module.css`)

```tsx
'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/Button/Button';
import { useAnalytics } from '../../context/AnalyticsContext';
import styles from './AppErrorBoundary.module.css';

export function AppErrorBoundary({
	error,
	reset,
	scope,
}: {
	error: Error & { digest?: string };
	reset: () => void;
	scope?: string;
}) {
	const analytics = useAnalytics();
	const t = useTranslations('error');

	useEffect(() => {
		analytics.captureException(error, { scope, digest: error.digest });
	}, [error, analytics, scope]);

	return (
		<div className={styles.wrap} role="alert">
			<h2 className={styles.title}>{t('title')}</h2>
			<p className={styles.message}>{t('description')}</p>
			<Button variant="primary" onClick={reset}>
				{t('retry')}
			</Button>
		</div>
	);
}
```

### Boundary files

| File                                    | Role                                                                                                                                                                                                          | scope          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `src/app/[locale]/error.tsx`            | Root of locale segment — catches render errors from all pages                                                                                                                                                 | `"app"`        |
| `src/app/global-error.tsx`              | Ultimate net — catches errors in the root layout itself. Must render its own `<html><body>` + `NextError`. Uses `getAnalytics()` singleton (it is OUTSIDE our providers, so `useAnalytics()` is unavailable). | —              |
| `src/app/[locale]/decks/error.tsx`      | Per-domain                                                                                                                                                                                                    | `"decks"`      |
| `src/app/[locale]/collection/error.tsx` | Per-domain                                                                                                                                                                                                    | `"collection"` |
| `src/app/[locale]/search/error.tsx`     | Per-domain                                                                                                                                                                                                    | `"search"`     |
| `src/app/[locale]/wishlist/error.tsx`   | Per-domain                                                                                                                                                                                                    | `"wishlist"`   |

Each per-domain / root `error.tsx`:

```tsx
'use client';
import { AppErrorBoundary } from '@/lib/analytics/components/AppErrorBoundary/AppErrorBoundary';
export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
	return <AppErrorBoundary {...props} scope="decks" />;
}
```

`global-error.tsx` is special (cannot use hooks/providers):

```tsx
'use client';
import { useEffect } from 'react';
import NextError from 'next/error';
import { getAnalytics } from '@/lib/analytics/context/AnalyticsContext';
export default function GlobalError({
	error,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		getAnalytics().captureException(error, { scope: 'global', digest: error.digest });
	}, [error]);
	return (
		<html>
			<body>
				<NextError statusCode={0} />
			</body>
		</html>
	);
}
```

## Server capture — `src/instrumentation.ts` (new root file)

Next.js auto-loads `instrumentation.ts`. This is distinct from `proxy.ts` (the Next 16 middleware) and keeps the `instrumentation` name.

```ts
import type { Instrumentation } from 'next';

export const onRequestError: Instrumentation.onRequestError = async (err) => {
	if (process.env.NEXT_RUNTIME === 'nodejs') {
		const { captureServerException } = await import('@/lib/analytics/server/track-server');
		await captureServerException(err instanceof Error ? err : new Error(String(err)));
	}
};
```

- Dynamic import (standard `instrumentation.ts` practice — avoids loading posthog-node in the edge runtime).
- `next.config.ts`: verify whether an `instrumentationHook` experimental flag is needed (it was required pre-Next-15, then stabilized). Confirm at implementation; add only if the build requires it.

## i18n

Add an `error` message group to `messages/en.json` and `messages/fr.json`: `title`, `description`, `retry`. Note: `src/lib/analytics/**` is not in the i18next-enforced ESLint globs, so `no-literal-string` is not enforced there — the component still uses `t()` by design.

## Files Touched (summary)

**New:**

- `src/lib/analytics/components/AppErrorBoundary/AppErrorBoundary.tsx` + `.module.css`
- `src/app/[locale]/error.tsx`
- `src/app/global-error.tsx`
- `src/app/[locale]/{decks,collection,search,wishlist}/error.tsx` (4 files)
- `src/instrumentation.ts`
- `error` i18n keys in `messages/{en,fr}.json`

**Modified:**

- `src/lib/analytics/analytics-client.ts` — add `captureException` to the port
- `src/lib/analytics/providers/posthog-client.ts` — implement `captureException` + `capture_exceptions: true` in init
- `src/lib/analytics/providers/noop-client.ts` — no-op `captureException`
- `src/lib/analytics/server/track-server.ts` — add `captureServerException`
- `next.config.ts` — only if an instrumentation flag is required

## Verification

No test framework (`project_no_test_framework`); verify via `npm run check` + runtime.

- `npm run check` (tsc + eslint) — `no-restricted-imports` stays green (no posthog import outside `providers/`). Gate on "no NEW problems" (baseline is red — `project_check_red_baseline`).
- **PostHog toggle**: enable "Enable exception autocapture" in Settings → Error tracking (else client autocapture does not surface).
- **Runtime client**: dev server, trigger a render error (a component that throws) → see the error UI + the exception in PostHog → Error tracking.
- **Runtime server**: throw in a Server Action / route handler → see the server exception surface (anonymous distinctId `server`).

## Non-Goals (YAGNI)

- No per-domain boundaries beyond the 4 main routes at launch (trivially extendable later).
- No `beforeSend` PII scrubbing (Standard content decision) — documented developer rule instead.
- No source map upload in this iteration (stack traces resolve to bundled code; can add later).
- No cookie/Supabase-user linkage for server errors (anonymous by decision).
