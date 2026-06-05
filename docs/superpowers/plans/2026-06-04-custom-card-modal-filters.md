# Custom Card Modal & Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a proper `CustomCard` type, surface all custom card metadata in the detail modal, and add `card_type` / `language` / MPC tag filters throughout the collection UI.

**Architecture:** `CustomCard = Partial<ScryfallCard> & { object: 'custom_card'; id; name; custom: CustomCardMeta }` mirrors the `Card = ScryfallCard & { entry: CardEntry }` pattern. The adapter is replaced by `toCustomCard()`. All downstream hooks, modal, and filter logic narrow on `object === 'custom_card'` via a typed guard.

**Tech Stack:** TypeScript, React, Next.js, Supabase (existing stack — no new deps)

---

## File Map

| Action | File                                                                  |
| ------ | --------------------------------------------------------------------- |
| Modify | `src/lib/mpc/types.ts`                                                |
| Modify | `src/types/cards.ts`                                                  |
| Modify | `src/lib/supabase/custom-cards.ts`                                    |
| Modify | `src/lib/mpc/adapter.ts`                                              |
| Modify | `src/lib/mpc/hooks/useCustomCards.ts`                                 |
| Modify | `src/lib/mpc/hooks/useMpcPrints.ts`                                   |
| Modify | `src/lib/card/components/CardImage/CardImage.tsx`                     |
| Modify | `src/lib/card/components/CardModal/CardModal.tsx`                     |
| Create | `src/lib/card/components/CardModal/CustomCardSection.tsx`             |
| Create | `src/lib/card/components/CardModal/CustomCardSection.module.css`      |
| Modify | `src/app/collection/utils/filterCollectionCards.ts`                   |
| Modify | `src/lib/search/components/FilterModal/FilterModal.tsx`               |
| Create | `src/lib/search/components/filters/MpcTagsFilter/MpcTagsFilter.tsx`   |
| Create | `src/lib/search/components/filters/CardTypeFilter/CardTypeFilter.tsx` |

---

## Task 1: Add `CustomCard` and `CustomCardMeta` types

**Files:**

- Modify: `src/lib/mpc/types.ts`
- Modify: `src/types/cards.ts`

- [ ] **Step 1: Add types to `src/lib/mpc/types.ts`**

Append after the existing exports:

```typescript
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

export interface CustomCardMeta {
	source_id: string | null;
	source_name: string;
	source_type: CardSourceType;
	card_type: CardType;
	image_url: string;
	lang: string | null;
	tags: string[];
	variants: string[];
	set_code: string | null;
	collector_number: string | null;
	is_public: boolean;
	raw_name: string;
}

export type CustomCard = Partial<ScryfallCard> & {
	object: 'custom_card';
	id: string;
	name: string;
	custom: CustomCardMeta;
};

export function isCustomCard(card: ScryfallCard | CustomCard): card is CustomCard {
	return card.object === 'custom_card';
}
```

- [ ] **Step 2: Update `Card` union in `src/types/cards.ts`**

The current line is:

```typescript
export type Card = ScryfallCard & { entry: CardEntry };
```

Replace with:

```typescript
import type { CustomCard } from '@/lib/mpc/types';

export type Card = (ScryfallCard | CustomCard) & { entry: CardEntry };
```

- [ ] **Step 3: Run type-check**

```bash
npm run check
```

Expected: may have errors in adapter/hooks (fixed in later tasks) — zero errors in `types.ts` and `cards.ts` themselves.

- [ ] **Step 4: Commit**

```bash
git add src/lib/mpc/types.ts src/types/cards.ts
git commit -m "feat(types): add CustomCard, CustomCardMeta, isCustomCard guard"
```

---

## Task 2: Extend DB query to fetch all custom fields

**Files:**

- Modify: `src/lib/supabase/custom-cards.ts`

- [ ] **Step 1: Extend `CustomCardRow` interface**

Replace the existing `CustomCardRow` interface (lines 11–23):

```typescript
interface CustomCardRow {
	id: string;
	source_id: string | null;
	name: string;
	raw_name: string;
	image_drive_url: string | null;
	image_storage_path: string | null;
	oracle_id: string | null;
	source_type: CardSourceType;
	is_public: boolean;
	created_by: string | null;
	card_type: CardType;
	language: string | null;
	tags: string[];
	variants: string[];
	set_code: string | null;
	collector_number: string | null;
}
```

- [ ] **Step 2: Extend SELECT strings in both `getCustomCards` and `getAllCustomCards`**

Replace both `.select(...)` calls. The current string is:

```
'id, source_id, name, image_drive_url, image_storage_path, oracle_id, source_type, is_public, created_by, card_type, language'
```

Replace with:

```
'id, source_id, name, raw_name, image_drive_url, image_storage_path, oracle_id, source_type, is_public, created_by, card_type, language, tags, variants, set_code, collector_number'
```

Apply to both `getCustomCards` (line ~106) and `getAllCustomCards` (line ~123).

- [ ] **Step 3: Update `rowToMpcCard` to include new fields**

Replace the existing `rowToMpcCard` function:

```typescript
function rowToMpcCard(row: CustomCardRow): MpcCard {
	return {
		id: row.id.startsWith('mpc:') ? row.id.slice(4) : row.id,
		name: row.name,
		rawName: row.raw_name,
		sourceId: row.source_id,
		imageUrl: resolveImageUrl(row),
		isCustom: true,
		oracleId: row.oracle_id ?? undefined,
		sourceType: row.source_type,
		isPublic: row.is_public,
		createdBy: row.created_by ?? undefined,
		cardType: row.card_type ?? 'card',
		language: row.language ?? null,
		tags: row.tags ?? [],
		variants: row.variants ?? [],
		setCode: row.set_code ?? null,
		collectorNumber: row.collector_number ?? null,
	};
}
```

- [ ] **Step 4: Update `MpcCard` interface in `src/lib/mpc/types.ts` to include new fields**

Add these fields to `MpcCard`:

```typescript
export interface MpcCard {
	id: string;
	name: string;
	rawName: string; // add
	sourceId: string | null;
	imageUrl: string;
	isCustom: true;
	oracleId?: string;
	sourceType: CardSourceType;
	isPublic: boolean;
	createdBy?: string;
	cardType: CardType;
	language: string | null;
	tags: string[]; // add
	variants: string[]; // add
	setCode: string | null; // add
	collectorNumber: string | null; // add
}
```

- [ ] **Step 5: Run type-check**

```bash
npm run check
```

Expected: errors in adapter (not yet updated) — no errors in `custom-cards.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/custom-cards.ts src/lib/mpc/types.ts
git commit -m "feat(db): extend CustomCardRow SELECT and MpcCard with tags, variants, set_code, collector_number, raw_name"
```

---

## Task 3: Replace adapter with `toCustomCard()`

**Files:**

- Modify: `src/lib/mpc/adapter.ts`

- [ ] **Step 1: Replace entire contents of `src/lib/mpc/adapter.ts`**

```typescript
import type { CustomCard } from './types';
import type { MpcCard, MpcSource } from './types';

export function toCustomCard(card: MpcCard, source: MpcSource): CustomCard {
	return {
		object: 'custom_card',
		id: `mpc:${card.id}`,
		name: card.name,
		...(card.oracleId ? { oracle_id: card.oracleId } : {}),
		custom: {
			source_id: card.sourceId,
			source_name: source.name,
			source_type: card.sourceType,
			card_type: card.cardType,
			image_url: card.imageUrl,
			lang: card.language,
			tags: card.tags,
			variants: card.variants,
			set_code: card.setCode,
			collector_number: card.collectorNumber,
			is_public: card.isPublic,
			raw_name: card.rawName,
		},
	};
}
```

- [ ] **Step 2: Update `src/lib/mpc/hooks/useCustomCards.ts`**

Replace the file:

```typescript
'use client';

import { useEffect, useReducer } from 'react';
import {
	getCustomCards,
	getAllCustomCards,
	getCustomCardSources,
} from '@/lib/supabase/custom-cards';
import { toCustomCard } from '../adapter';
import type { CustomCard } from '../types';

interface State {
	cards: CustomCard[];
	isLoading: boolean;
	error: string | null;
}

type Action =
	| { type: 'loading' }
	| { type: 'success'; cards: CustomCard[] }
	| { type: 'error'; message: string };

function reducer(state: State, action: Action): State {
	switch (action.type) {
		case 'loading':
			return { cards: [], isLoading: true, error: null };
		case 'success':
			return { cards: action.cards, isLoading: false, error: null };
		case 'error':
			return { cards: [], isLoading: false, error: action.message };
		default:
			return state;
	}
}

export function useCustomCards(sourceId?: string | null) {
	const [state, dispatch] = useReducer(reducer, {
		cards: [],
		isLoading: false,
		error: null,
	});

	useEffect(() => {
		let cancelled = false;

		async function load() {
			dispatch({ type: 'loading' });
			try {
				const [mpcCards, sources] = await Promise.all([
					sourceId ? getCustomCards(sourceId) : getAllCustomCards(),
					getCustomCardSources(),
				]);
				if (cancelled) return;
				const sourceMap = new Map(sources.map((s) => [s.id, s]));
				const converted = mpcCards.map((card) => {
					const source = (card.sourceId ? sourceMap.get(card.sourceId) : undefined) ?? {
						id: card.sourceId ?? 'user',
						name: card.sourceId ?? 'My Cards',
						isBuiltIn: false,
						tags: [],
					};
					return toCustomCard(card, source);
				});
				dispatch({ type: 'success', cards: converted });
			} catch (err: unknown) {
				if (!cancelled) {
					dispatch({
						type: 'error',
						message: err instanceof Error ? err.message : 'Unknown error',
					});
				}
			}
		}

		void load();
		return () => {
			cancelled = true;
		};
	}, [sourceId]);

	return state;
}
```

- [ ] **Step 3: Update `src/lib/mpc/hooks/useMpcPrints.ts`**

Replace the file:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { toCustomCard } from '../adapter';
import type { CustomCard, MpcIndexEntry } from '../types';

interface UseMpcPrintsResult {
	prints: CustomCard[];
	loading: boolean;
	error: string | null;
}

export function useMpcPrints(cardName: string): UseMpcPrintsResult {
	const [state, setState] = useState<UseMpcPrintsResult>({
		prints: [],
		loading: false,
		error: null,
	});

	useEffect(() => {
		if (!cardName) {
			setState({ prints: [], loading: false, error: null });
			return;
		}

		setState({ prints: [], loading: true, error: null });

		let cancelled = false;

		const fetchPrints = async () => {
			try {
				const res = await fetch(`/api/mpc/index?name=${encodeURIComponent(cardName)}`);
				if (!res.ok) throw new Error(`MPC index fetch failed: ${res.status}`);
				const entries = (await res.json()) as MpcIndexEntry[];

				if (cancelled) return;

				const cards = entries.map((entry) =>
					toCustomCard(
						{
							id: entry.identifier,
							name: entry.name,
							rawName: entry.rawName,
							sourceId: entry.sourceKey,
							imageUrl: entry.mediumThumbnailUrl,
							isCustom: true,
							sourceType: 'mpc_ingested',
							isPublic: true,
							cardType: 'card',
							language: null,
							tags: entry.tags,
							variants: [],
							setCode: null,
							collectorNumber: null,
						},
						{
							id: entry.sourceKey,
							name: entry.sourceName,
							isBuiltIn: true,
							tags: ['mpcfill', entry.sourceKey],
						}
					)
				);
				setState({ prints: cards, loading: false, error: null });
			} catch (err: unknown) {
				if (cancelled) return;
				setState({
					prints: [],
					loading: false,
					error: err instanceof Error ? err.message : 'Unknown error',
				});
			}
		};

		fetchPrints();

		return () => {
			cancelled = true;
		};
	}, [cardName]);

	return state;
}
```

Note: `MpcIndexEntry` needs a `rawName` field — add it to the interface in `src/lib/mpc/types.ts` if not already present:

```typescript
export interface MpcIndexEntry {
	identifier: string;
	name: string;
	rawName: string; // add if missing
	sourceName: string;
	sourceKey: string;
	smallThumbnailUrl: string;
	mediumThumbnailUrl: string;
	tags: string[];
	dpi: number;
}
```

- [ ] **Step 4: Run type-check**

```bash
npm run check
```

Expected: errors only in files that still import `toSyntheticScryfallCard` (CardModal, CardImage — fixed in later tasks). Adapter and hooks should be clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mpc/adapter.ts src/lib/mpc/hooks/useCustomCards.ts src/lib/mpc/hooks/useMpcPrints.ts src/lib/mpc/types.ts
git commit -m "feat(adapter): replace toSyntheticScryfallCard with toCustomCard returning CustomCard"
```

---

## Task 4: Update `CardImage` to support `CustomCard`

**Files:**

- Modify: `src/lib/card/components/CardImage/CardImage.tsx`

- [ ] **Step 1: Update `CardImageCard` type and image resolution logic**

The current `CardImageCard` type (lines 9–19) uses structural duck-typing. Replace it and update the image URI resolution in `renderCardImage`:

At the top of the file, add the import:

```typescript
import { isCustomCard } from '@/lib/mpc/types';
import type { CustomCard } from '@/lib/mpc/types';
```

Replace the `CardImageCard` type definition:

```typescript
type CardImageCard = {
	name: string;
	set?: string;
	collector_number?: string;
	language?: string;
	entry?: { language?: string };
	image_uris?: { small?: string; normal?: string; large?: string };
	card_faces?: Array<{
		name?: string;
		image_uris?: { small?: string; normal?: string; large?: string };
	}>;
	object?: string;
	custom?: { image_url: string };
};
```

In `CardImage`, replace the `imageUri` computation (currently lines 81–83):

```typescript
const isDoubleFaced =
	!isCustomCard(effectiveCard as CustomCard | CardImageCard) &&
	effectiveCard.card_faces &&
	effectiveCard.card_faces.length > 1 &&
	effectiveCard.card_faces[0].image_uris;

const imageUri = isCustomCard(effectiveCard as CustomCard | CardImageCard)
	? (effectiveCard as unknown as CustomCard).custom.image_url
	: isDoubleFaced
		? (effectiveCard.card_faces![currentFace].image_uris?.[size] ?? '')
		: getScryfallCardImageUriBySize(effectiveCard, size);
```

- [ ] **Step 2: Run type-check**

```bash
npm run check
```

Expected: no errors in `CardImage.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/card/components/CardImage/CardImage.tsx
git commit -m "feat(CardImage): resolve image from custom.image_url for CustomCard"
```

---

## Task 5: Create `CustomCardSection` component

**Files:**

- Create: `src/lib/card/components/CardModal/CustomCardSection.tsx`
- Create: `src/lib/card/components/CardModal/CustomCardSection.module.css`

- [ ] **Step 1: Create `CustomCardSection.tsx`**

```typescript
import type { CustomCard } from '@/lib/mpc/types';
import styles from './CustomCardSection.module.css';

const CARD_TYPE_LABELS: Record<string, string> = {
	card: 'Card',
	token: 'Token',
	cardback: 'Cardback',
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
	mpc_ingested: 'MPC',
	user_created: 'User Created',
};

export function CustomCardSection({ card }: { card: CustomCard }) {
	const m = card.custom;
	return (
		<div className={styles.section}>
			<div className={styles.sectionTitle}>Carte Custom</div>

			<div className={styles.badgeRow}>
				<span className={styles.badge}>{CARD_TYPE_LABELS[m.card_type] ?? m.card_type}</span>
				<span className={styles.badgeSecondary}>
					{SOURCE_TYPE_LABELS[m.source_type] ?? m.source_type}
				</span>
			</div>

			{m.source_name && (
				<div className={styles.row}>
					<span className={styles.label}>Source</span>
					<span className={styles.value}>{m.source_name}</span>
				</div>
			)}

			{m.set_code && (
				<div className={styles.row}>
					<span className={styles.label}>Set</span>
					<span className={styles.value}>
						{m.set_code.toUpperCase()}
						{m.collector_number ? ` #${m.collector_number}` : ''}
					</span>
				</div>
			)}

			{m.lang && (
				<div className={styles.row}>
					<span className={styles.label}>Langue</span>
					<span className={styles.value}>{m.lang}</span>
				</div>
			)}

			{m.tags.length > 0 && (
				<div className={styles.chipGroup}>
					<span className={styles.label}>Tags</span>
					<div className={styles.chips}>
						{m.tags.map((tag) => (
							<span key={tag} className={styles.chip}>
								{tag}
							</span>
						))}
					</div>
				</div>
			)}

			{m.variants.length > 0 && (
				<div className={styles.chipGroup}>
					<span className={styles.label}>Variants</span>
					<div className={styles.chips}>
						{m.variants.map((v) => (
							<span key={v} className={styles.chip}>
								{v}
							</span>
						))}
					</div>
				</div>
			)}

			<details className={styles.rawName}>
				<summary className={styles.rawNameSummary}>Filename</summary>
				<code className={styles.rawNameValue}>{m.raw_name}</code>
			</details>
		</div>
	);
}
```

- [ ] **Step 2: Create `CustomCardSection.module.css`**

```css
.section {
	margin-top: 16px;
	padding-top: 16px;
	border-top: 1px solid var(--color-border, #e5e7eb);
}

.sectionTitle {
	font-size: 11px;
	font-weight: 600;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--color-text-muted, #6b7280);
	margin-bottom: 8px;
}

.badgeRow {
	display: flex;
	gap: 6px;
	margin-bottom: 10px;
}

.badge {
	font-size: 11px;
	font-weight: 600;
	padding: 2px 8px;
	border-radius: 4px;
	background: var(--color-accent, #6366f1);
	color: #fff;
}

.badgeSecondary {
	font-size: 11px;
	font-weight: 500;
	padding: 2px 8px;
	border-radius: 4px;
	background: var(--color-surface-2, #f3f4f6);
	color: var(--color-text-muted, #6b7280);
}

.row {
	display: flex;
	gap: 8px;
	margin-bottom: 6px;
	font-size: 13px;
}

.label {
	color: var(--color-text-muted, #6b7280);
	min-width: 56px;
	flex-shrink: 0;
}

.value {
	color: var(--color-text, #111827);
}

.chipGroup {
	margin-bottom: 8px;
}

.chips {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
	margin-top: 4px;
}

.chip {
	font-size: 11px;
	padding: 2px 8px;
	border-radius: 999px;
	background: var(--color-surface-2, #f3f4f6);
	color: var(--color-text, #111827);
	border: 1px solid var(--color-border, #e5e7eb);
}

.rawName {
	margin-top: 10px;
}

.rawNameSummary {
	font-size: 11px;
	color: var(--color-text-muted, #6b7280);
	cursor: pointer;
	user-select: none;
}

.rawNameValue {
	display: block;
	margin-top: 4px;
	font-size: 11px;
	padding: 4px 8px;
	background: var(--color-surface-2, #f3f4f6);
	border-radius: 4px;
	word-break: break-all;
	color: var(--color-text-muted, #6b7280);
}
```

- [ ] **Step 3: Run type-check**

```bash
npm run check
```

Expected: no errors in the two new files.

- [ ] **Step 4: Commit**

```bash
git add src/lib/card/components/CardModal/CustomCardSection.tsx src/lib/card/components/CardModal/CustomCardSection.module.css
git commit -m "feat(CardModal): add CustomCardSection component with tags, variants, source, set, language"
```

---

## Task 6: Wire `CustomCard` into `CardModal`

**Files:**

- Modify: `src/lib/card/components/CardModal/CardModal.tsx`

The modal currently has two paths: `CardModalInner` (for `Card[]` with `entry`) and `ScryfallCardModalInner` (for bare `ScryfallCard`). We add a third path for `CustomCard`.

- [ ] **Step 1: Add `CustomCard` import and `isCustomCard` import**

At the top of `CardModal.tsx`, add:

```typescript
import type { CustomCard } from '@/lib/mpc/types';
import { isCustomCard } from '@/lib/mpc/types';
import { CustomCardSection } from './CustomCardSection';
```

- [ ] **Step 2: Update `Props` to accept `CustomCard`**

In the `Props` interface, change:

```typescript
cards: Card | Card[] | ScryfallCard | null;
```

to:

```typescript
cards: Card | Card[] | ScryfallCard | CustomCard | null;
```

- [ ] **Step 3: Add `CustomCardModalInner` component**

Add this new component before `CardModal`:

```typescript
function CustomCardModalInner({
	card,
	onClose,
}: {
	card: CustomCard;
	onClose: () => void;
}) {
	const [lightbox, setLightbox] = useState(false);
	const symbolMap = useScryfallSymbols();

	return (
		<>
			<Modal onClose={onClose} className={styles.modal}>
				<button className={styles.closeIcon} onClick={onClose} aria-label="Close" type="button">
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path
							d="M2 2l12 12M14 2L2 14"
							stroke="currentColor"
							strokeWidth="1.8"
							strokeLinecap="round"
						/>
					</svg>
				</button>

				<div className={styles.layout}>
					<div className={styles.imageCol}>
						<CardImage card={card} size="large" priority onClick={() => setLightbox(true)} />
					</div>

					<div className={styles.infoCol}>
						{card.type_line || card.oracle_text ? (
							<CardDetailSection card={card as ScryfallCard} symbolMap={symbolMap} />
						) : (
							<div className={styles.cardMeta}>
								<div className={styles.cardNameRow}>
									<h2 className={styles.cardName}>{card.name}</h2>
								</div>
							</div>
						)}
						<CustomCardSection card={card} />
					</div>
				</div>
			</Modal>

			{lightbox && <CardLightbox card={card} onClose={() => setLightbox(false)} />}
		</>
	);
}
```

- [ ] **Step 4: Add custom card branch in `CardModal`**

In the `CardModal` function, before the `!isCollectionCard(first)` check, add:

```typescript
const first = normalizedCards[0];

// Custom card path
if (isCustomCard(first as ScryfallCard | CustomCard)) {
	return (
		<CustomCardModalInner
			key={first.id}
			card={first as CustomCard}
			onClose={onClose}
		/>
	);
}
```

- [ ] **Step 5: Run type-check**

```bash
npm run check
```

Expected: no errors in `CardModal.tsx`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/card/components/CardModal/CardModal.tsx
git commit -m "feat(CardModal): add CustomCardModalInner path with CustomCardSection"
```

---

## Task 7: Add generic `card_type` and `language` filters

**Files:**

- Modify: `src/app/collection/utils/filterCollectionCards.ts`
- Create: `src/lib/search/components/filters/CardTypeFilter/CardTypeFilter.tsx`

- [ ] **Step 1: Add filter fields to `CollectionFilters`**

In `filterCollectionCards.ts`, update the `CollectionFilters` interface:

```typescript
import type { CardType } from '@/lib/mpc/types';
import { isCustomCard } from '@/lib/mpc/types';
import type { CustomCard } from '@/lib/mpc/types';

export interface CollectionFilters extends Omit<CardFilters, 'order'> {
	order: CollectionSortOrder;
	proxyFilter: 'all' | 'official' | 'proxy';
	foilTypeFilter: 'none' | 'all' | 'foil' | 'etched';
	languageFilter: MtgLanguage | 'all';
	cardTypeFilter: CardType | 'all'; // add
}

export const defaultCollectionFilters: CollectionFilters = {
	...DEFAULT_CARD_FILTERS,
	order: 'name',
	proxyFilter: 'all',
	foilTypeFilter: 'all',
	languageFilter: 'all',
	cardTypeFilter: 'all', // add
};
```

- [ ] **Step 2: Add normalizer helpers**

Add these helpers in `filterCollectionCards.ts` before `cardMatchesFilters`:

```typescript
function getCardType(card: ScryfallCard | Card | CustomCard): CardType {
	if (isCustomCard(card as ScryfallCard | CustomCard)) {
		return (card as CustomCard).custom.card_type;
	}
	const layout = (card as ScryfallCard).layout;
	if (layout === 'token' || layout === 'double_faced_token') return 'token';
	return 'card';
}

function getCardLang(card: ScryfallCard | Card | CustomCard): string | null {
	if (isCustomCard(card as ScryfallCard | CustomCard)) {
		return (card as CustomCard).custom.lang;
	}
	return (card as ScryfallCard).lang ?? null;
}
```

- [ ] **Step 3: Update `matchesLanguageFilter` to use `getCardLang`**

Replace the existing `matchesLanguageFilter` function:

```typescript
function matchesLanguageFilter(
	card: ScryfallCard | Card | CustomCard,
	languageFilter: CollectionFilters['languageFilter']
): boolean {
	if (languageFilter === 'all') return true;
	if ('entry' in card && (card as Card).entry.language) {
		return (card as Card).entry.language === languageFilter;
	}
	return getCardLang(card) === languageFilter;
}
```

- [ ] **Step 4: Add `matchesCardTypeFilter` and wire into `cardMatchesFilters`**

Add the new filter function:

```typescript
function matchesCardTypeFilter(
	card: ScryfallCard | Card | CustomCard,
	cardTypeFilter: CollectionFilters['cardTypeFilter']
): boolean {
	if (cardTypeFilter === 'all') return true;
	return getCardType(card) === cardTypeFilter;
}
```

In `cardMatchesFilters`, add before `return true`:

```typescript
if (!matchesCardTypeFilter(card, filters.cardTypeFilter)) return false;
if (!matchesLanguageFilter(card, filters.languageFilter)) return false;
```

Remove the existing `matchesLanguageFilter` call from the `'entry' in card` block so it's not applied twice.

- [ ] **Step 5: Create `CardTypeFilter` component**

Create `src/lib/search/components/filters/CardTypeFilter/CardTypeFilter.tsx`:

```typescript
import type { CardType } from '@/lib/mpc/types';

const OPTIONS: { value: CardType | 'all'; label: string }[] = [
	{ value: 'all', label: 'Tous' },
	{ value: 'card', label: 'Cartes' },
	{ value: 'token', label: 'Tokens' },
	{ value: 'cardback', label: 'Cardbacks' },
];

interface CardTypeFilterProps {
	value: CardType | 'all';
	onChange: (value: CardType | 'all') => void;
}

export function CardTypeFilter({ value, onChange }: CardTypeFilterProps) {
	return (
		<div>
			<div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--color-text-muted, #6b7280)' }}>
				Type de carte
			</div>
			<select
				value={value}
				onChange={(e) => onChange(e.target.value as CardType | 'all')}
				style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border, #e5e7eb)', background: 'var(--color-surface, #fff)', fontSize: 13 }}
			>
				{OPTIONS.map((opt) => (
					<option key={opt.value} value={opt.value}>
						{opt.label}
					</option>
				))}
			</select>
		</div>
	);
}
```

- [ ] **Step 6: Run type-check**

```bash
npm run check
```

Expected: no errors in `filterCollectionCards.ts` or `CardTypeFilter.tsx`.

- [ ] **Step 7: Commit**

```bash
git add src/app/collection/utils/filterCollectionCards.ts src/lib/search/components/filters/CardTypeFilter/CardTypeFilter.tsx
git commit -m "feat(filters): add generic cardTypeFilter and unified languageFilter for ScryfallCard + CustomCard"
```

---

## Task 8: Add MPC tags filter (custom-only)

**Files:**

- Create: `src/lib/search/components/filters/MpcTagsFilter/MpcTagsFilter.tsx`
- Modify: `src/app/collection/utils/filterCollectionCards.ts`

- [ ] **Step 1: Add `mpcTagsFilter` to `CollectionFilters`**

In `filterCollectionCards.ts`, add to `CollectionFilters`:

```typescript
mpcTagsFilter: string[];
```

And to `defaultCollectionFilters`:

```typescript
mpcTagsFilter: [],
```

- [ ] **Step 2: Add `matchesMpcTagsFilter` and wire it**

Add the function:

```typescript
function matchesMpcTagsFilter(
	card: ScryfallCard | Card | CustomCard,
	mpcTagsFilter: string[]
): boolean {
	if (mpcTagsFilter.length === 0) return true;
	if (!isCustomCard(card as ScryfallCard | CustomCard)) return true;
	const tags = (card as CustomCard).custom.tags;
	return mpcTagsFilter.every((t) => tags.includes(t));
}
```

Wire it in `cardMatchesFilters` before `return true`:

```typescript
if (!matchesMpcTagsFilter(card, filters.mpcTagsFilter)) return false;
```

- [ ] **Step 3: Create `MpcTagsFilter` component**

Create `src/lib/search/components/filters/MpcTagsFilter/MpcTagsFilter.tsx`:

```typescript
interface MpcTagsFilterProps {
	availableTags: string[];
	value: string[];
	onChange: (value: string[]) => void;
}

export function MpcTagsFilter({ availableTags, value, onChange }: MpcTagsFilterProps) {
	if (availableTags.length === 0) return null;

	const toggle = (tag: string) => {
		onChange(value.includes(tag) ? value.filter((t) => t !== tag) : [...value, tag]);
	};

	return (
		<div>
			<div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--color-text-muted, #6b7280)' }}>
				Tags MPC
			</div>
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
				{availableTags.map((tag) => (
					<button
						key={tag}
						type="button"
						onClick={() => toggle(tag)}
						style={{
							fontSize: 11,
							padding: '2px 8px',
							borderRadius: 999,
							border: '1px solid var(--color-border, #e5e7eb)',
							background: value.includes(tag) ? 'var(--color-accent, #6366f1)' : 'var(--color-surface-2, #f3f4f6)',
							color: value.includes(tag) ? '#fff' : 'var(--color-text, #111827)',
							cursor: 'pointer',
						}}
					>
						{tag}
					</button>
				))}
			</div>
		</div>
	);
}
```

- [ ] **Step 4: Run type-check**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/collection/utils/filterCollectionCards.ts src/lib/search/components/filters/MpcTagsFilter/MpcTagsFilter.tsx
git commit -m "feat(filters): add mpcTagsFilter for custom card MPC bracket tags"
```

---

## Task 9: Wire new filters into `FilterModal`

**Files:**

- Modify: `src/lib/search/components/FilterModal/FilterModal.tsx`

The `FilterModal` currently handles `customSources` as the only custom filter. We add `cardTypeFilter` (generic, always shown) and `mpcTagsFilter` (custom-only section).

- [ ] **Step 1: Update `FilterModalProps` and `FilterModalContentProps`**

Add to `FilterModalProps`:

```typescript
cardTypeFilter?: CardType | 'all';
mpcTagsFilter?: string[];
availableMpcTags?: string[];
onApply: (filters: {
	// ... existing fields ...
	customSourceId: string | null;
	cardTypeFilter: CardType | 'all';
	mpcTagsFilter: string[];
}) => void;
```

Add corresponding `initial*` props to `FilterModalContentProps`:

```typescript
initialCardTypeFilter: CardType | 'all';
initialMpcTagsFilter: string[];
availableMpcTags: string[];
```

- [ ] **Step 2: Add imports**

```typescript
import type { CardType } from '@/lib/mpc/types';
import { CardTypeFilter } from '@/lib/search/components/filters/CardTypeFilter/CardTypeFilter';
import { MpcTagsFilter } from '@/lib/search/components/filters/MpcTagsFilter/MpcTagsFilter';
```

- [ ] **Step 3: Add draft state and reset in `FilterModalContent`**

```typescript
const [draftCardTypeFilter, setDraftCardTypeFilter] = useState<CardType | 'all'>(
	initialCardTypeFilter
);
const [draftMpcTagsFilter, setDraftMpcTagsFilter] = useState<string[]>(initialMpcTagsFilter);
```

In `handleReset`, add:

```typescript
setDraftCardTypeFilter('all');
setDraftMpcTagsFilter([]);
```

In `handleApply`, add to the object passed to `onApply`:

```typescript
cardTypeFilter: draftCardTypeFilter,
mpcTagsFilter: draftMpcTagsFilter,
```

- [ ] **Step 4: Add filter components to the body**

In the `FilterModalContent` JSX body, add `CardTypeFilter` after `SortFilter`:

```tsx
<CardTypeFilter value={draftCardTypeFilter} onChange={setDraftCardTypeFilter} />
```

In the existing custom section (after `customSources.length > 0` check), add `MpcTagsFilter`:

```tsx
{
	customSources.length > 0 && (
		<>
			<div className={styles.sectionDivider} />
			<div className={styles.sectionTitle}>Cartes Custom</div>
			<CustomSourceFilter
				sources={customSources}
				value={draftCustomSourceId}
				onChange={setDraftCustomSourceId}
			/>
			<MpcTagsFilter
				availableTags={availableMpcTags}
				value={draftMpcTagsFilter}
				onChange={setDraftMpcTagsFilter}
			/>
		</>
	);
}
```

- [ ] **Step 5: Update `FilterModal` wrapper to pass new props with defaults**

```typescript
export function FilterModal({
	// ... existing props ...
	cardTypeFilter = 'all',
	mpcTagsFilter = [],
	availableMpcTags = [],
	// ...
}: FilterModalProps) {
```

Pass through to `FilterModalContent`:

```tsx
initialCardTypeFilter = { cardTypeFilter };
initialMpcTagsFilter = { mpcTagsFilter };
availableMpcTags = { availableMpcTags };
```

- [ ] **Step 6: Run type-check**

```bash
npm run check
```

Expected: errors in callers of `FilterModal` that don't yet pass new props — they use the `= 'all'` / `= []` defaults so at runtime it's fine, but TS may complain if `onApply` return shape changed. Fix any call-site type errors found.

- [ ] **Step 7: Commit**

```bash
git add src/lib/search/components/FilterModal/FilterModal.tsx
git commit -m "feat(FilterModal): add CardTypeFilter (generic) and MpcTagsFilter (custom section)"
```

---

## Task 10: Full verification

- [ ] **Step 1: Run full check**

```bash
npm run check
```

Expected: zero errors, zero warnings.

- [ ] **Step 2: Start local Supabase and dev server**

```bash
npm run sb:start
npm run dev
```

- [ ] **Step 3: Verify — unenriched custom card modal**

Open a custom card that has no `oracle_id`. The modal should show:

- Card name as h2
- `CustomCardSection` with source, card_type badge, source_type badge, tags chips, variants chips
- No Scryfall block (no type_line, oracle_text rows)

- [ ] **Step 4: Verify — enriched custom card modal**

Open a custom card that has `oracle_id` populated (from Strategy A). The modal should show:

- Full Scryfall block (type_line, oracle_text, etc.)
- `CustomCardSection` below it with custom metadata

- [ ] **Step 5: Verify — card_type filter**

In the collection, open FilterModal → set "Type de carte" to "Token" → apply. Only token cards should appear (both Scryfall tokens and custom tokens).

- [ ] **Step 6: Verify — MPC tags filter**

Open FilterModal → if custom cards are present, the "Cartes Custom" section should show tag chips. Select "Extended Art" → apply. Only custom cards tagged `Extended Art` should remain.

- [ ] **Step 7: Final commit if any loose changes**

```bash
git add -p
git commit -m "chore: final cleanup from custom card modal & filters"
```
