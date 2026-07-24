# Public Deck Page SSR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the public `/decks/[id]` card list on the server from the DB catalog, and delete the three-step client fetch cascade.

**Architecture:** The owner/visitor split moves from a client component into the RSC `page.tsx`. On the public path the server reads `card_entries` (RLS-scoped, cookie-bearing client), neutralises `entry.proxy`, resolves prints via `catalog-db.byCollection()`, and passes the result as initial props. `usePublicDeckDetail` gains an optional `initial` argument: it seeds state and the resolved-ids ref, so its existing derivation `useMemo`s produce correct output on first render and the network effect resolves only what the catalog missed. Dynamic SSR, no caching.

**Tech Stack:** Next.js 15 App Router (RSC), Supabase (`@supabase/ssr` + RLS), TypeScript, React 19.

**Spec:** `docs/superpowers/specs/2026-07-25-public-deck-page-ssr-design.md`

## Global Constraints

- **No test framework exists** in this project (no vitest/jest). Verification is `npm run check` plus runtime checks against local Supabase. Do NOT add a test framework.
- **`npm run check` baseline is RED** (~60 pre-existing problems in unrelated files). The gate is **no NEW problems**. Verify changed files with `npx eslint <file>` and `npx tsc --noEmit`.
- **`select('*')` on `card_entries` 403s for anon.** Anon holds column grants, not a table grant (migration `20260710120000_fix_purchase_price_leak.sql`). Every anon-reachable query MUST list columns explicitly and MUST NOT include `purchase_price`.
- **Exact column list** for deck-card reads (copy verbatim):
  `'id, owner_id, scryfall_id, date_added, is_foil, foil_type, condition, language, alter, proxy, tags, for_trade, deck_id, wishlist'`
- **`entry.proxy` must be `false`** on every card sent down the public path, set server-side before serialisation.
- **Ownership uses `supabase.auth.getUser()`**, never `getSession()`.
- **The public deck query uses `@/lib/supabase/server` `createClient()`** (cookie-bearing), NOT `createCatalogClient`. Only catalog reads use the cookieless client.
- Run `npm run sb:start` before runtime verification. Dev server: `npm run dev`.
- Work on branch `feat/public-deck-ssr` (already created; the spec commit is on it).

---

## File Structure

| File                                                     | Responsibility                 | Change                                                                         |
| -------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| `src/lib/supabase/queries/decks.ts`                      | Raw Supabase queries           | Add `fetchDeckCardRowsServer(deckId)` — SSR-client twin of `fetchDeckCardRows` |
| `src/lib/deck/db/deck.server.ts`                         | Server-side deck reads         | Add `fetchPublicDeckDataServer(deckId)`                                        |
| `src/app/[locale]/decks/[id]/usePublicDeckDetail.ts`     | Public deck state + derivation | Add optional `initial` parameter                                               |
| `src/app/[locale]/decks/[id]/DeckDetailReadOnlyView.tsx` | Public view                    | Accept + forward `initial`                                                     |
| `src/app/[locale]/decks/[id]/page.tsx`                   | Route entry                    | Becomes owner/visitor decision point                                           |
| `src/app/[locale]/decks/[id]/DeckDetailClient.tsx`       | (obsolete)                     | **Delete**                                                                     |

Task order is bottom-up: each task leaves the app working. Tasks 1–3 are additive and change no behaviour; Task 4 flips the route over; Task 5 verifies end-to-end.

---

### Task 1: Server-side deck card row query

**Files:**

- Modify: `src/lib/supabase/queries/decks.ts` (add after `fetchDeckCardRows`, ~line 137)

**Interfaces:**

- Consumes: `CardDbRow` from `@/lib/card/db/cardRow` (already imported in this file — verify the import line and reuse it).
- Produces: `fetchDeckCardRowsServer(deckId: string): Promise<CardDbRow[]>`

**Why a separate function:** `fetchDeckCardRows` calls `createClient()` from `@/lib/supabase/client` (browser, synchronous). The server needs `createClient()` from `@/lib/supabase/server` (async, cookie-bearing). The two clients are not interchangeable, so this is a deliberate twin rather than a shared helper.

- [ ] **Step 1: Read the existing function to match its shape**

Run: `sed -n '110,140p' src/lib/supabase/queries/decks.ts`

Confirm the column list and `.order('date_added', { ascending: true })`. The new function must match both exactly.

- [ ] **Step 2: Add the server query**

Add to `src/lib/supabase/queries/decks.ts`. Note the aliased import — this file already imports the browser `createClient` at the top, so the server one must be aliased to avoid a name collision. Add this import at the top of the file:

```ts
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';
```

Then append the function after `fetchDeckCardRows`:

```ts
/**
 * Server-side twin of {@link fetchDeckCardRows}, for RSC use. Same explicit
 * column list (omits purchase_price — anon holds column grants, not a table
 * grant, so `select('*')` would 403; see migration
 * 20260710120000_fix_purchase_price_leak.sql) and the same date_added ordering,
 * so both paths produce identical card order.
 *
 * Uses the cookie-bearing SSR client: RLS on card_entries gates deck-card reads
 * through the parent deck's visibility, which includes `auth.uid() = d.owner_id`
 * — a cookieless client would drop that branch and hide decks a signed-in
 * visitor may legitimately see.
 */
export async function fetchDeckCardRowsServer(deckId: string): Promise<CardDbRow[]> {
	const supabase = await createServerSupabaseClient();
	const { data, error } = await supabase
		.from('card_entries')
		.select(
			'id, owner_id, scryfall_id, date_added, is_foil, foil_type, condition, language, alter, proxy, tags, for_trade, deck_id, wishlist'
		)
		.eq('deck_id', deckId)
		.order('date_added', { ascending: true });
	if (error) throw new Error(`[queries/decks] fetchDeckCardRowsServer error: ${error.message}`);
	return data as CardDbRow[];
}
```

- [ ] **Step 3: Verify it compiles with no new problems**

Run: `npx tsc --noEmit 2>&1 | grep -i "queries/decks" || echo "CLEAN"`
Expected: `CLEAN`

Run: `npx eslint src/lib/supabase/queries/decks.ts`
Expected: no output (clean), or only pre-existing warnings unrelated to your change.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/queries/decks.ts
git commit -m "feat(deck): add server-side deck card row query

Cookie-bearing SSR twin of fetchDeckCardRows, same explicit column list
(no purchase_price) and same date_added ordering.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JpeYSVBHF1okqrWRDrvmkM"
```

---

### Task 2: `fetchPublicDeckDataServer`

**Files:**

- Modify: `src/lib/deck/db/deck.server.ts` (append; file currently ends at `fetchDeckMetaServer`, ~line 160)

**Interfaces:**

- Consumes: `fetchDeckCardRowsServer` (Task 1); `rowToCardEntry` from `@/lib/card/db/cardRow`; `byCollection` from `@/lib/card/catalog-db`; `fetchNicknameById` from `@/lib/profile/db/profiles.server`.
- Produces:
  ```ts
  export interface PublicDeckData {
  	deckCards: Array<{ scryfallId: string; entry: CardEntry }>;
  	cards: Card[];
  	ownerNickname: string | null;
  }
  export async function fetchPublicDeckDataServer(
  	deckId: string,
  	ownerId: string | null
  ): Promise<PublicDeckData>;
  ```

**Design notes for the implementer:**

- `byCollection` takes `ScryfallCardIdentifier[]` and returns `(Card | null)[]` positionally. Filter the nulls out — the client resolves those.
- `mpc:` ids are custom cards living in a different table; `byCollection` cannot resolve them. Exclude them from the request entirely.
- The whole body is best-effort: any failure returns empty `cards` so the client resolves everything, exactly as today. It must never throw the page down.
- `ownerNickname` is folded in here (rather than its own task) because it is one query on the same server render and the view needs it in the same props object.

- [ ] **Step 1: Add imports at the top of `src/lib/deck/db/deck.server.ts`**

```ts
import { fetchDeckCardRowsServer } from '@/lib/supabase/queries/decks';
import { rowToCardEntry } from '@/lib/card/db/cardRow';
import { byCollection } from '@/lib/card/catalog-db';
import { fetchNicknameById } from '@/lib/profile/db/profiles.server';
import type { Card, CardEntry } from '@/types/cards';
```

- [ ] **Step 2: Append the function**

```ts
export interface PublicDeckData {
	deckCards: Array<{ scryfallId: string; entry: CardEntry }>;
	cards: Card[];
	ownerNickname: string | null;
}

/**
 * Server-side load of everything the PUBLIC deck view needs: the deck's card
 * entries plus the prints the local catalog can resolve, so the decklist ships
 * in the HTML instead of being fetched by the browser.
 *
 * Two deliberate limits, both covered by the client hydrating on top:
 * - Only the DB catalog is consulted (no Scryfall). A server-side Scryfall
 *   fallback would put TTFB at the mercy of a third-party API; the client
 *   already resolves misses, with an IndexedDB cache the server lacks.
 * - `mpc:` custom cards live in another table and are never sent to byCollection.
 *
 * Best-effort throughout: on any failure it returns empty `cards` and the client
 * resolves the whole deck, exactly as before this path existed.
 */
export async function fetchPublicDeckDataServer(
	deckId: string,
	ownerId: string | null
): Promise<PublicDeckData> {
	const ownerNickname = ownerId ? await fetchNicknameById(ownerId).catch(() => null) : null;

	let rows;
	try {
		rows = await fetchDeckCardRowsServer(deckId);
	} catch {
		return { deckCards: [], cards: [], ownerNickname };
	}

	// `proxy` is the OWNER's private physical status. Neutralise it here, before
	// anything is serialised into the RSC payload — on this path a leak would
	// ship in the raw HTML. Mirrors usePublicDeckDetail's client-side handling.
	const deckCards = rows.map((row) => {
		const entry = rowToCardEntry(row, { includeOwnerId: true });
		return { scryfallId: row.scryfall_id, entry: { ...entry, proxy: false } };
	});

	const catalogIds = [
		...new Set(deckCards.map((c) => c.scryfallId).filter((id) => !id.startsWith('mpc:'))),
	];
	if (catalogIds.length === 0) return { deckCards, cards: [], ownerNickname };

	try {
		const resolved = await byCollection(catalogIds.map((id) => ({ id })));
		return {
			deckCards,
			cards: resolved.filter((c): c is Card => c !== null),
			ownerNickname,
		};
	} catch {
		return { deckCards, cards: [], ownerNickname };
	}
}
```

- [ ] **Step 3: Verify types and lint**

Run: `npx tsc --noEmit 2>&1 | grep -i "deck.server" || echo "CLEAN"`
Expected: `CLEAN`

Run: `npx eslint src/lib/deck/db/deck.server.ts`
Expected: clean.

- [ ] **Step 4: Confirm no `purchase_price` reaches the payload**

Run: `grep -n "purchase" src/lib/deck/db/deck.server.ts src/lib/supabase/queries/decks.ts | grep -i "server" || echo "NO PURCHASE_PRICE ON SERVER PATH"`
Expected: `NO PURCHASE_PRICE ON SERVER PATH`

- [ ] **Step 5: Commit**

```bash
git add src/lib/deck/db/deck.server.ts
git commit -m "feat(deck): add fetchPublicDeckDataServer

Loads deck card entries + catalog-resolved prints for the public deck
view. Neutralises entry.proxy before serialisation; skips mpc: custom
cards; best-effort so the client still resolves on failure.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JpeYSVBHF1okqrWRDrvmkM"
```

---

### Task 3: `usePublicDeckDetail` accepts initial server data

**Files:**

- Modify: `src/app/[locale]/decks/[id]/usePublicDeckDetail.ts`

**Interfaces:**

- Consumes: `PublicDeckData` (Task 2), `DeckMeta`, `Card`, `CardEntry`.
- Produces:
  ```ts
  export interface InitialPublicDeckData {
  	deck: DeckMeta;
  	ownerNickname: string | null;
  	deckCards: Array<{ scryfallId: string; entry: CardEntry }>;
  	cards: Card[];
  }
  export function usePublicDeckDetail(deckId: string, initial?: InitialPublicDeckData);
  ```
  Return shape is UNCHANGED (`deck`, `ownerNickname`, `cardsByZone`, `resolvedCards`, `stats`, `coverArtUrl`, `isLoading`, `isResolving`, `deckCardCount`).

**Critical:** without `initial`, behaviour must be byte-for-byte what it is today. The derivation `useMemo`s (lines ~118–165) are NOT touched.

- [ ] **Step 1: Export the initial-data type and extend the signature**

Add the interface above the hook, then change the signature:

```ts
export interface InitialPublicDeckData {
	deck: DeckMeta;
	ownerNickname: string | null;
	deckCards: DeckCard[];
	cards: Card[];
}

export function usePublicDeckDetail(deckId: string, initial?: InitialPublicDeckData) {
```

- [ ] **Step 2: Seed state from `initial`**

Replace the state initialisers (currently lines ~24–31) with:

```ts
const [deck, setDeck] = useState<DeckMeta | null>(initial?.deck ?? null);
const [ownerNickname, setOwnerNickname] = useState<string | null>(initial?.ownerNickname ?? null);
const [deckCards, setDeckCards] = useState<DeckCard[]>(initial?.deckCards ?? []);
const [scryfallCards, setScryfallCards] = useState<Record<string, Card | CustomCard>>(() =>
	Object.fromEntries((initial?.cards ?? []).map((c) => [c.id, c]))
);
// Pre-seed with the ids the server already resolved so the resolution effect
// below computes an empty `toResolve` — no network call at all when the
// catalog covered the whole deck, and exactly the misses when it didn't.
const resolvedIdsRef = useRef<Set<string>>(new Set((initial?.cards ?? []).map((c) => c.id)));
const [resolveGeneration, setResolveGeneration] = useState(0);
const [isLoading, setIsLoading] = useState(!initial);
const activeResolveRef = useRef(0);
```

- [ ] **Step 3: Skip the deck-meta fetch when `initial` is present**

In the "Load deck meta + cards from DB" effect (starts ~line 34), add an early return as the FIRST statement inside the effect body, before `let cancelled = false`:

```ts
// Server already provided deck + cards; nothing to fetch.
if (initial) return;
```

Then add `initial` to that effect's dependency array: `}, [deckId, initial]);`

- [ ] **Step 4: Skip the nickname fetch when `initial` is present**

In the nickname effect (starts ~line 64), add as the first statement in the effect body:

```ts
if (initial) return;
```

Then add `initial` to its dependency array: `}, [deck?.ownerId, initial]);`

- [ ] **Step 5: Verify types and lint**

Run: `npx tsc --noEmit 2>&1 | grep -i "usePublicDeckDetail" || echo "CLEAN"`
Expected: `CLEAN`

Run: `npx eslint src/app/\[locale\]/decks/\[id\]/usePublicDeckDetail.ts`
Expected: clean. If `react-hooks/exhaustive-deps` complains about `initial`, that is a REAL warning — fix it by adding `initial` to the deps as instructed above, not by disabling the rule.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/decks/[id]/usePublicDeckDetail.ts"
git commit -m "feat(deck): let usePublicDeckDetail hydrate from server data

Optional \`initial\` seeds deck, cards and resolvedIdsRef so derivation
runs on first render and the network effect resolves only catalog misses.
Without it, behaviour is unchanged.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JpeYSVBHF1okqrWRDrvmkM"
```

---

### Task 4: Route becomes the owner/visitor decision point

**Files:**

- Modify: `src/app/[locale]/decks/[id]/DeckDetailReadOnlyView.tsx` (props)
- Modify: `src/app/[locale]/decks/[id]/page.tsx` (default export)
- Delete: `src/app/[locale]/decks/[id]/DeckDetailClient.tsx`

**Interfaces:**

- Consumes: `fetchPublicDeckDataServer` + `PublicDeckData` (Task 2), `InitialPublicDeckData` (Task 3), `fetchDeckMetaServer` (existing).
- Produces: `DeckDetailReadOnlyView({ deckId, initial }: { deckId: string; initial?: InitialPublicDeckData })`

- [ ] **Step 1: Accept `initial` in the read-only view**

In `DeckDetailReadOnlyView.tsx`, change the signature (line ~39) and the hook call (line ~42):

```ts
export function DeckDetailReadOnlyView({
	deckId,
	initial,
}: {
	deckId: string;
	initial?: InitialPublicDeckData;
}) {
```

and

```ts
	} = usePublicDeckDetail(deckId, initial);
```

Add to the existing import from `./usePublicDeckDetail`:

```ts
import { usePublicDeckDetail, type InitialPublicDeckData } from './usePublicDeckDetail';
```

- [ ] **Step 2: Rewrite `page.tsx`'s default export**

Replace the `DeckPage` function (lines 44–65) with the following. Leave `generateMetadata` (lines 12–42) completely untouched.

```ts
export default async function DeckPage({ params }: DeckPageProps) {
	const { id } = await params;
	const deck = await fetchDeckMetaServer(id);
	// RLS already hid a deck this viewer may not see, so a null deck is a real 404
	// (the route used to answer 200 with a client-rendered "not found" screen).
	if (!deck) notFound();

	// getUser() verifies the token server-side; getSession() would trust an
	// unverified cookie for an ownership decision.
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (user && deck.ownerId === user.id) {
		return <DeckDetailOwnerView deckId={id} />;
	}

	const { deckCards, cards, ownerNickname } = await fetchPublicDeckDataServer(id, deck.ownerId);
	return (
		<DeckDetailReadOnlyView
			deckId={id}
			initial={{ deck, ownerNickname, deckCards, cards }}
		/>
	);
}
```

Replace the page's imports (keep `Metadata`, `getTranslations`, `Locale`, `buildAlternates`, `fetchDeckMetaServer`) with:

```ts
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fetchDeckMetaServer, fetchPublicDeckDataServer } from '@/lib/deck/db/deck.server';
import DeckDetailOwnerView from './DeckDetailOwnerView';
import { DeckDetailReadOnlyView } from './DeckDetailReadOnlyView';
```

Remove the `import DeckDetailClient from './DeckDetailClient';` line. The hidden `<h1>` goes away with the old body — the real decklist now ships in the HTML.

- [ ] **Step 3: Delete the obsolete client shim**

```bash
git rm "src/app/[locale]/decks/[id]/DeckDetailClient.tsx"
```

- [ ] **Step 4: Confirm nothing else imports it**

Run: `grep -rn "DeckDetailClient" src/ || echo "NO REFERENCES"`
Expected: `NO REFERENCES`

- [ ] **Step 5: Verify the full build**

Run: `npm run build 2>&1 | tail -30`
Expected: build succeeds. A full build is required here, not just `tsc` — per project history, some Supabase generic-depth errors (TS2589) surface only in `npm run build`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/decks/[id]/page.tsx" "src/app/[locale]/decks/[id]/DeckDetailReadOnlyView.tsx"
git commit -m "feat(deck): server-render the public deck page

The owner/visitor split moves into the RSC route: the deck meta is read
once server-side and the public path ships its resolved decklist in the
HTML. Deletes DeckDetailClient (client meta re-fetch + spinner) and
returns a real 404 for an invisible deck.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JpeYSVBHF1okqrWRDrvmkM"
```

---

### Task 5: Runtime verification

**Files:** none modified (verification only; fix-ups land as their own commits).

No test framework exists, so this task is the safety net. Run every check and record the actual output — do not report success without it.

- [ ] **Step 1: Start the stack**

```bash
npm run sb:start
npm run dev
```

Get a public deck id (owner profile public, deck public) and a private one from Studio (`npm run sb:studio`, port 54323), table `decks`.

- [ ] **Step 2: THE CENTRAL CRITERION — cards in the raw HTML**

```bash
curl -s http://localhost:3000/fr/decks/<PUBLIC_DECK_ID> | grep -o 'alt="[^"]*"' | head -20
```

Expected: real card names. This is the whole point of the change — if this is empty, the task is not done.

- [ ] **Step 3: Private deck returns 404 with no card data**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/fr/decks/<PRIVATE_DECK_ID>
curl -s http://localhost:3000/fr/decks/<PRIVATE_DECK_ID> | grep -c 'alt="'
```

Expected: `404`, then `0`.

- [ ] **Step 4: `purchase_price` never appears**

```bash
curl -s http://localhost:3000/fr/decks/<PUBLIC_DECK_ID> | grep -ci "purchase" || echo "0 — CLEAN"
```

Expected: `0`.

- [ ] **Step 5: `proxy` is neutralised**

```bash
curl -s http://localhost:3000/fr/decks/<PUBLIC_DECK_ID> | grep -o '"proxy":[a-z]*' | sort -u
```

Expected: only `"proxy":false` (or nothing at all). Any `"proxy":true` is a privacy regression — stop and fix.

- [ ] **Step 6: Browser checks**

Open the public deck in a private window (anonymous):

- Cards visible with no full-page spinner.
- DevTools Network: the old `deck meta → deck meta → cards` cascade is gone; no Scryfall `collection` call when the catalog covers the deck.
- Stats, mana curve and warnings render.

Signed in as the owner:

- Editable view loads; add / edit / delete a card still work.

Signed in as a different user on someone else's public deck:

- Read-only view; "copy to my decks" works.

- [ ] **Step 7: Custom cards still resolve**

If a deck with `mpc:` cards exists, open it and confirm the custom cards appear after hydration (they resolve client-side by design).

- [ ] **Step 8: Owner privacy flip takes effect immediately**

In Studio set the owner's `profiles.is_public = false`, then re-request the public deck anonymously:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/fr/decks/<PUBLIC_DECK_ID>
```

Expected: `404`. This confirms the no-cache decision holds. Restore `is_public = true` afterwards.

- [ ] **Step 9: No new lint/type problems**

```bash
npx eslint "src/app/[locale]/decks/[id]/page.tsx" "src/app/[locale]/decks/[id]/DeckDetailReadOnlyView.tsx" "src/app/[locale]/decks/[id]/usePublicDeckDetail.ts" src/lib/deck/db/deck.server.ts src/lib/supabase/queries/decks.ts
npm run build
```

Expected: clean on changed files; build succeeds. (Remember `npm run check` is red at baseline — judge only the files you touched.)

- [ ] **Step 10: Commit any fixes**

If steps 2–9 required changes, commit them with a message describing the actual fix. If everything passed first time, there is nothing to commit — say so plainly rather than inventing a commit.

---

## Self-Review

**Spec coverage:**

| Spec requirement                                              | Task                                                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Owner/visitor split moves to server                           | 4                                                                                                            |
| `fetchPublicDeckDataServer` with the specified signature      | 2                                                                                                            |
| Cookie-bearing SSR client on the public path                  | 1 (query), 4 (auth)                                                                                          |
| `entry.proxy` neutralised before serialisation                | 2 (impl), 5 step 5 (verify)                                                                                  |
| `mpc:` cards excluded server-side, resolved client-side       | 2, 5 step 7                                                                                                  |
| DB-only resolution, no server Scryfall fallback               | 2                                                                                                            |
| Best-effort degradation on catalog failure                    | 2                                                                                                            |
| `usePublicDeckDetail(deckId, initial?)`, derivation untouched | 3                                                                                                            |
| `resolvedIdsRef` pre-seeded → no redundant fetches            | 3 step 2, 5 step 6                                                                                           |
| `DeckDetailReadOnlyView` accepts/forwards `initial`           | 4 step 1                                                                                                     |
| `DeckDetailClient.tsx` deleted                                | 4 step 3                                                                                                     |
| `notFound()` for invisible decks                              | 4 step 2, 5 step 3                                                                                           |
| Ownership via `getUser()`                                     | 4 step 2                                                                                                     |
| Serialisation is JSON-safe                                    | Verified during planning: `rowToCardEntry` returns only primitives, `string[]`, and `undefined` — no `Date`. |
| Dynamic SSR, no cache                                         | No `revalidate`/`generateStaticParams` added anywhere; verified by 5 step 8                                  |
| No new lint/type problems                                     | 5 step 9                                                                                                     |

**Placeholder scan:** none — every code step carries the literal code to write.

**Type consistency:** `PublicDeckData` (Task 2) and `InitialPublicDeckData` (Task 3) are deliberately distinct: the server function does not know the `DeckMeta` (the route already loaded it), while the hook needs it. Task 4 composes the two — `{ deck, ...publicDeckData }` — which is why `page.tsx` spreads the three fields explicitly. `fetchPublicDeckDataServer(deckId, ownerId)` is called with two arguments in Task 4, matching its Task 2 definition.
