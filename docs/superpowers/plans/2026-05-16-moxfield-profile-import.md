# Moxfield Profile Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Moxfield Profile" tab to `ImportDeckModal` that lets a user enter a Moxfield username or profile URL, browse all their public decks (with stats and folder grouping), select which ones to import, and optionally place them in a Wizcard folder.

**Architecture:** A new Next.js API route proxies requests to Moxfield's user-decks endpoint (same User-Agent pattern as the existing deck route). A new `ImportProfileTab` component handles the two-step UI (fetch → select & import). The existing `createDeck` + `bulkAddCardsToDeck` context methods are reused for each deck; a `createFolder` call is made once if the user opts into "Import From Moxfield" folder grouping.

**Tech Stack:** Next.js App Router API routes, React (hooks, useCallback, useState), TypeScript, CSS Modules, existing `useDeckContext`.

---

## File Map

| Action | Path                                                                   | Responsibility                                                     |
| ------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Create | `src/app/api/moxfield/user/[username]/decks/route.ts`                  | Proxy to Moxfield `/v2/users/{username}/decks`, paginate all pages |
| Create | `src/lib/moxfield/fetch-user-decks.ts`                                 | `extractMoxfieldUsername()`, `fetchMoxfieldUserDecks()`, types     |
| Create | `src/app/decks/components/ImportDeckModal/ImportProfileTab.tsx`        | Two-step UI: username input → deck list with checkboxes            |
| Create | `src/app/decks/components/ImportDeckModal/ImportProfileTab.module.css` | Styles for the profile tab (deck list, checkboxes, progress)       |
| Modify | `src/app/decks/components/ImportDeckModal/ImportDeckModal.tsx`         | Add `'profile'` to `ImportMode`, render `<ImportProfileTab>`       |

---

## Task 1: API Route — Proxy Moxfield user decks

**Files:**

- Create: `src/app/api/moxfield/user/[username]/decks/route.ts`

This route fetches all pages from `https://api.moxfield.com/v2/users/{username}/decks` and returns a flat array of deck summaries. It uses the same `MOXFIELD_USER_AGENT` env var as the existing deck route.

The Moxfield response per deck in the list looks like:

```json
{
	"publicId": "abc123",
	"name": "My Deck",
	"format": "commander",
	"colorIdentity": ["W", "U"],
	"mainboardCount": 99,
	"sideboardCount": 0,
	"commandersCount": 1,
	"lastUpdatedAtUtc": "2024-03-10T12:00:00Z",
	"hub": { "name": "Folder Name" }
}
```

Note: the `hub` field is Moxfield's closest equivalent to folders/groupings in the public API. If absent, `folderName` will be `null`.

- [ ] **Step 1: Create the API route file**

```typescript
// src/app/api/moxfield/user/[username]/decks/route.ts
import { NextResponse } from 'next/server';

const MOXFIELD_API = 'https://api.moxfield.com/v2/users';
const PAGE_SIZE = 100;

export type MoxfieldUserDeckEntry = {
	publicId: string;
	name: string;
	format: string | null;
	colorIdentity: string[];
	cardCount: number;
	lastUpdatedAtUtc: string | null;
	folderName: string | null;
};

type MoxfieldUserDecksPage = {
	data: Array<{
		publicId: string;
		name: string;
		format: string | null;
		colorIdentity: string[];
		mainboardCount: number;
		sideboardCount: number;
		commandersCount: number;
		lastUpdatedAtUtc: string | null;
		hub?: { name: string } | null;
	}>;
	pageNumber: number;
	pageSize: number;
	totalResults: number;
};

export async function GET(_req: Request, { params }: { params: Promise<{ username: string }> }) {
	const { username } = await params;

	if (!/^[A-Za-z0-9_-]{1,40}$/.test(username)) {
		return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
	}

	const userAgent = process.env.MOXFIELD_USER_AGENT ?? 'Wizcard/1.0';
	const allDecks: MoxfieldUserDeckEntry[] = [];
	let pageNumber = 1;
	let totalPages = 1;

	while (pageNumber <= totalPages) {
		const url = `${MOXFIELD_API}/${encodeURIComponent(username)}/decks?pageNumber=${pageNumber}&pageSize=${PAGE_SIZE}&sortType=updated&sortDirection=descending`;

		const res = await fetch(url, {
			headers: { 'User-Agent': userAgent, Accept: 'application/json' },
		});

		if (res.status === 404) {
			return NextResponse.json({ error: 'User not found' }, { status: 404 });
		}
		if (res.status === 403) {
			return NextResponse.json({ error: 'Profile is private' }, { status: 403 });
		}
		if (!res.ok) {
			return NextResponse.json({ error: 'Failed to fetch from Moxfield' }, { status: 502 });
		}

		const page = (await res.json()) as MoxfieldUserDecksPage;

		for (const d of page.data) {
			allDecks.push({
				publicId: d.publicId,
				name: d.name,
				format: d.format ?? null,
				colorIdentity: d.colorIdentity ?? [],
				cardCount: (d.mainboardCount ?? 0) + (d.commandersCount ?? 0),
				lastUpdatedAtUtc: d.lastUpdatedAtUtc ?? null,
				folderName: d.hub?.name ?? null,
			});
		}

		totalPages = Math.ceil(page.totalResults / PAGE_SIZE);
		pageNumber++;
	}

	return NextResponse.json({ decks: allDecks });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/moxfield/user/[username]/decks/route.ts
git commit -m "feat: add Moxfield user decks proxy API route"
```

---

## Task 2: Client fetch lib — `fetch-user-decks.ts`

**Files:**

- Create: `src/lib/moxfield/fetch-user-decks.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/lib/moxfield/fetch-user-decks.ts
import type { MoxfieldUserDeckEntry } from '@/app/api/moxfield/user/[username]/decks/route';

export type { MoxfieldUserDeckEntry };

const MOXFIELD_PROFILE_RE = /^https?:\/\/(?:www\.)?moxfield\.com\/users\/([A-Za-z0-9_-]+)/;

export function extractMoxfieldUsername(input: string): string | null {
	const trimmed = input.trim();
	const match = MOXFIELD_PROFILE_RE.exec(trimmed);
	if (match) return match[1];
	if (/^[A-Za-z0-9_-]{1,40}$/.test(trimmed)) return trimmed;
	return null;
}

export async function fetchMoxfieldUserDecks(username: string): Promise<MoxfieldUserDeckEntry[]> {
	const res = await fetch(`/api/moxfield/user/${encodeURIComponent(username)}/decks`);

	if (res.status === 404) throw new Error('Moxfield user not found.');
	if (res.status === 403) throw new Error('This Moxfield profile is private.');
	if (!res.ok) throw new Error(`Failed to fetch Moxfield profile (${res.status}).`);

	const data = (await res.json()) as { decks: MoxfieldUserDeckEntry[] };
	return data.decks;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/moxfield/fetch-user-decks.ts
git commit -m "feat: add Moxfield username extraction and user decks fetch"
```

---

## Task 3: `ImportProfileTab` component

**Files:**

- Create: `src/app/decks/components/ImportDeckModal/ImportProfileTab.tsx`
- Create: `src/app/decks/components/ImportDeckModal/ImportProfileTab.module.css`

The tab has two internal phases:

1. **Input phase** — text input for username/URL + Fetch button
2. **Select phase** — scrollable deck list grouped by `folderName`, with checkboxes, stats per deck, "select all" toggle, folder option, and "Import N decks" button with progress

The component receives `onClose` and calls `useDeckContext()` internally (same pattern as the existing tab logic in `ImportDeckModal`).

- [ ] **Step 1: Create `ImportProfileTab.tsx`**

```typescript
// src/app/decks/components/ImportDeckModal/ImportProfileTab.tsx
'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/Button/Button';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { extractMoxfieldUsername, fetchMoxfieldUserDecks } from '@/lib/moxfield/fetch-user-decks';
import { fetchMoxfieldDeck } from '@/lib/moxfield/fetch-deck';
import { convertMoxfieldDeck } from '@/lib/moxfield/convert-deck';
import type { MoxfieldUserDeckEntry } from '@/lib/moxfield/fetch-user-decks';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import styles from './ImportProfileTab.module.css';

const FORMAT_LABELS: Record<string, string> = {
  standard: 'Standard', modern: 'Modern', pioneer: 'Pioneer', legacy: 'Legacy',
  vintage: 'Vintage', commander: 'Commander', pauper: 'Pauper', brawl: 'Brawl',
  oathbreaker: 'Oathbreaker', draft: 'Draft', limited: 'Limited',
};

const COLOR_SYMBOLS: Record<string, string> = {
  W: '☀', U: '💧', B: '💀', R: '🔥', G: '🌲',
};

type Phase = 'input' | 'select' | 'importing';

type Props = { onClose: () => void };

export function ImportProfileTab({ onClose }: Props) {
  const { createDeck, createFolder, bulkAddCardsToDeck } = useDeckContext();

  const [phase, setPhase] = useState<Phase>('input');
  const [input, setInput] = useState('');
  const [decks, setDecks] = useState<MoxfieldUserDeckEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [useImportFolder, setUseImportFolder] = useState(true);
  const [preserveFolders, setPreserveFolders] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const handleFetch = useCallback(async () => {
    setErrors([]);
    const username = extractMoxfieldUsername(input);
    if (!username) {
      setErrors(['Invalid username or profile URL. Expected: https://moxfield.com/users/... or just the username.']);
      return;
    }
    setIsFetching(true);
    try {
      const fetched = await fetchMoxfieldUserDecks(username);
      if (fetched.length === 0) {
        setErrors(['No public decks found for this user.']);
        return;
      }
      setDecks(fetched);
      setSelected(new Set(fetched.map((d) => d.publicId)));
      setPhase('select');
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Failed to fetch Moxfield profile.']);
    } finally {
      setIsFetching(false);
    }
  }, [input]);

  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === decks.length ? new Set() : new Set(decks.map((d) => d.publicId))
    );
  }, [decks]);

  const toggleDeck = useCallback((publicId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(publicId)) next.delete(publicId);
      else next.add(publicId);
      return next;
    });
  }, []);

  const handleImport = useCallback(async () => {
    if (selected.size === 0) return;
    setErrors([]);
    setPhase('importing');

    const toImport = decks.filter((d) => selected.has(d.publicId));
    setProgress({ done: 0, total: toImport.length });

    // Optionally create top-level import folder
    let rootFolderId: string | null = null;
    if (useImportFolder) {
      rootFolderId = createFolder('Import From Moxfield', null);
    }

    // Build subfolder map if preserving Moxfield folder structure
    const subfolderMap = new Map<string, string>(); // folderName → Wizcard folderId

    const importErrors: string[] = [];

    for (let i = 0; i < toImport.length; i++) {
      const entry = toImport[i];
      try {
        // Determine target folder
        let folderId: string | null = rootFolderId;
        if (preserveFolders && entry.folderName) {
          const key = entry.folderName;
          if (!subfolderMap.has(key)) {
            const subId = createFolder(key, rootFolderId);
            subfolderMap.set(key, subId);
          }
          folderId = subfolderMap.get(key) ?? rootFolderId;
        }

        // Fetch full deck data
        const deckResponse = await fetchMoxfieldDeck(entry.publicId);
        const deckData = convertMoxfieldDeck(deckResponse);

        // Create deck
        const deckId = createDeck(
          deckData.name,
          deckData.format,
          deckData.description,
          folderId
        );

        // Add cards
        const cardsToAdd = deckData.cards.map((c) => ({
          card: { id: c.scryfallId } as ScryfallCard,
          zone: c.zone,
          quantity: c.quantity,
        }));
        bulkAddCardsToDeck(deckId, cardsToAdd);
      } catch {
        importErrors.push(`Failed to import "${entry.name}"`);
      }
      setProgress({ done: i + 1, total: toImport.length });
    }

    if (importErrors.length > 0) {
      setErrors(importErrors);
    }
    // Stay open so user sees the result; they close manually
    setPhase('select');
  }, [selected, decks, useImportFolder, preserveFolders, createFolder, createDeck, bulkAddCardsToDeck]);

  // Group decks by folderName for display
  const grouped = groupByFolder(decks);

  if (phase === 'input') {
    return (
      <div className={styles.root}>
        <label className={styles.label}>
          Moxfield Username or Profile URL
          <div className={styles.urlRow}>
            <input
              type="text"
              className={styles.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
              placeholder="SaffronOlive or https://moxfield.com/users/..."
              autoFocus
            />
            <Button
              variant="secondary"
              onClick={handleFetch}
              disabled={!input.trim() || isFetching}
              isLoading={isFetching}
            >
              Fetch
            </Button>
          </div>
        </label>
        {errors.length > 0 && (
          <div className={styles.errors}>
            {errors.map((e, i) => <p key={i} className={styles.errorLine}>{e}</p>)}
          </div>
        )}
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    );
  }

  const selectedCount = selected.size;
  const allSelected = selectedCount === decks.length;

  return (
    <div className={styles.root}>
      <div className={styles.listHeader}>
        <button type="button" className={styles.selectAll} onClick={toggleAll}>
          {allSelected ? 'Deselect all' : 'Select all'} ({decks.length})
        </button>
        <span className={styles.selectedCount}>{selectedCount} selected</span>
      </div>

      <div className={styles.deckList}>
        {grouped.map(({ folderName, items }) => (
          <div key={folderName ?? '__none__'} className={styles.group}>
            {folderName && <div className={styles.groupLabel}>{folderName}</div>}
            {items.map((deck) => (
              <label key={deck.publicId} className={styles.deckRow}>
                <input
                  type="checkbox"
                  checked={selected.has(deck.publicId)}
                  onChange={() => toggleDeck(deck.publicId)}
                  className={styles.checkbox}
                />
                <span className={styles.deckName}>{deck.name}</span>
                <span className={styles.deckMeta}>
                  {deck.format ? (FORMAT_LABELS[deck.format] ?? deck.format) : '—'}
                </span>
                <span className={styles.deckColors}>
                  {deck.colorIdentity.length > 0
                    ? deck.colorIdentity.map((c) => COLOR_SYMBOLS[c] ?? c).join('')
                    : '—'}
                </span>
                <span className={styles.deckMeta}>{deck.cardCount}c</span>
                <span className={styles.deckMeta}>
                  {deck.lastUpdatedAtUtc ? formatDate(deck.lastUpdatedAtUtc) : '—'}
                </span>
              </label>
            ))}
          </div>
        ))}
      </div>

      <div className={styles.options}>
        <label className={styles.optionRow}>
          <input
            type="checkbox"
            checked={useImportFolder}
            onChange={(e) => setUseImportFolder(e.target.checked)}
          />
          Put imported decks in a folder "Import From Moxfield"
        </label>
        <label className={styles.optionRow}>
          <input
            type="checkbox"
            checked={preserveFolders}
            onChange={(e) => setPreserveFolders(e.target.checked)}
          />
          Preserve Moxfield folder structure as subfolders
        </label>
      </div>

      {progress && phase === 'importing' && (
        <p className={styles.progress}>
          Importing… {progress.done}/{progress.total}
        </p>
      )}

      {errors.length > 0 && (
        <div className={styles.errors}>
          {errors.map((e, i) => <p key={i} className={styles.errorLine}>{e}</p>)}
        </div>
      )}

      <div className={styles.actions}>
        <Button variant="ghost" onClick={onClose} disabled={phase === 'importing'}>
          {errors.length > 0 ? 'Close' : 'Cancel'}
        </Button>
        <Button
          onClick={handleImport}
          disabled={selectedCount === 0 || phase === 'importing'}
          isLoading={phase === 'importing'}
        >
          Import {selectedCount > 0 ? `${selectedCount} deck${selectedCount > 1 ? 's' : ''}` : ''}
        </Button>
      </div>
    </div>
  );
}

function groupByFolder(
  decks: MoxfieldUserDeckEntry[]
): Array<{ folderName: string | null; items: MoxfieldUserDeckEntry[] }> {
  const map = new Map<string, MoxfieldUserDeckEntry[]>();
  const order: Array<string | null> = [];

  for (const deck of decks) {
    const key = deck.folderName ?? '__none__';
    if (!map.has(key)) {
      map.set(key, []);
      order.push(deck.folderName);
    }
    map.get(key)!.push(deck);
  }

  return order.map((folderName) => ({
    folderName,
    items: map.get(folderName ?? '__none__')!,
  }));
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
}
```

- [ ] **Step 2: Create `ImportProfileTab.module.css`**

```css
/* src/app/decks/components/ImportDeckModal/ImportProfileTab.module.css */
.root {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.label {
	display: flex;
	flex-direction: column;
	gap: 6px;
	font-size: var(--text-base);
	font-weight: 500;
	color: var(--text-muted);
}

.input {
	padding: 10px 12px;
	background: rgba(255, 255, 255, 0.04);
	border: 1px solid var(--border);
	border-radius: 8px;
	color: var(--foreground);
	font-size: var(--text-base);
	outline: none;
	transition: border-color 0.15s;
	flex: 1;
	min-width: 0;
}

.input:focus {
	border-color: var(--primary);
}

.urlRow {
	display: flex;
	gap: 8px;
	align-items: stretch;
}

.listHeader {
	display: flex;
	justify-content: space-between;
	align-items: center;
	font-size: var(--text-xs);
	color: var(--text-muted);
}

.selectAll {
	background: none;
	border: none;
	color: var(--primary);
	font-size: var(--text-xs);
	cursor: pointer;
	padding: 0;
}

.selectAll:hover {
	text-decoration: underline;
}

.selectedCount {
	opacity: 0.6;
}

.deckList {
	display: flex;
	flex-direction: column;
	gap: 2px;
	max-height: 320px;
	overflow-y: auto;
	border: 1px solid var(--border);
	border-radius: 8px;
	padding: 4px;
}

.group {
	display: flex;
	flex-direction: column;
}

.groupLabel {
	font-size: var(--text-xs);
	font-weight: 600;
	color: var(--text-muted);
	opacity: 0.6;
	padding: 6px 8px 2px;
	text-transform: uppercase;
	letter-spacing: 0.05em;
}

.deckRow {
	display: grid;
	grid-template-columns: 16px 1fr 80px 48px 32px 72px;
	align-items: center;
	gap: 8px;
	padding: 6px 8px;
	border-radius: 6px;
	cursor: pointer;
	font-size: var(--text-sm);
	color: var(--foreground);
}

.deckRow:hover {
	background: rgba(255, 255, 255, 0.04);
}

.checkbox {
	cursor: pointer;
	accent-color: var(--primary);
}

.deckName {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.deckMeta {
	font-size: var(--text-xs);
	color: var(--text-muted);
	white-space: nowrap;
}

.deckColors {
	font-size: var(--text-xs);
	white-space: nowrap;
}

.options {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.optionRow {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: var(--text-sm);
	color: var(--text-muted);
	cursor: pointer;
}

.optionRow input[type='checkbox'] {
	accent-color: var(--primary);
	cursor: pointer;
}

.progress {
	font-size: var(--text-sm);
	color: var(--text-muted);
	margin: 0;
}

.errors {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	background: rgba(220, 53, 69, 0.08);
	border: 1px solid rgba(220, 53, 69, 0.3);
	border-radius: 8px;
	font-size: var(--text-xs);
	color: var(--error, #dc3545);
	max-height: 100px;
	overflow-y: auto;
}

.errorLine {
	margin: 0;
}

.actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	margin-top: 4px;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/decks/components/ImportDeckModal/ImportProfileTab.tsx \
        src/app/decks/components/ImportDeckModal/ImportProfileTab.module.css
git commit -m "feat: add ImportProfileTab component for Moxfield profile import"
```

---

## Task 4: Wire the new tab into `ImportDeckModal`

**Files:**

- Modify: `src/app/decks/components/ImportDeckModal/ImportDeckModal.tsx`

Three changes:

1. Add `'profile'` to the `ImportMode` type
2. Import and render `<ImportProfileTab>`
3. Add the "Moxfield Profile" tab button

The profile tab owns its own import flow entirely (its own buttons, progress, close), so in profile mode the shared Name/Format fields and the bottom Import button are NOT shown.

- [ ] **Step 1: Apply the changes**

In `ImportDeckModal.tsx`:

Change line 48:

```typescript
type ImportMode = 'paste' | 'url';
```

to:

```typescript
type ImportMode = 'paste' | 'url' | 'profile';
```

Add import at the top (after the existing moxfield imports):

```typescript
import { ImportProfileTab } from './ImportProfileTab';
```

In the tabs section (around line 332), add the third tab button after the "Moxfield URL" button:

```tsx
<button
	type="button"
	className={`${styles.tab} ${mode === 'profile' ? styles.tabActive : ''}`}
	onClick={() => handleModeChange('profile')}
>
	Moxfield Profile
</button>
```

After the `{mode === 'url' && ...}` block (around line 392), add:

```tsx
{
	mode === 'profile' && <ImportProfileTab onClose={onClose} />;
}
```

Wrap the Name, Format, errors, and actions section so they only render when `mode !== 'profile'`:

```tsx
{
	mode !== 'profile' && (
		<>
			<label className={styles.label}>
				Name
				{/* ... existing name input ... */}
			</label>
			<label className={styles.label}>
				Format
				{/* ... existing format select ... */}
			</label>
			{errors.length > 0 && (
				<div className={styles.errors}>
					{errors.map((err, i) => (
						<p key={i} className={styles.errorLine}>
							{err}
						</p>
					))}
				</div>
			)}
			<div className={styles.actions}>
				<Button variant="ghost" type="button" onClick={onClose} disabled={isImporting}>
					Cancel
				</Button>
				<Button onClick={handleImport} disabled={!canImport} isLoading={isImporting}>
					Import
				</Button>
			</div>
		</>
	);
}
```

- [ ] **Step 2: Run type check**

```bash
cd /home/elthinkbuntu/Documents/Wizcard && npm run check
```

Expected: no TypeScript or lint errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/decks/components/ImportDeckModal/ImportDeckModal.tsx
git commit -m "feat: add Moxfield Profile tab to ImportDeckModal"
```

---

## Verification

- [ ] Open the decks page, click the Import button → modal opens with 3 tabs: "Paste list", "Moxfield URL", "Moxfield Profile"
- [ ] Switch to "Moxfield Profile" tab → Name/Format/Import button are hidden
- [ ] Enter an invalid string → error message appears
- [ ] Enter a valid Moxfield username or profile URL → deck list loads, grouped by folder if any
- [ ] Deselect a few decks → import button shows updated count
- [ ] "Select all / Deselect all" toggle works
- [ ] Import with "Import From Moxfield" folder checked → folder created, decks land inside
- [ ] Import with "Preserve Moxfield folder structure" checked → subfolders created under the root import folder
- [ ] A failed deck import (private/404) shows an error per deck without aborting the whole batch
- [ ] `npm run check` passes clean
