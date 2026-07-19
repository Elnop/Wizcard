# Ignored Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Ignored Tags" account setting (NSFW ignored by default) that hides custom prints carrying an ignored tag across print lists, the card page, and the print picker — and non-destructively falls back to an official print when a selected custom print is ignored or fails to load.

**Architecture:** A new `profiles.ignored_tags text[]` column (default `{nsfw}`), surfaced through the existing profile types / DB mapping / sync-queue. A single filter in `useCustomCardPrints` hides ignored custom prints from lists/picker/card page. `CardImage` (the universal render point) is extended so a `CustomCard` that is either ignored or failed-to-load is routed through the existing localized→official→placeholder fallback chain instead of showing its custom image — never touching the stored selection. A new `IgnoredTagsSection` in Settings edits the list via a reusable chips+autocomplete tag input that also accepts free-text tags.

**Tech Stack:** Next.js (App Router) + React client components, Zustand profile store, Supabase (Postgres), next-intl (fr/en), TypeScript, CSS Modules.

## Global Constraints

- **No test framework** — there is no vitest/jest. "Tests" mean: `npm run check` (TypeScript + ESLint + Prettier) and runtime verification (dev server, Supabase reset/migrate/Studio). Never add a test runner.
- **`npm run check` baseline is RED** — ~60 pre-existing problems in unrelated files. The gate is **no NEW problems**. Verify changed files specifically with `npx eslint <changed files>` and confirm your files are clean; do not try to make the whole repo green.
- **Tags are lowercase, full names** — `nsfw`, `nudity`, `gore`, … (aligned with `CustomCard.custom.tags`). Never store the short search code `'n'` in `ignored_tags`.
- **Non-destructive fallback** — never rewrite a stored print selection (`scryfallId = 'mpc:<uuid>'`). Fallback happens only at render time.
- **Default guest ignored tags** = `['nsfw']`.
- **i18n both locales** — every new user-facing string added to both `messages/en.json` and `messages/fr.json`.
- **Commit message trailer** — end each commit body with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: DB migration + profile data model

Adds the `ignored_tags` column and threads it through the profile types, DB mapping, and store default so the value round-trips through the existing sync-queue.

**Files:**

- Create: `supabase/migrations/20260719120000_add_profile_ignored_tags.sql`
- Modify: `src/lib/profile/types.ts`
- Modify: `src/lib/profile/db/profiles.ts`
- Modify: `src/lib/profile/store/profile-store.ts`
- Modify: `supabase/bootstrap/init_schema.sql` (add column to the consolidated `profiles` definition)
- Modify: `supabase/verify_schema.sql` (add an assertion for the `ignored_tags` column)

**Interfaces:**

- Produces: `Profile.ignoredTags: string[]`, `ProfileUpdate` accepts `ignoredTags`. DB column `public.profiles.ignored_tags text[] not null default '{nsfw}'::text[]`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260719120000_add_profile_ignored_tags.sql`:

```sql
-- Ignored tags: custom prints carrying any of these tags are hidden across
-- print lists / card page / picker, and fall back to an official print at
-- display time. Default '{nsfw}' so new profiles hide NSFW out of the box.
alter table public.profiles
  add column if not exists ignored_tags text[] not null default '{nsfw}'::text[];
```

- [ ] **Step 2: Add the column to the bootstrap schema**

In `supabase/bootstrap/init_schema.sql`, find the `create table ... profiles` block and add, alongside the other preference columns (e.g. next to `theme_preference` / `is_public`):

```sql
  ignored_tags text[] not null default '{nsfw}'::text[],
```

(Match the surrounding column formatting exactly. If `init_schema.sql` does not contain a `profiles` table definition, skip this step — the migration is the source of truth.)

- [ ] **Step 3: Add a verify_schema assertion**

In `supabase/verify_schema.sql`, locate the block of `perform pg_temp.chk('column', 'profiles.<x>', ...)` assertions for the `profiles` table and add one matching the existing style, e.g.:

```sql
perform pg_temp.chk(
  'column', 'profiles.ignored_tags',
  pg_temp.col_exists('public', 'profiles', 'ignored_tags'),
  'profiles.ignored_tags text[] manquante (migration 20260719120000)'
);
```

Use whatever the actual helper name is in that file (read the helper definitions near the top — the pattern is `col_exists('public', <table>, <column>)`). If the exact helper differs, mirror an existing `profiles` column assertion line and swap the column name.

- [ ] **Step 4: Add `ignoredTags` to the types**

In `src/lib/profile/types.ts`, add to `Profile` (after `themePreference`):

```ts
	ignoredTags: string[];
```

And add `'ignoredTags'` to the `ProfileUpdate` `Pick<...>` union:

```ts
export type ProfileUpdate = Partial<
	Pick<
		Profile,
		| 'nickname'
		| 'description'
		| 'avatarUrl'
		| 'language'
		| 'priceCurrency'
		| 'showPrices'
		| 'themePreference'
		| 'isPublic'
		| 'ignoredTags'
	>
>;
```

- [ ] **Step 5: Thread `ignored_tags` through the DB mapping**

In `src/lib/profile/db/profiles.ts`:

Add to `ProfileRow`:

```ts
	ignored_tags: string[];
```

In `rowToProfile`, add (after `themePreference`):

```ts
		ignoredTags: row.ignored_tags ?? ['nsfw'],
```

Add `ignored_tags` to all three `.select('…')` column lists (in `fetchProfile`, `fetchProfileByNickname`, `isNicknameTaken` does NOT select it — leave that one, it only selects `id`). The two full selects become:

```ts
'id, nickname, description, avatar_url, language, price_currency, show_prices, theme_preference, is_public, ignored_tags, created_at, updated_at';
```

In `upsertProfile`, add (after the `themePreference` line):

```ts
if (updates.ignoredTags !== undefined) cols.ignored_tags = updates.ignoredTags;
```

- [ ] **Step 6: Add the store default**

In `src/lib/profile/store/profile-store.ts`, in `hydrateProfile`'s fallback profile object (the `profile ?? { ... }` literal for a user with no row yet), add (after `themePreference: 'system',`):

```ts
					ignoredTags: ['nsfw'],
```

- [ ] **Step 7: Apply migration + verify schema**

Run:

```bash
npm run sb:migrate && npm run sb:verify
```

Expected: migration applies; `sb:verify` reports the `profiles.ignored_tags` assertion as PASS and ends "N passed / 0 failed" (or unchanged failure count vs. baseline — no NEW failures).

- [ ] **Step 8: Typecheck/lint changed files**

Run:

```bash
npx eslint src/lib/profile/types.ts src/lib/profile/db/profiles.ts src/lib/profile/store/profile-store.ts
npx tsc --noEmit
```

Expected: no NEW problems in these files (tsc: no errors referencing `ignoredTags`/`ignored_tags`).

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260719120000_add_profile_ignored_tags.sql supabase/bootstrap/init_schema.sql supabase/verify_schema.sql src/lib/profile/types.ts src/lib/profile/db/profiles.ts src/lib/profile/store/profile-store.ts
git commit -m "$(cat <<'EOF'
feat(profile): add ignored_tags column and thread through model

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `ignored-tags` helpers

Pure functions that resolve effective ignored tags (with guest default) and test a custom card against them. No React, easy to reason about, reused by Tasks 3 and 4.

**Files:**

- Create: `src/lib/mpc/ignored-tags.ts`

**Interfaces:**

- Consumes: `Profile` (Task 1), `CustomCard` from `@/lib/mpc/types`.
- Produces:
  - `DEFAULT_IGNORED_TAGS: string[]` (= `['nsfw']`)
  - `getEffectiveIgnoredTags(profile: Profile | null): string[]`
  - `isIgnored(card: CustomCard, ignoredTags: string[]): boolean`

- [ ] **Step 1: Write the helper module**

Create `src/lib/mpc/ignored-tags.ts`:

```ts
import type { Profile } from '@/lib/profile/types';
import type { CustomCard } from '@/lib/mpc/types';

/** Guest default: hide NSFW even when no profile is loaded. */
export const DEFAULT_IGNORED_TAGS: string[] = ['nsfw'];

/** Tags to hide: the profile's list, or the guest default when signed out. */
export function getEffectiveIgnoredTags(profile: Profile | null): string[] {
	return profile?.ignoredTags ?? DEFAULT_IGNORED_TAGS;
}

/** True when any of the custom card's tags is ignored (case-insensitive). */
export function isIgnored(card: CustomCard, ignoredTags: string[]): boolean {
	if (ignoredTags.length === 0) return false;
	const ignored = new Set(ignoredTags.map((t) => t.toLowerCase()));
	return (card.custom.tags ?? []).some((t) => ignored.has(t.toLowerCase()));
}
```

- [ ] **Step 2: Lint the new file**

Run:

```bash
npx eslint src/lib/mpc/ignored-tags.ts && npx tsc --noEmit
```

Expected: clean (no problems in this file).

- [ ] **Step 3: Commit**

```bash
git add src/lib/mpc/ignored-tags.ts
git commit -m "$(cat <<'EOF'
feat(mpc): add ignored-tags helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Hide ignored custom prints in lists / card page / picker

Filter ignored custom prints at the single choke point (`useCustomCardPrints`), which feeds both `PrintList` (picker) and `PrintsTab` (card page).

**Files:**

- Modify: `src/lib/mpc/hooks/useCustomCardPrints.ts`

**Interfaces:**

- Consumes: `getEffectiveIgnoredTags`, `isIgnored` (Task 2); `useProfileContext` from `@/lib/profile/context/ProfileContext`.
- Produces: unchanged return shape (`{ prints: CustomCard[]; loading: boolean }`), but `prints` excludes ignored cards.

- [ ] **Step 1: Import the helpers and profile context**

In `src/lib/mpc/hooks/useCustomCardPrints.ts`, add imports near the top:

```ts
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { getEffectiveIgnoredTags, isIgnored } from '@/lib/mpc/ignored-tags';
```

- [ ] **Step 2: Read the profile and derive a stable key**

Inside `useCustomCardPrints`, after the `useState` declaration, add:

```ts
const { profile } = useProfileContext();
const ignoredTags = getEffectiveIgnoredTags(profile);
const ignoredKey = ignoredTags.join(',');
```

- [ ] **Step 3: Filter ignored cards before setting state**

In the `fetch` function, change the line that builds `cards` so it filters ignored cards. Replace:

```ts
const cards = result.cards.map((c) => toCustomCard(c, unknownSource));

setState({ prints: cards, loading: false });
```

with:

```ts
const cards = result.cards
	.map((c) => toCustomCard(c, unknownSource))
	.filter((c) => !isIgnored(c, ignoredTags));

setState({ prints: cards, loading: false });
```

- [ ] **Step 4: Re-run the effect when ignored tags change**

Change the effect dependency array from `[oracleId]` to include the ignored-tags key so toggling a tag re-filters live:

```ts
	}, [oracleId, ignoredKey]); // eslint-disable-line react-hooks/exhaustive-deps
```

(The `ignoredTags`/`isIgnored` references inside are covered by `ignoredKey`; keep the existing eslint-disable pattern used elsewhere in the repo.)

- [ ] **Step 5: Lint the changed file**

Run:

```bash
npx eslint src/lib/mpc/hooks/useCustomCardPrints.ts && npx tsc --noEmit
```

Expected: no NEW problems.

- [ ] **Step 6: Runtime check**

Start dev (`npm run dev` if not already running). As a **signed-out** user, open a card page known to have NSFW custom prints (Prints tab) and open the print picker for a collection card of the same oracle. Expected: no NSFW custom print appears in either. Signed in with `nsfw` in Ignored Tags: same. (This surface is fully re-verified end-to-end after Task 6 once the toggle UI exists.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/mpc/hooks/useCustomCardPrints.ts
git commit -m "$(cat <<'EOF'
feat(mpc): hide ignored custom prints in lists, card page, picker

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Generic display-time fallback in `CardImage`

Route a `CustomCard` that is ignored OR whose image failed to load through the existing localized→official→placeholder chain, keyed on `oracle_id`. Non-destructive.

**Files:**

- Modify: `src/lib/card/components/CardImage/CardImage.tsx`

**Interfaces:**

- Consumes: `isIgnored`, `getEffectiveIgnoredTags` (Task 2); `useProfileContext`. Existing `useLocalizedImage` / `useEnglishFallbackImage` chain and the local `error` state.
- Produces: no prop/API change. `CardImage` renders an official print (localized first) instead of the custom image when the custom card is ignored or errored.

**Context (current code, `CardImage.tsx`):**

- `line 85`: `const isInputCustom = isCustomCard(card as unknown as CustomCard);`
- `line 86`: `const visible = !isInputCustom && (priority || isVisible);`
- `line 96`: `const basePlaceholder = !isInputCustom && !localized && !hasRealScan(card.image_status);`
- `line 105`: `const isCustom = isCustomCard(effectiveCard as unknown as CustomCard);`
- `line 113`: `if (isCustom) { imageUri = (effectiveCard as unknown as CustomCard).custom.image_url; }`
- `error` state is set by the `<Image onError={() => setError(true)}>` (line ~194).

The `card` passed to `useLocalizedImage` / `useEnglishFallbackImage` must carry `oracle_id`, `set`, `collector_number`, `lang` etc. A resolved `CustomCard` (from `resolveCardsByScryfallIds`) is `Omit<Partial<ScryfallCard>> & { custom }`, so it carries `oracle_id`. This is what makes the localized/official lookup possible.

- [ ] **Step 1: Import helpers + profile context**

Add imports near the existing imports:

```ts
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { getEffectiveIgnoredTags, isIgnored } from '@/lib/mpc/ignored-tags';
```

- [ ] **Step 2: Compute `shouldFallbackFromCustom`**

Right after `const isInputCustom = isCustomCard(card as unknown as CustomCard);` (line 85), add:

```ts
const { profile } = useProfileContext();
const ignoredTags = getEffectiveIgnoredTags(profile);
const isIgnoredCustom = isInputCustom && isIgnored(card as unknown as CustomCard, ignoredTags);
// `error` is set when the custom image fails to load (onError below).
const shouldFallbackFromCustom = isInputCustom && (isIgnoredCustom || error);
```

Note: `error` is declared just above at line 65 (`const [error, setError] = useState(false);`), so it is in scope here.

- [ ] **Step 3: Let ignored/failed customs go through the resolution chain**

Change line 86 from:

```ts
const visible = !isInputCustom && (priority || isVisible);
```

to:

```ts
// A normal (non-custom) card, OR a custom we must fall back away from,
// is eligible for localized/official image resolution.
const visible = (!isInputCustom || shouldFallbackFromCustom) && (priority || isVisible);
```

- [ ] **Step 4: Include fallback customs in `basePlaceholder`**

The English/official fallback (`useEnglishFallbackImage`) only fires when `basePlaceholder` is true. A custom we're falling back from has no real Scryfall scan on `card` itself, so we want the placeholder-resolution path enabled for it too. Change line 96 from:

```ts
const basePlaceholder = !isInputCustom && !localized && !hasRealScan(card.image_status);
```

to:

```ts
const basePlaceholder =
	(!isInputCustom || shouldFallbackFromCustom) && !localized && !hasRealScan(card.image_status);
```

- [ ] **Step 5: Stop using the custom image when falling back**

The image-uri branch keys off `isCustom` (from `effectiveCard`, line 105/113). When we fall back, `effectiveCard` is `{ ...card, ...resolvedOverride }` — still `object: 'custom_card'`, so `isCustom` stays true and it would keep using `custom.image_url`. Gate the custom branch on NOT falling back. Change line 105 from:

```ts
const isCustom = isCustomCard(effectiveCard as unknown as CustomCard);
```

to:

```ts
// When falling back from a custom (ignored or failed-to-load), do NOT treat it
// as custom for image selection — use the resolved official/localized print.
const isCustom = isCustomCard(effectiveCard as unknown as CustomCard) && !shouldFallbackFromCustom;
```

- [ ] **Step 6: Lint + typecheck the changed file**

Run:

```bash
npx eslint src/lib/card/components/CardImage/CardImage.tsx && npx tsc --noEmit
```

Expected: no NEW problems. (If the `react-hooks/exhaustive-deps` rule flags the new hook usage, follow the existing pattern in this file — the hooks are called unconditionally at the top level, so no dep change is needed.)

- [ ] **Step 7: Runtime check (the critical one)**

Signed in, with `nsfw` in Ignored Tags:

1. On a collection/deck card whose selected print is an NSFW custom print, confirm the card now shows an **official print** (localized to your preferred language when available), NOT the custom art, and NOT a broken image.
2. Remove `nsfw` from Ignored Tags (Task 6 UI, or temporarily via Studio: set `profiles.ignored_tags = '{}'`) → the custom print reappears. Confirm the DB row's stored `scryfallId` was never changed (still `mpc:<uuid>`).
3. Sanity: a normal (non-custom) card still renders exactly as before.

- [ ] **Step 8: Commit**

```bash
git add src/lib/card/components/CardImage/CardImage.tsx
git commit -m "$(cat <<'EOF'
feat(card): fall back to official print for ignored/failed custom prints

Non-destructive: routes ignored or failed-to-load custom prints through the
existing localized -> official -> placeholder chain, keyed on oracle_id. The
stored print selection is never rewritten.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Reusable `TagInput` with free-text support

Extract the chips + autocomplete dropdown from `MpcTagsFilter` into a standalone, reusable component, and add free-text entry (Enter with no focused suggestion adds the typed tag). Used by the settings section in Task 6. Also refactor `MpcTagsFilter` to consume it (no behavior change there).

**Files:**

- Create: `src/lib/mpc/components/TagInput/TagInput.tsx`
- Create: `src/lib/mpc/components/TagInput/TagInput.module.css` (move/copy the relevant classes from `MpcTagsFilter.module.css`)
- Modify: `src/lib/search/components/filters/MpcTagsFilter/MpcTagsFilter.tsx` (consume the shared `TagInput`)

**Interfaces:**

- Produces:

  ```ts
  export interface TagInputProps {
  	selected: string[];
  	onAdd: (tag: string) => void;
  	onRemove: (tag: string) => void;
  	placeholder: string;
  	/** Tags already selected in a sibling list, hidden from suggestions. */
  	otherSelected?: string[];
  	/** Allow adding a tag not present in the taxonomy (default false). */
  	allowFreeText?: boolean;
  	/** aria-label prefix for the remove buttons, e.g. "Remove". */
  	removeLabel: string;
  	variant?: 'include' | 'exclude' | 'neutral';
  }
  export function TagInput(props: TagInputProps): JSX.Element;
  ```

- [ ] **Step 1: Create the shared `TagInput` component**

Create `src/lib/mpc/components/TagInput/TagInput.tsx`. Port the existing `TagInput` from `MpcTagsFilter.tsx` (lines 40–203), generalized per the interface above. Full content:

```tsx
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MPC_TAG_GROUPS } from '@/lib/mpc/mpc-tag-taxonomy';
import type { MpcTagNode, MpcTagGroup } from '@/lib/mpc/mpc-tag-taxonomy';
import styles from './TagInput.module.css';

interface FlatTag {
	label: string;
	group: string;
}

function flattenGroup(group: MpcTagGroup): FlatTag[] {
	function flattenNode(node: MpcTagNode): string[] {
		if (!node.children?.length) return [node.label];
		return [node.label, ...node.children.flatMap(flattenNode)];
	}
	return group.tags.flatMap(flattenNode).map((label) => ({ label, group: group.label }));
}

const ALL_TAGS: FlatTag[] = MPC_TAG_GROUPS.flatMap(flattenGroup);

function filterSuggestions(query: string, exclude: string[]): FlatTag[] {
	const q = query.toLowerCase().trim();
	return ALL_TAGS.filter(
		(t) => !exclude.includes(t.label) && (q === '' || t.label.toLowerCase().includes(q))
	);
}

export interface TagInputProps {
	selected: string[];
	onAdd: (tag: string) => void;
	onRemove: (tag: string) => void;
	placeholder: string;
	otherSelected?: string[];
	allowFreeText?: boolean;
	removeLabel: string;
	variant?: 'include' | 'exclude' | 'neutral';
}

export function TagInput({
	selected,
	onAdd,
	onRemove,
	placeholder,
	otherSelected = [],
	allowFreeText = false,
	removeLabel,
	variant = 'neutral',
}: TagInputProps) {
	const [query, setQuery] = useState('');
	const [open, setOpen] = useState(false);
	const [focusedIndex, setFocusedIndex] = useState(-1);
	const inputRef = useRef<HTMLInputElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const excluded = [...selected, ...otherSelected];
	const suggestions = filterSuggestions(query, excluded);

	const chipClass =
		variant === 'include'
			? styles.chipInclude
			: variant === 'exclude'
				? styles.chipExclude
				: styles.chipNeutral;
	const inputVariantClass =
		variant === 'include' ? styles.inputInclude : variant === 'exclude' ? styles.inputExclude : '';

	const handleAdd = useCallback(
		(tag: string) => {
			const normalized = tag.trim();
			if (!normalized) return;
			onAdd(normalized);
			setQuery('');
			setFocusedIndex(-1);
			inputRef.current?.focus();
		},
		[onAdd]
	);

	useEffect(() => {
		if (!open) return;
		function handleClick(e: MouseEvent) {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		document.addEventListener('mousedown', handleClick);
		return () => document.removeEventListener('mousedown', handleClick);
	}, [open]);

	function handleKeyDown(e: React.KeyboardEvent) {
		if (!open) {
			if (e.key === 'ArrowDown' || e.key === 'Enter') setOpen(true);
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setFocusedIndex((i) => Math.min(i + 1, suggestions.length - 1));
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			setFocusedIndex((i) => Math.max(i - 1, 0));
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (focusedIndex >= 0 && suggestions[focusedIndex]) {
				handleAdd(suggestions[focusedIndex].label);
			} else if (allowFreeText && query.trim()) {
				// No suggestion focused: add the typed tag verbatim.
				handleAdd(query);
			}
		} else if (e.key === 'Escape') {
			setOpen(false);
		} else if (e.key === 'Backspace' && query === '' && selected.length > 0) {
			onRemove(selected[selected.length - 1]);
		}
	}

	const grouped: { group: string; items: FlatTag[] }[] = [];
	for (const tag of suggestions) {
		const last = grouped[grouped.length - 1];
		if (last && last.group === tag.group) {
			last.items.push(tag);
		} else {
			grouped.push({ group: tag.group, items: [tag] });
		}
	}

	return (
		<div className={styles.root}>
			{selected.length > 0 && (
				<div className={styles.chips}>
					{selected.map((tag) => (
						<span key={tag} className={`${styles.chip} ${chipClass}`}>
							{tag}
							<button
								type="button"
								className={styles.chipRemove}
								onClick={() => onRemove(tag)}
								aria-label={`${removeLabel} ${tag}`}
							>
								×
							</button>
						</span>
					))}
				</div>
			)}

			<div className={styles.inputWrap} ref={containerRef}>
				<input
					ref={inputRef}
					type="text"
					className={`${styles.input} ${inputVariantClass}`}
					placeholder={placeholder}
					value={query}
					onChange={(e) => {
						setQuery(e.target.value);
						setFocusedIndex(-1);
						setOpen(true);
					}}
					onFocus={() => setOpen(true)}
					onKeyDown={handleKeyDown}
					autoComplete="off"
				/>

				{open && (suggestions.length > 0 || (allowFreeText && query.trim())) && (
					<div className={styles.dropdown} role="listbox">
						{suggestions.length === 0 ? (
							allowFreeText && query.trim() ? (
								<div
									role="option"
									aria-selected={false}
									className={styles.dropdownItem}
									onMouseDown={(e) => {
										e.preventDefault();
										handleAdd(query);
									}}
								>
									{`Add "${query.trim()}"`}
								</div>
							) : (
								<div className={styles.dropdownEmpty}>No tag found</div>
							)
						) : (
							grouped.map(({ group, items }) => (
								<div key={group}>
									<div className={styles.dropdownItemGroup}>{group}</div>
									{items.map((tag) => {
										const idx = suggestions.indexOf(tag);
										return (
											<div
												key={tag.label}
												role="option"
												aria-selected={false}
												className={`${styles.dropdownItem} ${focusedIndex === idx ? styles.dropdownItemFocused : ''}`}
												onMouseDown={(e) => {
													e.preventDefault();
													handleAdd(tag.label);
												}}
												onMouseEnter={() => setFocusedIndex(idx)}
											>
												{tag.label}
											</div>
										);
									})}
								</div>
							))
						)}
					</div>
				)}
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Create the CSS module**

Create `src/lib/mpc/components/TagInput/TagInput.module.css` by copying the relevant classes from `src/lib/search/components/filters/MpcTagsFilter/MpcTagsFilter.module.css`: `.chips`, `.chip`, `.chipInclude`, `.chipExclude`, `.chipRemove`, `.inputWrap`, `.input`, `.inputInclude`, `.inputExclude`, `.dropdown`, `.dropdownEmpty`, `.dropdownItem`, `.dropdownItemGroup`, `.dropdownItemFocused`. Add a `.root` wrapper class (replaces the old `.section`) and a neutral `.chipNeutral` variant:

```css
.root {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.chipNeutral {
	/* neutral variant — mirror .chipExclude colors or use the section's accent */
}
```

Read the source module first and copy the exact declarations for each class listed; for `.chipNeutral`, reuse the same visual treatment as an existing chip variant (pick `.chipExclude`'s colors as the neutral default). Keep property values identical to the originals so the search filter is visually unchanged.

- [ ] **Step 3: Refactor `MpcTagsFilter` to use the shared `TagInput`**

In `src/lib/search/components/filters/MpcTagsFilter/MpcTagsFilter.tsx`, delete the local `TagInput`, `FlatTag`, `flattenGroup`, `ALL_TAGS`, `filterSuggestions` definitions (now in the shared component) and import the shared one:

```tsx
import { TagInput } from '@/lib/mpc/components/TagInput/TagInput';
```

Keep the section label markup (`.section`, `.sectionLabel*`) around each `TagInput` in `MpcTagsFilter` itself (those labels are search-specific). Update the two usages:

```tsx
<div className={styles.section}>
	<div className={`${styles.sectionLabel} ${styles.sectionLabelInclude}`}>
		Must have at least one of
	</div>
	<TagInput
		variant="include"
		selected={mustHave}
		otherSelected={mustNotHave}
		removeLabel="Remove"
		placeholder="Search a tag…"
		onAdd={(tag) => onChange({ mustHave: [...mustHave, tag], mustNotHave })}
		onRemove={(tag) => onChange({ mustHave: mustHave.filter((t) => t !== tag), mustNotHave })}
	/>
</div>
<div className={styles.section}>
	<div className={`${styles.sectionLabel} ${styles.sectionLabelExclude}`}>Ne doit pas avoir</div>
	<TagInput
		variant="exclude"
		selected={mustNotHave}
		otherSelected={mustHave}
		removeLabel="Remove"
		placeholder="Search a tag…"
		onAdd={(tag) => onChange({ mustHave, mustNotHave: [...mustNotHave, tag] })}
		onRemove={(tag) => onChange({ mustHave, mustNotHave: mustNotHave.filter((t) => t !== tag) })}
	/>
</div>
```

`allowFreeText` is omitted here (defaults to `false`) — the search filter keeps taxonomy-only behavior, unchanged from before.

- [ ] **Step 4: Lint + typecheck**

Run:

```bash
npx eslint src/lib/mpc/components/TagInput/TagInput.tsx src/lib/search/components/filters/MpcTagsFilter/MpcTagsFilter.tsx && npx tsc --noEmit
```

Expected: no NEW problems.

- [ ] **Step 5: Runtime check — search filter unchanged**

In the card search, open the filter modal → MPC Tags. Confirm the include/exclude tag inputs look and behave exactly as before (chips, autocomplete, keyboard nav). No free-text add here.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mpc/components/TagInput/ src/lib/search/components/filters/MpcTagsFilter/MpcTagsFilter.tsx
git commit -m "$(cat <<'EOF'
refactor(mpc): extract reusable TagInput with optional free-text

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `IgnoredTagsSection` settings UI + i18n

The account-settings category that edits `ignoredTags`, using the shared `TagInput` with `allowFreeText`.

**Files:**

- Create: `src/app/[locale]/settings/sections/IgnoredTagsSection.tsx`
- Modify: `src/app/[locale]/settings/SettingsView.tsx`
- Modify: `messages/en.json`
- Modify: `messages/fr.json`

**Interfaces:**

- Consumes: `useProfileContext` (`profile.ignoredTags`, `updateProfile`), `SettingsSection` + `settingsStyles`, `useSaveStatus`, `TagInput` (Task 5).
- Produces: `<IgnoredTagsSection />` rendered in `SettingsView`.

- [ ] **Step 1: Add i18n keys (en)**

In `messages/en.json`, add an `ignoredTags` block inside `settings` (after `display`):

```json
    "ignoredTags": {
      "title": "Ignored tags",
      "description": "Custom prints tagged with any of these are hidden everywhere, and replaced by an official print. NSFW is hidden by default.",
      "placeholder": "Add a tag (e.g. nsfw, gore)…",
      "removeLabel": "Remove",
      "empty": "No ignored tags — sensitive custom prints will be shown."
    },
```

- [ ] **Step 2: Add i18n keys (fr)**

In `messages/fr.json`, add the matching block inside `settings` (after `display`):

```json
    "ignoredTags": {
      "title": "Tags ignorés",
      "description": "Les prints custom portant l'un de ces tags sont masqués partout et remplacés par un print officiel. Le NSFW est masqué par défaut.",
      "placeholder": "Ajouter un tag (ex. nsfw, gore)…",
      "removeLabel": "Retirer",
      "empty": "Aucun tag ignoré — les prints custom sensibles seront affichés."
    },
```

- [ ] **Step 3: Create the section component**

Create `src/app/[locale]/settings/sections/IgnoredTagsSection.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { TagInput } from '@/lib/mpc/components/TagInput/TagInput';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { SettingsSection, settingsStyles as s } from '../components/SettingsSection';
import { useSaveStatus } from '../useSaveStatus';

export function IgnoredTagsSection() {
	const t = useTranslations('settings.ignoredTags');
	const { profile, updateProfile } = useProfileContext();
	const { status, markSaving } = useSaveStatus();
	if (!profile) return null;

	const ignoredTags = profile.ignoredTags ?? [];

	const add = (tag: string) => {
		const normalized = tag.trim().toLowerCase();
		if (!normalized || ignoredTags.includes(normalized)) return;
		markSaving();
		updateProfile({ ignoredTags: [...ignoredTags, normalized] });
	};

	const remove = (tag: string) => {
		markSaving();
		updateProfile({ ignoredTags: ignoredTags.filter((x) => x !== tag) });
	};

	return (
		<SettingsSection title={t('title')} status={status}>
			<p className={s.hint}>{t('description')}</p>
			<TagInput
				variant="neutral"
				allowFreeText
				selected={ignoredTags}
				onAdd={add}
				onRemove={remove}
				removeLabel={t('removeLabel')}
				placeholder={t('placeholder')}
			/>
			{ignoredTags.length === 0 && <p className={s.hint}>{t('empty')}</p>}
		</SettingsSection>
	);
}
```

Note: `s.hint` is a shared settings class (verify it exists in `SettingsSection.module.css`; if the class is named differently, use the actual hint/help class from that module — grep `settingsStyles` usages in other sections, e.g. `LanguageSection` uses a hint class).

- [ ] **Step 4: Render it in `SettingsView`**

In `src/app/[locale]/settings/SettingsView.tsx`, import and place it between `DisplaySection` and `PrivacySection`:

```tsx
import { IgnoredTagsSection } from './sections/IgnoredTagsSection';
```

```tsx
			<DisplaySection />
			<IgnoredTagsSection />
			<PrivacySection />
```

- [ ] **Step 5: Lint + typecheck**

Run:

```bash
npx eslint "src/app/[locale]/settings/sections/IgnoredTagsSection.tsx" "src/app/[locale]/settings/SettingsView.tsx" && npx tsc --noEmit
```

Expected: no NEW problems. Also confirm JSON validity:

```bash
node -e "require('./messages/en.json');require('./messages/fr.json');console.log('json ok')"
```

- [ ] **Step 6: Runtime check (full feature, end-to-end)**

Signed in, open `/settings`:

1. "Ignored tags" section shows `nsfw` chip by default.
2. Add a free-text tag (e.g. `gore`) via Enter → chip appears, "Saved" status shows, and it persists after reload (sync-queue → DB).
3. Remove `nsfw` → NSFW custom prints reappear in print lists / card page / picker, and a previously-fallen-back collection card shows its custom NSFW print again.
4. Re-add `nsfw` → they hide again and the collection card falls back to the official print.
5. Signed out: NSFW is hidden (guest default) even though there is no profile.

- [ ] **Step 7: Full check gate**

Run:

```bash
npm run check
```

Expected: **no NEW** problems vs. the RED baseline (compare the count/files against pre-existing ones; your changed files must be clean). If `check` surfaces problems only in the files you touched, fix them.

- [ ] **Step 8: Commit**

```bash
git add "src/app/[locale]/settings/sections/IgnoredTagsSection.tsx" "src/app/[locale]/settings/SettingsView.tsx" messages/en.json messages/fr.json
git commit -m "$(cat <<'EOF'
feat(settings): add Ignored Tags section (NSFW hidden by default)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**

- Migration + `default '{nsfw}'` → Task 1 ✓
- Types / DB mapping / store default → Task 1 ✓
- `ignored-tags.ts` helpers (`getEffectiveIgnoredTags`, `isIgnored`) → Task 2 ✓
- Hide in lists / card page / picker via `useCustomCardPrints` → Task 3 ✓
- Generic display-time fallback in `CardImage` (ignored OR failed load; localized-first; non-destructive) → Task 4 ✓
- Settings UI: chips + free-text autocomplete, rendered between Display and Privacy → Tasks 5–6 ✓
- i18n en+fr → Task 6 ✓
- verify_schema / bootstrap updates → Task 1 ✓

**Placeholder scan:** No "TBD/TODO/handle edge cases". The two "verify the actual helper/class name" notes (verify_schema helper in Task 1 Step 3, `s.hint` class in Task 6 Step 3) are explicit lookups with a concrete fallback instruction, not deferred work.

**Type consistency:** `getEffectiveIgnoredTags(profile)` / `isIgnored(card, ignoredTags)` used identically in Tasks 3 and 4. `TagInputProps` fields (`selected`, `onAdd`, `onRemove`, `otherSelected`, `allowFreeText`, `removeLabel`, `variant`, `placeholder`) match between Task 5 (definition) and Tasks 5–6 (usages). `ignoredTags` / `ignored_tags` naming consistent across Task 1 model, Task 2 helper, Tasks 3/4/6 consumers.

**Note on TDD:** This repo has no test framework, so the standard "write failing test → pass" loop is replaced by lint/typecheck + explicit runtime verification steps per Global Constraints. This is intentional and matches `project_no_test_framework`.
