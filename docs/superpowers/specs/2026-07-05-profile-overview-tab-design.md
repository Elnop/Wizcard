# Profile Overview tab — design

**Date:** 2026-07-05

## Problem

The `/users/<nickname>` profile shell has three tabs — Decks / Collection /
Wishlist — each a sub-route under the shell (see
[2026-07-05-profile-tab-routing-design](./2026-07-05-profile-tab-routing-design.md)).
The profile has no landing/dashboard view: the root `/users/<nickname>` merely
redirects to `/decks`. We want a first **Overview** tab presenting a small
profile dashboard (recap stats + recent activity).

## Target

Add an **Overview** tab as the profile's landing page. It lives at the shell
**root** `/users/<nickname>` — there is deliberately **no** `/overview`
sub-route. The tab bar becomes four entries:

```
Overview | Decks | Collection | Wishlist

/users/Elnop            → Overview  (root IS the Overview page)
/users/Elnop/decks      → Decks
/users/Elnop/collection → Collection
/users/Elnop/wishlist   → Wishlist
```

Overview is **public and identical for owner and visitor** — like the other
tabs, all reads rely on the existing public-read RLS. `isOwner` does not change
Overview content (no editing here).

## Architecture

### 1. Routing & shell

- **`page.tsx` (root)** — stops redirecting to `/decks`. Becomes the Overview
  page: reads `ownerId` / `isOwner` / `handle` from `ProfileShellContext` (same
  pattern as the other sub-pages) and renders `<ProfileOverview>`.
- **`ProfileView.tsx`** — the tab bar gains a fourth entry. `tabFromPathname`
  gains an `overview` case: when the pathname is the shell **root**
  `/users/<handle>` (no `decks`/`collection`/`wishlist` trailing segment), the
  active tab is `overview`. The Overview tab link points at `/users/${handle}`
  (the root).
- The **header stats row** (Decks / Collection / Wishlist with counts) is a
  distinct row of shortcuts and is **not** extended with Overview — Overview has
  no "count". Overview appears only as a clickable entry in the tab bar.

### 2. `ProfileOverview.tsx` (new) — dashboard content

Three blocks:

**a) Recap stats** — stat cards:

- **Unique cards** (`COUNT(DISTINCT scryfall_id)` over public `wishlist=false`
  cards) and **Total copies** (row count).
- **Member since** — `profile.createdAt` formatted (e.g. "Membre depuis juil.
  2026").

**b) Recently added cards** — the ~8 most recently added public collection cards
(`date_added desc`), thumbnail + name. Name/image resolve from the Scryfall
store client-side, the same path `PublicCollectionView` already uses (the DB row
stores only `scryfall_id`).

**c) Recently updated decks** — the ~5 most recently updated decks
(`updated_at desc`), derived by client-side sort of the deck list **already
loaded** by `useProfileSummary` (no extra query). Name + link to the deck.

### 3. Data

New reads:

- **RPC `count_distinct_public_cards(owner uuid)`** (new migration) →
  `COUNT(DISTINCT scryfall_id)` over the owner's public `wishlist=false` cards.
  Exact, light, index-friendly. `security definer` / respects public-read
  semantics consistent with the existing public view.
- **`fetchRecentPublicCards(ownerId, limit)`** in
  `src/lib/supabase/queries/cards.ts` → `public_collection_cards`,
  `wishlist=false`, `order('date_added', desc)`, `limit`.
- **Total copies** — existing `fetchPublicCardCount(ownerId, false)`.
- **Recent decks** — client sort of `summary.decks` (already loaded).

A hook **`useProfileOverview(ownerId)`** orchestrates the unique-count and
recent-cards fetches. The total-copies count and deck list already come from the
shell's `useProfileSummary`; that `summary` is passed into `ProfileOverview` as a
prop so those are not refetched.

### 4. Ownership

Overview is public and identical for owner and visitor. `isOwner` changes
nothing about Overview content. All reads use the existing public-read RLS.

## Files

- **New:** `ProfileOverview.tsx` (+ `ProfileOverview.module.css`),
  `useProfileOverview.ts`, migration adding `count_distinct_public_cards`.
- **Modified:** `page.tsx` (root — render Overview instead of redirect),
  `ProfileView.tsx` (4th tab + root/overview case in `tabFromPathname`),
  `src/lib/supabase/queries/cards.ts` (`fetchRecentPublicCards` +
  `count_distinct_public_cards` RPC wrapper).
- **Unchanged:** navbar, the working routes `/collection` `/wishlist` `/decks`,
  the existing tab sub-pages, `useProfileSummary` (reused as-is).

## Out of scope

- No color (WUBRG) breakdown chart.
- No monetary/value stats.
- No editing from the Overview.
