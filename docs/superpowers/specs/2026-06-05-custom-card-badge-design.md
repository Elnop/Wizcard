# Custom Card Badge + Unified Search List

**Date:** 2026-06-05  
**Status:** Approved

## Summary

Two linked changes:

1. Every custom card displayed anywhere in the UI gets a shimmer violet border overlay.
2. In the Search page, mode "Tout" merges official and custom cards into a single `CardList` (official first, customs appended) instead of two separate lists.

---

## 1. Type System — Widen `AnyCard`

**File:** `src/lib/card/components/CardList/CardList.types.ts`

Change:

```ts
// before
export type AnyCard = ScryfallCard | Card;

// after
export type AnyCard = ScryfallCard | Card | CustomCard;
```

`CustomCard` is already `Omit<Partial<ScryfallCard>, 'object'> & { object: 'custom_card'; id: string; name: string; custom: CustomCardMeta }` — all Scryfall fields are optional, so it satisfies `AnyCard` consumers that only need `id` and `name`. Consumers that access Scryfall-specific fields (e.g. `card.set`, `card.cmc`) must narrow with `isCustomCard()` first, exactly as they already do for `Card` vs `ScryfallCard`.

**Import to add:** `import type { CustomCard } from '@/lib/mpc/types';`

No other type files change. The existing `as unknown as CardListCards` cast in `search/page.tsx` is removed.

---

## 2. CustomCardBadge Component

**New file:** `src/lib/card/components/CustomCardBadge/CustomCardBadge.tsx`  
**New file:** `src/lib/card/components/CustomCardBadge/CustomCardBadge.module.css`

A single `<div>` overlay, `position: absolute; inset: 0; pointer-events: none; border-radius: 4.75% / 3.4%` (matching `.image` in `CardImage.module.css`).

### Shimmer effect

Uses `@property --angle` + `conic-gradient` rotating around the border:

```css
@property --angle {
	syntax: '<angle>';
	inherits: false;
	initial-value: 0deg;
}

.badge {
	position: absolute;
	inset: 0;
	pointer-events: none;
	border-radius: 4.75% / 3.4%;
	padding: 2px;
	background: conic-gradient(
		from var(--angle),
		#7c3aed 0%,
		#a78bfa 20%,
		#c4b5fd 30%,
		#7c3aed 50%,
		#5b21b6 70%,
		#7c3aed 100%
	);
	-webkit-mask:
		linear-gradient(#fff 0 0) content-box,
		linear-gradient(#fff 0 0);
	-webkit-mask-composite: xor;
	mask-composite: exclude;
	animation: customShimmer 3s linear infinite;
	box-shadow: 0 0 8px 2px rgba(124, 58, 237, 0.45);
}

@keyframes customShimmer {
	to {
		--angle: 360deg;
	}
}
```

The `-webkit-mask` / `mask-composite: exclude` trick renders only the 2px border strip, leaving the card image fully visible underneath.

### Usage

```tsx
// CustomCardBadge.tsx
import { isCustomCard } from '@/lib/mpc/types';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import styles from './CustomCardBadge.module.css';

export function CustomCardBadge({ card }: { card: AnyCard }) {
	if (!isCustomCard(card)) return null;
	return <div className={styles.badge} aria-label="Carte custom" />;
}
```

---

## 3. Injecting the Badge — renderOverlay

The badge is injected via the existing `renderOverlay` prop on `CardListGrid` / `CardList`. Each page that renders cards composes its own overlay — the badge stacks with existing overlays (count badge in collection, DeckCardOverlay in decks).

### Helper

A small utility to compose overlays:

```ts
// src/lib/card/utils/composeOverlay.tsx
import type { ReactNode } from 'react';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import { CustomCardBadge } from '@/lib/card/components/CustomCardBadge/CustomCardBadge';

export function withCustomBadge(
  card: AnyCard,
  inner?: ReactNode
): ReactNode {
  return (
    <>
      <CustomCardBadge card={card} />
      {inner}
    </>
  );
}
```

### Per-page integration

| Page                  | Current renderOverlay       | Change                                                              |
| --------------------- | --------------------------- | ------------------------------------------------------------------- |
| `search/page.tsx`     | none                        | add `renderOverlay={(c) => withCustomBadge(c)}`                     |
| `collection/page.tsx` | count badge `x{n}`          | wrap: `withCustomBadge(c, countBadge)`                              |
| `decks/[id]/page.tsx` | `DeckCardOverlay` (complex) | wrap return value with `withCustomBadge(c, <DeckCardOverlay .../>)` |
| `wishlist/page.tsx`   | none                        | add `renderOverlay={(c) => withCustomBadge(c)}`                     |

---

## 4. Search — Unified List in Mode "Tout"

**File:** `src/app/search/page.tsx`

### Current behavior

Mode `all`: two `<CardList>` components rendered sequentially — official cards first, then a "Cartes Custom" section header, then custom cards.

### New behavior

Mode `all`: a single `<CardList>` receives the merged array `[...cards, ...filteredCustomCards]`. The "Cartes Custom" section header and its wrapping `{showOfficial && (...)}` around it are removed.

```ts
const mergedCards: AnyCard[] = useMemo(() => {
	if (mode === 'all') return [...cards, ...filteredCustomCards];
	if (mode === 'custom') return filteredCustomCards;
	return cards;
}, [mode, cards, filteredCustomCards]);
```

- The `{showOfficial && <CardList .../>}` and `{showCustom && <CardList .../>}` blocks collapse into one `<CardList cards={mergedCards} .../>`.
- `showEmptyState` and `noResults` logic is adjusted to account for the merged list.
- The custom-only loading state (`customLoading`) is preserved — while customs load, the list shows official results only (customs append once loaded).
- `renderOverlay` on this single `CardList` uses `withCustomBadge`.

---

## 5. What Does Not Change

- `CardImage.tsx` — no changes, it already handles custom image URLs via `isCustomCard`.
- `CardListGrid.tsx` — no changes, `renderOverlay` already positions content over each card.
- `CardModal.tsx` — no changes.
- All filter/search hooks — no changes.
- The `SearchModeSwitcher` — no changes.

---

## Files Touched

| File                                                                 | Change                                  |
| -------------------------------------------------------------------- | --------------------------------------- |
| `src/lib/card/components/CardList/CardList.types.ts`                 | Widen `AnyCard` to include `CustomCard` |
| `src/lib/card/components/CustomCardBadge/CustomCardBadge.tsx`        | New component                           |
| `src/lib/card/components/CustomCardBadge/CustomCardBadge.module.css` | New styles                              |
| `src/lib/card/utils/composeOverlay.tsx`                              | New helper                              |
| `src/app/search/page.tsx`                                            | Merge lists, add badge overlay          |
| `src/app/collection/page.tsx`                                        | Add badge overlay                       |
| `src/app/decks/[id]/page.tsx`                                        | Add badge overlay                       |
| `src/app/wishlist/page.tsx`                                          | Add badge overlay                       |
