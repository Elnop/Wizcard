# MPC Tag Filter — Design Spec

**Date:** 2026-06-07  
**Status:** Approved

## Problem

The `MpcTagsFilter` component exists and is wired end-to-end (URL params → hooks → Supabase query), but the filter section never renders because `availableMpcTags` is always `[]` — the search page never populates it. Users cannot filter custom cards by MPC style tags.

## Goal

Show a structured, hierarchical MPC tag filter in the search filter modal, matching the tag taxonomy from `docs/mpc_fil_format.txt`. Users can select one or more tags to narrow custom card results.

## Approach

Static canonical tag list (Option A), grouped by category with hierarchical selection (Option C):

- No DB round-trip to discover tags
- Tags organized under Art / Frame / Misc / Universe
- Parent nodes are clickable (selects all leaf descendants)
- Leaf nodes are individually selectable pills
- Parent shows partial state when some but not all children are selected

## Data Layer

### New file: `src/lib/mpc/mpc-tag-taxonomy.ts`

Exports a typed tree that mirrors the doc hierarchy exactly:

```ts
export interface MpcTagNode {
	label: string;
	children?: MpcTagNode[];
}

export interface MpcTagGroup {
	label: string;
	tags: MpcTagNode[];
}

export const MPC_TAG_GROUPS: MpcTagGroup[];
```

**Tag values must match the exact strings stored in `custom_cards.tags`** — tags are stored as-is from filenames (no lowercasing). Canonical names from the doc are used verbatim (e.g. `"Extended-Art"`, `"AI Art"`, `"Full-Art"`).

**Group structure (canonical, from doc):**

**Art:**

- Altered Art → Pixel Art, Pop-Out Art, Sketch Art
- Custom Art → AI Art → AI Remaster; Artist Art; Switched Art
- Upscaled Scan

**Frame:**

- Borderless → Post-2023 Borderless
- Custom-Made Frame → AI Frame; Minimalist; Stonecutter
- Extended-Art
- FNM Promo
- Foil-Etched
- Full Text
- Futureshifted
- Full-Art
- M15
- Modern
- Planeshifted
- Retro
- Showcase → (all 30+ showcase sub-tags from doc: Amonkhet Invocations, Capenna Art Deco, Capenna Golden Age, Capenna Skyscraper, ClassicShifted, Commander Legends, D&D Module, D&D Sourcebook, Doctor Who TARDIS, Dominaria Stained Glass, Eldraine Enchanting Tales, Eldraine Storybook, English Mystical Archive, FCA Showcase, Ikoria Crystal, Innistrad Equinox, Innistrad Fang, Ixalan Coin, Japanese Mystical Archive, Japan Showcase, Kaladesh Inventions, Kaldheim Viking, Kamigawa Neon, Kamigawa Ninja, Kamigawa Samurai, LOTR Ring, LOTR Scrolls of Middle-earth, M21 Spellbook, Phyrexia Oil, Ravnica Architecture, Sketch Frame, Tarkir Dragon Wing, Theros Nyx, Universes Beyond, Zendikar Expeditions, Zendikar Hedron, Zendikar Rising Expeditions)

**Misc:**

- Alternate Name → Nickname
- Card → Eternal Night Card; Realistic; Secret Lair; Textless
- Non-Black Border → Gold Border; Silver Border; White Border
- NSFW

**Universe:**

- Anime → Hatsune Miku
- Avatar The Last Airbender
- Dr Who
- Fallout
- Final Fantasy
- In-Multiverse
- League of Legends
- Lord of the Rings
- My Little Pony
- Spider-Man
- Warhammer 40k

## Component: `MpcTagsFilter`

### Updated interface

```ts
interface MpcTagsFilterProps {
	value: string[];
	onChange: (value: string[]) => void;
}
```

`availableTags` prop is removed — the component consumes `MPC_TAG_GROUPS` directly.

### Helper functions (internal to component)

```ts
function getLeaves(node: MpcTagNode): string[];
// Returns all leaf label strings under a node (recursive)

function getSelectionState(node: MpcTagNode, selected: string[]): 'none' | 'partial' | 'all';
// none: no leaves selected
// partial: some leaves selected
// all: all leaves selected

function toggleNode(
	node: MpcTagNode,
	selected: string[],
	state: 'none' | 'partial' | 'all'
): string[];
// state 'none' | 'partial' → add all leaves
// state 'all' → remove all leaves
```

### Rendering

- Each `MpcTagGroup`: rendered as a labeled section (category header)
- `MpcTagNode` with children: rendered as a clickable label-style button showing partial/full selection indicator; children rendered indented below
- `MpcTagNode` leaf: rendered as a pill button (active/inactive style)
- The Showcase sub-group is large (~30 items) — render collapsed by default with a "Show all" toggle

### `FilterModal` changes

- Remove `availableMpcTags` prop and all usages (prop, state, pass-through)
- `MpcTagsFilter` receives only `value` and `onChange`
- `MpcTagsFilter` is shown whenever `cardTypeFilter` allows custom cards (i.e. always in the custom section, no gating on `availableMpcTags.length`)

### Search page changes

- Remove `availableMpcTags` from `FilterModal` props call (it no longer exists)

## What does NOT change

- `mpc-tags.ts` — unchanged, used only for ingestion tag detection
- `useSearchFiltersFromUrl` — unchanged, `mpcTagsFilter: string[]` already wired
- `useCustomCards` / `queryCustomCards` — unchanged, consume `mpcTagsFilter` as-is
- URL format — unchanged, `mpcTags=Extended-Art,Full-Art` comma-separated

## Files changed

| File                                                                | Change                                                            |
| ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `src/lib/mpc/mpc-tag-taxonomy.ts`                                   | **New** — static tag tree                                         |
| `src/lib/search/components/filters/MpcTagsFilter/MpcTagsFilter.tsx` | **Rewrite** — hierarchical UI, no `availableTags` prop            |
| `src/lib/search/components/FilterModal/FilterModal.tsx`             | **Update** — remove `availableMpcTags` prop                       |
| `src/app/search/page.tsx`                                           | **Update** — remove `availableMpcTags` prop from FilterModal call |
