# Profile tab routing — design

**Date:** 2026-07-05

## Problem

The `/users/[userId]/` namespace currently has two disconnected experiences:

- `page.tsx` (root) renders the profile shell (avatar / name / bio header + a tab
  bar for Decks / Collection / Wishlist), but tabs switch via local `useState` —
  **the URL never changes**, so a tab is not shareable.
- `collection/`, `wishlist/`, `decks/` are **standalone routes** with no profile
  header/tabs. Each one re-resolves the nickname, handles loading / not-found,
  and branches on ownership: for the owner it renders the _full editable_ owner
  page (`CollectionPage` / `WishlistPage` / `DecksPageClient`), for a visitor the
  read-only public view.

The goal: tabs should navigate (shareable URLs), and `/users/Elnop/collection`
should BE the profile page with the Collection tab active — the public profile
shell — not a standalone page. The owner should be able to visit their own
profile the same way visitors do.

## Target

A single **profile shell** (header + tab bar) where **each tab is a sub-route**:

```
/users/Elnop            → redirects to /users/Elnop/decks
/users/Elnop/decks      → profile shell, Decks tab active
/users/Elnop/collection → profile shell, Collection tab active
/users/Elnop/wishlist   → profile shell, Wishlist tab active
```

Owner and visitor see the same public shell. The owner keeps editable cards
(owner card menu, deck badges) and the Edit-profile button via `isOwner=true`;
the visitor sees read-only.

The app's original working routes `/collection`, `/wishlist`, `/decks` (reached
from the navbar) are **unchanged** — they remain the signed-in user's private
working pages where real editing/management happens.

## Key change

In the three `/users/[userId]/{collection,wishlist,decks}` sub-pages, **remove
the `isOwner ? <FullEditablePage/> : <PublicView/>` branch**. They **always**
render the public view integrated into the shell (`PublicCollectionView` /
`PublicWishlistView` / `PublicDecksView`), passing `isOwner` only to enable the
owner card menu / badges. `CollectionPage` / `WishlistPage` / `DecksPageClient`
are **no longer used** anywhere under `/users/`.

## Architecture

### 1. `users/[userId]/layout.tsx` (new) — the shell

- Resolves the nickname → profile **once** (`useProfileByNickname`), handles
  `loading` / `not-found`, computes `isOwner`.
- Renders `ProfileView` as the shell (header + tabs) and injects `{children}`
  into the tab panel.
- Exposes `ownerId` / `isOwner` / `handle` to the sub-pages via a light
  **`ProfileShellContext`**, so each page does not re-resolve the nickname.

Because Next.js layouts do not remount when navigating between their children,
`useProfileSummary` (tab counts) and `useStickyHeader` (scroll state) live in the
shell and survive tab navigation — no refetch, no scroll reset. This is the
desired behavior, for free.

### 2. `ProfileView.tsx` (modified)

- No longer holds tab state in `useState`: the **active tab is derived from the
  `pathname`**.
- Tabs become `<Link href={/users/<handle>/<tab>}>` — real navigation, shareable
  URL.
- The tab content comes from `children` (the layout). The internal conditional
  rendering of `PublicCollectionView` / `PublicWishlistView` is removed.

### 3. The three `page.tsx` (slimmed down)

- No nickname resolution, no loading / not-found, no owner branch.
- Read `ownerId` / `isOwner` from `ProfileShellContext` and render just
  `PublicCollectionView` / `PublicWishlistView` / `PublicDecksView`.
- The `PublicCollectionView` / `PublicWishlistView` named exports stay (used by
  the pages); only their `default export` owner/visitor wrapper is removed.

### 4. `page.tsx` (root) → redirect

Redirects to `/users/<handle>/decks`.

## Files

- **New:** `users/[userId]/layout.tsx`, `users/[userId]/ProfileShellContext.tsx`.
- **Modified:** `ProfileView.tsx`, `collection/page.tsx`, `wishlist/page.tsx`,
  `decks/page.tsx`, `page.tsx` (root).
- **Unchanged:** navbar, original app routes, data hooks, `CollectionView`,
  owner/viewer card menus, `CardModalProvider`.

## Out of scope

- No changes to navbar links or the original `/collection`, `/wishlist`,
  `/decks` working pages.
- No new "link to my profile" entry point in the navbar (owner reaches their
  profile by visiting `/users/<theirNickname>`).
