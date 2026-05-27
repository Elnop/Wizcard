# Wishlist Feature — Design Spec

**Date:** 2026-05-27  
**Status:** Approved

## Context

Users want to track cards they intend to acquire — either generally or for a specific deck build. Today there is no way to mark a card as "wanted" without adding it to the collection (which implies ownership). The wishlist fills this gap: a single, persistent list of specific printings the user wants to buy, separate from what they own.

---

## Requirements

- Single wishlist per user (not multiple named wishlists)
- Tracks a specific printing (scryfallId), not just an oracle card
- Display: grid/table toggle, same as collection page
- Add from: search results, deck detail page (card modal, context menu, bulk select)
- Remove from: wishlist page (card modal)
- Move to collection: button in card modal on wishlist page — transfers the item to the collection and removes it from the wishlist
- No additional metadata beyond what `CardEntry` already provides (condition, foil, language, etc.)
- No overlap/badge logic with collection — wishlist and collection are independent

---

## Data Model

### Migration

```sql
ALTER TABLE cards
  ADD COLUMN wishlist boolean NOT NULL DEFAULT false;
```

Wishlist items are `cards` rows where `wishlist = true` and `owner_id = <user>` and `deck_id IS NULL`.  
Collection queries remain unchanged — existing code implicitly excludes wishlist rows because it never fetches `wishlist = true` rows.  
Add explicit `wishlist = false` filter to `fetchCollectionPage` to be safe.

---

## Module Structure

```
src/lib/wishlist/
  store/
    wishlist-store.ts       # Zustand store
  context/
    WishlistContext.tsx     # Context + provider
    useWishlistContext.ts   # Hook
  db/
    wishlist.ts             # fetchWishlistPage, insertWishlistItem, deleteWishlistItem
  hooks/
    useWishlistCards.ts     # hydrates Card[] + CardStack[] from store
```

Page: `src/app/wishlist/page.tsx`  
Page-local components: `src/app/wishlist/components/`

---

## Store (`wishlist-store.ts`)

Mirror of `collection-store.ts`. Key actions:

| Action                                                  | Description                                                                                   |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `addToWishlist(card, userId, triggerSync, entryPatch?)` | Insert a `cards` row with `wishlist = true`                                                   |
| `removeFromWishlist(rowId, userId, triggerSync)`        | Delete the row                                                                                |
| `moveToCollection(rowId, userId, triggerSync)`          | Call `addCard()` on collection-store, then `removeFromWishlist()` — two sync queue operations |
| `hydrateFromSupabase(userId)`                           | Fetch wishlist rows on login                                                                  |

Uses `enqueue()` + `triggerSync()` for all mutations. LocalStorage key: `wizcard-wishlist`.

---

## Provider Setup

Add `WishlistProvider` to `src/contexts/Providers.tsx` **after** `CollectionProvider`:

```tsx
<CollectionProvider>
	<WishlistProvider>
		<ImportProvider>{children}</ImportProvider>
	</WishlistProvider>
</CollectionProvider>
```

---

## Page `/wishlist`

Route: `src/app/wishlist/page.tsx`

Structure mirrors `src/app/collection/page.tsx`:

- `useWishlistContext()` for store access
- `useWishlistCards()` to get `Card[]` + `CardStack[]`
- Grid/table toggle reusing existing `CardGrid` / `CardTable` components
- `CardModal` with:
  - `onRemoveEntry` → `removeFromWishlist(rowId)`
  - `onAddToCollection` → `moveToCollection(rowId)` with label `"Move to Collection"`
  - `onChangePrint` → update the scryfallId on the wishlist item
- No filters sidebar in v1 — add later if needed

---

## Navbar

Add link in `src/components/Navbar/Navbar.tsx` between Decks and Collection:

```tsx
<NavLink href="/wishlist">Wishlist</NavLink>
```

No badge count needed in v1.

---

## Adding Cards from Search

In `src/app/search/page.tsx`, pass a second handler to `CardModal`:

```tsx
onAddToWishlist={(card, entry) => wishlistCtx.addToWishlist(card, userId, triggerSync, entry)}
```

In `CardModal`, add an "Add to Wishlist" button alongside "Add to Collection" when `onAddToWishlist` is provided. This is a prop addition to `CardModal`'s interface.

---

## Adding Cards from Deck

Three entry points on the deck detail page (`src/app/decks/[id]/`):

1. **CardModal** — add `onAddToWishlist` prop, same as search
2. **Context menu (⋯ button on card)** — add "Add to Wishlist" menu item; opens a brief entry modal for foil/condition/language before adding
3. **Bulk select** — checkbox multi-select mode + "Add to Wishlist" batch action; adds selected cards with default entry values

---

## Verification

1. `npm run check` passes (TypeScript + ESLint + Prettier)
2. Run `npm run sb:migrate` — `wishlist` column appears in `cards` table
3. Open search page → click a card → "Add to Wishlist" button visible → click → navigate to `/wishlist` → card appears
4. Open a deck → use all 3 entry points (modal, context menu, bulk) → cards appear in wishlist
5. On wishlist page → open a card modal → "Move to Collection" → card disappears from wishlist, appears in collection
6. On wishlist page → remove a card → card disappears
7. Collection page still loads correctly with no wishlist items appearing
