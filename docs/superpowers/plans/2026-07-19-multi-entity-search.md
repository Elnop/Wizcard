# Multi-Entity Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `/search` from card-only search to a multi-entity search (Cards / Decks / Profiles), with a Moxfield-style filter modal for decks and a public-visibility flag on decks.

**Architecture:** A top-level `SearchEntitySwitcher` (URL param `entity`) routes to one of three view components. The existing card logic is extracted verbatim into `CardSearchView`; two new views (`DeckSearchView`, `ProfileSearchView`) are added. Deck public visibility is added via a new migration (`is_public`, default true) plus a Public/Private toggle threaded through the existing `DeckMeta`/store/context/sync-queue chain.

**Tech Stack:** Next.js App Router (client components), TypeScript, Supabase (Postgres + RLS), next-intl (locales `en`/`fr`), CSS Modules.

## Global Constraints

- **No test framework** (no vitest/jest). Each task verifies via `npx eslint <changed files>` + `npx tsc --noEmit` (or `npm run check`) + runtime validation (dev server / Supabase Studio / `sb:verify`). Gate = **no NEW eslint/tsc problems** vs the pre-existing red baseline (~60 problems in unrelated files) — check changed files only with `npx eslint`.
- **i18n is strict**: every new user-facing string MUST have a key in BOTH `messages/en.json` and `messages/fr.json`. Search keys live under `search.*`; deck keys under `decks.*`.
- **Deck zone lives in `cards.tags`** as `deck:<zone>` (e.g. `deck:commander`), NOT in the `cards.zone` column. Query with `.contains('tags', ['deck:commander'])`.
- **TS2589 avoidance**: build Supabase queries with reassignments `q = q.eq(...)`, never chain filters inside the `let q = client.from()...` initializer. Only `npm run build` catches TS2589 reliably.
- **ESLint [locale] glob bug**: rules keyed on `src/app/**/<domain>/**`, not on `[locale]/(group)` parens.
- After migrations: `npm run sb:migrate` then `npm run sb:verify` must pass.

---

## File Structure

**Created:**

- `supabase/migrations/20260719120000_add_deck_visibility.sql` — `is_public` column + RLS.
- `src/lib/search/db/searchDecks.ts` — deck search query.
- `src/lib/search/db/searchProfiles.ts` — profile search query.
- `src/lib/search/hooks/useDeckSearch.ts` — paginated deck search hook.
- `src/lib/search/hooks/useProfileSearch.ts` — paginated profile search hook.
- `src/lib/search/components/DeckFilterModal/DeckFilterModal.tsx` + `.module.css` — deck filter modal.
- `src/lib/search/components/ProfileCard/ProfileCard.tsx` + `.module.css` — profile result card.
- `src/app/[locale]/search/components/SearchEntitySwitcher/SearchEntitySwitcher.tsx` + `.module.css` — entity tabs.
- `src/app/[locale]/search/views/CardSearchView.tsx` — extracted card view.
- `src/app/[locale]/search/views/DeckSearchView.tsx` — deck results view.
- `src/app/[locale]/search/views/ProfileSearchView.tsx` — profile results view.

**Modified:**

- `src/lib/search/types.ts` — add `SearchEntity`, `DeckSearchFilters`, `DEFAULT_DECK_FILTERS`, `countActiveDeckFilters`.
- `src/types/decks.ts` — add `isPublic` to `DeckMeta`.
- `src/lib/supabase/queries/decks.ts` — add `is_public` to `DeckDbRow`.
- `src/lib/deck/db/decks.ts` — map/insert/update `is_public`.
- `src/lib/deck/store/deck-store.ts` — allow `isPublic` in `updateDeck` updates.
- `src/lib/deck/context/DeckContext.tsx` — allow `isPublic` in `updateDeck` updates.
- `src/app/[locale]/decks/[id]/components/DeckHeader/DeckHeader.tsx` — Public/Private toggle.
- `src/app/[locale]/search/page.tsx` — replace body with entity switcher + view routing.
- `src/app/[locale]/search/useSearchFiltersFromUrl.ts` — add `entity` + deck-filter URL state.
- `messages/en.json`, `messages/fr.json` — new keys.
- `supabase/bootstrap/init_schema.sql` — align consolidated schema.

---

## Task 1: Deck visibility migration

**Files:**

- Create: `supabase/migrations/20260719120000_add_deck_visibility.sql`
- Modify: `supabase/bootstrap/init_schema.sql`

**Interfaces:**

- Produces: `decks.is_public boolean not null default true`; public SELECT policy on `decks`; widened SELECT policy on `cards`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260719120000_add_deck_visibility.sql`:

```sql
-- is_public gates deck discoverability. default true → EXISTING decks become
-- public (product decision, validated). Owner always sees own decks; others
-- only when public.
alter table public.decks
  add column if not exists is_public boolean not null default true;

create index if not exists decks_is_public_idx on public.decks (is_public) where is_public;

drop policy if exists "Users can view their own decks" on public.decks;
create policy "Anyone can view public decks, owners view their own"
  on public.decks for select
  using (is_public or auth.uid() = owner_id);

-- Cards of public decks must be readable (deck content, commander).
drop policy if exists "Users can view their own cards" on public.cards;
create policy "Users can view their own cards"
  on public.cards for select
  using (
    auth.uid() = owner_id
    or deck_id in (select id from public.decks where is_public or owner_id = auth.uid())
  );
```

- [ ] **Step 2: Apply and verify the migration**

Run: `npm run sb:migrate && npm run sb:verify`
Expected: migration applies cleanly; `sb:verify` reports PASS (no schema drift). If `sb:verify` asserts on the new column/policies, that is expected drift vs its assertion list — update the verify script's assertions if the project keeps one (`supabase/verify_prod_schema.sql`), otherwise a clean apply is the gate.

- [ ] **Step 3: Confirm in Studio**

Run: `npm run sb:studio` and confirm the `decks` table shows an `is_public` column defaulting to true, and the two policies exist under Authentication → Policies.
Expected: column present; both policies listed.

- [ ] **Step 4: Align consolidated schema**

In `supabase/bootstrap/init_schema.sql`, find the `create table public.decks` block and add `is_public boolean not null default true` to the column list; find the decks SELECT policy and cards SELECT policy and replace them with the `using (...)` clauses from Step 1. (Match the exact policy names present in that file; if the bootstrap uses different policy names, keep its names but use the new `using` expressions.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260719120000_add_deck_visibility.sql supabase/bootstrap/init_schema.sql
git commit -m "feat(decks): add is_public column and public SELECT policies"
```

---

## Task 2: Thread is_public through the deck data layer

**Files:**

- Modify: `src/types/decks.ts` (`DeckMeta`)
- Modify: `src/lib/supabase/queries/decks.ts:8-20` (`DeckDbRow`)
- Modify: `src/lib/deck/db/decks.ts` (`rowToDeckMeta`, `insertDeck`, `updateDeckMeta`)

**Interfaces:**

- Consumes: `DeckDbRow` from Task 1's migrated schema.
- Produces: `DeckMeta.isPublic: boolean`; `updateDeckMeta` accepts `isPublic` in its `updates` Pick; `insertDeck` persists `is_public`.

- [ ] **Step 1: Add `isPublic` to `DeckMeta`**

In `src/types/decks.ts`, in the `DeckMeta` interface, add after `coverArtUrl`:

```typescript
isPublic: boolean;
```

- [ ] **Step 2: Add `is_public` to `DeckDbRow`**

In `src/lib/supabase/queries/decks.ts`, in `export type DeckDbRow`, add after `cover_art_url`:

```typescript
is_public: boolean;
```

- [ ] **Step 3: Map and persist `is_public` in `src/lib/deck/db/decks.ts`**

In `rowToDeckMeta`, add after `coverArtUrl`:

```typescript
		isPublic: row.is_public ?? true,
```

In `insertDeck`'s `insertDeckRow({...})` payload, add after `cover_art_url`:

```typescript
		is_public: deck.isPublic ?? true,
```

In `updateDeckMeta`, extend the `updates` parameter Pick and the payload. Change the signature's Pick to include `'isPublic'`:

```typescript
updates: Partial<Pick<DeckMeta, 'name' | 'format' | 'description' | 'coverArtUrl' | 'isPublic'>>;
```

and add before `await updateDeckRow(...)`:

```typescript
if (updates.isPublic !== undefined) payload.is_public = updates.isPublic;
```

- [ ] **Step 4: Typecheck changed files**

Run: `npx tsc --noEmit`
Expected: no NEW errors referencing `isPublic`/`is_public`. Pre-existing baseline errors in unrelated files are acceptable. If a caller constructing a `DeckMeta` literal now errors on the missing `isPublic`, fix that caller by adding `isPublic: true` (search: `grep -rn "coverArtUrl:" src` to find object literals building DeckMeta — e.g. CreateDeckModal).

- [ ] **Step 5: Commit**

```bash
git add src/types/decks.ts src/lib/supabase/queries/decks.ts src/lib/deck/db/decks.ts
git commit -m "feat(decks): thread isPublic through deck data layer"
```

---

## Task 3: Thread isPublic through store + context, add DeckHeader toggle

**Files:**

- Modify: `src/lib/deck/store/deck-store.ts:113-118` (`updateDeck` type)
- Modify: `src/lib/deck/context/DeckContext.tsx:38-41` (`updateDeck` type)
- Modify: `src/app/[locale]/decks/[id]/components/DeckHeader/DeckHeader.tsx`
- Modify: `messages/en.json`, `messages/fr.json`

**Interfaces:**

- Consumes: `updateDeckMeta` accepting `isPublic` (Task 2); `DeckMeta.isPublic` (Task 2).
- Produces: `DeckHeader` `onUpdate` can carry `{ isPublic: boolean }`.

- [ ] **Step 1: Widen `updateDeck` in the store type**

In `src/lib/deck/store/deck-store.ts`, in the `updateDeck` field type, change the `updates` Pick to include `'isPublic'`:

```typescript
		updates: Partial<Pick<DeckMeta, 'name' | 'format' | 'description' | 'coverArtUrl' | 'isPublic'>>,
```

Also update the implementation's `updateDeck` signature (search the same file for `updateDeck:` in the store object / `updateDeck(` implementation) to use the identical Pick. The store forwards `updates` to the sync queue unchanged, so no body change beyond the type.

- [ ] **Step 2: Widen `updateDeck` in the context type**

In `src/lib/deck/context/DeckContext.tsx`, in the context interface's `updateDeck` field, change the Pick identically:

```typescript
updates: Partial<Pick<DeckMeta, 'name' | 'format' | 'description' | 'coverArtUrl' | 'isPublic'>>;
```

- [ ] **Step 3: Add i18n keys**

In `messages/en.json` under `"decks"`, add:

```json
		"visibilityPublic": "Public",
		"visibilityPrivate": "Private",
		"visibilityToggleAria": "Deck visibility",
		"visibilityPublicHint": "Anyone can find this deck in search",
		"visibilityPrivateHint": "Only you can see this deck",
```

In `messages/fr.json` under `"decks"`, add:

```json
		"visibilityPublic": "Public",
		"visibilityPrivate": "Privé",
		"visibilityToggleAria": "Visibilité du deck",
		"visibilityPublicHint": "Tout le monde peut trouver ce deck dans la recherche",
		"visibilityPrivateHint": "Vous seul pouvez voir ce deck",
```

- [ ] **Step 4: Extend DeckHeader `onUpdate` type and render the toggle**

In `src/app/[locale]/decks/[id]/components/DeckHeader/DeckHeader.tsx`, change the `onUpdate` prop type (line ~11) to:

```typescript
	onUpdate?: (
		updates: Partial<Pick<DeckMeta, 'name' | 'format' | 'description' | 'isPublic'>>
	) => void;
```

Then, in the header's action area (near where `deck.format` is rendered, ~line 106), add a visibility toggle shown only when NOT `readOnly`. Use the existing `useTranslations('decks')` `t` in this component (add the hook if absent):

```tsx
{
	!readOnly && onUpdate && (
		<button
			type="button"
			className={styles.visibilityToggle}
			aria-label={t('visibilityToggleAria')}
			aria-pressed={deck.isPublic}
			title={deck.isPublic ? t('visibilityPublicHint') : t('visibilityPrivateHint')}
			onClick={() => onUpdate({ isPublic: !deck.isPublic })}
		>
			{deck.isPublic ? t('visibilityPublic') : t('visibilityPrivate')}
		</button>
	);
}
```

Add a `.visibilityToggle` rule to `DeckHeader.module.css` styled like the existing kicker/badge elements (small pill button; reuse surrounding tokens).

- [ ] **Step 5: Typecheck + eslint changed files**

Run: `npx tsc --noEmit && npx eslint src/lib/deck/store/deck-store.ts src/lib/deck/context/DeckContext.tsx "src/app/[locale]/decks/[id]/components/DeckHeader/DeckHeader.tsx"`
Expected: no NEW problems.

- [ ] **Step 6: Runtime check**

Run: `npm run dev`, open a deck detail page, toggle Public/Private, reload the page.
Expected: toggle flips label, persists across reload (verify the `is_public` value changed in Studio).

- [ ] **Step 7: Commit**

```bash
git add src/lib/deck/store/deck-store.ts src/lib/deck/context/DeckContext.tsx "src/app/[locale]/decks/[id]/components/DeckHeader/DeckHeader.tsx" messages/en.json messages/fr.json
git commit -m "feat(decks): public/private visibility toggle in deck header"
```

---

## Task 4: Search types — entity + deck filters

**Files:**

- Modify: `src/lib/search/types.ts`

**Interfaces:**

- Produces:
  - `export type SearchEntity = 'cards' | 'decks' | 'profiles';`
  - `export interface DeckSearchFilters { name: string; formats: DeckFormat[]; authorNickname: string; cardInBoard: string; commander: string; }`
  - `export const DEFAULT_DECK_FILTERS: DeckSearchFilters`
  - `export function countActiveDeckFilters(f: DeckSearchFilters): number`
  - `export const COMMANDER_FORMATS: DeckFormat[]` (formats that surface the Commander input)

- [ ] **Step 1: Add the deck-search types**

In `src/lib/search/types.ts`, add at the end (import `DeckFormat` at top from `@/types/decks`):

```typescript
import type { DeckFormat } from '@/types/decks';

export type SearchEntity = 'cards' | 'decks' | 'profiles';

/** Formats that require a commander → surface the conditional Commander input. */
export const COMMANDER_FORMATS: DeckFormat[] = ['commander', 'brawl', 'oathbreaker'];

export interface DeckSearchFilters {
	name: string;
	formats: DeckFormat[];
	authorNickname: string;
	cardInBoard: string;
	commander: string;
}

export const DEFAULT_DECK_FILTERS: DeckSearchFilters = {
	name: '',
	formats: [],
	authorNickname: '',
	cardInBoard: '',
	commander: '',
};

export function countActiveDeckFilters(f: DeckSearchFilters): number {
	const commanderActive = f.formats.some((fmt) => COMMANDER_FORMATS.includes(fmt)) && !!f.commander;
	return (
		(f.name ? 1 : 0) +
		(f.formats.length > 0 ? 1 : 0) +
		(f.authorNickname ? 1 : 0) +
		(f.cardInBoard ? 1 : 0) +
		(commanderActive ? 1 : 0)
	);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no NEW errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/search/types.ts
git commit -m "feat(search): deck search filter types and entity type"
```

---

## Task 5: Profile search query + hook

**Files:**

- Create: `src/lib/search/db/searchProfiles.ts`
- Create: `src/lib/search/hooks/useProfileSearch.ts`

**Interfaces:**

- Consumes: Supabase client `createClient` from `@/lib/supabase/client`; `Profile` type shape (id, nickname, description, avatarUrl).
- Produces:
  - `searchProfiles(term: string, opts: { limit: number; offset: number }): Promise<{ profiles: ProfileSearchResult[]; total: number }>`
  - `type ProfileSearchResult = { id: string; nickname: string | null; description: string | null; avatarUrl: string | null }`
  - `useProfileSearch(term: string): { profiles: ProfileSearchResult[]; isLoading: boolean; isLoadingMore: boolean; hasMore: boolean; total: number; loadMore: () => void }`

- [ ] **Step 1: Write `searchProfiles`**

Create `src/lib/search/db/searchProfiles.ts`:

```typescript
import { createClient } from '@/lib/supabase/client';

export type ProfileSearchResult = {
	id: string;
	nickname: string | null;
	description: string | null;
	avatarUrl: string | null;
};

const PAGE = 24;

/** Search public profiles by nickname (RLS already restricts to is_public). */
export async function searchProfiles(
	term: string,
	opts: { limit?: number; offset?: number } = {}
): Promise<{ profiles: ProfileSearchResult[]; total: number }> {
	const limit = opts.limit ?? PAGE;
	const offset = opts.offset ?? 0;
	const supabase = createClient();
	let q = supabase
		.from('profiles')
		.select('id, nickname, description, avatar_url', { count: 'exact' });
	if (term.trim()) q = q.ilike('nickname', `%${term.trim()}%`);
	q = q.not('nickname', 'is', null).order('nickname', { ascending: true });
	q = q.range(offset, offset + limit - 1);
	const { data, error, count } = await q;
	if (error) throw new Error(`[searchProfiles] ${error.message}`);
	const profiles = (data ?? []).map((r) => ({
		id: r.id as string,
		nickname: r.nickname as string | null,
		description: r.description as string | null,
		avatarUrl: r.avatar_url as string | null,
	}));
	return { profiles, total: count ?? profiles.length };
}
```

- [ ] **Step 2: Write `useProfileSearch`**

Create `src/lib/search/hooks/useProfileSearch.ts`:

```typescript
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { searchProfiles, type ProfileSearchResult } from '@/lib/search/db/searchProfiles';

const PAGE = 24;

export function useProfileSearch(term: string) {
	const [profiles, setProfiles] = useState<ProfileSearchResult[]>([]);
	const [total, setTotal] = useState(0);
	const [isLoading, setIsLoading] = useState(false);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const offsetRef = useRef(0);

	useEffect(() => {
		let cancelled = false;
		setIsLoading(true);
		offsetRef.current = 0;
		searchProfiles(term, { limit: PAGE, offset: 0 })
			.then((res) => {
				if (cancelled) return;
				setProfiles(res.profiles);
				setTotal(res.total);
				offsetRef.current = res.profiles.length;
			})
			.catch(() => {
				if (!cancelled) {
					setProfiles([]);
					setTotal(0);
				}
			})
			.finally(() => {
				if (!cancelled) setIsLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [term]);

	const loadMore = useCallback(() => {
		if (isLoadingMore || profiles.length >= total) return;
		setIsLoadingMore(true);
		searchProfiles(term, { limit: PAGE, offset: offsetRef.current })
			.then((res) => {
				setProfiles((prev) => [...prev, ...res.profiles]);
				offsetRef.current += res.profiles.length;
			})
			.catch(() => {})
			.finally(() => setIsLoadingMore(false));
	}, [term, isLoadingMore, profiles.length, total]);

	return {
		profiles,
		isLoading,
		isLoadingMore,
		hasMore: profiles.length < total,
		total,
		loadMore,
	};
}
```

- [ ] **Step 3: Typecheck + eslint**

Run: `npx tsc --noEmit && npx eslint src/lib/search/db/searchProfiles.ts src/lib/search/hooks/useProfileSearch.ts`
Expected: no NEW problems.

- [ ] **Step 4: Commit**

```bash
git add src/lib/search/db/searchProfiles.ts src/lib/search/hooks/useProfileSearch.ts
git commit -m "feat(search): profile search query and hook"
```

---

## Task 6: Deck search query + hook

**Files:**

- Create: `src/lib/search/db/searchDecks.ts`
- Create: `src/lib/search/hooks/useDeckSearch.ts`

**Interfaces:**

- Consumes: `DeckSearchFilters` (Task 4); `DeckMeta`/`DeckFormat` (types); `createClient`.
- Produces:
  - `type DeckSearchResult = { deck: DeckMeta; authorNickname: string | null; authorAvatarUrl: string | null }`
  - `searchDecks(filters: DeckSearchFilters, opts: { limit: number; offset: number }): Promise<{ decks: DeckSearchResult[]; total: number }>`
  - `useDeckSearch(filters: DeckSearchFilters): { decks: DeckSearchResult[]; isLoading: boolean; isLoadingMore: boolean; hasMore: boolean; total: number; loadMore: () => void }`

- [ ] **Step 1: Write `searchDecks`**

Create `src/lib/search/db/searchDecks.ts`. Note the two-step resolution for author-nickname and card/commander filters, and the TS2589-safe `q = q.x()` reassignment style:

```typescript
import { createClient } from '@/lib/supabase/client';
import type { DeckMeta } from '@/types/decks';
import type { DeckSearchFilters } from '@/lib/search/types';
import { COMMANDER_FORMATS } from '@/lib/search/types';

export type DeckSearchResult = {
	deck: DeckMeta;
	authorNickname: string | null;
	authorAvatarUrl: string | null;
};

const PAGE = 24;

type ProfileMini = { nickname: string | null; avatar_url: string | null };

/** Resolve owner_ids whose profile nickname matches the given term. */
async function resolveAuthorIds(nickname: string): Promise<string[]> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from('profiles')
		.select('id')
		.ilike('nickname', `%${nickname.trim()}%`);
	if (error) throw new Error(`[searchDecks/author] ${error.message}`);
	return (data ?? []).map((r) => r.id as string);
}

/**
 * Resolve deck_ids that contain a card whose scryfall_id matches `scryfallId`,
 * optionally only in the commander zone (zone stored in cards.tags as
 * "deck:commander").
 */
async function resolveDeckIdsWithCard(
	scryfallId: string,
	commanderOnly: boolean
): Promise<string[]> {
	const supabase = createClient();
	let q = supabase.from('cards').select('deck_id').eq('scryfall_id', scryfallId);
	q = q.not('deck_id', 'is', null);
	if (commanderOnly) q = q.contains('tags', ['deck:commander']);
	const { data, error } = await q;
	if (error) throw new Error(`[searchDecks/card] ${error.message}`);
	return Array.from(new Set((data ?? []).map((r) => r.deck_id as string).filter(Boolean)));
}

function rowToResult(row: Record<string, unknown>): DeckSearchResult {
	const author = (row.profiles as ProfileMini | null) ?? null;
	return {
		deck: {
			id: row.id as string,
			ownerId: row.owner_id as string,
			name: row.name as string,
			format: (row.format as DeckMeta['format']) ?? null,
			description: (row.description as string | null) ?? null,
			folderId: (row.folder_id as string | null) ?? null,
			coverArtUrl: (row.cover_art_url as string | null) ?? null,
			isPublic: (row.is_public as boolean) ?? true,
			createdAt: row.created_at as string,
			updatedAt: row.updated_at as string,
		},
		authorNickname: author?.nickname ?? null,
		authorAvatarUrl: author?.avatar_url ?? null,
	};
}

export async function searchDecks(
	filters: DeckSearchFilters,
	opts: { limit?: number; offset?: number } = {}
): Promise<{ decks: DeckSearchResult[]; total: number }> {
	const limit = opts.limit ?? PAGE;
	const offset = opts.offset ?? 0;
	const supabase = createClient();

	// Pre-resolve author and card/commander constraints to deck_id / owner_id lists.
	let authorIds: string[] | null = null;
	if (filters.authorNickname.trim()) {
		authorIds = await resolveAuthorIds(filters.authorNickname);
		if (authorIds.length === 0) return { decks: [], total: 0 };
	}

	const commanderActive =
		filters.formats.some((f) => COMMANDER_FORMATS.includes(f)) && !!filters.commander.trim();

	let deckIdConstraint: string[] | null = null;
	if (filters.cardInBoard.trim()) {
		deckIdConstraint = await resolveDeckIdsWithCard(filters.cardInBoard.trim(), false);
	}
	if (commanderActive) {
		const cmdIds = await resolveDeckIdsWithCard(filters.commander.trim(), true);
		deckIdConstraint =
			deckIdConstraint === null ? cmdIds : deckIdConstraint.filter((id) => cmdIds.includes(id));
	}
	if (deckIdConstraint !== null && deckIdConstraint.length === 0) {
		return { decks: [], total: 0 };
	}

	let q = supabase
		.from('decks')
		.select('*, profiles!decks_owner_id_fkey(nickname, avatar_url)', { count: 'exact' });
	if (filters.name.trim()) q = q.ilike('name', `%${filters.name.trim()}%`);
	if (filters.formats.length > 0) q = q.in('format', filters.formats);
	if (authorIds !== null) q = q.in('owner_id', authorIds);
	if (deckIdConstraint !== null) q = q.in('id', deckIdConstraint);
	q = q.order('updated_at', { ascending: false });
	q = q.range(offset, offset + limit - 1);

	const { data, error, count } = await q;
	if (error) throw new Error(`[searchDecks] ${error.message}`);
	const decks = (data ?? []).map((r) => rowToResult(r as Record<string, unknown>));
	return { decks, total: count ?? decks.length };
}
```

- [ ] **Step 2: Write `useDeckSearch`**

Create `src/lib/search/hooks/useDeckSearch.ts` mirroring `useProfileSearch`, but keyed on a stable serialization of `filters` and storing `DeckSearchResult[]`:

```typescript
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { searchDecks, type DeckSearchResult } from '@/lib/search/db/searchDecks';
import type { DeckSearchFilters } from '@/lib/search/types';

const PAGE = 24;

export function useDeckSearch(filters: DeckSearchFilters) {
	const [decks, setDecks] = useState<DeckSearchResult[]>([]);
	const [total, setTotal] = useState(0);
	const [isLoading, setIsLoading] = useState(false);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const offsetRef = useRef(0);
	const key = JSON.stringify(filters);

	useEffect(() => {
		let cancelled = false;
		setIsLoading(true);
		offsetRef.current = 0;
		searchDecks(filters, { limit: PAGE, offset: 0 })
			.then((res) => {
				if (cancelled) return;
				setDecks(res.decks);
				setTotal(res.total);
				offsetRef.current = res.decks.length;
			})
			.catch(() => {
				if (!cancelled) {
					setDecks([]);
					setTotal(0);
				}
			})
			.finally(() => {
				if (!cancelled) setIsLoading(false);
			});
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key]);

	const loadMore = useCallback(() => {
		if (isLoadingMore || decks.length >= total) return;
		setIsLoadingMore(true);
		searchDecks(filters, { limit: PAGE, offset: offsetRef.current })
			.then((res) => {
				setDecks((prev) => [...prev, ...res.decks]);
				offsetRef.current += res.decks.length;
			})
			.catch(() => {})
			.finally(() => setIsLoadingMore(false));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key, isLoadingMore, decks.length, total]);

	return {
		decks,
		isLoading,
		isLoadingMore,
		hasMore: decks.length < total,
		total,
		loadMore,
	};
}
```

- [ ] **Step 3: Verify the FK name for the join**

Run: `grep -rn "decks_owner_id_fkey\|owner_id.*references" supabase/migrations/*decks*`
Expected: confirm the FK constraint name. The `create table` used an inline `references auth.users(id)`, so Postgres auto-names it `decks_owner_id_fkey`. If the embedded join `profiles!decks_owner_id_fkey` errors at runtime (PostgREST can't infer the relationship because the FK points at `auth.users`, not `profiles`), fall back to a manual two-step: fetch decks, then batch-fetch `profiles` by `owner_id` via `.in('id', ownerIds)` and merge. Note this contingency here so the implementer expects it.

- [ ] **Step 4: Typecheck + eslint**

Run: `npx tsc --noEmit && npx eslint src/lib/search/db/searchDecks.ts src/lib/search/hooks/useDeckSearch.ts`
Expected: no NEW problems.

- [ ] **Step 5: Build (TS2589 gate)**

Run: `npm run build`
Expected: build succeeds. If it fails at `searchDecks.ts` with TS2589, confirm no filter is chained inside the `let q = supabase.from(...)` initializer — all filters must be `q = q.x()` reassignments (already the case above).

- [ ] **Step 6: Commit**

```bash
git add src/lib/search/db/searchDecks.ts src/lib/search/hooks/useDeckSearch.ts
git commit -m "feat(search): deck search query and hook"
```

---

## Task 7: DeckFilterModal component

**Files:**

- Create: `src/lib/search/components/DeckFilterModal/DeckFilterModal.tsx`
- Create: `src/lib/search/components/DeckFilterModal/DeckFilterModal.module.css`
- Modify: `messages/en.json`, `messages/fr.json`

**Interfaces:**

- Consumes: `DeckSearchFilters`, `COMMANDER_FORMATS`, `DEFAULT_DECK_FILTERS` (Task 4); `DeckFormat` (types); existing `Modal` component (`@/components/Modal/Modal`).
- Produces:
  - `<DeckFilterModal isOpen filters onApply onClose />` where `onApply: (f: DeckSearchFilters) => void`.

- [ ] **Step 1: Add i18n keys**

In `messages/en.json` under `"search"`, add:

```json
		"entityCards": "Cards",
		"entityDecks": "Decks",
		"entityProfiles": "Profiles",
		"entityAriaLabel": "Search type",
		"deckNameLabel": "Deck name",
		"deckFormatLabel": "Format",
		"deckAuthorLabel": "Author",
		"deckAuthorPlaceholder": "Nickname",
		"deckCardInBoardLabel": "Card in deck",
		"deckCommanderLabel": "Commander",
		"deckSearchPlaceholder": "Search decks…",
		"profileSearchPlaceholder": "Search profiles…",
		"deckResultsCount": "{count, plural, one {# deck} other {# decks}}",
		"profileResultsCount": "{count, plural, one {# profile} other {# profiles}}",
		"apply": "Apply",
		"reset": "Reset",
		"viewGrid": "Grid",
		"viewList": "List",
		"colAuthor": "Author",
		"colFormat": "Format",
		"colUpdated": "Updated"
```

In `messages/fr.json` under `"search"`, add:

```json
		"entityCards": "Cartes",
		"entityDecks": "Decks",
		"entityProfiles": "Profils",
		"entityAriaLabel": "Type de recherche",
		"deckNameLabel": "Nom du deck",
		"deckFormatLabel": "Format",
		"deckAuthorLabel": "Auteur",
		"deckAuthorPlaceholder": "Pseudo",
		"deckCardInBoardLabel": "Carte dans le deck",
		"deckCommanderLabel": "Commandant",
		"deckSearchPlaceholder": "Rechercher des decks…",
		"profileSearchPlaceholder": "Rechercher des profils…",
		"deckResultsCount": "{count, plural, one {# deck} other {# decks}}",
		"profileResultsCount": "{count, plural, one {# profil} other {# profils}}",
		"apply": "Appliquer",
		"reset": "Réinitialiser",
		"viewGrid": "Grille",
		"viewList": "Liste",
		"colAuthor": "Auteur",
		"colFormat": "Format",
		"colUpdated": "Mis à jour"
```

(If the `search` block already defines `apply`/`reset`/`viewGrid`/`viewList`, skip the duplicate — check with `python3 -c "import json;print('apply' in json.load(open('messages/en.json'))['search'])"` first.)

- [ ] **Step 2: Write the modal**

Create `src/lib/search/components/DeckFilterModal/DeckFilterModal.tsx`. Manage a local draft copy of filters; the Commander field renders only when a selected format is in `COMMANDER_FORMATS`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal/Modal';
import type { DeckFormat } from '@/types/decks';
import type { DeckSearchFilters } from '@/lib/search/types';
import { COMMANDER_FORMATS, DEFAULT_DECK_FILTERS } from '@/lib/search/types';
import styles from './DeckFilterModal.module.css';

const ALL_FORMATS: DeckFormat[] = [
	'standard',
	'modern',
	'pioneer',
	'legacy',
	'vintage',
	'commander',
	'pauper',
	'draft',
	'limited',
	'oathbreaker',
	'brawl',
];

type Props = {
	isOpen: boolean;
	filters: DeckSearchFilters;
	onApply: (f: DeckSearchFilters) => void;
	onClose: () => void;
};

export function DeckFilterModal({ isOpen, filters, onApply, onClose }: Props) {
	const t = useTranslations('search');
	const [draft, setDraft] = useState<DeckSearchFilters>(filters);

	useEffect(() => {
		if (isOpen) setDraft(filters);
	}, [isOpen, filters]);

	const showCommander = draft.formats.some((f) => COMMANDER_FORMATS.includes(f));

	const toggleFormat = (fmt: DeckFormat) => {
		setDraft((d) => ({
			...d,
			formats: d.formats.includes(fmt) ? d.formats.filter((x) => x !== fmt) : [...d.formats, fmt],
		}));
	};

	const apply = () => {
		// Drop a stale commander value if no commander format is selected.
		const cleaned = showCommander ? draft : { ...draft, commander: '' };
		onApply(cleaned);
		onClose();
	};

	return (
		<Modal isOpen={isOpen} onClose={onClose} title={t('filters')}>
			<div className={styles.body}>
				<label className={styles.field}>
					<span>{t('deckNameLabel')}</span>
					<input
						type="text"
						value={draft.name}
						onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
					/>
				</label>

				<fieldset className={styles.field}>
					<legend>{t('deckFormatLabel')}</legend>
					<div className={styles.formatGrid}>
						{ALL_FORMATS.map((fmt) => (
							<button
								key={fmt}
								type="button"
								className={`${styles.chip} ${draft.formats.includes(fmt) ? styles.chipActive : ''}`}
								aria-pressed={draft.formats.includes(fmt)}
								onClick={() => toggleFormat(fmt)}
							>
								{fmt}
							</button>
						))}
					</div>
				</fieldset>

				<label className={styles.field}>
					<span>{t('deckAuthorLabel')}</span>
					<input
						type="text"
						placeholder={t('deckAuthorPlaceholder')}
						value={draft.authorNickname}
						onChange={(e) => setDraft((d) => ({ ...d, authorNickname: e.target.value }))}
					/>
				</label>

				<label className={styles.field}>
					<span>{t('deckCardInBoardLabel')}</span>
					<input
						type="text"
						value={draft.cardInBoard}
						onChange={(e) => setDraft((d) => ({ ...d, cardInBoard: e.target.value }))}
					/>
				</label>

				{showCommander && (
					<label className={styles.field}>
						<span>{t('deckCommanderLabel')}</span>
						<input
							type="text"
							value={draft.commander}
							onChange={(e) => setDraft((d) => ({ ...d, commander: e.target.value }))}
						/>
					</label>
				)}
			</div>

			<div className={styles.actions}>
				<button type="button" onClick={() => setDraft(DEFAULT_DECK_FILTERS)}>
					{t('reset')}
				</button>
				<button type="button" className={styles.apply} onClick={apply}>
					{t('apply')}
				</button>
			</div>
		</Modal>
	);
}
```

**Note on `cardInBoard`/`commander` inputs:** V1 accepts a raw scryfall_id string (the query filters on `scryfall_id`). If a card-name autocomplete is desired, it can reuse the existing card search; that is out of scope for V1 and the input is a plain text field resolving to a scryfall_id. Document this limitation in the field label via a `title` if needed.

- [ ] **Step 3: Write the CSS module**

Create `src/lib/search/components/DeckFilterModal/DeckFilterModal.module.css` following `FilterModal.module.css` conventions (read that file first for tokens/spacing). Minimum: `.body` (column flex, gap), `.field` (label column), `.formatGrid` (wrap flex), `.chip`/`.chipActive` (pill toggle), `.actions` (right-aligned row), `.apply` (primary button). Reuse the same CSS custom properties the sibling modal uses.

- [ ] **Step 4: Typecheck + eslint**

Run: `npx tsc --noEmit && npx eslint "src/lib/search/components/DeckFilterModal/DeckFilterModal.tsx"`
Expected: no NEW problems. Confirm `Modal` accepts `title` prop (read `@/components/Modal/Modal`); if its API differs (e.g. children-only), adapt the usage to match.

- [ ] **Step 5: Commit**

```bash
git add src/lib/search/components/DeckFilterModal messages/en.json messages/fr.json
git commit -m "feat(search): deck filter modal with conditional commander field"
```

---

## Task 8: ProfileCard component

**Files:**

- Create: `src/lib/search/components/ProfileCard/ProfileCard.tsx`
- Create: `src/lib/search/components/ProfileCard/ProfileCard.module.css`

**Interfaces:**

- Consumes: `ProfileSearchResult` (Task 5); i18n navigation `Link` from `@/i18n/navigation`.
- Produces: `<ProfileCard profile={ProfileSearchResult} />` linking to `/users/[nickname]`.

- [ ] **Step 1: Write ProfileCard**

Create `src/lib/search/components/ProfileCard/ProfileCard.tsx`:

```tsx
'use client';

import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import type { ProfileSearchResult } from '@/lib/search/db/searchProfiles';
import styles from './ProfileCard.module.css';

type Props = { profile: ProfileSearchResult };

export function ProfileCard({ profile }: Props) {
	const href = profile.nickname ? `/users/${encodeURIComponent(profile.nickname)}` : '#';
	return (
		<Link href={href} className={styles.card}>
			<div className={styles.avatar}>
				{profile.avatarUrl ? (
					<Image
						src={profile.avatarUrl}
						alt=""
						width={56}
						height={56}
						className={styles.avatarImg}
					/>
				) : (
					<span className={styles.avatarFallback}>
						{(profile.nickname ?? '?').charAt(0).toUpperCase()}
					</span>
				)}
			</div>
			<div className={styles.body}>
				<span className={styles.nickname}>{profile.nickname ?? '—'}</span>
				{profile.description && <span className={styles.description}>{profile.description}</span>}
			</div>
		</Link>
	);
}
```

- [ ] **Step 2: Verify the user-page route param**

Run: `grep -rn "userId\|nickname" "src/app/[locale]/users/[userId]/useProfileByNickname.ts" | head`
Expected: confirm `/users/[userId]` resolves by nickname (the segment is named `[userId]` but the profiles feature keys on nickname — cf. memory `project_nickname_validation`). If it resolves by nickname, the `href` above is correct; if by UUID, change `href` to `/users/${profile.id}`.

- [ ] **Step 3: Write CSS module**

Create `src/lib/search/components/ProfileCard/ProfileCard.module.css`: `.card` (row flex, gap, padding, border-radius, hover state, no underline), `.avatar` (56px circle, overflow hidden), `.avatarImg`, `.avatarFallback` (centered initial), `.body` (column), `.nickname` (bold), `.description` (muted, 2-line clamp). Use existing color tokens.

- [ ] **Step 4: Confirm `cards.scryfall.io`/avatar host is allowed for next/image**

Run: `grep -rn "remotePatterns\|domains" next.config.*`
Expected: confirm the avatar bucket host (Supabase storage public URL) is in `remotePatterns`. If avatars are served from the Supabase project host and it's not whitelisted, either add it or use a plain `<img>` for the fallback (note: memory `project_scryfall_image_ua_block` concerns scryfall images specifically — avatars come from Supabase storage, a different host).

- [ ] **Step 5: Typecheck + eslint**

Run: `npx tsc --noEmit && npx eslint "src/lib/search/components/ProfileCard/ProfileCard.tsx"`
Expected: no NEW problems.

- [ ] **Step 6: Commit**

```bash
git add src/lib/search/components/ProfileCard
git commit -m "feat(search): profile result card"
```

---

## Task 9: SearchEntitySwitcher + URL state

**Files:**

- Create: `src/app/[locale]/search/components/SearchEntitySwitcher/SearchEntitySwitcher.tsx`
- Create: `src/app/[locale]/search/components/SearchEntitySwitcher/SearchEntitySwitcher.module.css`
- Modify: `src/app/[locale]/search/useSearchFiltersFromUrl.ts`

**Interfaces:**

- Consumes: `SearchEntity`, `DeckSearchFilters`, `DEFAULT_DECK_FILTERS` (Task 4).
- Produces:
  - `<SearchEntitySwitcher value onChange />` where `value: SearchEntity`, `onChange: (e: SearchEntity) => void`.
  - `useSearchFiltersFromUrl()` additionally returns: `entity`, `setEntity`, `deckFilters`, `setDeckFilters`, `profileTerm`, `setProfileTerm`.

- [ ] **Step 1: Write the switcher (mirror SearchModeSwitcher)**

Create `src/app/[locale]/search/components/SearchEntitySwitcher/SearchEntitySwitcher.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import styles from './SearchEntitySwitcher.module.css';
import type { SearchEntity } from '@/lib/search/types';

const ENTITY_KEYS = {
	cards: 'entityCards',
	decks: 'entityDecks',
	profiles: 'entityProfiles',
} as const;

const ENTITIES: SearchEntity[] = ['cards', 'decks', 'profiles'];

type Props = { value: SearchEntity; onChange: (e: SearchEntity) => void };

export function SearchEntitySwitcher({ value, onChange }: Props) {
	const t = useTranslations('search');
	return (
		<div className={styles.switcher} role="group" aria-label={t('entityAriaLabel')}>
			{ENTITIES.map((entity) => (
				<button
					key={entity}
					type="button"
					className={`${styles.option} ${value === entity ? styles.active : ''}`}
					onClick={() => onChange(entity)}
					aria-pressed={value === entity}
				>
					{t(ENTITY_KEYS[entity])}
				</button>
			))}
		</div>
	);
}
```

- [ ] **Step 2: Write the CSS module**

Create `SearchEntitySwitcher.module.css` by copying `SearchModeSwitcher.module.css` and keeping the same class names (`.switcher`, `.option`, `.active`). Read the source file first and replicate exactly (it is the established look for this control).

- [ ] **Step 3: Extend `useSearchFiltersFromUrl` with entity + deck/profile state**

In `src/app/[locale]/search/useSearchFiltersFromUrl.ts`:

Add to the valid-set constants at top:

```typescript
const VALID_ENTITIES = new Set(['cards', 'decks', 'profiles']);
```

Add a parser near `parseMode`:

```typescript
function parseEntity(param: string | null): SearchEntity {
	if (param && VALID_ENTITIES.has(param)) return param as SearchEntity;
	return 'cards';
}
```

Import at top: add `SearchEntity`, `DeckSearchFilters`, `DEFAULT_DECK_FILTERS` to the existing `@/lib/search/types` import and to the type import.

Inside the hook, add state (read initial from URL):

```typescript
const [entity, setEntity] = useState<SearchEntity>(() => parseEntity(searchParams.get('entity')));
const [profileTerm, setProfileTerm] = useState(() => searchParams.get('pq') ?? '');
const [deckFilters, setDeckFilters] = useState<DeckSearchFilters>(() => ({
	name: searchParams.get('dname') ?? '',
	formats: (searchParams.get('dformats')?.split(',').filter(Boolean) ??
		[]) as DeckSearchFilters['formats'],
	authorNickname: searchParams.get('dauthor') ?? '',
	cardInBoard: searchParams.get('dcard') ?? '',
	commander: searchParams.get('dcmd') ?? '',
}));
```

In `buildSearchParams`, extend `UrlSyncState` with `entity`, `profileTerm`, `deckFilters` and append (before `return params`):

```typescript
if (state.entity !== 'cards') params.set('entity', state.entity);
if (state.profileTerm) params.set('pq', state.profileTerm);
if (state.deckFilters.name) params.set('dname', state.deckFilters.name);
if (state.deckFilters.formats.length > 0)
	params.set('dformats', state.deckFilters.formats.join(','));
if (state.deckFilters.authorNickname) params.set('dauthor', state.deckFilters.authorNickname);
if (state.deckFilters.cardInBoard) params.set('dcard', state.deckFilters.cardInBoard);
if (state.deckFilters.commander) params.set('dcmd', state.deckFilters.commander);
```

Add `entity`, `profileTerm`, `deckFilters` to the object passed into `buildSearchParams` in the sync effect, and to the effect's dependency array.

Return `entity, setEntity, profileTerm, setProfileTerm, deckFilters, setDeckFilters` from the hook.

- [ ] **Step 4: Typecheck + eslint**

Run: `npx tsc --noEmit && npx eslint "src/app/[locale]/search/components/SearchEntitySwitcher/SearchEntitySwitcher.tsx" "src/app/[locale]/search/useSearchFiltersFromUrl.ts"`
Expected: no NEW problems.

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/search/components/SearchEntitySwitcher" "src/app/[locale]/search/useSearchFiltersFromUrl.ts"
git commit -m "feat(search): entity switcher and deck/profile URL state"
```

---

## Task 10: Extract CardSearchView

**Files:**

- Create: `src/app/[locale]/search/views/CardSearchView.tsx`
- Modify: `src/app/[locale]/search/page.tsx`

**Interfaces:**

- Consumes: all card-search state from `useSearchFiltersFromUrl()` (name/colors/…/mode).
- Produces: `<CardSearchView />` — a self-contained component rendering the current card search UI (SearchBar + SearchModeSwitcher + FilterModal + CardList + result/error states).

- [ ] **Step 1: Move the card UI into `CardSearchView`**

Create `src/app/[locale]/search/views/CardSearchView.tsx`. Move the entire body of the current `SearchPageContent` (everything from `const t = useTranslations('search')` through the closing `</main>`... but keep `<main>`/page wrappers in `page.tsx` — see Step 2) into this component. Concretely: `CardSearchView` owns `useSearchFiltersFromUrl` consumption for card fields, the two search hooks (`useScryfallCardSearch`, `useCustomCards`), `useScryfallSets`, the modal state, `tableColumns`, and returns the `searchSection` + `FilterModal` + result info + `CardList` + no-results JSX. Import paths shift from `./` to `../` (e.g. `../useSearchFiltersFromUrl`, `../searchCardMenu`).

Since `useSearchFiltersFromUrl` is a single hook returning ALL entity state, call it once inside `CardSearchView` and destructure only the card fields there. (The parent will call it separately for `entity`; a hook called in two components maintains independent URL-synced state, which is fine because only the mounted view drives the URL — but to avoid double URL writers, see Task 11's guard.)

- [ ] **Step 2: Verify build compiles with the extracted component unused-imported**

Run: `npx tsc --noEmit`
Expected: `CardSearchView` compiles. `page.tsx` still renders the old inline body at this step (not yet switched) — that's fine; Task 11 rewires it.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/search/views/CardSearchView.tsx"
git commit -m "refactor(search): extract CardSearchView from search page"
```

---

## Task 11: Wire page.tsx to entity routing + build the two new views

**Files:**

- Modify: `src/app/[locale]/search/page.tsx`
- Create: `src/app/[locale]/search/views/DeckSearchView.tsx`
- Create: `src/app/[locale]/search/views/ProfileSearchView.tsx`

**Interfaces:**

- Consumes: `useSearchFiltersFromUrl` (entity/deckFilters/profileTerm), `SearchEntitySwitcher`, `CardSearchView`, `DeckSearchView`, `ProfileSearchView`, `useDeckSearch`, `useProfileSearch`, `DeckFilterModal`, `DeckCard`, `ProfileCard`, `SearchBar`.

- [ ] **Step 1: Rewrite `SearchPageContent` in `page.tsx`**

Replace the body of `SearchPageContent` so it: (a) calls `useSearchFiltersFromUrl()` ONCE, taking `entity, setEntity` (and the deck/profile pieces to pass down); (b) renders the shared page/main wrapper + `SearchEntitySwitcher`; (c) routes to the active view. To avoid two components both syncing the URL, do NOT also call `useSearchFiltersFromUrl` inside `CardSearchView` — instead pass the hook's return down, OR keep the single call in `page.tsx` and pass card props into `CardSearchView`. Simplest: `page.tsx` calls the hook once and passes the whole bag to whichever view is active:

```tsx
function SearchPageContent() {
	const {
		entity,
		setEntity,
		deckFilters,
		setDeckFilters,
		profileTerm,
		setProfileTerm,
		...cardState
	} = useSearchFiltersFromUrl();

	return (
		<div className={styles.page}>
			<main className={styles.main}>
				<div className={styles.searchSection}>
					<SearchEntitySwitcher value={entity} onChange={setEntity} />
				</div>
				{entity === 'cards' && <CardSearchView cardState={cardState} />}
				{entity === 'decks' && (
					<DeckSearchView filters={deckFilters} onFiltersChange={setDeckFilters} />
				)}
				{entity === 'profiles' && (
					<ProfileSearchView term={profileTerm} onTermChange={setProfileTerm} />
				)}
			</main>
		</div>
	);
}
```

Adjust `CardSearchView` from Task 10 to accept a `cardState` prop (the destructured card fields) instead of calling the hook itself. Update its signature accordingly and remove its internal `useSearchFiltersFromUrl` call. (Keep the Suspense wrapper `SearchPage` unchanged.)

- [ ] **Step 2: Build `DeckSearchView`**

Create `src/app/[locale]/search/views/DeckSearchView.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { SearchBar } from '@/lib/search/components/SearchBar/SearchBar';
import { DeckFilterModal } from '@/lib/search/components/DeckFilterModal/DeckFilterModal';
import { useDeckSearch } from '@/lib/search/hooks/useDeckSearch';
import { countActiveDeckFilters, type DeckSearchFilters } from '@/lib/search/types';
import { DeckCard } from '@/app/[locale]/decks/components/DeckCard/DeckCard';
import { Spinner } from '@/components/Spinner/Spinner';
import styles from '../page.module.css';

type Props = {
	filters: DeckSearchFilters;
	onFiltersChange: (f: DeckSearchFilters) => void;
};

export function DeckSearchView({ filters, onFiltersChange }: Props) {
	const t = useTranslations('search');
	const router = useRouter();
	const [modalOpen, setModalOpen] = useState(false);
	const { decks, isLoading, isLoadingMore, hasMore, total, loadMore } = useDeckSearch(filters);
	const activeCount = countActiveDeckFilters(filters);

	return (
		<>
			<div className={styles.searchRow}>
				<SearchBar
					value={filters.name}
					onChange={(v) => onFiltersChange({ ...filters, name: v })}
					placeholder={t('deckSearchPlaceholder')}
				/>
				<button type="button" className={styles.filtersButton} onClick={() => setModalOpen(true)}>
					{t('filters')}
					{activeCount > 0 && <span className={styles.filterBadge}>{activeCount}</span>}
				</button>
			</div>

			<DeckFilterModal
				isOpen={modalOpen}
				filters={filters}
				onApply={onFiltersChange}
				onClose={() => setModalOpen(false)}
			/>

			{!isLoading && decks.length > 0 && (
				<div className={styles.resultInfo}>
					<span>{t('deckResultsCount', { count: total })}</span>
				</div>
			)}

			{isLoading ? (
				<div className={styles.loading}>
					<Spinner size="lg" />
				</div>
			) : (
				<div className={styles.deckGrid}>
					{decks.map(({ deck, authorNickname }) => (
						<DeckCard
							key={deck.id}
							deck={deck}
							symbolMap={{}}
							readOnly
							onClick={() => router.push(`/decks/${deck.id}`)}
						/>
					))}
				</div>
			)}

			{hasMore && !isLoading && (
				<div className={styles.loadMore}>
					<button type="button" onClick={loadMore} disabled={isLoadingMore}>
						{isLoadingMore ? <Spinner size="sm" /> : t('viewList')}
					</button>
				</div>
			)}
		</>
	);
}
```

**Note:** `DeckCard` requires a `symbolMap` prop (`Record<string, ScryfallCardSymbol>`); mana symbols on the mini-curve need it. For V1 pass `{}` (curve renders without symbol art) OR wire `useScryfallSymbols` if the app has a shared hook — check with `grep -rn "symbolMap=" "src/app/[locale]/decks"` and reuse the same source the decks page uses. If author display on the card is desired, render `authorNickname` beneath each `DeckCard` in a wrapper `<div>` (DeckCard itself has no author slot). Add a `.deckGrid`, `.loadMore` rule to `page.module.css` (grid of cards; centered load-more button) reusing existing spacing tokens.

- [ ] **Step 3: Build `ProfileSearchView`**

Create `src/app/[locale]/search/views/ProfileSearchView.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { SearchBar } from '@/lib/search/components/SearchBar/SearchBar';
import { ProfileCard } from '@/lib/search/components/ProfileCard/ProfileCard';
import { useProfileSearch } from '@/lib/search/hooks/useProfileSearch';
import { Spinner } from '@/components/Spinner/Spinner';
import styles from '../page.module.css';

type Props = { term: string; onTermChange: (t: string) => void };

export function ProfileSearchView({ term, onTermChange }: Props) {
	const t = useTranslations('search');
	const { profiles, isLoading, isLoadingMore, hasMore, total, loadMore } = useProfileSearch(term);

	return (
		<>
			<div className={styles.searchRow}>
				<SearchBar
					value={term}
					onChange={onTermChange}
					placeholder={t('profileSearchPlaceholder')}
				/>
			</div>

			{!isLoading && profiles.length > 0 && (
				<div className={styles.resultInfo}>
					<span>{t('profileResultsCount', { count: total })}</span>
				</div>
			)}

			{isLoading ? (
				<div className={styles.loading}>
					<Spinner size="lg" />
				</div>
			) : (
				<div className={styles.profileGrid}>
					{profiles.map((p) => (
						<ProfileCard key={p.id} profile={p} />
					))}
				</div>
			)}

			{hasMore && !isLoading && (
				<div className={styles.loadMore}>
					<button type="button" onClick={loadMore} disabled={isLoadingMore}>
						{isLoadingMore ? <Spinner size="sm" /> : '…'}
					</button>
				</div>
			)}
		</>
	);
}
```

Add `.profileGrid` to `page.module.css` (responsive grid).

- [ ] **Step 4: Typecheck, eslint, build**

Run: `npx tsc --noEmit && npx eslint "src/app/[locale]/search/page.tsx" "src/app/[locale]/search/views/DeckSearchView.tsx" "src/app/[locale]/search/views/ProfileSearchView.tsx" "src/app/[locale]/search/views/CardSearchView.tsx" && npm run build`
Expected: build succeeds; no NEW eslint/tsc problems on changed files.

- [ ] **Step 5: Runtime — all three tabs**

Run: `npm run dev`. Visit `/search`. Verify:

- Cards tab: identical behavior to before (search, filters, modes).
- Decks tab: shows public decks; open filter modal; select `commander` format → Commander input appears; filter by author nickname; filter by card (paste a scryfall_id from a known deck card).
- Profiles tab: typing a nickname filters profiles; clicking a card navigates to `/users/<nickname>`.
- URL: switching tabs sets `?entity=`; deck/profile filters reflect in the URL and survive reload.
  Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/search/page.tsx" "src/app/[locale]/search/views" "src/app/[locale]/search/page.module.css" "src/app/[locale]/search/views/CardSearchView.tsx"
git commit -m "feat(search): multi-entity routing with deck and profile views"
```

---

## Task 12: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full check**

Run: `npm run check`
Expected: no NEW problems vs the ~60-problem baseline. If new problems appear, they are in files this plan touched — fix them. Cross-check by running `git stash && npm run check 2>&1 | tail -3 && git stash pop` to capture the baseline count, then compare.

- [ ] **Step 2: i18n parity**

Run: `python3 -c "import json; e=json.load(open('messages/en.json'))['search']; f=json.load(open('messages/fr.json'))['search']; print('missing in fr:', set(e)-set(f)); print('missing in en:', set(f)-set(e))"` and the same for the `decks` block.
Expected: both empty sets.

- [ ] **Step 3: Migration re-apply from scratch**

Run: `npm run sb:reset && npm run sb:verify`
Expected: full reset applies all migrations including the new one; verify passes.

- [ ] **Step 4: Privacy spot-check**

In Studio, set one deck `is_public=false`, then (logged out or as another user in the app) confirm it does NOT appear in deck search and its `/decks/[id]` page is not readable; set it back to public and confirm it reappears.
Expected: private deck hidden; public deck visible.

- [ ] **Step 5: Final commit (if any fixes)**

```bash
git add -A
git commit -m "chore(search): final verification fixes for multi-entity search"
```

---

## Self-Review Notes

- **Spec coverage:** §1 Navigation → Tasks 9-11. §2 DB → Task 1. §3 Deck filter modal → Tasks 4, 7. §4 Data/queries → Tasks 5, 6. §5 Rendering + toggle → Tasks 3, 8, 11. i18n → Tasks 3, 7, 12. Verification → Task 12.
- **Contingencies flagged inline:** PostgREST embed on a FK pointing at `auth.users` (Task 6 Step 3), user-page route param name (Task 8 Step 2), avatar image host (Task 8 Step 4), `Modal` API shape (Task 7 Step 4), `DeckCard.symbolMap` source (Task 11 Step 2). These are real unknowns a fresh implementer must confirm against the codebase — each has an explicit fallback.
- **Type consistency:** `isPublic` (camel, app) vs `is_public` (snake, DB) threaded consistently; `DeckSearchFilters` field names (`name`/`formats`/`authorNickname`/`cardInBoard`/`commander`) identical across Tasks 4, 6, 7, 9, 11.
