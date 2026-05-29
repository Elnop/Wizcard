# Zone Selection in Add-Deck-to-Collection Modal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Zones" section to `AddDeckToCollectionModal` so the user can choose which deck zones (mainboard, sideboard, commander, maybeboard) are included when adding the deck to the collection.

**Architecture:** Zone stats (total / owned per zone) are computed in `useAddDeckToCollection`, passed to the modal as props, and the modal manages `selectedZones` local state. The `execute` function filters `resolvedCards` by the selected zones before processing. The global `onlyMissing` option and `addCount` summary both reflect only the selected zones.

**Tech Stack:** React, TypeScript, CSS Modules. No new dependencies.

---

## File Map

| File                                                                                         | Action | Purpose                                                                            |
| -------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------- |
| `src/app/decks/[id]/useAddDeckToCollection.ts`                                               | Modify | Add `zoneStats` and `availableZones` to return value; filter by zones in `execute` |
| `src/app/decks/[id]/components/AddDeckToCollectionModal/AddDeckToCollectionModal.tsx`        | Modify | Add zone checkboxes section; update `addCount` logic                               |
| `src/app/decks/[id]/components/AddDeckToCollectionModal/AddDeckToCollectionModal.module.css` | Modify | Add `.section`, `.sectionTitle`, `.zoneCount` styles                               |
| `src/app/decks/[id]/page.tsx`                                                                | Modify | Pass `zoneStats` and `availableZones` to the modal                                 |

---

## Task 1: Extend `useAddDeckToCollection` with per-zone stats and zone-filtered execute

**Files:**

- Modify: `src/app/decks/[id]/useAddDeckToCollection.ts`

**Context:** This hook currently returns `ownedCount`, `unownedCount`, `wishlistMatchCount`, and `execute`. We need to add `zoneStats` (owned/total per zone) and `availableZones` (zones that have at least one card), and update `execute` to filter by a `zones` array from options.

- [ ] **Step 1: Update the `AddDeckToCollectionOptions` type**

Open `src/app/decks/[id]/useAddDeckToCollection.ts`. Replace the type:

```typescript
export type AddDeckToCollectionOptions = {
	onlyMissing: boolean;
	asProxy: boolean;
	removeWishlist: boolean;
	zones: DeckZone[];
};
```

Add the import at the top of the file:

```typescript
import { getDeckZone } from '@/types/decks';
import type { DeckZone } from '@/types/decks';
```

- [ ] **Step 2: Add `ZoneStat` type and update hook return type**

Add after the imports:

```typescript
export type ZoneStat = { total: number; owned: number };
```

Update `UseAddDeckToCollectionResult`:

```typescript
type UseAddDeckToCollectionResult = {
	ownedCount: number;
	unownedCount: number;
	wishlistMatchCount: number;
	zoneStats: Record<DeckZone, ZoneStat>;
	availableZones: DeckZone[];
	execute: (options: AddDeckToCollectionOptions) => void;
};
```

- [ ] **Step 3: Compute `zoneStats` and `availableZones` inside the hook**

The zones must appear in a fixed display order. Add these two `useMemo` calls inside `useAddDeckToCollection`, after the existing `ownedCount` / `unownedCount` memos:

```typescript
const ZONE_ORDER: DeckZone[] = ['commander', 'mainboard', 'sideboard', 'maybeboard'];

const zoneStats = useMemo((): Record<DeckZone, ZoneStat> => {
	const stats: Record<DeckZone, ZoneStat> = {
		commander: { total: 0, owned: 0 },
		mainboard: { total: 0, owned: 0 },
		sideboard: { total: 0, owned: 0 },
		maybeboard: { total: 0, owned: 0 },
	};
	for (const rc of resolvedCards) {
		const zone = getDeckZone(rc.entry.tags);
		stats[zone].total += 1;
		if (rc.entry.ownerId != null) stats[zone].owned += 1;
	}
	return stats;
}, [resolvedCards]);

const availableZones = useMemo(() => ZONE_ORDER.filter((z) => zoneStats[z].total > 0), [zoneStats]);
```

- [ ] **Step 4: Update `execute` to filter by `options.zones`**

Replace the current `execute` callback body:

```typescript
const execute = useCallback(
	(options: AddDeckToCollectionOptions) => {
		const zoneSet = new Set(options.zones);
		const toProcess = resolvedCards.filter((rc) => {
			const zone = getDeckZone(rc.entry.tags);
			if (!zoneSet.has(zone)) return false;
			if (options.onlyMissing) return rc.entry.ownerId == null;
			return true;
		});

		for (const rc of toProcess) {
			if (rc.entry.ownerId == null) {
				toggleOwned(rc.entry.rowId, options.asProxy || undefined);
			}
		}

		if (options.removeWishlist) {
			for (const rowId of matchingWishlistRowIds) {
				removeFromWishlist(rowId);
			}
		}
	},
	[resolvedCards, toggleOwned, matchingWishlistRowIds, removeFromWishlist]
);
```

- [ ] **Step 5: Add `zoneStats` and `availableZones` to the return value**

```typescript
return { ownedCount, unownedCount, wishlistMatchCount, zoneStats, availableZones, execute };
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npm run check
```

Expected: no errors in `useAddDeckToCollection.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/app/decks/\[id\]/useAddDeckToCollection.ts
git commit -m "feat: add zoneStats, availableZones and zone-filtered execute to useAddDeckToCollection"
```

---

## Task 2: Update `AddDeckToCollectionModal` to show zone checkboxes

**Files:**

- Modify: `src/app/decks/[id]/components/AddDeckToCollectionModal/AddDeckToCollectionModal.tsx`
- Modify: `src/app/decks/[id]/components/AddDeckToCollectionModal/AddDeckToCollectionModal.module.css`

**Context:** The modal currently accepts `ownedCount`, `unownedCount`, `wishlistMatchCount`, `onConfirm`, and `onClose`. We replace the count props with the richer zone data and rebuild the `addCount` derivation.

- [ ] **Step 1: Update the props type and imports**

Replace the entire file content:

```typescript
'use client';

import { useState, useMemo } from 'react';
import { Modal } from '@/components/Modal/Modal';
import { Button } from '@/components/Button/Button';
import type { DeckZone } from '@/types/decks';
import type { AddDeckToCollectionOptions, ZoneStat } from '../../useAddDeckToCollection';
import styles from './AddDeckToCollectionModal.module.css';

const ZONE_LABELS: Record<DeckZone, string> = {
  commander: 'Commander',
  mainboard: 'Mainboard',
  sideboard: 'Sideboard',
  maybeboard: 'Maybeboard',
};

const DEFAULT_SELECTED: Set<DeckZone> = new Set(['commander', 'mainboard', 'sideboard']);

type Props = {
  zoneStats: Record<DeckZone, ZoneStat>;
  availableZones: DeckZone[];
  wishlistMatchCount: number;
  onConfirm: (options: AddDeckToCollectionOptions) => void;
  onClose: () => void;
};

export function AddDeckToCollectionModal({
  zoneStats,
  availableZones,
  wishlistMatchCount,
  onConfirm,
  onClose,
}: Props) {
  const initialSelected = useMemo(
    () => new Set(availableZones.filter((z) => DEFAULT_SELECTED.has(z))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run on mount
    []
  );

  const [selectedZones, setSelectedZones] = useState<Set<DeckZone>>(initialSelected);

  const totalInSelectedZones = useMemo(
    () => availableZones.filter((z) => selectedZones.has(z)).reduce((sum, z) => sum + zoneStats[z].total, 0),
    [availableZones, selectedZones, zoneStats]
  );

  const ownedInSelectedZones = useMemo(
    () => availableZones.filter((z) => selectedZones.has(z)).reduce((sum, z) => sum + zoneStats[z].owned, 0),
    [availableZones, selectedZones, zoneStats]
  );

  const unownedInSelectedZones = totalInSelectedZones - ownedInSelectedZones;

  const hasAnyOwned = ownedInSelectedZones > 0;
  const [onlyMissing, setOnlyMissing] = useState(hasAnyOwned);
  const [asProxy, setAsProxy] = useState(false);
  const [removeWishlist, setRemoveWishlist] = useState(wishlistMatchCount > 0);

  const addCount = onlyMissing ? unownedInSelectedZones : totalInSelectedZones;

  const toggleZone = (zone: DeckZone) => {
    setSelectedZones((prev) => {
      const next = new Set(prev);
      if (next.has(zone)) next.delete(zone);
      else next.add(zone);
      return next;
    });
  };

  return (
    <Modal onClose={onClose} className={styles.dialog} zIndex={1100}>
      <h2 className={styles.title}>Ajouter le deck à la collection</h2>
      <p className={styles.summary}>
        <strong>
          {addCount} carte{addCount !== 1 ? 's' : ''}
        </strong>{' '}
        à ajouter
      </p>

      <div className={styles.section}>
        <p className={styles.sectionTitle}>Zones</p>
        <div className={styles.options}>
          {availableZones.map((zone) => {
            const stat = zoneStats[zone];
            return (
              <label key={zone} className={styles.option}>
                <input
                  type="checkbox"
                  checked={selectedZones.has(zone)}
                  onChange={() => toggleZone(zone)}
                />
                {ZONE_LABELS[zone]}
                <span className={styles.zoneCount}>
                  ({stat.owned} / {stat.total} possédées)
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className={styles.section}>
        <p className={styles.sectionTitle}>Options</p>
        <div className={styles.options}>
          {hasAnyOwned && (
            <label className={styles.option}>
              <input
                type="checkbox"
                checked={onlyMissing}
                onChange={(e) => setOnlyMissing(e.target.checked)}
              />
              Seulement les non possédées ({unownedInSelectedZones} carte
              {unownedInSelectedZones !== 1 ? 's' : ''})
            </label>
          )}
          <label className={styles.option}>
            <input
              type="checkbox"
              checked={asProxy}
              onChange={(e) => setAsProxy(e.target.checked)}
            />
            Marquer comme proxy
          </label>
          {wishlistMatchCount > 0 && (
            <label className={styles.option}>
              <input
                type="checkbox"
                checked={removeWishlist}
                onChange={(e) => setRemoveWishlist(e.target.checked)}
              />
              Supprimer de la wishlist ({wishlistMatchCount} carte
              {wishlistMatchCount !== 1 ? 's' : ''})
            </label>
          )}
        </div>
      </div>

      <div className={styles.actions}>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Annuler
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() =>
            onConfirm({
              onlyMissing,
              asProxy,
              removeWishlist,
              zones: Array.from(selectedZones),
            })
          }
          disabled={addCount === 0 || selectedZones.size === 0}
        >
          Ajouter
        </Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Add new CSS classes**

Append to `AddDeckToCollectionModal.module.css`:

```css
.section {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.sectionTitle {
	font-size: var(--text-xs);
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	color: var(--text-tertiary);
	margin: 0;
}

.zoneCount {
	margin-left: auto;
	color: var(--text-secondary);
	font-size: var(--text-xs);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run check
```

Expected: no errors in the modal files.

- [ ] **Step 4: Commit**

```bash
git add "src/app/decks/[id]/components/AddDeckToCollectionModal/AddDeckToCollectionModal.tsx" "src/app/decks/[id]/components/AddDeckToCollectionModal/AddDeckToCollectionModal.module.css"
git commit -m "feat: add zone selection section to AddDeckToCollectionModal"
```

---

## Task 3: Wire new props in `page.tsx`

**Files:**

- Modify: `src/app/decks/[id]/page.tsx` (lines ~281-285 and ~482-492)

**Context:** `page.tsx` currently passes `ownedCount`, `unownedCount`, `wishlistMatchCount` to the modal. We replace the first two with `zoneStats` and `availableZones` from the updated hook.

- [ ] **Step 1: Destructure new values from the hook**

Find this block in `page.tsx` (~line 281):

```typescript
const {
	ownedCount,
	unownedCount,
	wishlistMatchCount,
	execute: executeAddToCollection,
} = useAddDeckToCollection(resolvedCards, deckId);
```

Replace with:

```typescript
const {
	wishlistMatchCount,
	zoneStats,
	availableZones,
	execute: executeAddToCollection,
} = useAddDeckToCollection(resolvedCards, deckId);
```

- [ ] **Step 2: Update the modal JSX**

Find the `AddDeckToCollectionModal` usage (~line 482):

```tsx
{
	addToCollectionModalOpen && (
		<AddDeckToCollectionModal
			ownedCount={ownedCount}
			unownedCount={unownedCount}
			wishlistMatchCount={wishlistMatchCount}
			onConfirm={(options) => {
				executeAddToCollection(options);
				setAddToCollectionModalOpen(false);
			}}
			onClose={() => setAddToCollectionModalOpen(false)}
		/>
	);
}
```

Replace with:

```tsx
{
	addToCollectionModalOpen && (
		<AddDeckToCollectionModal
			zoneStats={zoneStats}
			availableZones={availableZones}
			wishlistMatchCount={wishlistMatchCount}
			onConfirm={(options) => {
				executeAddToCollection(options);
				setAddToCollectionModalOpen(false);
			}}
			onClose={() => setAddToCollectionModalOpen(false)}
		/>
	);
}
```

- [ ] **Step 3: Final check**

```bash
npm run check
```

Expected: zero errors across the whole project.

- [ ] **Step 4: Commit**

```bash
git add "src/app/decks/[id]/page.tsx"
git commit -m "feat: wire zoneStats and availableZones into AddDeckToCollectionModal"
```
