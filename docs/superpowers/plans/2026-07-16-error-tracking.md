# Error Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add client + server error/exception tracking to Wizcard via PostHog Error Tracking, integrated into the existing decoupled analytics layer.

**Architecture:** Extend the `AnalyticsClient` port with `captureException`; implement in all adapters. Enable client autocapture via an init flag. Add a shared `AppErrorBoundary` reused by root/global/per-domain `error.tsx` files. Add `src/instrumentation.ts` with `onRequestError` for server errors (anonymous distinctId). No PostHog import outside `src/lib/analytics/providers/`.

**Tech Stack:** Next.js 16.2.9 (App Router, `instrumentation.ts`, `error.tsx`/`global-error.tsx`), TypeScript strict, `posthog-js`, `posthog-node`, `next-intl` (messages at `messages/{en,fr}.json`), CSS Modules.

## Global Constraints

- **No PostHog SDK import outside `src/lib/analytics/providers/`** — enforced by ESLint `no-restricted-imports`. `error.tsx`/`global-error.tsx`/`instrumentation.ts` must go through the port (`useAnalytics()` / `getAnalytics()` / `captureServerException`), never `import posthog`.
- **`captureException` never throws** — client adapter wraps in the existing `safe()` helper; server helper wraps in try/catch (silent, `console.debug` in dev only).
- **Server errors are anonymous** — distinctId `'server'`; do NOT read the PostHog cookie or Supabase user.
- **Exact verified SDK signatures (do not deviate):**
  - `posthog-js`: `captureException(error: unknown, additionalProperties?: Properties): CaptureResult | undefined` — **2 args** (error, context). NOT 3.
  - `posthog-node`: `captureException(error: unknown, distinctId?: string, additionalProperties?: Record<string|number, any>, uuid?): void`.
  - Init flag for client autocapture: `capture_exceptions: true`.
- **No test framework** (`project_no_test_framework`) — verify via `npm run check` + runtime. Gate on "no NEW problems" (`project_check_red_baseline`), not a green baseline.
- **Code style:** tabs (width 2), single quotes, trailing commas es5. No barrel `index.ts`. Folder only when ≥2 files of a kind.
- **`src/lib/analytics/**` is NOT in the i18next-enforced ESLint globs** — `no-literal-string` is off there, but components still use `t()` by design.

---

### Task 1: Extend the port + client & noop adapters + autocapture flag

**Files:**

- Modify: `src/lib/analytics/analytics-client.ts`
- Modify: `src/lib/analytics/providers/posthog-client.ts`
- Modify: `src/lib/analytics/providers/noop-client.ts`

**Interfaces:**

- Consumes: existing `AnalyticsClient`, `safe()` helper in posthog-client.ts
- Produces: `AnalyticsClient.captureException(error: Error, context?: Record<string, unknown>): void` implemented in both adapters; client autocapture enabled

- [ ] **Step 1: Add `captureException` to the port**

In `src/lib/analytics/analytics-client.ts`, add to the `AnalyticsClient` interface (after the `setConsent` line):

```ts
	captureException(error: Error, context?: Record<string, unknown>): void;
```

- [ ] **Step 2: Implement in the noop adapter**

In `src/lib/analytics/providers/noop-client.ts`, add to the returned object:

```ts
		captureException: () => {},
```

- [ ] **Step 3: Implement in the PostHog client adapter + enable autocapture**

In `src/lib/analytics/providers/posthog-client.ts`:

(a) Add `capture_exceptions: true` to the `posthog.init(...)` config object inside `initPosthog()` (add it alongside the other options, e.g. after `defaults: '2026-05-30',`):

```ts
			capture_exceptions: true,
```

(b) Add to the object returned by `createPosthogClient()`:

```ts
		captureException: (error, context) => safe(() => posthog.captureException(error, context)),
```

(Note: posthog-js `captureException` takes exactly 2 args — `(error, additionalProperties)`. Pass `context` as the 2nd arg. Do NOT pass a 3rd argument.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors referencing `src/lib/analytics/`. If `capture_exceptions` is rejected by the installed posthog-js types, verify the exact option name via `grep -rn "capture_exceptions" node_modules/posthog-js/dist/module.d.ts` and use the confirmed name; do not remove autocapture silently.

- [ ] **Step 5: Lint (boundary must stay green)**

Run: `npx eslint src/lib/analytics/`
Expected: clean; NO `no-restricted-imports` error (posthog still only in providers/).

- [ ] **Step 6: Commit**

```bash
git add src/lib/analytics/analytics-client.ts src/lib/analytics/providers/posthog-client.ts src/lib/analytics/providers/noop-client.ts
git commit -m "feat(analytics): add captureException to port + client autocapture"
```

---

### Task 2: Server exception capture

**Files:**

- Modify: `src/lib/analytics/server/track-server.ts`

**Interfaces:**

- Consumes: `createServerClient()` from `../providers/posthog-server` (posthog-node client or null)
- Produces: `captureServerException(error: Error): Promise<void>`

- [ ] **Step 1: Add `captureServerException`**

In `src/lib/analytics/server/track-server.ts`, add a new exported function below `trackServer` (keep the existing import of `createServerClient`):

```ts
// Capture a server-side exception (Server Actions, route handlers, RSC render).
// Anonymous distinctId 'server' — we do NOT read the PostHog cookie or Supabase
// user (consistent with anonymous-until-consent). Never throws.
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

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors. (`posthog-node`'s `captureException(error, distinctId?, ...)` accepts `(error, 'server')`.)

- [ ] **Step 3: Lint**

Run: `npx eslint src/lib/analytics/server/track-server.ts`
Expected: clean, no restricted-import error.

- [ ] **Step 4: Commit**

```bash
git add src/lib/analytics/server/track-server.ts
git commit -m "feat(analytics): add captureServerException (anonymous server errors)"
```

---

### Task 3: instrumentation.ts (onRequestError)

**Files:**

- Create: `src/instrumentation.ts`
- Modify: `next.config.ts` (only if the build requires an instrumentation flag — verify)

**Interfaces:**

- Consumes: `captureServerException` (Task 2) via dynamic import
- Produces: server errors routed to PostHog

- [ ] **Step 1: Create `src/instrumentation.ts`**

```ts
import type { Instrumentation } from 'next';

// Next.js auto-loads this. onRequestError fires for uncaught server errors
// (Server Actions, route handlers, RSC render). Dynamic import keeps posthog-node
// out of the edge runtime. Distinct from proxy.ts (the Next 16 middleware).
export const onRequestError: Instrumentation.onRequestError = async (err) => {
	if (process.env.NEXT_RUNTIME === 'nodejs') {
		const { captureServerException } = await import('@/lib/analytics/server/track-server');
		await captureServerException(err instanceof Error ? err : new Error(String(err)));
	}
};
```

- [ ] **Step 2: Verify build picks up instrumentation (and whether a flag is needed)**

Run:

```bash
npx tsc --noEmit && npm run build 2>&1 | tail -25
```

Expected: build succeeds. In Next 16 the instrumentation hook is stable and needs NO `experimental.instrumentationHook` flag. If (and only if) the build errors asking for the flag, add to `next.config.ts` `nextConfig`:

```ts
	experimental: { instrumentationHook: true },
```

and re-run. If the build passes without it, do NOT add the flag.

- [ ] **Step 3: Confirm no restricted-import leak**

Run: `npx eslint src/instrumentation.ts`
Expected: clean (it imports our server helper dynamically, never posthog directly).

- [ ] **Step 4: Commit**

```bash
git add src/instrumentation.ts next.config.ts
git commit -m "feat(analytics): capture server errors via instrumentation onRequestError"
```

---

### Task 4: Shared AppErrorBoundary component + i18n

**Files:**

- Create: `src/lib/analytics/components/AppErrorBoundary/AppErrorBoundary.tsx`
- Create: `src/lib/analytics/components/AppErrorBoundary/AppErrorBoundary.module.css`
- Modify: `messages/en.json`, `messages/fr.json`

**Interfaces:**

- Consumes: `useAnalytics()` (context), `useTranslations` (next-intl), `Button`
- Produces: `AppErrorBoundary({ error, reset, scope })`

- [ ] **Step 1: Add `error` message keys to `messages/en.json`**

Add a top-level `error` object (mind JSON comma validity):

```json
	"error": {
		"title": "Something went wrong",
		"description": "An unexpected error occurred. You can try again.",
		"retry": "Try again"
	},
```

- [ ] **Step 2: Add the same keys to `messages/fr.json`**

```json
	"error": {
		"title": "Une erreur est survenue",
		"description": "Une erreur inattendue s'est produite. Vous pouvez réessayer.",
		"retry": "Réessayer"
	},
```

- [ ] **Step 3: Write `AppErrorBoundary.module.css`**

```css
.wrap {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 1rem;
	min-height: 40vh;
	padding: 2rem;
	text-align: center;
}

.title {
	font-size: 1.5rem;
	font-weight: 700;
	margin: 0;
}

.message {
	font-size: 1rem;
	opacity: 0.8;
	margin: 0;
	max-width: 40ch;
}
```

- [ ] **Step 4: Write `AppErrorBoundary.tsx`**

```tsx
'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/Button/Button';
import { useAnalytics } from '../../context/AnalyticsContext';
import styles from './AppErrorBoundary.module.css';

// Shared by every error.tsx. Captures the exception via the analytics port
// (never posthog directly) and renders a clean, i18n error UI with a retry button.
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

> **Verify before writing:** confirm the `Button` import path/props against `src/components/Button/Button.tsx` — it is a named export with `variant?: 'primary' | 'secondary' | 'ghost' | 'danger'` and spreads `ButtonHTMLAttributes` (so `onClick` works). The usage above is correct per that signature.

- [ ] **Step 5: Typecheck + lint**

Run:

```bash
npx tsc --noEmit && npx eslint src/lib/analytics/components/AppErrorBoundary/
```

Expected: clean, no restricted-import error. Verify both JSON files still parse:

```bash
node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8')); JSON.parse(require('fs').readFileSync('messages/fr.json','utf8')); console.log('json ok')"
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/analytics/components/AppErrorBoundary/ messages/en.json messages/fr.json
git commit -m "feat(analytics): add shared AppErrorBoundary with i18n"
```

---

### Task 5: Root + global error boundaries

**Files:**

- Create: `src/app/[locale]/error.tsx`
- Create: `src/app/global-error.tsx`

**Interfaces:**

- Consumes: `AppErrorBoundary` (Task 4), `getAnalytics()` (singleton, for global-error)
- Produces: root + ultimate error boundaries wired

- [ ] **Step 1: Create `src/app/[locale]/error.tsx`**

```tsx
'use client';

import { AppErrorBoundary } from '@/lib/analytics/components/AppErrorBoundary/AppErrorBoundary';

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
	return <AppErrorBoundary {...props} scope="app" />;
}
```

- [ ] **Step 2: Create `src/app/global-error.tsx`**

`global-error` replaces the root layout, so it is OUTSIDE our providers — it cannot use `useAnalytics()`. Use the `getAnalytics()` singleton, and render its own `<html><body>`.

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

- [ ] **Step 3: Typecheck + lint**

Run:

```bash
npx tsc --noEmit && npx eslint src/app/[locale]/error.tsx src/app/global-error.tsx
```

Expected: clean, no restricted-import error (both go through our layer, not posthog).

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/error.tsx" src/app/global-error.tsx
git commit -m "feat(analytics): add root and global error boundaries"
```

---

### Task 6: Per-domain error boundaries

**Files:**

- Create: `src/app/[locale]/decks/error.tsx`
- Create: `src/app/[locale]/collection/error.tsx`
- Create: `src/app/[locale]/search/error.tsx`
- Create: `src/app/[locale]/wishlist/error.tsx`

**Interfaces:**

- Consumes: `AppErrorBoundary` (Task 4)
- Produces: contextual error UI per domain (all 4 route dirs confirmed to exist)

- [ ] **Step 1: Create `src/app/[locale]/decks/error.tsx`**

```tsx
'use client';

import { AppErrorBoundary } from '@/lib/analytics/components/AppErrorBoundary/AppErrorBoundary';

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
	return <AppErrorBoundary {...props} scope="decks" />;
}
```

- [ ] **Step 2: Create `src/app/[locale]/collection/error.tsx`**

```tsx
'use client';

import { AppErrorBoundary } from '@/lib/analytics/components/AppErrorBoundary/AppErrorBoundary';

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
	return <AppErrorBoundary {...props} scope="collection" />;
}
```

- [ ] **Step 3: Create `src/app/[locale]/search/error.tsx`**

```tsx
'use client';

import { AppErrorBoundary } from '@/lib/analytics/components/AppErrorBoundary/AppErrorBoundary';

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
	return <AppErrorBoundary {...props} scope="search" />;
}
```

- [ ] **Step 4: Create `src/app/[locale]/wishlist/error.tsx`**

```tsx
'use client';

import { AppErrorBoundary } from '@/lib/analytics/components/AppErrorBoundary/AppErrorBoundary';

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
	return <AppErrorBoundary {...props} scope="wishlist" />;
}
```

- [ ] **Step 5: Typecheck + lint**

Run:

```bash
npx tsc --noEmit && npx eslint "src/app/[locale]/decks/error.tsx" "src/app/[locale]/collection/error.tsx" "src/app/[locale]/search/error.tsx" "src/app/[locale]/wishlist/error.tsx"
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/decks/error.tsx" "src/app/[locale]/collection/error.tsx" "src/app/[locale]/search/error.tsx" "src/app/[locale]/wishlist/error.tsx"
git commit -m "feat(analytics): add per-domain error boundaries (decks, collection, search, wishlist)"
```

---

### Task 7: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full check, gated on no NEW problems**

Run:

```bash
npm run check 2>&1 | tail -30
```

Baseline is red (`project_check_red_baseline`). Confirm no NEW problems reference the new/changed files. Isolate with:

```bash
npx eslint src/lib/analytics/ src/instrumentation.ts "src/app/[locale]/error.tsx" src/app/global-error.tsx "src/app/[locale]/decks/error.tsx" "src/app/[locale]/collection/error.tsx" "src/app/[locale]/search/error.tsx" "src/app/[locale]/wishlist/error.tsx"
```

Expected: clean.

- [ ] **Step 2: Verify the decoupling invariant still holds**

Run:

```bash
grep -rn --include="*.ts" --include="*.tsx" -E "from '(posthog-js|posthog-node)'" src | grep -v "src/lib/analytics/providers/"
```

Expected: NO output.

- [ ] **Step 3: Production build**

Run:

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds (instrumentation + error boundaries compile).

- [ ] **Step 4: Runtime verification (requires PostHog key in .env.local + the autocapture toggle)**

Manual, for the user to confirm (needs a browser + the PostHog "Enable exception autocapture" toggle in Settings → Error tracking):

- Dev server, trigger a client render error → the AppErrorBoundary UI shows + the exception appears in PostHog → Error tracking.
- Throw in a server action / route handler → the server exception appears (distinctId `server`).

Note this step in the completion report as user-verified rather than agent-verified.

---

## Self-Review Notes

- **Spec coverage:** port + adapters + autocapture (Task 1), server capture (Task 2), instrumentation onRequestError (Task 3), shared boundary + i18n (Task 4), root/global boundaries (Task 5), per-domain boundaries (Task 6), verification (Task 7). All spec sections covered.
- **Signature correctness:** client `captureException(error, context)` = 2 args (verified against node_modules — the spec's `(error, undefined, context)` was wrong; this plan uses the correct 2-arg form). Server `captureException(error, 'server')` matches posthog-node. Init flag `capture_exceptions: true` verified.
- **Boundary integrity:** every new file goes through `useAnalytics()`/`getAnalytics()`/`captureServerException`; none imports posthog directly. Task 7 Step 2 asserts this mechanically.
- **Placeholder scan:** no TBD/TODO; the `instrumentationHook` flag is a verify-then-add-only-if-needed step, not a placeholder.
