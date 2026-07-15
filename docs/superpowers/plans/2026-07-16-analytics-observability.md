# Analytics & Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add vendor-decoupled product & web analytics to Wizcard, with PostHog Cloud (EU) as the initial provider, replaceable by rewriting two adapter files.

**Architecture:** Ports & Adapters. A single `src/lib/analytics/` module owns all PostHog knowledge behind a typed `AnalyticsClient` interface. An ESLint `no-restricted-imports` rule forbids importing `posthog-js`/`posthog-node` anywhere except `src/lib/analytics/providers/`. Consent starts anonymous-in-memory and upgrades to persistent on acceptance. Client and server both emit via the same typed `track()` contract.

**Tech Stack:** Next.js 16 (App Router, `src/proxy.ts`), TypeScript strict, `posthog-js`, `posthog-node`, `next-intl` (messages at `messages/{en,fr}.json`), Zustand stores, CSS Modules.

## Global Constraints

- **No PostHog SDK import outside `src/lib/analytics/providers/`** — enforced by ESLint `no-restricted-imports`.
- **No PII in event props** — IDs and categories only; never email, name, or `purchase_price`.
- **`track()` never throws** — adapters wrap all calls in silent try/catch (`console.debug` in dev only).
- **Object form** `track({ name, props })`, not `track(name, props)`.
- **Provider order is load-bearing** — `AnalyticsProvider` sits ABOVE `AuthProvider`; do NOT insert any provider between `SyncQueueRunner` and `CollectionProvider` (`AGENTS.md`).
- **Reverse-proxy path is `/tamiyo`** — must be excluded from the `next-intl` locale matcher in `src/proxy.ts`.
- **CSP stays Report-Only** — do not switch to enforcing mode.
- **No token → noop-client** — absent `NEXT_PUBLIC_POSTHOG_KEY` means zero network calls.
- **No test framework** (`project_no_test_framework`) — verify via `npm run check` + runtime. Gate on "no NEW eslint problems" on changed files (`project_check_red_baseline`), not a green baseline.
- **Code style:** tabs (width 2), single quotes, trailing commas es5. No barrel `index.ts`. Folder only when ≥2 files of a kind.

---

### Task 1: Install dependencies & environment scaffolding

**Files:**

- Modify: `package.json` (dependencies)
- Modify: `.env.example` (create if absent)

**Interfaces:**

- Consumes: nothing
- Produces: `posthog-js` and `posthog-node` available; env var names `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `POSTHOG_SERVER_KEY`

- [ ] **Step 1: Install the two SDKs**

Run:

```bash
npm install posthog-js posthog-node
```

Expected: `package.json` gains `posthog-js` and `posthog-node` under `dependencies`; install completes with no errors.

- [ ] **Step 2: Document env vars in `.env.example`**

Append to `.env.example` (create the file if it does not exist):

```
# Analytics (PostHog Cloud EU). Leave NEXT_PUBLIC_POSTHOG_KEY empty to disable
# analytics entirely (noop-client — zero network calls). Get the project token
# from PostHog → Project Settings. Host is the local reverse-proxy path.
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=/tamiyo
POSTHOG_SERVER_KEY=
```

- [ ] **Step 3: Verify install**

Run:

```bash
node -e "require.resolve('posthog-js'); require.resolve('posthog-node'); console.log('ok')"
```

Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: add posthog SDKs and analytics env vars"
```

---

### Task 2: Event catalogue & port interface (pure types, zero deps)

**Files:**

- Create: `src/lib/analytics/analytics-events.ts`
- Create: `src/lib/analytics/analytics-client.ts`

**Interfaces:**

- Consumes: nothing
- Produces:
  - `type AnalyticsEvent` (discriminated union, `name` + `props`)
  - `type EventName = AnalyticsEvent['name']`
  - `interface AnalyticsClient { track<E extends AnalyticsEvent>(event: E): void; identify(userId: string, traits?: Record<string, string | number | boolean>): void; reset(): void; setConsent(granted: boolean): void; }`

- [ ] **Step 1: Write `analytics-events.ts`**

```ts
// Typed catalogue of every business event. ZERO PostHog import — this file is
// the vendor-neutral contract the whole app depends on. No PII in props: IDs and
// categories only, never email/name/purchase_price.
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

- [ ] **Step 2: Write `analytics-client.ts`**

```ts
import type { AnalyticsEvent } from './analytics-events';

// The "port" — every adapter (PostHog, noop, or a future replacement)
// implements this. No file outside src/lib/analytics/providers/ may import a
// vendor SDK; consumers depend only on this interface.
export interface AnalyticsClient {
	track<E extends AnalyticsEvent>(event: E): void;
	identify(userId: string, traits?: Record<string, string | number | boolean>): void;
	reset(): void;
	setConsent(granted: boolean): void;
}
```

- [ ] **Step 3: Typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: no NEW errors referencing `src/lib/analytics/`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/analytics/analytics-events.ts src/lib/analytics/analytics-client.ts
git commit -m "feat(analytics): add typed event catalogue and AnalyticsClient port"
```

---

### Task 3: Consent store (localStorage, SSR-safe)

**Files:**

- Create: `src/lib/analytics/consent/consent-store.ts`

**Interfaces:**

- Consumes: nothing
- Produces:
  - `type ConsentState = 'unknown' | 'granted' | 'denied'`
  - `getConsent(): ConsentState` (SSR-safe: `'unknown'` on server)
  - `setConsentState(state: 'granted' | 'denied'): void`
  - `CONSENT_STORAGE_KEY = 'wizcard-analytics-consent'`

- [ ] **Step 1: Write `consent-store.ts`**

```ts
// Consent state persisted in localStorage. SSR-safe: returns 'unknown' when
// window is undefined (server render) so the banner logic degrades gracefully.
export type ConsentState = 'unknown' | 'granted' | 'denied';

export const CONSENT_STORAGE_KEY = 'wizcard-analytics-consent';

export function getConsent(): ConsentState {
	if (typeof window === 'undefined') return 'unknown';
	try {
		const value = window.localStorage.getItem(CONSENT_STORAGE_KEY);
		return value === 'granted' || value === 'denied' ? value : 'unknown';
	} catch {
		return 'unknown';
	}
}

export function setConsentState(state: 'granted' | 'denied'): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(CONSENT_STORAGE_KEY, state);
	} catch {
		// Storage unavailable (private mode / quota) — analytics stays anonymous.
	}
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/analytics/consent/consent-store.ts
git commit -m "feat(analytics): add SSR-safe consent store"
```

---

### Task 4: Noop adapter

**Files:**

- Create: `src/lib/analytics/providers/noop-client.ts`

**Interfaces:**

- Consumes: `AnalyticsClient` (Task 2)
- Produces: `createNoopClient(): AnalyticsClient`

- [ ] **Step 1: Write `noop-client.ts`**

```ts
import type { AnalyticsClient } from '../analytics-client';

// Active whenever NEXT_PUBLIC_POSTHOG_KEY is absent (dev, tests, opt-out builds).
// Every method is a no-op so calling code is identical whether analytics is on.
export function createNoopClient(): AnalyticsClient {
	return {
		track: () => {},
		identify: () => {},
		reset: () => {},
		setConsent: () => {},
	};
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/analytics/providers/noop-client.ts
git commit -m "feat(analytics): add noop adapter"
```

---

### Task 5: PostHog browser adapter

**Files:**

- Create: `src/lib/analytics/providers/posthog-client.ts`

**Interfaces:**

- Consumes: `AnalyticsClient` (Task 2), `posthog-js`
- Produces: `createPosthogClient(): AnalyticsClient`, `initPosthog(): void`

- [ ] **Step 1: Write `posthog-client.ts`**

```ts
import posthog from 'posthog-js';
import type { AnalyticsClient } from '../analytics-client';

// SOLE import of posthog-js in the codebase. Everything vendor-specific lives here.
const isDev = process.env.NODE_ENV === 'development';

function safe(fn: () => void): void {
	try {
		fn();
	} catch (error) {
		// Analytics is non-critical: a blocked/down provider must never break the app.
		if (isDev) console.debug('[analytics] call failed', error);
	}
}

// Called once from instrumentation-client.ts. No-op if key is missing (the
// caller falls back to the noop client for consumers).
export function initPosthog(): void {
	const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
	if (!key) return;
	posthog.init(key, {
		api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? '/tamiyo',
		ui_host: 'https://eu.posthog.com',
		persistence: 'memory', // anonymous until consent granted
		person_profiles: 'identified_only',
		capture_pageview: false, // handled manually for the App Router
		defaults: '2026-05-30',
	});
}

export function createPosthogClient(): AnalyticsClient {
	return {
		track: (event) => safe(() => posthog.capture(event.name, event.props)),
		identify: (userId, traits) => safe(() => posthog.identify(userId, traits)),
		reset: () => safe(() => posthog.reset()),
		setConsent: (granted) =>
			safe(() => posthog.set_config({ persistence: granted ? 'localStorage+cookie' : 'memory' })),
	};
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors. (If `defaults: '2026-05-30'` is rejected by the installed `posthog-js` types, remove that line — it is a convenience default, not load-bearing.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/analytics/providers/posthog-client.ts
git commit -m "feat(analytics): add posthog-js browser adapter"
```

---

### Task 6: PostHog server adapter & trackServer

**Files:**

- Create: `src/lib/analytics/providers/posthog-server.ts`
- Create: `src/lib/analytics/server/track-server.ts`

**Interfaces:**

- Consumes: `AnalyticsEvent` (Task 2), `posthog-node`
- Produces: `trackServer(event: AnalyticsEvent, distinctId: string): Promise<void>`

- [ ] **Step 1: Write `posthog-server.ts`**

```ts
import { PostHog } from 'posthog-node';

// SOLE import of posthog-node. Server functions are ephemeral, so flush eagerly
// (flushAt: 1, flushInterval: 0) and shut down after each capture.
export function createServerClient(): PostHog | null {
	const key = process.env.POSTHOG_SERVER_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_KEY;
	if (!key) return null;
	return new PostHog(key, {
		host: 'https://eu.i.posthog.com',
		flushAt: 1,
		flushInterval: 0,
	});
}
```

- [ ] **Step 2: Write `track-server.ts`**

```ts
import type { AnalyticsEvent } from '../analytics-events';
import { createServerClient } from '../providers/posthog-server';

// Emit a business event from a Server Action / route handler. No-op when no key
// is configured. Never throws — analytics must not break a server request.
export async function trackServer(event: AnalyticsEvent, distinctId: string): Promise<void> {
	const client = createServerClient();
	if (!client) return;
	try {
		client.capture({ distinctId, event: event.name, properties: event.props });
		await client.shutdown();
	} catch (error) {
		if (process.env.NODE_ENV === 'development') {
			console.debug('[analytics] server track failed', error);
		}
	}
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/analytics/providers/posthog-server.ts src/lib/analytics/server/track-server.ts
git commit -m "feat(analytics): add posthog-node server adapter and trackServer"
```

---

### Task 7: Analytics context, singleton, and useAnalytics hook

**Files:**

- Create: `src/lib/analytics/context/AnalyticsContext.tsx`
- Create: `src/lib/analytics/hooks/useAnalytics.ts`

**Interfaces:**

- Consumes: `AnalyticsClient` (Task 2), `createPosthogClient`/`initPosthog` (Task 5), `createNoopClient` (Task 4), `getConsent`/`setConsentState`/`ConsentState` (Task 3)
- Produces:
  - `<AnalyticsProvider>` React component
  - `useAnalytics(): AnalyticsClient` (context hook)
  - `getAnalytics(): AnalyticsClient` (module singleton, for non-React Zustand stores)
  - `useConsent(): { consent: ConsentState; accept: () => void; refuse: () => void }`

- [ ] **Step 1: Write `AnalyticsContext.tsx`**

```tsx
'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { AnalyticsClient } from '../analytics-client';
import { createNoopClient } from '../providers/noop-client';
import { createPosthogClient } from '../providers/posthog-client';
import { getConsent, setConsentState, type ConsentState } from '../consent/consent-store';

// Module singleton: the active client is chosen once (posthog if a key exists,
// noop otherwise) and exposed both via React context (components) and via
// getAnalytics() (Zustand stores, which live outside React).
const activeClient: AnalyticsClient = process.env.NEXT_PUBLIC_POSTHOG_KEY
	? createPosthogClient()
	: createNoopClient();

export function getAnalytics(): AnalyticsClient {
	return activeClient;
}

const AnalyticsContext = createContext<AnalyticsClient>(activeClient);

type ConsentContextValue = {
	consent: ConsentState;
	accept: () => void;
	refuse: () => void;
};
const ConsentContext = createContext<ConsentContextValue | null>(null);

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
	const [consent, setConsent] = useState<ConsentState>('unknown');

	// Read persisted consent on mount and re-apply it to the client (so a
	// returning visitor who accepted stays persistent across reloads).
	useEffect(() => {
		const stored = getConsent();
		setConsent(stored);
		if (stored === 'granted') activeClient.setConsent(true);
	}, []);

	const accept = () => {
		setConsentState('granted');
		setConsent('granted');
		activeClient.setConsent(true);
	};
	const refuse = () => {
		setConsentState('denied');
		setConsent('denied');
		activeClient.setConsent(false);
	};

	return (
		<AnalyticsContext value={activeClient}>
			<ConsentContext value={{ consent, accept, refuse }}>{children}</ConsentContext>
		</AnalyticsContext>
	);
}

export function useAnalytics(): AnalyticsClient {
	return useContext(AnalyticsContext);
}

export function useConsent(): ConsentContextValue {
	const ctx = useContext(ConsentContext);
	if (!ctx) throw new Error('useConsent must be used within AnalyticsProvider');
	return ctx;
}
```

- [ ] **Step 2: Write `useAnalytics.ts` (re-export for import ergonomics)**

```ts
// Convenience re-export so consumers import from a hooks/ path consistent with
// the rest of the codebase. The implementation lives in the context module.
export { useAnalytics } from '../context/AnalyticsContext';
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/analytics/context/AnalyticsContext.tsx src/lib/analytics/hooks/useAnalytics.ts
git commit -m "feat(analytics): add provider, useAnalytics hook, and getAnalytics singleton"
```

---

### Task 8: Auth sync hook (identify / reset)

**Files:**

- Create: `src/lib/analytics/hooks/useAnalyticsAuthSync.ts`

**Interfaces:**

- Consumes: `useAuth` (`src/lib/supabase/contexts/AuthContext`), `useAnalytics` (Task 7)
- Produces: `useAnalyticsAuthSync(): void` (mounted inside the auth tree)

- [ ] **Step 1: Write `useAnalyticsAuthSync.ts`**

```ts
'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useAnalytics } from '../context/AnalyticsContext';

// Bridges Supabase auth state to analytics identity. Mounted INSIDE the auth
// tree (it needs useAuth); the AnalyticsProvider itself sits above AuthProvider.
// Tracks the previous user id so we only identify/reset on real transitions.
export function useAnalyticsAuthSync(): void {
	const { user, isLoading } = useAuth();
	const analytics = useAnalytics();
	const prevUserId = useRef<string | null>(null);

	useEffect(() => {
		if (isLoading) return;
		const currentId = user?.id ?? null;
		if (currentId === prevUserId.current) return;

		if (currentId) {
			analytics.identify(currentId);
		} else if (prevUserId.current) {
			// Was signed in, now signed out.
			analytics.reset();
		}
		prevUserId.current = currentId;
	}, [user, isLoading, analytics]);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/analytics/hooks/useAnalyticsAuthSync.ts
git commit -m "feat(analytics): sync auth state to analytics identify/reset"
```

---

### Task 9: Pageview capture component

**Files:**

- Create: `src/lib/analytics/components/AnalyticsPageView.tsx`

**Interfaces:**

- Consumes: `useAnalytics` is NOT used here (pageviews go straight to posthog via a capture on route change through the active client's `track` is typed-only). Instead consume `getAnalytics` indirectly — but pageviews are not in the typed catalogue, so call PostHog's generic `$pageview` through a dedicated method. To keep the boundary intact, add a `page(url: string)` method.
- Produces: mounted `<AnalyticsPageView />`

> **Interface addition:** `$pageview` is not a business event, so extend the port with a `page(url: string)` method rather than forcing it into `AnalyticsEvent`. Update `AnalyticsClient`, both adapters, and noop.

- [ ] **Step 1: Add `page(url: string)` to the port**

Modify `src/lib/analytics/analytics-client.ts` — add to the interface:

```ts
	page(url: string): void;
```

(Insert after the `track` line.)

- [ ] **Step 2: Implement `page` in the noop adapter**

Modify `src/lib/analytics/providers/noop-client.ts` — add to the returned object:

```ts
		page: () => {},
```

- [ ] **Step 3: Implement `page` in the PostHog adapter**

Modify `src/lib/analytics/providers/posthog-client.ts` — add to the returned object in `createPosthogClient`:

```ts
		page: (url) => safe(() => posthog.capture('$pageview', { $current_url: url })),
```

- [ ] **Step 4: Write `AnalyticsPageView.tsx`**

```tsx
'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAnalytics } from '../context/AnalyticsContext';

// Captures a $pageview on every App Router navigation. usePathname/useSearchParams
// require a Suspense boundary at the mount site (see Providers wiring).
export function AnalyticsPageView() {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const analytics = useAnalytics();

	useEffect(() => {
		if (!pathname) return;
		const query = searchParams?.toString();
		const url = query ? `${pathname}?${query}` : pathname;
		analytics.page(window.location.origin + url);
	}, [pathname, searchParams, analytics]);

	return null;
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analytics/analytics-client.ts src/lib/analytics/providers/noop-client.ts src/lib/analytics/providers/posthog-client.ts src/lib/analytics/components/AnalyticsPageView.tsx
git commit -m "feat(analytics): add App Router pageview capture"
```

---

### Task 10: Consent banner (i18n + CSS Module)

**Files:**

- Create: `src/lib/analytics/components/ConsentBanner/ConsentBanner.tsx`
- Create: `src/lib/analytics/components/ConsentBanner/ConsentBanner.module.css`
- Modify: `messages/en.json`, `messages/fr.json`

**Interfaces:**

- Consumes: `useConsent` (Task 7), `useTranslations` (next-intl)
- Produces: `<ConsentBanner />`

- [ ] **Step 1: Add message keys to `messages/en.json`**

Add a top-level `consent` object:

```json
	"consent": {
		"message": "We use privacy-friendly analytics to understand how Wizcard is used. Until you accept, data stays anonymous.",
		"accept": "Accept",
		"refuse": "Refuse"
	},
```

- [ ] **Step 2: Add the same keys to `messages/fr.json`**

```json
	"consent": {
		"message": "Nous utilisons des statistiques respectueuses de la vie privée pour comprendre l'usage de Wizcard. Tant que vous n'acceptez pas, les données restent anonymes.",
		"accept": "Accepter",
		"refuse": "Refuser"
	},
```

- [ ] **Step 3: Write `ConsentBanner.module.css`**

```css
.banner {
	position: fixed;
	inset-inline: 1rem;
	bottom: 1rem;
	z-index: 1000;
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 1rem;
	padding: 1rem 1.25rem;
	border-radius: 12px;
	background: rgba(20, 20, 28, 0.72);
	backdrop-filter: blur(12px);
	border: 1px solid rgba(255, 255, 255, 0.12);
	color: #f5f5f7;
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
}

.message {
	flex: 1 1 240px;
	font-size: 0.875rem;
	line-height: 1.4;
	margin: 0;
}

.actions {
	display: flex;
	gap: 0.5rem;
}
```

- [ ] **Step 4: Write `ConsentBanner.tsx`**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/Button/Button';
import { useConsent } from '../../context/AnalyticsContext';
import styles from './ConsentBanner.module.css';

// Shown only while consent is 'unknown'. Accepting flips PostHog to persistent
// storage; refusing keeps it anonymous-in-memory (not a full opt-out).
export function ConsentBanner() {
	const { consent, accept, refuse } = useConsent();
	const t = useTranslations('consent');

	if (consent !== 'unknown') return null;

	return (
		<div className={styles.banner} role="dialog" aria-live="polite">
			<p className={styles.message}>{t('message')}</p>
			<div className={styles.actions}>
				<Button variant="ghost" onClick={refuse}>
					{t('refuse')}
				</Button>
				<Button variant="primary" onClick={accept}>
					{t('accept')}
				</Button>
			</div>
		</div>
	);
}
```

> **Verify before running:** confirm the `Button` import path/signature against `src/components/Button/`. Adjust the import and the `variant` prop names to match the actual component (the plan assumes `variant="ghost" | "primary"` per `AGENTS.md` § Generic UI Components).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analytics/components/ConsentBanner/ messages/en.json messages/fr.json
git commit -m "feat(analytics): add consent banner with i18n"
```

---

### Task 11: Client init file & Next config (proxy + CSP)

**Files:**

- Create: `src/instrumentation-client.ts`
- Modify: `next.config.ts`
- Modify: `src/proxy.ts` (matcher exclusion)

**Interfaces:**

- Consumes: `initPosthog` (Task 5)
- Produces: PostHog initialized on client load; `/tamiyo/*` reverse-proxied; `worker-src` in CSP; `/tamiyo` excluded from locale matcher

- [ ] **Step 1: Create `src/instrumentation-client.ts`**

```ts
// Next.js 16 auto-loads this at client startup. It only calls the adapter's
// init — it does NOT import posthog-js directly, preserving the ESLint boundary.
import { initPosthog } from '@/lib/analytics/providers/posthog-client';

initPosthog();
```

> **Note:** This file lives outside `src/lib/analytics/providers/`. It imports the adapter (allowed) but must NOT import `posthog-js` (Task 12's ESLint rule enforces this).

- [ ] **Step 2: Add rewrites + `skipTrailingSlashRedirect` to `next.config.ts`**

In the `nextConfig` object (alongside `images`, `headers`), add:

```ts
	skipTrailingSlashRedirect: true,
	async rewrites() {
		return [
			{
				source: '/tamiyo/static/:path*',
				destination: 'https://eu-assets.i.posthog.com/static/:path*',
			},
			{ source: '/tamiyo/:path*', destination: 'https://eu.i.posthog.com/:path*' },
		];
	},
```

- [ ] **Step 3: Add `worker-src` to the CSP array in `next.config.ts`**

In the `csp` array (after the `connect-src` line), add:

```ts
		`worker-src 'self' blob:`,
```

- [ ] **Step 4: Exclude `/tamiyo` from the locale matcher in `src/proxy.ts`**

Change the matcher's negative-lookahead group to include `tamiyo`. Current:

```ts
		'/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|wasm)$).*)',
```

New (add `tamiyo|` right after `api|`):

```ts
		'/((?!api|tamiyo|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|wasm)$).*)',
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors.

- [ ] **Step 6: Commit**

```bash
git add src/instrumentation-client.ts next.config.ts src/proxy.ts
git commit -m "feat(analytics): init client, reverse-proxy /tamiyo, CSP worker-src"
```

---

### Task 12: ESLint decoupling boundary (the key invariant)

**Files:**

- Modify: `eslint.config.mjs`

**Interfaces:**

- Consumes: nothing
- Produces: `npm run check` fails if `posthog-js`/`posthog-node` is imported outside `src/lib/analytics/providers/`

- [ ] **Step 1: Add a restricted-imports block to `eslint.config.mjs`**

Add this config object to the `defineConfig([...])` array, AFTER the main rules block and BEFORE `globalIgnores(...)`:

```js
	{
		// Vendor-decoupling boundary: PostHog SDKs may only be imported by the
		// adapter layer. Everything else depends on the AnalyticsClient port.
		// Replacing PostHog = rewriting providers/*, nothing else.
		ignores: ['src/lib/analytics/providers/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: 'posthog-js',
							message:
								'Import PostHog only inside src/lib/analytics/providers/. Use useAnalytics()/getAnalytics() elsewhere.',
						},
						{
							name: 'posthog-node',
							message:
								'Import PostHog only inside src/lib/analytics/providers/. Use trackServer() elsewhere.',
						},
					],
				},
			],
		},
	},
```

- [ ] **Step 2: Verify the rule FAILS when violated**

Temporarily add `import posthog from 'posthog-js';` to the top of `src/instrumentation-client.ts`, then run:

```bash
npx eslint src/instrumentation-client.ts
```

Expected: FAIL with the restricted-import message.

- [ ] **Step 3: Verify the rule PASSES for the adapter**

Run:

```bash
npx eslint src/lib/analytics/providers/posthog-client.ts
```

Expected: no restricted-import error (adapter is in the `ignores` list).

- [ ] **Step 4: Remove the temporary violating import**

Revert the extra import added in Step 2 from `src/instrumentation-client.ts`.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.mjs
git commit -m "feat(analytics): enforce PostHog import boundary via ESLint"
```

---

### Task 13: Wire providers into the app tree

**Files:**

- Modify: `src/contexts/Providers.tsx`

**Interfaces:**

- Consumes: `AnalyticsProvider` (Task 7), `useAnalyticsAuthSync` (Task 8), `AnalyticsPageView` (Task 9), `ConsentBanner` (Task 10)
- Produces: analytics live in the running app

- [ ] **Step 1: Add imports to `Providers.tsx`**

At the top with the other imports:

```tsx
import { Suspense } from 'react';
import { AnalyticsProvider } from '@/lib/analytics/context/AnalyticsContext';
import { useAnalyticsAuthSync } from '@/lib/analytics/hooks/useAnalyticsAuthSync';
import { AnalyticsPageView } from '@/lib/analytics/components/AnalyticsPageView';
import { ConsentBanner } from '@/lib/analytics/components/ConsentBanner/ConsentBanner';
```

- [ ] **Step 2: Add an internal auth-sync bridge component**

Above the `Providers` function, add:

```tsx
// Mounted inside the auth tree so it can read useAuth(); emits identify/reset.
function AnalyticsAuthBridge() {
	useAnalyticsAuthSync();
	return null;
}
```

- [ ] **Step 3: Wrap the tree with `AnalyticsProvider` and mount the pieces**

Replace the `Providers` return with (AnalyticsProvider ABOVE AuthProvider; bridge INSIDE auth; do NOT insert anything between SyncQueueRunner and CollectionProvider):

```tsx
return (
	<AnalyticsProvider>
		<AuthProvider>
			<AnalyticsAuthBridge />
			<Suspense fallback={null}>
				<AnalyticsPageView />
			</Suspense>
			<BrandFontProvider>
				<SyncQueueRunner>
					<ProfileProvider>
						<CollectionProvider>
							<WishlistProvider>
								<DeckProvider>
									<ImportProvider>
										<AddToDeckModalProvider>
											<AddCardModalProvider>
												<CardModalProvider>{children}</CardModalProvider>
											</AddCardModalProvider>
										</AddToDeckModalProvider>
									</ImportProvider>
								</DeckProvider>
							</WishlistProvider>
						</CollectionProvider>
					</ProfileProvider>
				</SyncQueueRunner>
			</BrandFontProvider>
			<ConsentBanner />
		</AuthProvider>
	</AnalyticsProvider>
);
```

- [ ] **Step 4: Typecheck + full check on changed file**

Run:

```bash
npx tsc --noEmit && npx eslint src/contexts/Providers.tsx
```

Expected: no NEW errors.

- [ ] **Step 5: Runtime smoke test**

Run `npm run dev`, open the app. Verify:

- Consent banner appears at the bottom.
- DevTools → Network: with a key set, requests go to `/tamiyo/...` (not blocked; not locale-prefixed). Without a key, zero PostHog requests.
- Navigate between pages; with a key, a `$pageview` fires per navigation (PostHog → Activity).

- [ ] **Step 6: Commit**

```bash
git add src/contexts/Providers.tsx
git commit -m "feat(analytics): wire AnalyticsProvider, pageview, auth sync, consent banner"
```

---

### Task 14: Instrument business events (client stores & hooks)

**Files:**

- Modify: `src/lib/collection/store/collection-store.ts`
- Modify: `src/lib/deck/store/deck-store.ts`
- Modify: import/search/wishlist hooks (exact files located in Step 1)

**Interfaces:**

- Consumes: `getAnalytics` (Task 7)
- Produces: business events emitted at mutation points

> **Instrumentation principle:** one action = one emission, at the store/hook mutation point, NOT in UI buttons. Zustand stores are outside React so they use `getAnalytics()`, not the hook.

- [ ] **Step 1: Locate the exact mutation points**

Run:

```bash
grep -n "addCard:\|removeEntry:\|updateEntry:\|changePrint:\|clearCollection:" src/lib/collection/store/collection-store.ts
grep -n "createDeck:\|deleteDeck:\|addCardToDeck\|addCard" src/lib/deck/store/deck-store.ts
grep -rln "wishlist" src/lib/wishlist/ | head
grep -rln "import_completed\|onComplete\|parse" src/lib/import/ | head
```

Note the line numbers — you will insert `getAnalytics().track(...)` inside each mutation implementation.

- [ ] **Step 2: Instrument `collection-store.ts`**

Add at the top:

```ts
import { getAnalytics } from '@/lib/analytics/context/AnalyticsContext';
```

Inside `addCard` (after the entry is created, before/after the sync trigger), add:

```ts
getAnalytics().track({
	name: 'card_added',
	props: { scryfallId: card.scryfallId, isFoil: Boolean(entryPatch?.isFoil), source: 'manual' },
});
```

Inside `removeEntry`:

```ts
getAnalytics().track({ name: 'card_removed', props: { scryfallId } });
```

Inside `clearCollection` (before wiping, capture the count):

```ts
getAnalytics().track({ name: 'collection_cleared', props: { count } });
```

> **Verify before writing:** confirm the actual parameter names in each store method (`card.scryfallId`, `scryfallId`, count source) against the real signatures found in Step 1. Adjust field access to match. Do NOT pass `purchase_price` or any PII.

- [ ] **Step 3: Instrument `deck-store.ts`**

Add the `getAnalytics` import. Inside `createDeck` (after the deck object with its id exists):

```ts
getAnalytics().track({ name: 'deck_created', props: { deckId: deck.id } });
```

Inside the delete method:

```ts
getAnalytics().track({ name: 'deck_deleted', props: { deckId } });
```

Inside the add-card-to-deck method:

```ts
getAnalytics().track({ name: 'card_added_to_deck', props: { deckId, scryfallId } });
```

> **Verify before writing:** match `deck.id` / `deckId` / `scryfallId` to the real method signatures from Step 1.

- [ ] **Step 4: Instrument import completion**

In the import hook where a parse resolves successfully:

```ts
getAnalytics().track({ name: 'import_completed', props: { format, cardCount } });
```

And on failure:

```ts
getAnalytics().track({ name: 'import_failed', props: { format, reason } });
```

- [ ] **Step 5: Instrument wishlist toggle & search**

In the wishlist toggle method:

```ts
getAnalytics().track({ name: 'wishlist_toggled', props: { scryfallId, added } });
```

In the search hook (debounced, where a search actually executes):

```ts
getAnalytics().track({ name: 'search_performed', props: { hasFilters } });
```

- [ ] **Step 6: Check changed files**

Run:

```bash
npx tsc --noEmit && npx eslint src/lib/collection/store/collection-store.ts src/lib/deck/store/deck-store.ts
```

Expected: no NEW errors, and NO restricted-import error (stores import `getAnalytics`, not PostHog).

- [ ] **Step 7: Runtime verification**

`npm run dev` with a key set. Perform: add a card, create a deck, run an import, toggle wishlist, run a search. In PostHog → Activity, confirm each event arrives with the expected (PII-free) props.

- [ ] **Step 8: Commit**

```bash
git add src/lib/collection/store/collection-store.ts src/lib/deck/store/deck-store.ts src/lib/import/ src/lib/wishlist/ src/lib/search/
git commit -m "feat(analytics): instrument collection, deck, import, wishlist, search events"
```

---

### Task 15: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full check, gated on no NEW problems**

Run:

```bash
npm run check 2>&1 | tail -40
```

The baseline is red (~60 pre-existing problems, `project_check_red_baseline`). Confirm no NEW problems reference `src/lib/analytics/`, `src/instrumentation-client.ts`, `next.config.ts`, `src/proxy.ts`, or the instrumented stores/hooks. To isolate, also run:

```bash
npx eslint src/lib/analytics/ src/instrumentation-client.ts
```

Expected: clean.

- [ ] **Step 2: Verify the decoupling invariant end-to-end**

Run:

```bash
grep -rn "from 'posthog-js'\|from 'posthog-node'\|from \"posthog" src --include=*.ts --include=*.tsx | grep -v "src/lib/analytics/providers/"
```

Expected: NO output (PostHog is imported only inside `providers/`).

- [ ] **Step 3: Verify noop path (no-key build)**

Run dev with the key unset:

```bash
NEXT_PUBLIC_POSTHOG_KEY= npm run dev
```

In DevTools → Network, confirm zero requests to `/tamiyo/*`. App functions normally; consent banner still renders (it's independent of the key) but analytics is a no-op.

- [ ] **Step 4: Production build sanity**

Run:

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds (rewrites and `instrumentation-client.ts` compile).

- [ ] **Step 5: Final commit (if any lint auto-fixes applied)**

```bash
git add -A
git commit -m "chore(analytics): final verification pass" || echo "nothing to commit"
```

---

## Self-Review Notes

- **Spec coverage:** module structure (Task 2–10), decoupling boundary (Task 12), consent memory→persistent (Task 3, 7, 10), client+server (Task 5, 6), reverse proxy /tamiyo + matcher + CSP (Task 11), provider order (Task 13), store instrumentation via singleton (Task 14), autocapture — **note:** autocapture is PostHog's default when `posthog.init` runs; no extra code needed, covered implicitly by Task 5. Session replay stays disabled (not enabled in init) — matches "wired but off".
- **Type consistency:** `getAnalytics()` / `useAnalytics()` return `AnalyticsClient`; `page(url)` added to the port in Task 9 and implemented in both adapters + noop same task; `trackServer(event, distinctId)` consistent Task 6 ↔ future callers.
- **Placeholders:** each code step shows full code; "verify before writing" notes point at real signatures to confirm (store method params), which is guidance to match existing code, not a deferred TODO.
