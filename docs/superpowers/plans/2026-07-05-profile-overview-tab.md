# Profile Overview Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first "Overview" tab (a public profile dashboard: recap stats + recent activity) that lives at the shell root `/users/<nickname>`.

**Architecture:** The `/users/[userId]` shell (`layout.tsx` + `ProfileView.tsx`) already renders a tab bar and loads `useProfileSummary` (deck list + collection/wishlist counts). We turn the root `page.tsx` — currently a redirect to `/decks` — into the Overview page, add a fourth "Overview" tab whose active state is derived from the shell root pathname, and build a `ProfileOverview` component fed by a new `useProfileOverview` hook + one new Postgres RPC.

**Tech Stack:** Next.js App Router (client components), React, Zustand (Scryfall/cards stores), Supabase (PostgREST + RPC), CSS Modules, TypeScript.

## Global Constraints

- **No test framework** in this repo (no vitest/jest). Every task's "test cycle" is `npm run check` (TypeScript + ESLint + Prettier) plus a runtime verification step in the dev app. Do NOT add a test runner or write `.test.ts` files.
- **Commit only when a task is complete and `npm run check` passes.** Branch is `main`; commit directly (the repo's existing workflow).
- All profile reads are **public** and rely on the existing public-read RLS / `public_collection_cards` view. Never read `purchase_price` or any owner-private field in Overview.
- Overview content is **identical for owner and visitor**; `isOwner` must not change what Overview renders.
- The URL nickname is the `handle`; the real user id is `ownerId`. They are deliberately distinct — never build a query with `handle` or a link with `ownerId`.
- Commit message trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## File Structure

- **New** `supabase/migrations/<timestamp>_count_distinct_public_cards.sql` — Postgres function `count_distinct_public_cards(owner uuid)`.
- **Modify** `src/lib/supabase/queries/cards.ts` — add `fetchDistinctPublicCardCount(ownerId)` (RPC wrapper) and `fetchRecentPublicCardRows(ownerId, limit)`.
- **Modify** `src/lib/collection/db/collection.ts` — add `fetchRecentPublicCards(ownerId, limit)` returning `{ scryfallId, entry }[]` (maps rows via existing `mapRows`).
- **New** `src/app/users/[userId]/useProfileOverview.ts` — hook orchestrating the unique-count + recent-cards fetches.
- **New** `src/app/users/[userId]/components/ProfileOverview.tsx` — dashboard UI (stats + recent cards + recent decks).
- **New** `src/app/users/[userId]/components/ProfileOverview.module.css` — dashboard styles.
- **Modify** `src/app/users/[userId]/page.tsx` — render `ProfileOverview` instead of redirecting.
- **Modify** `src/app/users/[userId]/components/ProfileView.tsx` — 4th "Overview" tab + `overview` case in `tabFromPathname`; pass `summary` down so Overview reuses it.

Task order is dependency-driven: data layer (Tasks 1–3) → hook (Task 4) → UI (Task 5) → wiring the route + tab (Tasks 6–7).

---

### Task 1: Postgres RPC — `count_distinct_public_cards`

**Files:**

- Create: `supabase/migrations/20260705120000_count_distinct_public_cards.sql`

**Interfaces:**

- Produces: SQL function `public.count_distinct_public_cards(owner uuid) returns integer` — count of DISTINCT `scryfall_id` among that owner's `cards` where `wishlist = false` and `owner_id = owner`. Callable by the `anon` role (public profiles).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260705120000_count_distinct_public_cards.sql`:

```sql
-- Exact count of an owner's distinct public collection prints (scryfall_id),
-- for the profile Overview "unique cards" stat. security definer so it reads
-- past RLS the same way the public_collection_cards view exposes public rows;
-- it only ever returns an aggregate count, never row data.
create or replace function public.count_distinct_public_cards(owner uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct scryfall_id)::int
  from public.cards
  where owner_id = owner
    and wishlist = false;
$$;

grant execute on function public.count_distinct_public_cards(uuid) to anon, authenticated;
```

- [ ] **Step 2: Apply the migration**

Run: `npm run sb:migrate`
Expected: applies `20260705120000_count_distinct_public_cards` with no error.

- [ ] **Step 3: Verify the function in Studio / psql**

Run in Supabase Studio SQL editor (or `npm run sb:studio`, port 54323):

```sql
select public.count_distinct_public_cards('00000000-0000-0000-0000-000000000000');
```

Expected: returns `0` (unknown owner) with no error. If you have a seeded owner id, calling it there returns a positive integer ≤ that owner's total public card rows.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260705120000_count_distinct_public_cards.sql
git commit -m "feat(db): count_distinct_public_cards RPC for profile Overview

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Query layer — distinct count + recent rows

**Files:**

- Modify: `src/lib/supabase/queries/cards.ts`

**Interfaces:**

- Consumes: RPC `count_distinct_public_cards(owner)` from Task 1; existing `CardDbRow` type; existing `createClient()`.
- Produces:
  - `fetchDistinctPublicCardCount(ownerId: string): Promise<number>`
  - `fetchRecentPublicCardRows(ownerId: string, limit: number): Promise<CardDbRow[]>` — the `limit` most recent public collection rows (`wishlist=false`, `order date_added desc`), from the `public_collection_cards` view.

- [ ] **Step 1: Add both functions**

Append to `src/lib/supabase/queries/cards.ts` (after `fetchPublicCardCount`, keeping the file's existing style — one `createClient()` per call, console.error + safe fallback on error):

```ts
/**
 * Exact count of an owner's DISTINCT public prints (scryfall_id) via the
 * count_distinct_public_cards RPC. Used by the profile Overview "unique cards"
 * stat; the plain fetchPublicCardCount gives total copies (rows).
 */
export async function fetchDistinctPublicCardCount(ownerId: string): Promise<number> {
	const supabase = createClient();
	const { data, error } = await supabase.rpc('count_distinct_public_cards', { owner: ownerId });
	if (error) {
		console.error('[queries/cards] fetchDistinctPublicCardCount error:', error);
		return 0;
	}
	return (data as number | null) ?? 0;
}

/**
 * The `limit` most recently added public collection rows for an owner
 * (wishlist=false), newest first. Read via the price-free public view; used by
 * the profile Overview "recently added" strip.
 */
export async function fetchRecentPublicCardRows(
	ownerId: string,
	limit: number
): Promise<CardDbRow[]> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from('public_collection_cards')
		.select('*')
		.eq('owner_id', ownerId)
		.eq('wishlist', false)
		.order('date_added', { ascending: false })
		.limit(limit);
	if (error) {
		console.error('[queries/cards] fetchRecentPublicCardRows error:', error);
		return [];
	}
	return data as CardDbRow[];
}
```

- [ ] **Step 2: Verify types + lint**

Run: `npm run check`
Expected: PASS (no TS/ESLint/Prettier error). If `supabase.rpc(...)` complains about the function name being unknown to generated types, that's expected for a hand-written migration — cast the arg object is not needed; if a type error appears on the rpc name, add `// @ts-expect-error RPC not in generated types` on the `.rpc` line only. Prefer no suppression if it type-checks.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/queries/cards.ts
git commit -m "feat(profile): query helpers for distinct count + recent public cards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Collection db — `fetchRecentPublicCards`

**Files:**

- Modify: `src/lib/collection/db/collection.ts`

**Interfaces:**

- Consumes: `fetchRecentPublicCardRows` from Task 2; existing `mapRows` (module-local) which maps `CardDbRow[]` → `Array<{ scryfallId: string; entry: CardEntry }>`.
- Produces: `fetchRecentPublicCards(ownerId: string, limit: number): Promise<Array<{ scryfallId: string; entry: CardEntry }>>` — shape consumable by `useCollectionCards`.

- [ ] **Step 1: Import the new query and add the function**

In `src/lib/collection/db/collection.ts`, add `fetchRecentPublicCardRows` to the existing import from `@/lib/supabase/queries/cards`, then add (near `fetchPublicCollectionPage`):

```ts
/**
 * The `limit` most recently added public collection cards for an owner, mapped
 * to { scryfallId, entry } so they can be hydrated by useCollectionCards. Feeds
 * the profile Overview "recently added" strip.
 */
export async function fetchRecentPublicCards(
	ownerId: string,
	limit: number
): Promise<Array<{ scryfallId: string; entry: CardEntry }>> {
	const rows = await fetchRecentPublicCardRows(ownerId, limit);
	return mapRows(rows);
}
```

(If `CardEntry` is not already imported in this file, add `import type { CardEntry } from '@/types/cards';`. Check the existing imports first — `mapRows` returns that type, so it is likely already available via `rowToCardEntry`; only add the import if `npm run check` reports it missing.)

- [ ] **Step 2: Verify types + lint**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/collection/db/collection.ts
git commit -m "feat(profile): fetchRecentPublicCards for Overview recent strip

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `useProfileOverview` hook

**Files:**

- Create: `src/app/users/[userId]/useProfileOverview.ts`

**Interfaces:**

- Consumes: `fetchDistinctPublicCardCount` (Task 2), `fetchRecentPublicCards` (Task 3), existing `CardEntry` type.
- Produces:
  - Constant `RECENT_CARDS_LIMIT = 8`.
  - `useProfileOverview(ownerId: string): { uniqueCount: number; recentCards: Array<{ scryfallId: string; entry: CardEntry }>; isLoading: boolean }`.

This hook loads ONLY the two Overview-specific reads. Total copies and the deck list come from `useProfileSummary` in the shell and are passed to `ProfileOverview` as props — do NOT refetch them here.

- [ ] **Step 1: Write the hook**

Create `src/app/users/[userId]/useProfileOverview.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';
import type { CardEntry } from '@/types/cards';
import { fetchDistinctPublicCardCount } from '@/lib/supabase/queries/cards';
import { fetchRecentPublicCards } from '@/lib/collection/db/collection';

/** How many recently-added cards the Overview strip shows. */
export const RECENT_CARDS_LIMIT = 8;

type RecentCard = { scryfallId: string; entry: CardEntry };

/**
 * Overview-only reads: the exact unique-print count (distinct scryfall_id) and
 * the most recently added public cards. Total copies and the deck list already
 * come from useProfileSummary in the shell, so they are NOT fetched here.
 */
export function useProfileOverview(ownerId: string): {
	uniqueCount: number;
	recentCards: RecentCard[];
	isLoading: boolean;
} {
	const [uniqueCount, setUniqueCount] = useState(0);
	const [recentCards, setRecentCards] = useState<RecentCard[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setIsLoading(true);
			const [count, recent] = await Promise.all([
				fetchDistinctPublicCardCount(ownerId),
				fetchRecentPublicCards(ownerId, RECENT_CARDS_LIMIT),
			]);
			if (cancelled) return;
			setUniqueCount(count);
			setRecentCards(recent);
			setIsLoading(false);
		}
		void load();
		return () => {
			cancelled = true;
		};
	}, [ownerId]);

	return { uniqueCount, recentCards, isLoading };
}
```

- [ ] **Step 2: Verify types + lint**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/users/[userId]/useProfileOverview.ts
git commit -m "feat(profile): useProfileOverview hook (unique count + recent cards)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `ProfileOverview` component + styles

**Files:**

- Create: `src/app/users/[userId]/components/ProfileOverview.tsx`
- Create: `src/app/users/[userId]/components/ProfileOverview.module.css`

**Interfaces:**

- Consumes:
  - `useProfileOverview(ownerId)` (Task 4).
  - `useCollectionCards(entries)` from `@/lib/collection/hooks/useCollectionCards` → `{ stacks, isLoading, totalExpected }`; each stack's `cards[0]` is a full `ScryfallCard & { entry }`.
  - `getScryfallCardImageUriBySize(card, 'small'|'normal')` from `@/lib/scryfall/utils/scryfall-query`.
  - `scryfallImageLoader` from `@/lib/scryfall/utils/scryfallImageLoader` (memory: `cards.scryfall.io` 400s the default Next UA; route card `<Image>` through this loader).
  - `ProfileSummary` from `@/app/users/[userId]/useProfileSummary` (`{ decks, deckCount, collectionCount, wishlistCount, isLoading }`).
  - `Profile` from `@/lib/profile/types` (has `createdAt: string`).
  - `DeckMeta` from `@/types/decks` (has `id`, `name`, `updatedAt`).
- Produces: `ProfileOverview({ ownerId, profile, summary })` component.

- [ ] **Step 1: Write the component**

Create `src/app/users/[userId]/components/ProfileOverview.tsx`:

```tsx
'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Profile } from '@/lib/profile/types';
import type { DeckMeta } from '@/types/decks';
import { useCollectionCards } from '@/lib/collection/hooks/useCollectionCards';
import { getScryfallCardImageUriBySize } from '@/lib/scryfall/utils/scryfall-query';
import { scryfallImageLoader } from '@/lib/scryfall/utils/scryfallImageLoader';
import type { ProfileSummary } from '../useProfileSummary';
import { useProfileOverview } from '../useProfileOverview';
import styles from './ProfileOverview.module.css';

const RECENT_DECKS_LIMIT = 5;

/** "juil. 2026"-style month+year from an ISO date (French locale). */
function formatMemberSince(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '—';
	return d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
}

/**
 * Overview tab of the profile shell: a public dashboard. Recap stats (unique
 * cards / total copies / member since), a "recently added" card strip, and a
 * "recently updated decks" list. Public and identical for owner and visitor —
 * no editing here. Total copies and the deck list are passed in from the shell's
 * summary; unique count and recent cards come from useProfileOverview.
 */
export function ProfileOverview({
	ownerId,
	profile,
	summary,
}: {
	ownerId: string;
	profile: Profile | null;
	summary: ProfileSummary;
}) {
	const { uniqueCount, recentCards, isLoading } = useProfileOverview(ownerId);
	const { stacks } = useCollectionCards(recentCards);

	// Newest-first, capped. Sort a copy — never mutate summary.decks in place.
	const recentDecks: DeckMeta[] = useMemo(
		() =>
			[...summary.decks]
				.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
				.slice(0, RECENT_DECKS_LIMIT),
		[summary.decks]
	);

	const totalCopies = summary.collectionCount;
	const memberSince = profile ? formatMemberSince(profile.createdAt) : '—';

	return (
		<div className={styles.overview}>
			<section className={styles.statsGrid} aria-label="Statistiques">
				<div className={styles.statCard}>
					<span className={styles.statValue}>{isLoading ? '—' : uniqueCount}</span>
					<span className={styles.statLabel}>Cartes uniques</span>
				</div>
				<div className={styles.statCard}>
					<span className={styles.statValue}>{summary.isLoading ? '—' : totalCopies}</span>
					<span className={styles.statLabel}>Exemplaires</span>
				</div>
				<div className={styles.statCard}>
					<span className={styles.statValue}>{memberSince}</span>
					<span className={styles.statLabel}>Membre depuis</span>
				</div>
			</section>

			<section className={styles.block} aria-label="Cartes récemment ajoutées">
				<h2 className={styles.blockTitle}>Récemment ajoutées</h2>
				{!isLoading && recentCards.length === 0 ? (
					<p className={styles.empty}>Aucune carte publique pour l'instant.</p>
				) : (
					<div className={styles.cardStrip}>
						{stacks.slice(0, recentCards.length).map((stack) => {
							const card = stack.cards[0];
							const src = getScryfallCardImageUriBySize(card, 'small');
							return (
								<div key={card.entry.rowId} className={styles.cardThumb} title={card.name}>
									{src ? (
										<Image
											loader={scryfallImageLoader}
											src={src}
											alt={card.name}
											width={146}
											height={204}
											className={styles.cardImg}
										/>
									) : (
										<span className={styles.cardName}>{card.name}</span>
									)}
								</div>
							);
						})}
					</div>
				)}
			</section>

			<section className={styles.block} aria-label="Decks récemment modifiés">
				<h2 className={styles.blockTitle}>Decks récents</h2>
				{recentDecks.length === 0 ? (
					<p className={styles.empty}>Aucun deck pour l'instant.</p>
				) : (
					<ul className={styles.deckList}>
						{recentDecks.map((deck) => (
							<li key={deck.id}>
								<Link href={`/decks/${deck.id}`} className={styles.deckLink}>
									{deck.name}
								</Link>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
```

- [ ] **Step 2: Write the styles**

Create `src/app/users/[userId]/components/ProfileOverview.module.css`:

```css
.overview {
	display: flex;
	flex-direction: column;
	gap: 2rem;
	padding: 1rem 0;
}

.statsGrid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
	gap: 1rem;
}

.statCard {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	padding: 1rem 1.25rem;
	border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
	border-radius: 0.75rem;
	background: var(--surface, rgba(255, 255, 255, 0.03));
}

.statValue {
	font-size: 1.5rem;
	font-weight: 700;
	line-height: 1.1;
}

.statLabel {
	font-size: 0.8125rem;
	opacity: 0.7;
}

.block {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}

.blockTitle {
	font-size: 1rem;
	font-weight: 600;
	margin: 0;
}

.empty {
	opacity: 0.6;
	font-size: 0.875rem;
	margin: 0;
}

.cardStrip {
	display: flex;
	gap: 0.75rem;
	overflow-x: auto;
	padding-bottom: 0.25rem;
}

.cardThumb {
	flex: 0 0 auto;
	width: 96px;
	border-radius: 0.5rem;
	overflow: hidden;
	background: var(--surface, rgba(255, 255, 255, 0.05));
}

.cardImg {
	width: 100%;
	height: auto;
	display: block;
}

.cardName {
	display: block;
	padding: 0.5rem;
	font-size: 0.75rem;
	text-align: center;
}

.deckList {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.deckLink {
	display: block;
	padding: 0.625rem 0.875rem;
	border-radius: 0.5rem;
	border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
	text-decoration: none;
	color: inherit;
}

.deckLink:hover {
	background: var(--surface-hover, rgba(255, 255, 255, 0.06));
}
```

Note on CSS variables: check one sibling module (e.g. `ProfileView.module.css`) and reuse whatever theme variables it uses. If the project uses different token names, replace the `var(--…)` fallbacks above to match; the `, rgba(...)` fallbacks keep it rendering regardless.

- [ ] **Step 3: Verify types + lint**

Run: `npm run check`
Expected: PASS. If `next/image` requires the Scryfall host in `next.config`, the `loader` prop bypasses that (loader-based images skip domain config) — no config change needed.

- [ ] **Step 4: Commit**

```bash
git add src/app/users/[userId]/components/ProfileOverview.tsx src/app/users/[userId]/components/ProfileOverview.module.css
git commit -m "feat(profile): ProfileOverview dashboard component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Root page renders Overview; shell passes summary down

**Files:**

- Modify: `src/app/users/[userId]/page.tsx`
- Modify: `src/app/users/[userId]/components/ProfileView.tsx`

**Interfaces:**

- Consumes: `useProfileShell()` → `{ ownerId, isOwner, handle }`; `ProfileOverview` (Task 5); `ProfileSummary` + `useProfileSummary` (existing).
- Produces: the shell computes `summary` once and exposes it to the root page. Because the root page is a _child_ of the layout (not the same component), the summary is passed via a **new field on `ProfileShellContext`** OR the root page calls `useProfileSummary(ownerId)` itself. To avoid a double fetch, add `summary` to the shell context.

**Decision (locked):** Add `summary: ProfileSummary` to `ProfileShell` context so the root Overview page reuses the shell's single `useProfileSummary` call instead of refetching.

- [ ] **Step 1: Extend `ProfileShell` context with `summary`**

In `src/app/users/[userId]/ProfileShellContext.tsx`, add the field to the type:

```ts
import type { ProfileSummary } from './useProfileSummary';

export type ProfileShell = {
	ownerId: string;
	isOwner: boolean;
	handle: string;
	summary: ProfileSummary;
};
```

- [ ] **Step 2: Lift `useProfileSummary` into the layout and provide it**

In `src/app/users/[userId]/layout.tsx`, call the summary in the layout and pass it both to the provider and to `ProfileView` (so `ProfileView` no longer calls the hook itself). Add the import and the call after `isOwner` is computed:

```tsx
import { useProfileSummary } from './useProfileSummary';
// ...
const isOwner = !!user && user.id === resolved.id;
const profile = isOwner ? ownerCtx.profile : resolved;
const summary = useProfileSummary(resolved.id);
```

Then update the provider value and pass `summary` to `ProfileView`:

```tsx
<ProfileShellProvider value={{ ownerId: resolved.id, isOwner, handle: nickname, summary }}>
	<ProfileView
		userId={resolved.id}
		profile={profile}
		isLoading={isOwner ? ownerCtx.isLoading : false}
		onEdit={isOwner ? () => setEditing(true) : undefined}
		handle={nickname}
		summary={summary}
	>
		{children}
	</ProfileView>
	{editing && <ProfileEditModal onClose={() => setEditing(false)} />}
</ProfileShellProvider>
```

**Important:** `useProfileSummary` must be called before the early `return`s for loading/not-found? No — hooks cannot be conditional. Move the `useProfileSummary` call to run on every render: call it with a stable arg. Since `resolved.id` is only known after the guards, instead call `useProfileByNickname` and `useProfileContext` (already unconditional at top), then call `useProfileSummary` unconditionally BEFORE the `if (status === 'loading')` guard, passing `resolved?.id ?? ''`:

```tsx
const { profile: resolved, status } = useProfileByNickname(nickname);
const ownerCtx = useProfileContext();
const summary = useProfileSummary(resolved?.id ?? '');
```

`useProfileSummary('')` issues harmless empty-owner queries that return zero rows; they are discarded once `resolved` exists and the effect re-runs with the real id. Keep the guards below this line. Remove the later `const summary = ...` reassignment — declare it once here.

- [ ] **Step 3: Make `ProfileView` accept `summary` as a prop instead of calling the hook**

In `src/app/users/[userId]/components/ProfileView.tsx`:

- Remove `import { useProfileSummary } from '../useProfileSummary';` and add `import type { ProfileSummary } from '../useProfileSummary';`.
- Remove the line `const summary = useProfileSummary(userId);`.
- Add `summary: ProfileSummary;` to the props type and destructure `summary` from props.

The rest of `ProfileView` (which reads `summary.deckCount` etc.) is unchanged. `userId` is still used to key nothing now — keep the prop; it is passed by the layout and may be referenced elsewhere. Verify `userId` is still referenced; if ESLint flags it as unused, keep it (it documents identity) by prefixing usage in a comment is NOT acceptable — instead, if truly unused after this change, remove the `userId` prop from both the type and the layout's `<ProfileView userId=...>`. Let `npm run check` decide.

- [ ] **Step 4: Turn the root page into the Overview page**

Replace the entire contents of `src/app/users/[userId]/page.tsx`:

```tsx
'use client';

import { ProfileOverview } from './components/ProfileOverview';
import { useProfileShell } from './ProfileShellContext';

/**
 * Overview tab — the profile's landing page. Unlike the other tabs it has no
 * sub-route: `/users/<nickname>` IS the Overview. Identity and the shell's
 * already-loaded summary come from ProfileShellContext, so nothing is refetched
 * beyond the Overview-only reads inside ProfileOverview. Public for everyone.
 */
export default function UserOverviewPage() {
	const { ownerId, summary } = useProfileShell();
	// The owner's live profile is on ProfileContext; a visitor's is resolved by
	// the layout. Overview only needs createdAt, which both carry — read the
	// resolved profile through the shell is not available, so pass null-safe:
	return <ProfileOverview ownerId={ownerId} profile={null} summary={summary} />;
}
```

**Problem:** `ProfileOverview` needs `profile.createdAt` for "Member since", but the shell context does not currently expose the resolved `profile`. Fix: also add `profile: Profile | null` to `ProfileShell` context and provide it from the layout (the layout already computes `profile`). Update:

- `ProfileShellContext.tsx`: add `profile: Profile | null;` to `ProfileShell` (import `type { Profile } from '@/lib/profile/types'`).
- `layout.tsx`: add `profile` to the provider value: `value={{ ownerId: resolved.id, isOwner, handle: nickname, summary, profile }}`.
- `page.tsx`: read it — `const { ownerId, summary, profile } = useProfileShell();` and pass `profile={profile}`.

- [ ] **Step 5: Verify types + lint**

Run: `npm run check`
Expected: PASS. Resolve any unused-var lint (e.g. `userId` in ProfileView) per Step 3.

- [ ] **Step 6: Runtime verification**

Run the dev app (`npm run sb:start` if not running, then the dev server per the repo's usual command). In a browser:

1. Visit `/users/<a real nickname>` → the Overview dashboard renders: three stat cards (unique cards, exemplaires, membre depuis), a recent-cards strip with images, a recent-decks list.
2. The URL stays `/users/<nickname>` (no redirect to `/decks`).
3. Numbers are sane: unique ≤ exemplaires; recent cards ≤ 8; recent decks ≤ 5, newest first.
4. Visit as owner and as a logged-out visitor (or different account) → Overview looks identical.

Expected: all four hold. If images 400, confirm the `scryfallImageLoader` is wired on the `<Image>` (see memory: default UA is blocked).

- [ ] **Step 7: Commit**

```bash
git add src/app/users/[userId]/page.tsx src/app/users/[userId]/components/ProfileView.tsx src/app/users/[userId]/layout.tsx src/app/users/[userId]/ProfileShellContext.tsx
git commit -m "feat(profile): root /users/<nickname> renders Overview dashboard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Overview tab in the tab bar

**Files:**

- Modify: `src/app/users/[userId]/components/ProfileView.tsx`

**Interfaces:**

- Consumes: `usePathname()`, `handle`, existing `summary`.
- Produces: a fourth tab "Overview" linking to `/users/<handle>` (the root), active when the pathname is the shell root.

- [ ] **Step 1: Add the `overview` tab type and pathname derivation**

In `ProfileView.tsx`, widen the `Tab` type and teach `tabFromPathname` about the root. The root pathname is `/users/<handle>` with no trailing tab segment:

```ts
type Tab = 'overview' | 'decks' | 'collection' | 'wishlist';

/** Derive the active tab from the URL. The shell root (/users/<handle>, no
 *  trailing decks|collection|wishlist segment) is the Overview tab. */
function tabFromPathname(pathname: string): Tab {
	if (pathname.endsWith('/collection')) return 'collection';
	if (pathname.endsWith('/wishlist')) return 'wishlist';
	if (pathname.endsWith('/decks')) return 'decks';
	return 'overview';
}
```

- [ ] **Step 2: Render the Overview tab as the first tab**

The existing tab bar maps over a `stats` array that carries counts. Overview has no count, so render it as a separate leading `<Link>` before the mapped tabs. In the `renderHeader` function, inside the `.tabs` container, add before `{stats.map(...)}`:

```tsx
<Link
	href={`/users/${handle}`}
	role="tab"
	aria-selected={activeTab === 'overview'}
	className={`${styles.tab} ${activeTab === 'overview' ? styles.tabActive : ''}`}
>
	Overview
</Link>
```

Keep the existing `{stats.map(...)}` for Decks/Collection/Wishlist unchanged. (The Overview tab deliberately shows no count badge.)

- [ ] **Step 3: Verify types + lint**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Runtime verification**

In the dev app:

1. On `/users/<nickname>` the "Overview" tab is highlighted (`aria-selected`/active style); the other three are not.
2. Click Decks → URL becomes `/users/<nickname>/decks`, Decks tab active, Overview no longer active.
3. Click Overview → URL returns to `/users/<nickname>`, Overview active again, dashboard renders.
4. The sticky/pinned overlay header (scroll down) also shows the four tabs with Overview correctly active.

Expected: all four hold.

- [ ] **Step 5: Commit**

```bash
git add src/app/users/[userId]/components/ProfileView.tsx
git commit -m "feat(profile): Overview tab in the profile tab bar

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**

- Routing: root = Overview, no `/overview` sub-route → Task 6. ✓
- 4th "Overview" tab, active at root → Task 7. ✓
- Recap stats (unique cards, total copies, member since) → Task 5 (values from Tasks 2/4 + summary). ✓
- Recently added cards (~8, date_added desc, Scryfall thumbnails) → Tasks 2/3/4/5. ✓
- Recently updated decks (~5, from already-loaded deck list) → Task 5 (sorts `summary.decks`). ✓
- RPC for distinct count → Task 1. ✓
- `fetchRecentPublicCards` → Task 3. ✓
- Public/identical for owner & visitor → Tasks 5/6 (no `isOwner` branching in Overview). ✓
- Unchanged navbar / working routes / existing sub-pages → not touched by any task. ✓
- `useProfileSummary` reused (no refetch) → Task 6 lifts it into the layout and passes it via context. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. Task 6 notes a couple of "let `npm run check` decide" resolutions (unused `userId`, rpc type) — these are explicit fallbacks, not placeholders.

**Type consistency:**

- `fetchRecentPublicCardRows` (Task 2) → `CardDbRow[]`; consumed by `fetchRecentPublicCards` (Task 3) via `mapRows` → `{ scryfallId, entry }[]`; consumed by `useProfileOverview` (Task 4) and fed to `useCollectionCards` (Task 5). ✓
- `fetchDistinctPublicCardCount` → `Promise<number>` consumed as `uniqueCount`. ✓
- `ProfileSummary` shape (`decks`, `collectionCount`, `isLoading`) used consistently in Tasks 5/6. ✓
- `ProfileShell` context grows `summary` and `profile` (Task 6), both read in Task 6's page. ✓
- `RECENT_CARDS_LIMIT` (hook) vs `RECENT_DECKS_LIMIT` (component) — distinct constants, no collision. ✓

Note: Task 6 lifts `useProfileSummary` from `ProfileView` into `layout.tsx`; ensure `ProfileView`'s remaining references (`summary.deckCount`, etc.) now read the prop — covered in Task 6 Step 3.
