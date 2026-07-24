# Public deck page — server-side rendering of the card list

**Date**: 2026-07-25
**Status**: Design approved, ready for planning

## Context and goal

`/decks/[id]` is publicly shareable and explicitly indexed (`robots: { index: true }` in
`page.tsx`), yet the server renders **no cards at all** — only a visually-hidden `<h1>`.
The entire decklist is fetched and resolved in the browser, behind a three-step waterfall:

1. `page.tsx` renders `<DeckDetailClient />` (`'use client'`), which re-fetches the deck
   meta **in the browser** (`DeckDetailClient.tsx:30`) only to decide owner vs read-only.
   A full-screen spinner covers the page meanwhile.
2. The chosen view calls `usePublicDeckDetail`, which fetches the deck meta **again** plus
   the deck's cards.
3. `resolveCardsByScryfallIds` then resolves ~100 print ids in batched network calls.

So crawlers see an empty shell, and users wait through a serial cascade before the first
card paints.

**Goal**: render the public deck view's card list on the server, from the DB catalog, and
remove the client-side cascade. The owner view keeps its client-side editing flow but stops
paying for the redundant meta round-trip.

## Scope decisions (settled during brainstorming)

| Question                       | Decision                                                      |
| ------------------------------ | ------------------------------------------------------------- |
| Caching strategy               | **Dynamic SSR, no cache.** ISR deferred to a separate effort. |
| Cards missing from the catalog | **DB only server-side**; the client resolves the rest.        |
| Server/client split            | **Initial props + hydrating hook**; one derivation path.      |

### Why dynamic SSR and not ISR

Deck visibility depends on three mutable, per-user inputs, per the RLS policy in
`20260720120000_add_deck_visibility_and_precons.sql`:

```sql
(d.owner_id is null and d.is_public)
or (d.is_public and public.profile_is_public(d.owner_id))
or auth.uid() = d.owner_id
```

A cached page is served identically to everyone. If a deck were cached while public and the
owner then flipped their profile to private, the cache would keep serving the decklist —
precisely the leak that `20260720140000_fix_private_deck_card_leak.sql` was written to
close. That migration's header documents the bug being reproduced in practice, so this is a
demonstrated failure mode, not a hypothetical one.

**This does not contradict `2026-07-24-card-page-isr-design.md`.** That spec makes the
_card_ page ISR because its cached HTML holds only the immutable, public catalog shell —
nothing per-user. The deck page is the inverse: its very visibility is per-user. Same
principle ("cache only what is public and immutable"), opposite outcome.

ISR remains possible later via `revalidateTag`, but it requires wiring invalidation into
every deck- and profile-visibility write path, where a single missed call leaks a private
decklist. It buys latency only — the SEO and cascade wins below come entirely from dynamic
SSR — so it is deliberately out of scope here.

### Why DB-only resolution server-side

`catalog-db.byCollection()` reads only the catalog tables. Two classes of cards will not
resolve there: prints absent from the catalog (the seed is still in progress), and custom
`mpc:<uuid>` cards, which `resolveCardsByScryfallIds` routes to the `custom_cards` table
(`resolveCardsByScryfallIds.ts:72`) and which `byCollection` ignores entirely.

Falling back to Scryfall **on the server** would make TTFB depend on a third-party API —
a 100-card uncatalogued deck means several serial calls, without the IndexedDB cache the
browser enjoys, and `deck.server.ts` already documents that Scryfall rejects default
user-agents behind Cloudflare. Instead the server renders what the catalog covers and the
client fills the remainder using the code path that already exists. Server coverage rises
to 100% on its own as the catalog fills, with no further code changes.

## Design

### 1. Routing decision moves to the server

`page.tsx` becomes the owner/visitor decision point:

```
page.tsx (RSC, dynamic)
├── fetchDeckMetaServer(id)   → deck  (exists today)
├── auth.getUser()            → viewer (verified server-side, never getSession())
└── isOwner ?
    ├── yes → <DeckDetailOwnerView deckId initialDeck={deck} />
    └── no  → fetchPublicDeckDataServer(id)
               → <DeckDetailReadOnlyView deckId initial={...} />
```

`DeckDetailClient.tsx` is **deleted**: its only job was the client meta fetch plus spinner
(`DeckDetailClient.tsx:25-51`), both now resolved on the server. The hidden `<h1>`
(`page.tsx:51`) is also removed — the real list now ships in the HTML.

**The public path uses the cookie-bearing SSR client** (`@/lib/supabase/server`), _not_
`createCatalogClient`. A signed-in visitor must keep the access `auth.uid()` grants them; a
cookieless client would evaluate `auth.uid()` as null and hide decks they may legitimately
see. `createCatalogClient` stays reserved for the card catalog, which is public-read — its
documented purpose.

### 2. `fetchPublicDeckDataServer` — `src/lib/deck/db/deck.server.ts`

```ts
export async function fetchPublicDeckDataServer(deckId: string): Promise<{
	deckCards: Array<{ scryfallId: string; entry: CardEntry }>;
	cards: Card[];
} | null>;
```

Steps:

1. Read `card_entries` for the deck via the SSR client, ordered `date_added` ascending —
   matching the client's ordering exactly, so cover-art and sort behaviour are identical.
2. **Neutralise `entry.proxy` before anything else** (see Privacy below).
3. Resolve unique non-`mpc:` ids through `catalog-db.byCollection()`.

Best-effort: if the catalog read fails, return the entries with `cards: []` and let the
client resolve everything, exactly as today. The function never throws the page down.

### 3. `usePublicDeckDetail(deckId, initial?)`

Signature gains one optional argument:

```ts
initial?: { deck: DeckMeta; ownerNickname: string | null;
            deckCards: DeckCard[]; cards: Card[] }
```

Three contained internal changes:

- State initialises from `initial` instead of `null`/`[]`; `isLoading` starts `false` when
  `initial` is present.
- `resolvedIdsRef` is pre-seeded with the server-resolved ids, so the resolution effect
  (`usePublicDeckDetail.ts:85-88`) computes an empty `toResolve` — **zero network calls**
  when the catalog covered the deck, and exactly the misses otherwise.
- The deck-meta and nickname effects skip when `initial` is provided.

The whole derivation block (`resolvedCards`, `cardsByZone`, `stats`, `coverArtUrl` —
lines 118-165) is **unchanged** and produces correct output on the very first render.
Without `initial`, behaviour is identical to today, so other callers are unaffected.

This is why derivation was **not** moved to the server: `computeDeckStats` and
`pickCoverArt` are pure and cheap to replay on hydration, whereas serialising their output
would both bloat the RSC payload and duplicate subtle rules (zone grouping, tokens excluded
from stats, cover-art priority) across two implementations that could silently diverge.

### 4. `DeckDetailReadOnlyView`

Accepts `initial` and forwards it to the hook. No render changes; with `isLoading` false on
first paint, the spinner branch (`DeckDetailReadOnlyView.tsx:132-140`) is simply skipped.

**Serialisation**: RSC→client props must be JSON-serialisable. Confirm during
implementation that `rowToCardEntry` yields no `Date` instances.

## Privacy invariants

RLS remains the real backstop — a private deck returns zero rows regardless of application
code, and server rendering bypasses nothing. On top of that, three invariants:

1. **`entry.proxy` is neutralised server-side, before serialisation.** Today this happens
   client-side (`usePublicDeckDetail.ts:49`) because `proxy` is the owner's private physical
   status. If it leaked on the server path it would ship in the raw HTML — strictly worse
   than today, where it only ever crossed an API response.
2. **The public path uses the cookie-bearing SSR client** (see §1).
3. **Ownership is decided from `auth.getUser()`**, never `getSession()`.

## Error handling

- Deck missing or not visible → `fetchDeckMetaServer` returns `null` → `notFound()`. This
  replaces the client-side "deck not found" screen (`DeckDetailReadOnlyView.tsx:142-150`)
  with a real 404; today the route answers 200 for a nonexistent deck.
- Catalog resolution failure → silent degradation to client resolution; never an error page.

## Verification

No test framework in this project, so verification is runtime (`npm run check` + manual):

- `curl` `/fr/decks/<id>` anonymously → **card names present in the raw HTML**. This is the
  central success criterion.
- Network tab: the `deck meta → deck meta → cards` cascade is gone.
- Private deck, anonymous → 404, and **no** card data anywhere in the HTML.
- Owner flips their profile to private → deck stops being visible immediately (no cache).
- Signed-in owner → editable view; add/edit/delete still work.
- Deck containing `mpc:` cards → resolved on hydration, no missing entries.
- `npm run check` gated on **no new** problems (baseline is red: ~60 pre-existing issues in
  unrelated files).

## Out of scope

ISR and its invalidation; SSR of the owner view; the 113-file `ScryfallCard`→`Card`
migration; the production catalog seed. Server rendering covers whatever the catalog
already contains.
