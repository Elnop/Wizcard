# Localized Card-Name Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Search all languages" toggle beside both card-search bars that enables Scryfall multilingual name matching (`include_multilingual=true`) so users can find cards by their localized printed names.

**Architecture:** A new `includeMultilingual` boolean threads from each search-bar UI through `SearchFilters` into `useScryfallCardSearch`, which forwards it to `searchCards` as the `include_multilingual` request param — but only when a name term is present. A new controlled toggle component renders the control. The main `/search` page persists the flag in the URL; the deck panel keeps it in local state. The toggle defaults on when the user's preferred card language is non-English.

**Tech Stack:** Next.js (App Router), React, TypeScript, next-intl, CSS Modules. Scryfall REST API.

## Global Constraints

- No test framework exists in this repo. "Test" means `npm run check` (TypeScript + ESLint + Prettier) plus manual runtime verification. Do NOT add vitest/jest or write `*.test.ts` files.
- `ScryfallSearchParams.include_multilingual?: boolean` already exists (`src/lib/scryfall/types/api.ts:16`) and `searchCards` already forwards it (`src/lib/scryfall/endpoints/cards.ts:24-27`). Do NOT re-add these.
- Never send a `unique` param (Scryfall defaults to `cards`, which is what we want). Never add a `lang:` keyword to the query.
- `include_multilingual=true` is added ONLY when the effective name term is non-empty. Empty-query default views must stay byte-for-byte identical.
- Commit after each task with the `feat:`/`refactor:` prefix shown. End commit messages with the Co-Authored-By trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Preferred-language source: `usePreferredCardLang()` from `src/lib/scryfall/hooks/useLocalizedImage.ts` returns a Scryfall code string (e.g. `'fr'`) or `undefined`.

---

### Task 1: Thread `includeMultilingual` through `useScryfallCardSearch`

**Files:**

- Modify: `src/lib/scryfall/hooks/useScryfallCardSearch.ts`

**Interfaces:**

- Consumes: existing `searchCards(params: ScryfallSearchParams, signal?)` where `ScryfallSearchParams` already has `include_multilingual?: boolean`.
- Produces: `SearchFilters` gains `includeMultilingual?: boolean`. The hook sends `include_multilingual: true` to `searchCards` only when the effective (trimmed) name term is non-empty AND `filters.includeMultilingual` is true. The flag participates in `searchKey` so toggling re-fires the search.

- [ ] **Step 1: Add the field to the `SearchFilters` interface**

In `src/lib/scryfall/hooks/useScryfallCardSearch.ts`, add to the `SearchFilters` interface (after the `dir?` line, currently line 28):

```typescript
	dir?: ScryfallSortDir;
	includeMultilingual?: boolean;
}
```

- [ ] **Step 2: Derive an `includeMultilingual` value scoped to a present name term**

The hook already computes `order` and `dir` near line 72. Directly after those two lines, add:

```typescript
const order = filters.order ?? 'name';
const dir = filters.dir ?? 'auto';
const includeMultilingual = filters.includeMultilingual ?? false;
```

- [ ] **Step 3: Pass `include_multilingual` into `fetchCards` only when the name term is present**

`fetchCards` builds `effectiveQuery` (currently line 135) then calls `searchCards` (currently line 154). The multilingual flag must reflect whether THIS request carries a name term. The simplest correct place is inside `fetchCards`: compute it from `debouncedName`, which is the only name source. Replace the `searchCards` call (line 154) with:

```typescript
const multilingual = includeMultilingual && debouncedName.trim().length > 0;
const result = await searchCards(
	{
		q: effectiveQuery,
		page: pageNum,
		order,
		dir,
		...(multilingual ? { include_multilingual: true } : {}),
	},
	signal
);
```

- [ ] **Step 4: Add `includeMultilingual` and `debouncedName` to the `fetchCards` dependency array**

`fetchCards` is a `useCallback` whose dep array is currently `[order, dir]` (line 197). Change it to:

```typescript
[order, dir, includeMultilingual, debouncedName];
```

- [ ] **Step 5: Include the flag in `searchKey` so toggling re-fires the search**

The effect at line 200 computes `searchKey` (currently line 209) as `` `${effectiveQuery}|${order}|${dir}` ``. Change that line to include the multilingual state:

```typescript
const multilingual = includeMultilingual && debouncedName.trim().length > 0;
const searchKey = `${effectiveQuery}|${order}|${dir}|${multilingual}`;
```

Then add `includeMultilingual` to that effect's dependency array (currently ends `..., order, dir]` at line 217):

```typescript
	}, [enabled, debouncedName, buildQuery, fetchCards, order, dir, includeMultilingual]);
```

- [ ] **Step 6: Verify types and lint pass**

Run: `npm run check`
Expected: PASS (no TypeScript or ESLint errors). If ESLint flags the `fetchCards` dep array, confirm `debouncedName` and `includeMultilingual` are both listed.

- [ ] **Step 7: Commit**

```bash
git add src/lib/scryfall/hooks/useScryfallCardSearch.ts
git commit -m "feat: thread includeMultilingual through card search hook

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Add the `SearchAllLanguagesToggle` component

**Files:**

- Create: `src/lib/search/components/SearchAllLanguagesToggle/SearchAllLanguagesToggle.tsx`
- Create: `src/lib/search/components/SearchAllLanguagesToggle/SearchAllLanguagesToggle.module.css`
- Modify: `messages/en.json`
- Modify: `messages/fr.json`

**Interfaces:**

- Produces: `SearchAllLanguagesToggle` component with props `{ value: boolean; onChange: (value: boolean) => void }`. Reads i18n from the `search` namespace, keys `searchAllLanguages` (visible label) and `searchAllLanguagesAria` (aria-label).

- [ ] **Step 1: Add the i18n keys to `messages/en.json`**

In `messages/en.json`, inside the `"search"` object, add these two keys (place them after `"placeholder"`):

```json
		"searchAllLanguages": "All languages",
		"searchAllLanguagesAria": "Match card names in all languages",
```

- [ ] **Step 2: Add the i18n keys to `messages/fr.json`**

In `messages/fr.json`, inside the `"search"` object, add:

```json
		"searchAllLanguages": "Toutes les langues",
		"searchAllLanguagesAria": "Rechercher les noms de cartes dans toutes les langues",
```

- [ ] **Step 3: Create the CSS module**

Create `src/lib/search/components/SearchAllLanguagesToggle/SearchAllLanguagesToggle.module.css`:

```css
.toggle {
	display: inline-flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0 0.75rem;
	height: 40px;
	border: 1px solid var(--border-color, #333);
	border-radius: 8px;
	background: var(--surface, #1a1a1a);
	color: var(--text-secondary, #aaa);
	font-size: 0.85rem;
	cursor: pointer;
	white-space: nowrap;
	user-select: none;
	transition:
		border-color 0.15s ease,
		color 0.15s ease;
}

.toggle:hover {
	border-color: var(--border-hover, #555);
}

.toggle.active {
	border-color: var(--accent, #6c5ce7);
	color: var(--text-primary, #fff);
}

.checkbox {
	width: 14px;
	height: 14px;
	margin: 0;
	accent-color: var(--accent, #6c5ce7);
	cursor: pointer;
}
```

- [ ] **Step 4: Create the component**

Create `src/lib/search/components/SearchAllLanguagesToggle/SearchAllLanguagesToggle.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import styles from './SearchAllLanguagesToggle.module.css';

type Props = {
	value: boolean;
	onChange: (value: boolean) => void;
};

export function SearchAllLanguagesToggle({ value, onChange }: Props) {
	const t = useTranslations('search');
	return (
		<label
			className={`${styles.toggle} ${value ? styles.active : ''}`}
			aria-label={t('searchAllLanguagesAria')}
		>
			<input
				type="checkbox"
				className={styles.checkbox}
				checked={value}
				onChange={(e) => onChange(e.target.checked)}
			/>
			{t('searchAllLanguages')}
		</label>
	);
}
```

- [ ] **Step 5: Verify types and lint pass**

Run: `npm run check`
Expected: PASS. The component is not yet imported anywhere, so this only checks it compiles and the JSON is valid.

- [ ] **Step 6: Commit**

```bash
git add src/lib/search/components/SearchAllLanguagesToggle messages/en.json messages/fr.json
git commit -m "feat: add SearchAllLanguagesToggle component and i18n keys

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Wire the toggle into the main `/search` page with URL persistence

**Files:**

- Modify: `src/app/[locale]/search/useSearchFiltersFromUrl.ts`
- Modify: `src/app/[locale]/search/page.tsx`

**Interfaces:**

- Consumes: `SearchAllLanguagesToggle` (Task 2), `SearchFilters.includeMultilingual` (Task 1), `usePreferredCardLang()` from `src/lib/scryfall/hooks/useLocalizedImage.ts`.
- Produces: `useSearchFiltersFromUrl()` returns two new members: `includeMultilingual: boolean` and `setIncludeMultilingual: (v: boolean) => void`, persisted as URL param `ml=1`.

- [ ] **Step 1: Add default-derivation import and state to `useSearchFiltersFromUrl`**

In `src/app/[locale]/search/useSearchFiltersFromUrl.ts`, add this import after the existing type imports (near line 12):

```typescript
import { usePreferredCardLang } from '@/lib/scryfall/hooks/useLocalizedImage';
```

Then, inside `useSearchFiltersFromUrl` after the `oracleIdFilter` state block (currently ends line 145), add:

```typescript
const preferredLang = usePreferredCardLang();
const [includeMultilingual, setIncludeMultilingual] = useState<boolean>(() => {
	const raw = searchParams.get('ml');
	if (raw === '1') return true;
	if (raw === '0') return false;
	// Default: on when the user's preferred card language is non-English.
	return preferredLang !== undefined && preferredLang !== 'en';
});
```

- [ ] **Step 2: Persist `ml` in the URL-sync effect**

In the same file, inside the URL-building effect, after the `oracleIdFilter` line (currently line 173), add:

```typescript
if (includeMultilingual) params.set('ml', '1');
```

Then add `includeMultilingual` to that effect's dependency array (currently ends `..., oracleIdFilter, router]` around line 194):

```typescript
		oracleIdFilter,
		includeMultilingual,
		router,
```

- [ ] **Step 3: Return the new members from the hook**

In the same file, in the returned object (currently ends with `activeFilterCount,` near line 251), add:

```typescript
		includeMultilingual,
		setIncludeMultilingual,
		activeFilterCount,
```

- [ ] **Step 4: Consume the new members in `page.tsx`**

In `src/app/[locale]/search/page.tsx`, add to the destructuring of `useSearchFiltersFromUrl()` (the block starting line 70, alongside `oracleIdFilter`):

```typescript
		oracleIdFilter,
		includeMultilingual,
		setIncludeMultilingual,
		applyFilters,
```

- [ ] **Step 5: Pass the flag into the search hook**

In `page.tsx`, the `useScryfallCardSearch` filters object (starting line 112) currently ends with `dir,`. Add `includeMultilingual`:

```typescript
				order,
				dir,
				includeMultilingual,
			},
			{ enabled: mode === 'official' }
```

- [ ] **Step 6: Render the toggle in the search row**

In `page.tsx`, add the import near the other component imports (after the `SearchModeSwitcher` import, line 17):

```typescript
import { SearchAllLanguagesToggle } from '@/lib/search/components/SearchAllLanguagesToggle/SearchAllLanguagesToggle';
```

Then in the `searchRow` div (line 218), add the toggle after `SearchModeSwitcher` (line 220):

```tsx
						<SearchBar value={name} onChange={setName} placeholder={t('placeholder')} />
						<SearchModeSwitcher value={mode} onChange={setMode} />
						<SearchAllLanguagesToggle
							value={includeMultilingual}
							onChange={setIncludeMultilingual}
						/>
```

- [ ] **Step 7: Verify types and lint pass**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 8: Runtime verification**

Start the dev server (`npm run dev` if not already running). In a browser:

1. Go to `/search`, toggle "All languages" ON, type `Colère de Dieu`.
   Expected: _Wrath of God_ appears in results; URL contains `ml=1`.
2. Toggle OFF, keep the same text.
   Expected: no results (English-only matching); `ml` removed from URL.
3. Clear the search box with the toggle ON.
   Expected: default popular-EDH view, identical to before this change.

- [ ] **Step 9: Commit**

```bash
git add src/app/[locale]/search/useSearchFiltersFromUrl.ts src/app/[locale]/search/page.tsx
git commit -m "feat: add all-languages toggle to search page with URL persistence

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Wire the toggle into the deck `CardSearchPanel` (local state)

**Files:**

- Modify: `src/app/[locale]/decks/[id]/components/CardSearchPanel/CardSearchPanel.tsx`

**Interfaces:**

- Consumes: `SearchAllLanguagesToggle` (Task 2), `SearchFilters.includeMultilingual` (Task 1), `usePreferredCardLang()`.
- Produces: no exported interface change; internal local state only.

- [ ] **Step 1: Add imports**

In `src/app/[locale]/decks/[id]/components/CardSearchPanel/CardSearchPanel.tsx`, add after the `SearchBar` import (line 5):

```typescript
import { SearchAllLanguagesToggle } from '@/lib/search/components/SearchAllLanguagesToggle/SearchAllLanguagesToggle';
import { usePreferredCardLang } from '@/lib/scryfall/hooks/useLocalizedImage';
```

- [ ] **Step 2: Add local state with the preferred-language default**

Next to the existing `const [searchName, setSearchName] = useState('');` (line 62), add:

```typescript
const [searchName, setSearchName] = useState('');
const preferredLang = usePreferredCardLang();
const [includeMultilingual, setIncludeMultilingual] = useState<boolean>(
	() => preferredLang !== undefined && preferredLang !== 'en'
);
```

- [ ] **Step 3: Pass the flag into `scryfallFilters`**

In the `scryfallFilters` object (starting line 243), add `includeMultilingual` after the `dir` line (line 258). It must be disabled in collection-only mode, matching the sibling fields:

```typescript
			order: inCollectionOnly ? 'name' : order,
			dir: inCollectionOnly ? 'auto' : dir,
			includeMultilingual: inCollectionOnly ? false : includeMultilingual,
		};
```

- [ ] **Step 4: Render the toggle in the panel's search row**

In the `searchRow` div (line 372), add the toggle after `CardModeSwitcher` (line 378):

```tsx
							<CardModeSwitcher value={cardMode} onChange={setCardMode} />
							<SearchAllLanguagesToggle
								value={includeMultilingual}
								onChange={setIncludeMultilingual}
							/>
```

- [ ] **Step 5: Verify types and lint pass**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 6: Runtime verification**

In the dev server, open a deck detail page and open the card-search panel:

1. Toggle "All languages" ON, type `Colère de Dieu`.
   Expected: _Wrath of God_ appears.
2. Toggle OFF, same text.
   Expected: no results.
3. Switch to collection-only mode with the toggle ON.
   Expected: unchanged collection filtering behavior (flag ignored there).

- [ ] **Step 7: Commit**

```bash
git add "src/app/[locale]/decks/[id]/components/CardSearchPanel/CardSearchPanel.tsx"
git commit -m "feat: add all-languages toggle to deck card search panel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**

- Toggle beside main `/search` bar → Task 3. ✅
- Toggle beside deck `CardSearchPanel` bar → Task 4. ✅
- `include_multilingual=true` only when name term present → Task 1 (Steps 3 & 5 gate on `debouncedName.trim().length > 0`). ✅
- No `unique`, no `lang:` → Task 1 sends only `include_multilingual`; query builder untouched. ✅
- Empty query unchanged → gated by name-present check; verified in Task 3 Step 8.3 and Task 4 Step 6.3. ✅
- Default on for non-English preferred lang → Task 3 Step 1, Task 4 Step 2. ✅
- URL persistence on main page, local state in deck panel → Task 3 (`ml=1`), Task 4 (`useState`). ✅
- i18n keys → Task 2 Steps 1-2. ✅
- Testing via `npm run check` + runtime → every task. ✅

**Placeholder scan:** No TBD/TODO; all code shown in full. ✅

**Type consistency:** Field name `includeMultilingual` used identically across `SearchFilters` (Task 1), the hook (Task 1), `useSearchFiltersFromUrl` return (Task 3), and both call sites (Tasks 3, 4). Request param name `include_multilingual` matches the existing `ScryfallSearchParams` field. Component prop names `value`/`onChange` consistent between Task 2 definition and Tasks 3/4 usage. ✅
