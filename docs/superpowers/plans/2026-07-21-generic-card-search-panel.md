# Generic Card Search Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the deck page's `CardSearchPanel` into a config-driven panel and mount it on the collection and wishlist pages so users can search Scryfall and quickly add cards.

**Architecture:** Move `CardSearchPanel` into `src/lib/search/components/`, drive its deck coupling from a `mode` discriminated union (`deck | collection | wishlist`), and isolate deck-only hooks (`useDeckContext`, `useDeckCardIndex`) into a deck-only subcomponent so non-deck modes don't subscribe to deck state. Add thin per-page wrappers plus an "Add cards" button + fixed-panel reflow on each page.

**Tech Stack:** Next.js (App Router, `[locale]` i18n), React client components, CSS Modules, next-intl, Scryfall search hooks, Supabase-backed collection/wishlist contexts.

## Global Constraints

- **No test framework** (no vitest/jest). Verify via `npm run check` + `npm run build` + runtime (dev server + Supabase). See [[project_no_test_framework]].
- **`npm run check` baseline is RED** (~60 pre-existing problems in unrelated files). Gate on **no NEW problems** — run `npx eslint <changed files>` and compare, never the whole-repo count. See [[project_check_red_baseline]].
- **TS2589 risk:** `npm run build` (not per-file tsc) is the only thing that catches Supabase-builder deep-generic errors. Run a build before declaring done. See [[project_supabase_builder_ts2589]].
- All user-facing strings go through `useTranslations`; add keys to every locale file under `messages/`.
- Follow existing file/component patterns; CSS via `.module.css` co-located with the component.
- Providers (`DeckProvider`, `AddCardModalProvider`, `AddToDeckModalProvider`, `CardModalProvider`, `CollectionProvider`, `WishlistProvider`) are **already mounted globally** in `src/contexts/Providers.tsx` — no new provider wiring needed. Deck hooks therefore won't crash off-deck; isolating them (Task 2) is about avoiding needless deck-state subscription/re-renders, not preventing a crash.

---

## File Structure

**Moved (git mv, path change only in Task 1):**

```
src/lib/search/components/CardSearchPanel/
  CardSearchPanel.tsx CardSearchPanel.module.css
  CardModeSwitcher.tsx CardModeSwitcher.module.css
  PanelTabs.tsx PanelTabs.module.css
  EdhrecRecommendations.tsx
  DeckZoneBadges.tsx DeckZoneBadges.module.css
  SearchCardContextMenu.tsx
  useDeckCardIndex.ts deck-card-index.ts zone-badge.ts
```

**Refactored:** `CardSearchPanel.tsx` (mode-driven, Tasks 2–3).

**Created:**

```
src/lib/search/components/CardSearchPanel/DeckModeExtras.tsx      (Task 2)
src/app/[locale]/collection/lib/CollectionSearchPanel.tsx        (Task 4)
src/app/[locale]/wishlist/WishlistSearchPanel.tsx                (Task 5)
```

**Modified:**

```
src/app/[locale]/decks/[id]/DeckDetailOwnerView.tsx              (Task 3)
src/app/[locale]/collection/page.tsx                            (Task 4)
src/app/[locale]/collection/lib/CollectionView/CollectionView.tsx + .module.css (Task 4)
src/app/[locale]/wishlist/page.tsx + page.module.css            (Task 5)
messages/*.json                                                 (Tasks 4–5)
```

---

## Task 1: Move the panel into `src/lib/search/components/`

Pure move + import-path fixups. No behavior change. Ends green so later refactors start from a clean baseline.

**Files:**

- Move: `src/app/[locale]/decks/[id]/components/CardSearchPanel/*` → `src/lib/search/components/CardSearchPanel/*`
- Modify: `src/app/[locale]/decks/[id]/DeckDetailOwnerView.tsx:32` (import path)
- Modify: any relative imports inside the moved files that pointed back into `decks/[id]`

**Interfaces:**

- Produces: `CardSearchPanel` importable from `@/lib/search/components/CardSearchPanel/CardSearchPanel` with its **current** props (unchanged this task).

- [ ] **Step 1: Move the directory with git**

```bash
git mv "src/app/[locale]/decks/[id]/components/CardSearchPanel" "src/lib/search/components/CardSearchPanel"
```

- [ ] **Step 2: Find imports that break from the move**

Run:

```bash
grep -rn "components/CardSearchPanel\|decks/\[id\]/components" "src/lib/search/components/CardSearchPanel" src --include='*.ts' --include='*.tsx'
```

Expected: the deck owner view import at `DeckDetailOwnerView.tsx:32`, plus any imports **inside** the moved files that reach back into `decks/[id]` (e.g. deck types, `useDeckContext`, deck store). Note each one.

- [ ] **Step 3: Fix the deck owner view import**

In `src/app/[locale]/decks/[id]/DeckDetailOwnerView.tsx`, change line 32 from:

```ts
import { CardSearchPanel } from './components/CardSearchPanel/CardSearchPanel';
```

to:

```ts
import { CardSearchPanel } from '@/lib/search/components/CardSearchPanel/CardSearchPanel';
```

- [ ] **Step 4: Fix internal relative imports in moved files**

For each moved file, convert any relative import that pointed into `decks/[id]` or `@/lib`/`@/components` (aliases still resolve; relatives like `../../../` break). Prefer `@/`-aliased imports. Example — `useDeckContext`, `useScryfallCardSearch`, `CardList`, `SearchBar`, `FilterModal` already use `@/` aliases and are unaffected; only relatives (`./PanelTabs`, `./DeckZoneBadges`, etc.) that stayed within the moved folder remain valid. Verify none reach outside the folder with a stale relative path.

- [ ] **Step 5: Typecheck + lint the changed files**

Run:

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "CardSearchPanel\|DeckDetailOwnerView" || echo "no panel/view type errors"
npx eslint "src/lib/search/components/CardSearchPanel" "src/app/[locale]/decks/[id]/DeckDetailOwnerView.tsx"
```

Expected: no errors referencing the moved files or the owner view.

- [ ] **Step 6: Build to confirm nothing else imported the old path**

Run: `npm run build`
Expected: build succeeds (the only importer was the owner view, already fixed).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: move CardSearchPanel to src/lib/search/components"
```

---

## Task 2: Extract deck-only hooks into `DeckModeExtras`

Isolate `useDeckContext` (`addCardToDeck`) and `useDeckCardIndex` (zone badges) so they are only called in deck mode. This subcomponent renders the deck-specific result-overlay/add behavior; the parent will call it only when `mode.kind === 'deck'` (wired in Task 3). Still no behavior change to the deck page.

**Files:**

- Create: `src/lib/search/components/CardSearchPanel/DeckModeExtras.tsx`
- Modify: `src/lib/search/components/CardSearchPanel/CardSearchPanel.tsx` (extract deck hook usage)

**Interfaces:**

- Consumes: `useDeckContext` (`addCardToDeck(deckId, card, zone)`), `useDeckCardIndex(deckId)` (`getDeckZones(oracleId)`), `DeckZoneBadges`, `SearchCardContextMenu`.
- Produces: a hook `useDeckModeExtras(deckId)` returning:
  ```ts
  {
    getDeckZones: (oracleId?: string) => DeckZone[];
    addCardToDeck: (deckId: string, card: ScryfallCard, zone: string) => void;
  }
  ```
  Kept as a hook (not a component) because the parent needs `getDeckZones`/`addCardToDeck` inside its own `renderOverlay`/`onCardClick` callbacks. The "only in deck mode" guarantee is achieved by a **wrapper component** `DeckModeExtras` that calls the hook and renders nothing structural — see design note below.

> **Design note (hooks can't be conditional):** React forbids calling `useDeckContext`/`useDeckCardIndex` conditionally in `CardSearchPanel`. Two valid shapes; pick **A**:
>
> - **A (chosen): two panel bodies.** `CardSearchPanel` becomes a thin dispatcher: `mode.kind === 'deck'` → render `<DeckCardSearchPanel .../>` (calls deck hooks + shared `<SearchPanelCore/>`); else → render `<PlainCardSearchPanel .../>` (no deck hooks + shared `<SearchPanelCore/>`). The shared search UI lives in `SearchPanelCore`. This guarantees non-deck modes never call deck hooks.
> - B (rejected): single component with `useDeckContext()` always called — simplest but keeps the deck subscription on every page.

Given note A, this task restructures into three files. To keep tasks bite-sized, **Task 2 creates `SearchPanelCore` + `DeckCardSearchPanel`** (deck path, behavior-identical to today) and **Task 3 adds `PlainCardSearchPanel` + the dispatcher**.

- [ ] **Step 1: Create `SearchPanelCore.tsx` with the shared search UI**

Create `src/lib/search/components/CardSearchPanel/SearchPanelCore.tsx`. Move into it everything from today's `CardSearchPanel.tsx` that is **not** deck-hook-dependent: the header (title/expand/close), SearchBar + filters row + toggles, `FilterModal`, `CardList` results, and the `noResults` block. It receives via props everything mode-specific:

```tsx
'use client';
import type { ReactNode } from 'react';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
// ...existing imports for SearchBar, FilterModal, CardList, hooks, styles

export type SearchPanelCoreProps = {
	title: string;
	expanded: boolean;
	onToggleExpand?: () => void;
	onClose: () => void;
	// feature flags
	showLegalToggle: boolean;
	showCollectionOnlyToggle: boolean;
	// deck-format context (only used when the flags above are true)
	deckFormat?: import('@/types/decks').DeckFormat | null;
	commanderColorIdentity?: ScryfallColor[];
	commanderName?: string | null;
	showEdhrecTab: boolean;
	// seams
	onCardClick: (card: AnyCard) => void;
	buildCardMenuItems?: (
		card: AnyCard,
		close: () => void
	) => import('@/components/ContextMenu/ContextMenu').ContextMenuAction[];
	renderOverlay?: (card: AnyCard) => ReactNode;
	// edhrec (deck only)
	edhrecContent?: ReactNode;
	onCollectionModeChange?: (v: boolean) => void;
};
```

Preserve **all** current search state/logic (search name, multilingual toggle, token/card mode, filters, `useScryfallCardSearch`, collection-only overlay via `useCollectionContext`/`useCollectionCards`, commander CI narrowing, `matchNothing`). The collection-only overlay stays in the core but is only surfaced when `showCollectionOnlyToggle` is true. Right-click uses the injected `buildCardMenuItems` if provided, else the existing `useContextMenu` + injected menu. Left-click calls `onCardClick`. Overlays come from `renderOverlay`.

> Keep the existing `// eslint-disable-next-line sonarjs/cognitive-complexity` comment on the core function.

- [ ] **Step 2: Create `DeckCardSearchPanel.tsx` (deck path)**

Create `src/lib/search/components/CardSearchPanel/DeckCardSearchPanel.tsx`. This calls the deck hooks and renders `SearchPanelCore` with deck seams — reproducing today's exact behavior:

```tsx
'use client';
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useContextMenu } from '@/components/ContextMenu/useContextMenu';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { useDeckCardIndex } from './useDeckCardIndex';
import { DeckZoneBadges } from './DeckZoneBadges';
import { SearchCardContextMenu } from './SearchCardContextMenu';
import { EdhrecRecommendations } from './EdhrecRecommendations';
import { SearchPanelCore } from './SearchPanelCore';
import styles from './CardSearchPanel.module.css';
import type { ScryfallCard, ScryfallColor } from '@/lib/scryfall/types/scryfall';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import type { DeckFormat } from '@/types/decks';

type Props = {
	deckId: string;
	onCardClick: (card: ScryfallCard) => void;
	onClose: () => void;
	deckFormat?: DeckFormat | null;
	commanderColorIdentity?: ScryfallColor[];
	commanderName?: string | null;
	onCollectionModeChange?: (v: boolean) => void;
	expanded: boolean;
	onToggleExpand?: () => void;
};

export function DeckCardSearchPanel(props: Props) {
	const t = useTranslations('decks');
	const { addCardToDeck } = useDeckContext();
	const { getDeckZones } = useDeckCardIndex(props.deckId);
	const { menu, open, close } = useContextMenu<ScryfallCard>();
	// renderOverlay: DeckZoneBadges + right-click hook (as today)
	// onCardClick: token-mode add vs props.onCardClick (as today)
	// pass showLegalToggle / showCollectionOnlyToggle / showEdhrecTab = deck rules
	// edhrecContent={<EdhrecRecommendations .../>}
	// render <SearchCardContextMenu> when `menu` is set, as today
}
```

Move the deck-specific bits verbatim from today's `CardSearchPanel.tsx`: `handleAddCardClick` (token-mode branch), `renderSearchOverlay` (overlay + `DeckZoneBadges`), the `SearchCardContextMenu` render, and the EDHREC tab wiring. Feature flags: `showLegalToggle = deckFormat != null && !FORMATS_WITHOUT_LEGALITY.includes(deckFormat)`, `showCollectionOnlyToggle = true`, `showEdhrecTab = isCommanderFormat && !!commanderName`.

- [ ] **Step 3: Point `CardSearchPanel.tsx` at the deck path temporarily**

Reduce `CardSearchPanel.tsx` to a pass-through that renders `DeckCardSearchPanel` with today's props (the mode dispatcher arrives in Task 3):

```tsx
'use client';
import { DeckCardSearchPanel } from './DeckCardSearchPanel';
// keep the current Props type
export function CardSearchPanel(props: Props) {
	return <DeckCardSearchPanel {...props} expanded={props.expanded ?? false} />;
}
```

- [ ] **Step 4: Lint + build**

Run:

```bash
npx eslint "src/lib/search/components/CardSearchPanel"
npm run build
```

Expected: no new eslint problems on these files; build succeeds.

- [ ] **Step 5: Runtime smoke — deck page unchanged**

Run `npm run dev`, open a commander deck's detail page, open the search panel. Verify: search works, filters work, EDHREC tab present, legality toggle present, zone badges render on results, left-click selects, right-click adds to zone. **Behavior must be identical to before.**

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: split CardSearchPanel into SearchPanelCore + DeckCardSearchPanel"
```

---

## Task 3: Add the `mode` dispatcher + `PlainCardSearchPanel`

Introduce the `mode` prop and a non-deck panel path that hides deck-only features and injects the search-page interaction (left-click → card modal, right-click → `buildSearchMenuItems`). The deck view switches to `mode={{ kind: 'deck', ... }}`.

**Files:**

- Create: `src/lib/search/components/CardSearchPanel/PlainCardSearchPanel.tsx`
- Modify: `src/lib/search/components/CardSearchPanel/CardSearchPanel.tsx` (dispatcher + `PanelMode` type)
- Modify: `src/app/[locale]/decks/[id]/DeckDetailOwnerView.tsx:652` (pass `mode`)

**Interfaces:**

- Produces the public API:
  ```ts
  export type PanelMode =
  	| {
  			kind: 'deck';
  			deckId: string;
  			deckFormat?: DeckFormat | null;
  			commanderColorIdentity?: ScryfallColor[];
  			commanderName?: string | null;
  			onCardClick: (card: ScryfallCard) => void;
  			onCollectionModeChange?: (inCollectionOnly: boolean) => void;
  	  }
  	| {
  			kind: 'collection';
  			onCardClick: (card: AnyCard) => void;
  			buildCardMenuItems: (card: AnyCard, close: () => void) => ContextMenuAction[];
  	  }
  	| {
  			kind: 'wishlist';
  			onCardClick: (card: AnyCard) => void;
  			buildCardMenuItems: (card: AnyCard, close: () => void) => ContextMenuAction[];
  	  };

  export type CardSearchPanelProps = {
  	mode: PanelMode;
  	onClose: () => void;
  	expanded?: boolean;
  	onToggleExpand?: () => void;
  };
  export function CardSearchPanel(props: CardSearchPanelProps): JSX.Element;
  ```
- Consumes: `SearchPanelCore` (Task 2), `DeckCardSearchPanel` (Task 2), `buildSearchMenuItems`, `useCardMenuLabels`.

- [ ] **Step 1: Create `PlainCardSearchPanel.tsx`**

Create `src/lib/search/components/CardSearchPanel/PlainCardSearchPanel.tsx`. It renders `SearchPanelCore` with deck features off and the injected seams. It calls **no** deck hooks.

```tsx
'use client';
import { useTranslations } from 'next-intl';
import { SearchPanelCore } from './SearchPanelCore';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import type { ContextMenuAction } from '@/components/ContextMenu/ContextMenu';

type Props = {
	onCardClick: (card: AnyCard) => void;
	buildCardMenuItems: (card: AnyCard, close: () => void) => ContextMenuAction[];
	onClose: () => void;
	expanded: boolean;
	onToggleExpand?: () => void;
};

export function PlainCardSearchPanel(props: Props) {
	const t = useTranslations('decks'); // reuse decks.addCards title (see Task note)
	return (
		<SearchPanelCore
			title={t('addCards')}
			expanded={props.expanded}
			onToggleExpand={props.onToggleExpand}
			onClose={props.onClose}
			showLegalToggle={false}
			showCollectionOnlyToggle={false}
			showEdhrecTab={false}
			onCardClick={props.onCardClick}
			buildCardMenuItems={props.buildCardMenuItems}
			// renderOverlay omitted → SearchPanelCore falls back to withCustomBadge (see Step 2)
		/>
	);
}
```

- [ ] **Step 2: Default overlay in `SearchPanelCore`**

In `SearchPanelCore`, when `renderOverlay` is not provided, default to `withCustomBadge` (import from `@/lib/card/utils/composeOverlay`) — matching the search page. Deck mode still passes its own overlay. Ensure `CardList` receives `renderOverlay={renderOverlay ?? withCustomBadge}`.

- [ ] **Step 3: Rewrite `CardSearchPanel.tsx` as the dispatcher**

```tsx
'use client';
import { DeckCardSearchPanel } from './DeckCardSearchPanel';
import { PlainCardSearchPanel } from './PlainCardSearchPanel';
import type { ScryfallCard, ScryfallColor } from '@/lib/scryfall/types/scryfall';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import type { ContextMenuAction } from '@/components/ContextMenu/ContextMenu';
import type { DeckFormat } from '@/types/decks';

export type PanelMode =
	| {
			kind: 'deck';
			deckId: string;
			deckFormat?: DeckFormat | null;
			commanderColorIdentity?: ScryfallColor[];
			commanderName?: string | null;
			onCardClick: (card: ScryfallCard) => void;
			onCollectionModeChange?: (v: boolean) => void;
	  }
	| {
			kind: 'collection' | 'wishlist';
			onCardClick: (card: AnyCard) => void;
			buildCardMenuItems: (card: AnyCard, close: () => void) => ContextMenuAction[];
	  };

export type CardSearchPanelProps = {
	mode: PanelMode;
	onClose: () => void;
	expanded?: boolean;
	onToggleExpand?: () => void;
};

export function CardSearchPanel({
	mode,
	onClose,
	expanded = false,
	onToggleExpand,
}: CardSearchPanelProps) {
	if (mode.kind === 'deck') {
		return (
			<DeckCardSearchPanel
				deckId={mode.deckId}
				onCardClick={mode.onCardClick}
				onClose={onClose}
				deckFormat={mode.deckFormat}
				commanderColorIdentity={mode.commanderColorIdentity}
				commanderName={mode.commanderName}
				onCollectionModeChange={mode.onCollectionModeChange}
				expanded={expanded}
				onToggleExpand={onToggleExpand}
			/>
		);
	}
	return (
		<PlainCardSearchPanel
			onCardClick={mode.onCardClick}
			buildCardMenuItems={mode.buildCardMenuItems}
			onClose={onClose}
			expanded={expanded}
			onToggleExpand={onToggleExpand}
		/>
	);
}
```

- [ ] **Step 4: Update the deck owner view to pass `mode`**

In `src/app/[locale]/decks/[id]/DeckDetailOwnerView.tsx` around line 652, replace the flat props with:

```tsx
<CardSearchPanel
	mode={{
		kind: 'deck',
		deckId,
		deckFormat: deck.format,
		commanderColorIdentity,
		commanderName,
		onCardClick: setPanelSelectedCard,
		onCollectionModeChange: setPanelInCollectionOnly,
	}}
	onClose={() => {
		setSearchPanelOpen(false);
		setSearchPanelExpanded(false);
	}}
	expanded={searchPanelExpanded}
	onToggleExpand={() => setSearchPanelExpanded((v) => !v)}
/>
```

- [ ] **Step 5: Lint + build**

Run:

```bash
npx eslint "src/lib/search/components/CardSearchPanel" "src/app/[locale]/decks/[id]/DeckDetailOwnerView.tsx"
npm run build
```

Expected: no new problems; build succeeds (watch for TS2589 — none expected here, but the build is the gate).

- [ ] **Step 6: Runtime smoke — deck page still identical**

`npm run dev`, reopen a deck's search panel, re-verify the full deck checklist from Task 2 Step 5. Deck behavior must be unchanged.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: mode-driven CardSearchPanel with deck/collection/wishlist modes"
```

---

## Task 4: Collection page — wrapper, button, panel, reflow

Add `CollectionSearchPanel`, an "Add cards" button, panel open/expand state, and content reflow when the fixed panel is open.

**Files:**

- Create: `src/app/[locale]/collection/lib/CollectionSearchPanel.tsx`
- Modify: `src/app/[locale]/collection/page.tsx`
- Modify: `src/app/[locale]/collection/lib/CollectionView/CollectionView.tsx` (accept `panelOpen`, `children` already exists)
- Modify: `src/app/[locale]/collection/lib/CollectionView/CollectionView.module.css` (reflow rule)
- Modify: `messages/*.json` (button + panel keys)

**Interfaces:**

- Consumes: `CardSearchPanel`, `PanelMode` (Task 3); `useCollectionContext().addCards`; `useCardModalContext().openCardModal`; `useAddCardModal().openAddCard`; `useAddToDeckModal().openAddToDeck`; `useWishlistContext().addToWishlist`; `useCardMenuLabels`; `buildSearchMenuItems`; `useRouter` from `@/i18n/navigation`.
- Produces: `<CollectionSearchPanel expanded onToggleExpand onClose />`.

- [ ] **Step 1: Create `CollectionSearchPanel.tsx`**

```tsx
'use client';
import { useCallback } from 'react';
import { useRouter } from '@/i18n/navigation';
import { CardSearchPanel } from '@/lib/search/components/CardSearchPanel/CardSearchPanel';
import { buildSearchMenuItems } from '@/app/[locale]/search/searchCardMenu';
import { useCardMenuLabels } from '@/lib/card/hooks/useCardMenuLabels';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { useWishlistContext } from '@/lib/wishlist/context/WishlistContext';
import { useCardModalContext } from '@/contexts/CardModalProvider';
import { useAddCardModal } from '@/contexts/AddCardModalProvider';
import { useAddToDeckModal } from '@/contexts/AddToDeckModalProvider';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

type Props = { expanded: boolean; onToggleExpand: () => void; onClose: () => void };

export function CollectionSearchPanel({ expanded, onToggleExpand, onClose }: Props) {
	const router = useRouter();
	const labels = useCardMenuLabels();
	const { addCards } = useCollectionContext();
	const { addToWishlist } = useWishlistContext();
	const { openCardModal } = useCardModalContext();
	const { openAddCard } = useAddCardModal();
	const { openAddToDeck } = useAddToDeckModal();

	const onCardClick = useCallback(
		(card: AnyCard) => openCardModal(card as ScryfallCard),
		[openCardModal]
	);

	const buildCardMenuItems = useCallback(
		(card: AnyCard, close: () => void) =>
			buildSearchMenuItems(
				card,
				{
					onViewDetails: (c) => openCardModal(c as ScryfallCard),
					onOpenCardPage: (c) => router.push(`/card/${c.id}`),
					onAddToCollection: (c) =>
						openAddCard({
							scryfallCard: c as ScryfallCard,
							onAdd: (card, entry, count) => addCards(card, count, entry),
						}),
					onAddToWishlist: (c) =>
						openAddCard({
							scryfallCard: c as ScryfallCard,
							onAdd: (card, entry, count) => addToWishlist(card, entry, count),
						}),
					onAddToDeck: (c) => openAddToDeck(c),
				},
				close,
				labels
			),
		[router, labels, addCards, addToWishlist, openCardModal, openAddCard, openAddToDeck]
	);

	return (
		<CardSearchPanel
			mode={{ kind: 'collection', onCardClick, buildCardMenuItems }}
			onClose={onClose}
			expanded={expanded}
			onToggleExpand={onToggleExpand}
		/>
	);
}
```

- [ ] **Step 2: Add i18n keys**

In every `messages/<locale>.json`, under the `collection` namespace add:

```json
"addCards": "<localized: 'Add cards' / 'Ajouter des cartes'>"
```

(Reuse `decks.addCards` for the panel title — the panel's `PlainCardSearchPanel` already reads `decks.addCards`; confirm that key exists in all locales, it does today.)
Provide real translations for each locale file present under `messages/` (do not leave English placeholders in non-English files).

- [ ] **Step 3: Wire button + state + panel into `page.tsx`**

In `src/app/[locale]/collection/page.tsx` (`CollectionPageInner`):

- Add state: `const [panelOpen, setPanelOpen] = useState(false); const [panelExpanded, setPanelExpanded] = useState(false);`
- In the `actions` block, add before the Import button:

```tsx
<Button variant="secondary" onClick={() => setPanelOpen(true)} disabled={isBusy}>
	{t('addCards')}
</Button>
```

- Pass `panelOpen={panelOpen && !panelExpanded}` to `<CollectionView>` (new prop, Step 4) and render the panel as a child:

```tsx
<CollectionView ... panelOpen={panelOpen && !panelExpanded}>
  <ImportModal />
  {panelOpen && (
    <CollectionSearchPanel
      expanded={panelExpanded}
      onToggleExpand={() => setPanelExpanded((v) => !v)}
      onClose={() => { setPanelOpen(false); setPanelExpanded(false); }}
    />
  )}
</CollectionView>
```

Add the import: `import { CollectionSearchPanel } from './lib/CollectionSearchPanel';` and `useState` to the React import.

- [ ] **Step 4: Add `panelOpen` reflow to `CollectionView`**

In `CollectionView.tsx`, add `panelOpen?: boolean` to `Props` and to the destructured params (default `false`). Change `mainClass` to include a reflow class when open:

```ts
const mainClass = [styles.main, isModal && styles.mainModal, panelOpen && styles.mainWithPanel]
	.filter(Boolean)
	.join(' ');
```

In `CollectionView.module.css` add:

```css
.mainWithPanel {
	padding-right: calc(480px + 36px);
}
@media (max-width: 768px) {
	.mainWithPanel {
		padding-right: 0;
	}
}
```

- [ ] **Step 5: Lint + build**

Run:

```bash
npx eslint "src/app/[locale]/collection/lib/CollectionSearchPanel.tsx" "src/app/[locale]/collection/page.tsx" "src/app/[locale]/collection/lib/CollectionView/CollectionView.tsx"
npm run build
```

Expected: no new problems; build succeeds.

- [ ] **Step 6: Runtime — collection add flow**

`npm run dev` + Supabase running. On `/collection`:

- Click "Add cards" → fixed right panel opens; page content reflows left (desktop).
- Search a card → **left-click opens the card details modal**.
- **Right-click** a result → context menu with View details / Open card page / Add to collection / Add to wishlist / Add to deck.
- "Add to collection" → opens the quantity/print modal → confirm → card appears in the collection grid.
- No EDHREC tab, no legality toggle, no zone badges, no "in collection only" toggle.
- Expand/collapse works; on mobile the panel is fullscreen.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: card search panel on the collection page"
```

---

## Task 5: Wishlist page — wrapper, button, panel, reflow

Mirror Task 4 for the wishlist page. The wishlist page renders its own layout (not `CollectionView`), so the reflow attaches to its own container.

**Files:**

- Create: `src/app/[locale]/wishlist/WishlistSearchPanel.tsx`
- Modify: `src/app/[locale]/wishlist/page.tsx`
- Modify: `src/app/[locale]/wishlist/page.module.css` (reflow rule)
- Modify: `messages/*.json` (`wishlist.addCards`)

**Interfaces:**

- Consumes: identical to Task 4 (`CardSearchPanel`, `buildSearchMenuItems`, `useCardMenuLabels`, the four modal/context hooks). The **default add-from-panel** here still offers all of Add to collection / wishlist / deck (the search-page menu), matching the collection panel — the page context differs only in the button label and where the panel lives.
- Produces: `<WishlistSearchPanel expanded onToggleExpand onClose />`.

- [ ] **Step 1: Create `WishlistSearchPanel.tsx`**

Same body as `CollectionSearchPanel.tsx` (Task 4 Step 1) with `mode={{ kind: 'wishlist', onCardClick, buildCardMenuItems }}`. The handler wiring is identical (the menu already exposes both add-to-collection and add-to-wishlist). Copy the file and change only the `kind` and the component name.

- [ ] **Step 2: Add i18n key**

In every `messages/<locale>.json`, under `wishlist` add:

```json
"addCards": "<localized: 'Add cards' / 'Ajouter des cartes'>"
```

Real translation per locale file.

- [ ] **Step 3: Inspect the wishlist page layout container**

Run: `grep -n "className={styles\|actions\|return (\|<main\|<div" "src/app/[locale]/wishlist/page.tsx" | head -30`
Identify the top-level page container class (e.g. `styles.page` / a main wrapper) and the actions region where the Import button lives.

- [ ] **Step 4: Wire button + state + panel into `page.tsx`**

In `WishlistPageInner`:

- Add `const [panelOpen, setPanelOpen] = useState(false); const [panelExpanded, setPanelExpanded] = useState(false);` (add `useState` to imports).
- Add an "Add cards" button next to the existing actions (mirror the collection Button placement/variant):

```tsx
<Button variant="secondary" onClick={() => setPanelOpen(true)}>
	{t('addCards')}
</Button>
```

- Apply a reflow class to the page's main container when `panelOpen && !panelExpanded` (use the container class found in Step 3):

```tsx
<div className={`${styles.<container>} ${panelOpen && !panelExpanded ? styles.withPanel : ''}`}>
```

- Render the panel at the end of the page tree:

```tsx
{
	panelOpen && (
		<WishlistSearchPanel
			expanded={panelExpanded}
			onToggleExpand={() => setPanelExpanded((v) => !v)}
			onClose={() => {
				setPanelOpen(false);
				setPanelExpanded(false);
			}}
		/>
	);
}
```

Add `import { WishlistSearchPanel } from './WishlistSearchPanel';`.

- [ ] **Step 5: Add reflow CSS**

In `src/app/[locale]/wishlist/page.module.css`:

```css
.withPanel {
	padding-right: calc(480px + 36px);
}
@media (max-width: 768px) {
	.withPanel {
		padding-right: 0;
	}
}
```

(If the container already sets `padding`/`overflow`, apply `.withPanel` to the scrollable inner region so the fixed panel doesn't overlap content — match whatever element holds the grid.)

- [ ] **Step 6: Lint + build**

Run:

```bash
npx eslint "src/app/[locale]/wishlist/WishlistSearchPanel.tsx" "src/app/[locale]/wishlist/page.tsx"
npm run build
```

Expected: no new problems; build succeeds.

- [ ] **Step 7: Runtime — wishlist add flow**

`npm run dev` + Supabase. On `/wishlist`:

- "Add cards" opens the panel; reflow works (desktop).
- Left-click opens card modal; right-click menu present.
- "Add to wishlist" → quantity/print modal → confirm → card appears in the wishlist grid.
- Deck-only features absent; expand/collapse + mobile fullscreen work.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: card search panel on the wishlist page"
```

---

## Task 6: Final verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: succeeds (catches any TS2589 / type regressions across all three pages).

- [ ] **Step 2: Lint delta on all changed files**

Run:

```bash
git diff --name-only main...HEAD -- '*.ts' '*.tsx' | xargs npx eslint
```

Expected: no NEW problems vs the RED baseline (compare against `git stash`-clean run if unsure; the changed files themselves should be clean).

- [ ] **Step 3: Cross-page regression checklist (runtime)**

With dev + Supabase:

- Deck page: search panel fully unchanged (EDHREC, legality, zone badges, add-to-zone, expand, mobile).
- Collection page: add-to-collection works end to end; deck features hidden.
- Wishlist page: add-to-wishlist works end to end; deck features hidden.
- All three: left-click → card modal, right-click → correct menu, panel expand/collapse, mobile fullscreen, page reflow on desktop when side panel open.

- [ ] **Step 4: Confirm no orphaned references to the old path**

Run: `grep -rn "decks/\[id\]/components/CardSearchPanel" src`
Expected: no matches.

---

## Self-Review Notes

- **Spec coverage:** mode config (Task 3) ✓; same fixed panel + reflow (Tasks 4–5) ✓; left-click modal / right-click search menu (Tasks 3–5) ✓; deck-only features hidden (Task 3 flags) ✓; move to `src/lib/search` (Task 1) ✓; deck-hook isolation (Task 2, shape A) ✓; deck view unchanged behavior (Tasks 2,3,6) ✓.
- **Token mode:** kept in all modes via `SearchPanelCore` (the card/token switch is mode-agnostic search UI); no extra work needed. If token add misbehaves off-deck at runtime (Task 4/5 Step 6), the fallback is to gate the switcher behind a `showTokenMode` flag defaulting to deck-only — note only, not a planned task.
- **Type consistency:** `buildCardMenuItems` / `onCardClick` / `PanelMode` names match across Tasks 3–5; `openAddCard` (from `useAddCardModal`) used consistently; `addCards(card, count, entry)` arg order matches `CollectionContextValue`.
