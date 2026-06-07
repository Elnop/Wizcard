# MPC Tag Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the non-rendering `MpcTagsFilter` stub with a fully functional hierarchical tag filter that matches the MPC Autofill tag taxonomy, organized under Art / Frame / Misc / Universe category groups.

**Architecture:** A new static data file `mpc-tag-taxonomy.ts` exports a typed tree (`MpcTagGroup[]`) mirroring the doc hierarchy. `MpcTagsFilter` is rewritten to consume this tree directly (no props for available tags), rendering category headers, clickable parent nodes (toggle all leaves), and pill leaves with partial-selection indicators. `FilterModal` and the search page have their now-unused `availableMpcTags` prop removed.

**Tech Stack:** TypeScript, React (hooks, no external state library), Next.js App Router (client components), existing CSS variables from FilterModal.module.css.

---

### Task 1: Create `mpc-tag-taxonomy.ts` — static tag tree

**Files:**

- Create: `src/lib/mpc/mpc-tag-taxonomy.ts`

- [ ] **Step 1: Create the file with full taxonomy**

```typescript
// src/lib/mpc/mpc-tag-taxonomy.ts

export interface MpcTagNode {
	label: string;
	children?: MpcTagNode[];
}

export interface MpcTagGroup {
	label: string;
	tags: MpcTagNode[];
}

export const MPC_TAG_GROUPS: MpcTagGroup[] = [
	{
		label: 'Art',
		tags: [
			{
				label: 'Altered Art',
				children: [{ label: 'Pixel Art' }, { label: 'Pop-Out Art' }, { label: 'Sketch Art' }],
			},
			{
				label: 'Custom Art',
				children: [
					{
						label: 'AI Art',
						children: [{ label: 'AI Remaster' }],
					},
					{ label: 'Artist Art' },
					{ label: 'Switched Art' },
				],
			},
			{ label: 'Upscaled Scan' },
		],
	},
	{
		label: 'Frame',
		tags: [
			{
				label: 'Borderless',
				children: [{ label: 'Post-2023 Borderless' }],
			},
			{
				label: 'Custom-Made Frame',
				children: [{ label: 'AI Frame' }, { label: 'Minimalist' }, { label: 'Stonecutter' }],
			},
			{ label: 'Extended-Art' },
			{ label: 'FNM Promo' },
			{ label: 'Foil-Etched' },
			{ label: 'Full Text' },
			{ label: 'Full-Art' },
			{ label: 'Futureshifted' },
			{ label: 'M15' },
			{ label: 'Modern' },
			{ label: 'Planeshifted' },
			{ label: 'Retro' },
			{
				label: 'Showcase',
				children: [
					{ label: 'Amonkhet Invocations' },
					{ label: 'Capenna Art Deco' },
					{ label: 'Capenna Golden Age' },
					{ label: 'Capenna Skyscraper' },
					{ label: 'ClassicShifted' },
					{ label: 'Commander Legends' },
					{ label: 'D&D Module' },
					{ label: 'D&D Sourcebook' },
					{ label: 'Doctor Who TARDIS' },
					{ label: 'Dominaria Stained Glass' },
					{ label: 'Eldraine Enchanting Tales' },
					{ label: 'Eldraine Storybook' },
					{ label: 'English Mystical Archive' },
					{ label: 'FCA Showcase' },
					{ label: 'Ikoria Crystal' },
					{ label: 'Innistrad Equinox' },
					{ label: 'Innistrad Fang' },
					{ label: 'Ixalan Coin' },
					{ label: 'Japanese Mystical Archive' },
					{ label: 'Japan Showcase' },
					{ label: 'Kaladesh Inventions' },
					{ label: 'Kaldheim Viking' },
					{ label: 'Kamigawa Neon' },
					{ label: 'Kamigawa Ninja' },
					{ label: 'Kamigawa Samurai' },
					{ label: 'LOTR Ring' },
					{ label: 'LOTR Scrolls of Middle-earth' },
					{ label: 'M21 Spellbook' },
					{ label: 'Phyrexia Oil' },
					{ label: 'Ravnica Architecture' },
					{ label: 'Sketch Frame' },
					{ label: 'Tarkir Dragon Wing' },
					{ label: 'Theros Nyx' },
					{ label: 'Universes Beyond' },
					{ label: 'Zendikar Expeditions' },
					{ label: 'Zendikar Hedron' },
					{ label: 'Zendikar Rising Expeditions' },
				],
			},
		],
	},
	{
		label: 'Misc',
		tags: [
			{
				label: 'Alternate Name',
				children: [{ label: 'Nickname' }],
			},
			{
				label: 'Card',
				children: [
					{ label: 'Eternal Night Card' },
					{ label: 'Realistic' },
					{ label: 'Secret Lair' },
					{ label: 'Textless' },
				],
			},
			{
				label: 'Non-Black Border',
				children: [{ label: 'Gold Border' }, { label: 'Silver Border' }, { label: 'White Border' }],
			},
			{ label: 'NSFW' },
		],
	},
	{
		label: 'Universe',
		tags: [
			{
				label: 'Anime',
				children: [{ label: 'Hatsune Miku' }],
			},
			{ label: 'Avatar The Last Airbender' },
			{ label: 'Dr Who' },
			{ label: 'Fallout' },
			{ label: 'Final Fantasy' },
			{ label: 'In-Multiverse' },
			{ label: 'League of Legends' },
			{ label: 'Lord of the Rings' },
			{ label: 'My Little Pony' },
			{ label: 'Spider-Man' },
			{ label: 'Warhammer 40k' },
		],
	},
];
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run check`
Expected: No errors in `src/lib/mpc/mpc-tag-taxonomy.ts`

- [ ] **Step 3: Commit**

```bash
git add src/lib/mpc/mpc-tag-taxonomy.ts
git commit -m "feat(mpc): add static MPC tag taxonomy tree"
```

---

### Task 2: Rewrite `MpcTagsFilter` with hierarchical UI

**Files:**

- Modify: `src/lib/search/components/filters/MpcTagsFilter/MpcTagsFilter.tsx`

This task rewrites the component entirely. The new component:

- Imports `MPC_TAG_GROUPS`, `MpcTagNode` from `mpc-tag-taxonomy.ts`
- Has three internal pure functions: `getLeaves`, `getSelectionState`, `toggleNode`
- Renders category groups → parent nodes (clickable) → leaf pills
- Collapses the Showcase sub-group by default with an expand toggle

- [ ] **Step 1: Rewrite `MpcTagsFilter.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { MPC_TAG_GROUPS } from '@/lib/mpc/mpc-tag-taxonomy';
import type { MpcTagNode } from '@/lib/mpc/mpc-tag-taxonomy';

interface MpcTagsFilterProps {
	value: string[];
	onChange: (value: string[]) => void;
}

function getLeaves(node: MpcTagNode): string[] {
	if (!node.children || node.children.length === 0) return [node.label];
	return node.children.flatMap(getLeaves);
}

function getSelectionState(node: MpcTagNode, selected: string[]): 'none' | 'partial' | 'all' {
	const leaves = getLeaves(node);
	const count = leaves.filter((l) => selected.includes(l)).length;
	if (count === 0) return 'none';
	if (count === leaves.length) return 'all';
	return 'partial';
}

function toggleNode(
	node: MpcTagNode,
	selected: string[],
	state: 'none' | 'partial' | 'all'
): string[] {
	const leaves = getLeaves(node);
	if (state === 'all') return selected.filter((t) => !leaves.includes(t));
	const toAdd = leaves.filter((l) => !selected.includes(l));
	return [...selected, ...toAdd];
}

const SHOWCASE_LABEL = 'Showcase';

function TagNodeRow({
	node,
	depth,
	selected,
	onChange,
	collapsedNodes,
	onToggleCollapse,
}: {
	node: MpcTagNode;
	depth: number;
	selected: string[];
	onChange: (value: string[]) => void;
	collapsedNodes: Set<string>;
	onToggleCollapse: (label: string) => void;
}) {
	const isLeaf = !node.children || node.children.length === 0;
	const state = getSelectionState(node, selected);
	const isActive = state === 'all';
	const isPartial = state === 'partial';
	const isCollapsed = collapsedNodes.has(node.label);

	const handleClick = () => {
		onChange(toggleNode(node, selected, state));
	};

	if (isLeaf) {
		return (
			<button
				type="button"
				onClick={handleClick}
				style={{
					fontSize: 11,
					padding: '2px 8px',
					borderRadius: 999,
					border: '1px solid var(--color-border, #e5e7eb)',
					background: isActive ? 'var(--color-accent, #6366f1)' : 'var(--color-surface-2, #f3f4f6)',
					color: isActive ? '#fff' : 'var(--color-text, #111827)',
					cursor: 'pointer',
					marginLeft: depth * 8,
				}}
			>
				{node.label}
			</button>
		);
	}

	return (
		<div style={{ marginLeft: depth * 8 }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
				<button
					type="button"
					onClick={handleClick}
					style={{
						fontSize: 11,
						fontWeight: 600,
						padding: '2px 6px',
						borderRadius: 4,
						border: '1px solid var(--color-border, #e5e7eb)',
						background: isActive
							? 'var(--color-accent, #6366f1)'
							: isPartial
								? 'var(--color-accent-muted, #e0e7ff)'
								: 'transparent',
						color: isActive
							? '#fff'
							: isPartial
								? 'var(--color-accent, #6366f1)'
								: 'var(--color-text-muted, #6b7280)',
						cursor: 'pointer',
					}}
				>
					{isActive ? '✓ ' : isPartial ? '– ' : ''}
					{node.label}
				</button>
				<button
					type="button"
					onClick={() => onToggleCollapse(node.label)}
					aria-label={isCollapsed ? 'Expand' : 'Collapse'}
					style={{
						fontSize: 10,
						padding: '1px 4px',
						border: 'none',
						background: 'transparent',
						color: 'var(--color-text-muted, #6b7280)',
						cursor: 'pointer',
					}}
				>
					{isCollapsed ? '▶' : '▼'}
				</button>
			</div>
			{!isCollapsed && (
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
					{node.children!.map((child) => (
						<TagNodeRow
							key={child.label}
							node={child}
							depth={0}
							selected={selected}
							onChange={onChange}
							collapsedNodes={collapsedNodes}
							onToggleCollapse={onToggleCollapse}
						/>
					))}
				</div>
			)}
		</div>
	);
}

export function MpcTagsFilter({ value, onChange }: MpcTagsFilterProps) {
	const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set([SHOWCASE_LABEL]));

	const handleToggleCollapse = (label: string) => {
		setCollapsedNodes((prev) => {
			const next = new Set(prev);
			if (next.has(label)) next.delete(label);
			else next.add(label);
			return next;
		});
	};

	return (
		<div>
			<div
				style={{
					fontSize: 12,
					fontWeight: 600,
					marginBottom: 8,
					color: 'var(--color-text-muted, #6b7280)',
				}}
			>
				Tags MPC
			</div>
			{MPC_TAG_GROUPS.map((group) => (
				<div key={group.label} style={{ marginBottom: 10 }}>
					<div
						style={{
							fontSize: 10,
							fontWeight: 700,
							textTransform: 'uppercase',
							letterSpacing: '0.05em',
							color: 'var(--color-text-muted, #6b7280)',
							marginBottom: 6,
						}}
					>
						{group.label}
					</div>
					<div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
						{group.tags.map((node) => (
							<TagNodeRow
								key={node.label}
								node={node}
								depth={0}
								selected={value}
								onChange={onChange}
								collapsedNodes={collapsedNodes}
								onToggleCollapse={handleToggleCollapse}
							/>
						))}
					</div>
				</div>
			))}
		</div>
	);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run check`
Expected: No errors in `MpcTagsFilter.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/lib/search/components/filters/MpcTagsFilter/MpcTagsFilter.tsx
git commit -m "feat(search): rewrite MpcTagsFilter with hierarchical taxonomy UI"
```

---

### Task 3: Update `FilterModal` — remove `availableMpcTags` prop

**Files:**

- Modify: `src/lib/search/components/FilterModal/FilterModal.tsx`

`availableMpcTags` and its pass-through are removed. `MpcTagsFilter` no longer needs it. The filter section is always shown (no guard on `availableMpcTags.length`).

- [ ] **Step 1: Remove `availableMpcTags` from `FilterModalProps`**

In `FilterModal.tsx`, find the `FilterModalProps` interface and remove:

```ts
// remove these two lines:
availableMpcTags?: string[];
```

And in the `onApply` callback type, `mpcTagsFilter` stays — it's unrelated.

- [ ] **Step 2: Remove `availableMpcTags` from `FilterModalContentProps`**

Find `FilterModalContentProps` and remove:

```ts
// remove:
availableMpcTags: string[];
```

- [ ] **Step 3: Remove from `FilterModalContent` function signature and body**

In the `FilterModalContent` function:

- Remove `availableMpcTags` from the destructured props
- Update the `MpcTagsFilter` call — it now only needs `value` and `onChange`:

```tsx
<MpcTagsFilter value={draftMpcTagsFilter} onChange={setDraftMpcTagsFilter} />
```

- [ ] **Step 4: Remove from `FilterModal` function**

In the outer `FilterModal` function:

- Remove `availableMpcTags = []` from destructured props
- Remove `availableMpcTags={availableMpcTags}` from the `FilterModalContent` call

- [ ] **Step 5: The full updated `FilterModal.tsx` should now look like this for the changed sections**

`FilterModalProps` (abridged — only showing changed interface):

```ts
interface FilterModalProps {
	isOpen: boolean;
	colors: ScryfallColor[];
	colorMatch?: ColorMatch;
	type: string;
	set: string;
	rarities: string[];
	oracleText: string;
	cmc: string;
	sets: ScryfallSet[];
	setsLoading?: boolean;
	order: ScryfallSortOrder;
	dir: ScryfallSortDir;
	customSources?: MpcSourceWithCount[];
	customSourceId?: string | null;
	cardTypeFilter?: CardType | 'all';
	mpcTagsFilter?: string[];
	// availableMpcTags is gone
	onApply: (filters: {
		colors: ScryfallColor[];
		colorMatch: ColorMatch;
		type: string;
		set: string;
		rarities: string[];
		oracleText: string;
		cmc: string;
		order: ScryfallSortOrder;
		dir: ScryfallSortDir;
		customSourceId: string | null;
		cardTypeFilter: CardType | 'all';
		mpcTagsFilter: string[];
	}) => void;
	onClose: () => void;
}
```

`MpcTagsFilter` usage in the custom section:

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
			<MpcTagsFilter value={draftMpcTagsFilter} onChange={setDraftMpcTagsFilter} />
		</>
	);
}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npm run check`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/search/components/FilterModal/FilterModal.tsx
git commit -m "feat(search): remove availableMpcTags prop from FilterModal"
```

---

### Task 4: Update search page — remove `availableMpcTags` prop

**Files:**

- Modify: `src/app/search/page.tsx`

The search page passes `availableMpcTags` to `FilterModal`. Since the prop no longer exists, this line must be removed.

- [ ] **Step 1: Remove `availableMpcTags` from the `FilterModal` JSX call**

In `src/app/search/page.tsx`, find the `<FilterModal ... />` block and remove this line:

```tsx
// remove:
availableMpcTags={...}  // (if present — check the actual prop name used)
```

Check the current file: the prop was defaulted to `[]` in `FilterModal` so the search page may or may not explicitly pass it. Grep to confirm:

```bash
grep -n "availableMpcTags" src/app/search/page.tsx
```

If output is empty, no change needed in the page. If a line is found, remove it.

- [ ] **Step 2: Verify TypeScript compiles with no errors**

Run: `npm run check`
Expected: Clean — no TypeScript errors, no ESLint errors

- [ ] **Step 3: Commit**

```bash
git add src/app/search/page.tsx
git commit -m "feat(search): wire MpcTagsFilter — remove stale availableMpcTags prop"
```

---

### Task 5: Manual smoke test

No automated tests exist for this UI component (it's pure presentational). Verify the feature works end-to-end manually.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Open search page and open Filters modal**

Navigate to `http://localhost:3000/search`. Click the "Filtres" button.

- [ ] **Step 3: Verify the Tags MPC section renders**

Expected: Below the "Cartes Custom" source filter, a "Tags MPC" section appears with four category headers: Art, Frame, Misc, Universe.

- [ ] **Step 4: Verify category groups and pills**

- Art group shows: "Altered Art" parent button + its children pills (Pixel Art, Pop-Out Art, Sketch Art) expanded
- Frame > Showcase shows collapsed by default with a ▶ toggle
- Clicking ▶ on Showcase expands its ~37 sub-tags

- [ ] **Step 5: Verify parent selection behavior**

- Click "Altered Art" parent → Pixel Art, Pop-Out Art, Sketch Art pills all activate
- Click "Altered Art" again → all three deactivate
- Click "Pixel Art" alone → Altered Art shows partial state (– prefix)

- [ ] **Step 6: Verify filter applies and URL updates**

- Select "Extended-Art", click Appliquer
- URL should contain `mpcTags=Extended-Art`
- If in custom mode with cards, results should filter accordingly

- [ ] **Step 7: Verify reset clears tags**

- Open filters with active tags, click Réinitialiser → all tags deselected

- [ ] **Step 8: Commit if all checks pass**

```bash
git add -p  # stage only if any fixup changes were made
# if no changes needed:
echo "smoke test passed — no fixup needed"
```
