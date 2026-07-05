# Profile Tab Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `/users/[userId]` profile into a shell whose tabs are real shareable sub-routes (`/users/<handle>/{decks,collection,wishlist}`), rendered by a shared layout, with each tab always showing the public view (owner keeps editable cards via `isOwner`).

**Architecture:** A new `layout.tsx` under `users/[userId]` resolves the nickname once, computes `isOwner`, publishes `{ownerId, isOwner, handle}` via a light React context, and renders `ProfileView` as a shell with `{children}` in the tab panel. `ProfileView`'s tabs become `<Link>`s whose active state is derived from the pathname. The three sub-`page.tsx` shrink to just the public view, reading identity from context. The root `page.tsx` redirects to `/decks`.

**Tech Stack:** Next.js App Router (client components), React context, TypeScript, CSS modules.

## Global Constraints

- No test framework exists (no vitest/jest). Verify every task via `npm run check` (TypeScript + ESLint + Prettier) plus runtime checks in the dev app. See spec's testing note.
- `/users/**` routes are NOT auth-gated (public sharing). Read access is enforced by public SELECT RLS. Do not add auth redirects.
- Commit directly to `main` (user-authorized for this feature).
- Do not touch the navbar or the original working routes `/collection`, `/wishlist`, `/decks`.
- Preserve existing owner/visitor card behavior: owner gets `buildOwnedCardMenu` + deck badges + editable click; visitor gets `buildViewerCardMenu` + read-only click. This is already wired through `isOwner` in `PublicCollectionView` / `PublicWishlistView`.

---

## File Structure

- **New:** `src/app/users/[userId]/ProfileShellContext.tsx` — context carrying `{ ownerId, isOwner, handle }` from the layout to the sub-pages.
- **New:** `src/app/users/[userId]/layout.tsx` — resolves nickname, computes `isOwner`, provides context, renders `ProfileView` shell with `{children}`.
- **Modify:** `src/app/users/[userId]/components/ProfileView.tsx` — tabs become `<Link>`s (active derived from pathname); tab content is `children`; drop internal tab state and the inline `DecksTab`/`PublicCollectionView`/`PublicWishlistView` rendering.
- **Modify:** `src/app/users/[userId]/page.tsx` — redirect to `/users/<handle>/decks`.
- **Modify:** `src/app/users/[userId]/decks/page.tsx` — render `PublicDecksView` from context (drop nickname resolution + owner branch).
- **Modify:** `src/app/users/[userId]/collection/page.tsx` — render `PublicCollectionView` from context (drop the default owner/visitor wrapper).
- **Modify:** `src/app/users/[userId]/wishlist/page.tsx` — render `PublicWishlistView` from context (drop the default owner/visitor wrapper).

Note: `useProfileSummary` (tab counts) stays in `ProfileView`. The Decks tab now renders the full `PublicDecksView` (folders + all decks), consistent with the collection/wishlist tabs rendering their full browsing views; the old preview `DecksTab` and its `PREVIEW_LIMIT` "See all" link are removed.

---

## Task 1: ProfileShellContext

Create the context the layout uses to hand identity to the sub-pages, so pages don't re-resolve the nickname.

**Files:**

- Create: `src/app/users/[userId]/ProfileShellContext.tsx`

**Interfaces:**

- Produces:
  - `type ProfileShell = { ownerId: string; isOwner: boolean; handle: string }`
  - `ProfileShellProvider: React.FC<{ value: ProfileShell; children: React.ReactNode }>`
  - `useProfileShell(): ProfileShell` — throws if used outside the provider.

- [ ] **Step 1: Write the file**

```tsx
'use client';

import { createContext, useContext } from 'react';

/**
 * Identity of the profile being viewed, resolved ONCE by the users/[userId]
 * layout and handed to the tab sub-pages so they don't each re-resolve the
 * nickname. `handle` is the URL nickname; `ownerId` is the real user id;
 * `isOwner` is true when the signed-in user owns this profile.
 */
export type ProfileShell = {
	ownerId: string;
	isOwner: boolean;
	handle: string;
};

const ProfileShellContext = createContext<ProfileShell | null>(null);

export function ProfileShellProvider({
	value,
	children,
}: {
	value: ProfileShell;
	children: React.ReactNode;
}) {
	return <ProfileShellContext.Provider value={value}>{children}</ProfileShellContext.Provider>;
}

export function useProfileShell(): ProfileShell {
	const ctx = useContext(ProfileShellContext);
	if (!ctx) throw new Error('useProfileShell must be used within a ProfileShellProvider');
	return ctx;
}
```

- [ ] **Step 2: Verify it compiles/lints**

Run: `npm run check`
Expected: PASS (no TypeScript/ESLint/Prettier errors). The file is not yet imported anywhere, which is fine.

- [ ] **Step 3: Commit**

```bash
git add src/app/users/[userId]/ProfileShellContext.tsx
git commit -m "feat: profile shell context for tab sub-pages"
```

---

## Task 2: ProfileView becomes a shell with Link tabs + children

Rewrite `ProfileView` so tabs are `<Link>`s (active tab derived from the pathname) and the tab panel renders `{children}` instead of choosing a view internally. Keep the header (avatar/name/bio/edit), the sticky overlay, and the tab counts via `useProfileSummary`.

**Files:**

- Modify: `src/app/users/[userId]/components/ProfileView.tsx`

**Interfaces:**

- Consumes (Task 1): nothing directly — the layout (Task 3) passes props.
- Produces:
  - `ProfileView` new prop shape:
    ```ts
    {
      userId: string;
      profile: Profile | null;
      isLoading?: boolean;
      isOwner?: boolean;
      onEdit?: () => void;
      handle: string;            // NEW: URL nickname, for tab hrefs
      children: React.ReactNode; // NEW: active tab content (from layout)
    }
    ```
  - Tab hrefs: `/users/<handle>/decks`, `/users/<handle>/collection`, `/users/<handle>/wishlist`.
  - Active tab derived from `usePathname()`: the last path segment (`decks` | `collection` | `wishlist`); defaults to `decks`.

- [ ] **Step 1: Rewrite ProfileView.tsx**

Replace the entire file contents with:

```tsx
'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Profile } from '@/lib/profile/types';
import { Button } from '@/components/Button/Button';
import { useProfileSummary } from '../useProfileSummary';
import { useStickyHeader } from './useStickyHeader';
import styles from './ProfileView.module.css';

type Tab = 'decks' | 'collection' | 'wishlist';

/** Derive the active tab from the URL's last segment (defaults to decks). */
function tabFromPathname(pathname: string): Tab {
	if (pathname.endsWith('/collection')) return 'collection';
	if (pathname.endsWith('/wishlist')) return 'wishlist';
	return 'decks';
}

/**
 * Instagram-style profile shell: header (avatar / name / bio) + a stats row of
 * section counts, then tabs that are real links to `/users/<handle>/<tab>`. The
 * active tab's content is supplied as `children` by the users/[userId] layout,
 * so switching tabs is a real navigation with a shareable URL. Never receives or
 * renders an email — only public fields.
 */
export function ProfileView({
	userId,
	profile,
	isLoading = false,
	isOwner = false,
	onEdit,
	handle,
	children,
}: {
	userId: string;
	profile: Profile | null;
	isLoading?: boolean;
	/** True when the signed-in user is viewing their OWN profile. */
	isOwner?: boolean;
	onEdit?: () => void;
	/** URL nickname used to build tab hrefs. */
	handle: string;
	/** Active tab content, injected by the layout. */
	children: React.ReactNode;
}) {
	const pathname = usePathname();
	const activeTab = tabFromPathname(pathname);
	const summary = useProfileSummary(userId);
	const barRef = useRef<HTMLDivElement>(null);
	const { pinned, visible } = useStickyHeader(barRef);

	// Show a skeleton until the profile loads, rather than flashing the "Wizard"
	// placeholder and then swapping in the real nickname.
	const loaded = profile !== null && !isLoading;
	const displayName = profile?.nickname || 'Wizard';

	let avatarNode: React.ReactNode;
	if (!loaded) {
		avatarNode = (
			<span className={`${styles.avatarFallback} ${styles.skeletonAvatar}`} aria-hidden />
		);
	} else if (profile?.avatarUrl) {
		avatarNode = (
			// eslint-disable-next-line @next/next/no-img-element -- external Supabase storage URL
			<img src={profile.avatarUrl} alt="" className={styles.avatar} />
		);
	} else {
		avatarNode = (
			<span className={styles.avatarFallback}>{displayName.charAt(0).toUpperCase()}</span>
		);
	}

	const stats: Array<{ key: Tab; label: string; count: number }> = [
		{ key: 'decks', label: 'Decks', count: summary.deckCount },
		{ key: 'collection', label: 'Collection', count: summary.collectionCount },
		{ key: 'wishlist', label: 'Wishlist', count: summary.wishlistCount },
	];

	// `compact` = the sticky overlay: tabs only (no avatar / nickname / bio /
	// edit), so the pinned bar stays thin.
	const renderHeader = (compact: boolean) => (
		<>
			{!compact && (
				<>
					<div className={styles.header}>
						{avatarNode}
						<div className={styles.headerText}>
							{!loaded ? (
								<span className={styles.skeletonName} aria-hidden />
							) : (
								<h1 className={styles.name}>{displayName}</h1>
							)}
							{onEdit && (
								<Button variant="secondary" size="sm" onClick={onEdit}>
									Edit profile
								</Button>
							)}
						</div>
					</div>

					{profile?.description && <p className={styles.description}>{profile.description}</p>}
				</>
			)}

			{/* Tab bar with counts — real links to the tab sub-routes. */}
			<div className={styles.tabs} role="tablist">
				{stats.map((s) => (
					<Link
						key={s.key}
						href={`/users/${handle}/${s.key}`}
						role="tab"
						aria-selected={activeTab === s.key}
						className={`${styles.tab} ${activeTab === s.key ? styles.tabActive : ''}`}
					>
						{s.label}
						<span className={styles.tabCount}>{summary.isLoading ? '—' : s.count}</span>
					</Link>
				))}
			</div>
		</>
	);

	const overlayClass = [styles.overlayBar, visible ? styles.overlayVisible : styles.overlayHidden]
		.filter(Boolean)
		.join(' ');

	return (
		<div className={styles.container}>
			{/* Normal in-flow header at the top — never animates, scrolls away. */}
			<div ref={barRef}>{renderHeader(false)}</div>

			{/* Second overlay header that engages only once scrolled past the first,
			    sliding in/out on scroll direction. Compact = thin. */}
			{pinned && <div className={overlayClass}>{renderHeader(true)}</div>}

			<div className={styles.tabPanel}>{children}</div>
		</div>
	);
}
```

- [ ] **Step 2: Verify compile/lint**

Run: `npm run check`
Expected: This file passes. NOTE: `page.tsx` (root) still calls `ProfileView` with the old props and no `handle`/`children` — it will error until Task 3. If `npm run check` reports errors ONLY in `src/app/users/[userId]/page.tsx` (missing `handle`/`children`, unused imports), that is expected and resolved in Task 3. Any error inside `ProfileView.tsx` itself must be fixed now.

- [ ] **Step 3: Commit**

```bash
git add src/app/users/[userId]/components/ProfileView.tsx
git commit -m "feat: profile tabs are links, tab content via children"
```

---

## Task 3: Layout resolves nickname and renders the shell

Create the layout that owns nickname resolution, loading/not-found, `isOwner`, the context provider, the Edit modal, and the `ProfileView` shell wrapping `{children}`. This is the code moved out of the old root `page.tsx`.

**Files:**

- Create: `src/app/users/[userId]/layout.tsx`
- Modify: `src/app/users/[userId]/page.tsx` (redirect — done in Step 4 here)

**Interfaces:**

- Consumes (Task 1): `ProfileShellProvider`, `ProfileShell`.
- Consumes (Task 2): `ProfileView` with `handle` + `children`.
- Produces: layout wrapping all `/users/[userId]/*` pages; those pages call `useProfileShell()`.

- [ ] **Step 1: Write layout.tsx**

```tsx
'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { Spinner } from '@/components/Spinner/Spinner';
import { useProfileByNickname } from './useProfileByNickname';
import { ProfileShellProvider } from './ProfileShellContext';
import { ProfileView } from './components/ProfileView';
import { ProfileEditModal } from './components/ProfileEditModal';
import { UserNotFound } from './components/UserNotFound';

/**
 * Shell for every `/users/<nickname>/...` route. Resolves the nickname to a
 * profile ONCE, handles loading / not-found, computes ownership, and renders the
 * ProfileView shell (header + tab links) with the active tab's page as
 * `children`. The resolved identity is published via ProfileShellContext so the
 * tab sub-pages don't each re-resolve the nickname. The owner sees their live
 * profile (from ProfileContext) plus an Edit button; visitors see the read-only
 * public profile. Not auth-gated — public sharing is enforced by RLS.
 */
export default function UserProfileLayout({ children }: { children: React.ReactNode }) {
	const params = useParams();
	const nickname = params.userId as string;
	const { user } = useAuth();
	const [editing, setEditing] = useState(false);

	const { profile: resolved, status } = useProfileByNickname(nickname);
	const ownerCtx = useProfileContext();

	if (status === 'loading') {
		return (
			<div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
				<Spinner />
			</div>
		);
	}
	if (status === 'not-found' || !resolved) {
		return <UserNotFound />;
	}

	const isOwner = !!user && user.id === resolved.id;
	// The owner's live profile (reflects unsaved edits) comes from context; a
	// visitor sees the resolved public profile.
	const profile = isOwner ? ownerCtx.profile : resolved;

	return (
		<ProfileShellProvider value={{ ownerId: resolved.id, isOwner, handle: nickname }}>
			<ProfileView
				userId={resolved.id}
				profile={profile}
				isLoading={isOwner ? ownerCtx.isLoading : false}
				isOwner={isOwner}
				onEdit={isOwner ? () => setEditing(true) : undefined}
				handle={nickname}
			>
				{children}
			</ProfileView>
			{editing && <ProfileEditModal onClose={() => setEditing(false)} />}
		</ProfileShellProvider>
	);
}
```

- [ ] **Step 2: Verify layout compiles (page.tsx will still be wrong until Step 3)**

Run: `npm run check`
Expected: `layout.tsx` passes. The root `page.tsx` still references the old shell and duplicates resolution — expected errors there only; fixed next.

- [ ] **Step 3: Replace root page.tsx with a redirect to /decks**

Overwrite `src/app/users/[userId]/page.tsx` with:

```tsx
'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/**
 * The bare profile URL has no tab of its own — it redirects to the Decks tab so
 * every rendered profile view has an explicit, shareable tab URL. The shell
 * (header + tabs, loading / not-found) lives in the layout, which wraps this
 * redirect too.
 */
export default function ProfileIndexRedirect() {
	const router = useRouter();
	const params = useParams();
	const nickname = params.userId as string;

	useEffect(() => {
		router.replace(`/users/${nickname}/decks`);
	}, [router, nickname]);

	return null;
}
```

- [ ] **Step 4: Verify**

Run: `npm run check`
Expected: PASS overall EXCEPT the sub-pages (`decks`/`collection`/`wishlist`) still use their old structure — they compile today (they still resolve the nickname themselves), so `check` should now fully PASS. If it passes, good; Tasks 4–6 then simplify those pages.

- [ ] **Step 5: Runtime check**

Start dev if not running (`npm run dev`), then in the browser:

- Visit `/users/<an-existing-nickname>` → should redirect to `/users/<nickname>/decks` and show the profile shell (header + tabs) with the decks tab content.
- Visit `/users/does-not-exist` → shows `UserNotFound`.
  Expected: shell renders with header + tab links; clicking a tab navigates the URL.

- [ ] **Step 6: Commit**

```bash
git add src/app/users/[userId]/layout.tsx src/app/users/[userId]/page.tsx
git commit -m "feat: users/[userId] layout renders profile shell; root redirects to /decks"
```

---

## Task 4: Collection sub-page renders the public view from context

Strip `collection/page.tsx` down to the shell tab content: always the public collection view, identity from `useProfileShell()`. Keep the `PublicCollectionView` named export intact; remove the default owner/visitor wrapper.

**Files:**

- Modify: `src/app/users/[userId]/collection/page.tsx`

**Interfaces:**

- Consumes (Task 1): `useProfileShell()` → `{ ownerId, isOwner }`.
- Produces: default export = the collection tab content (no nickname resolution).

- [ ] **Step 1: Edit the default export**

In `src/app/users/[userId]/collection/page.tsx`:

Remove these now-unused imports:

```tsx
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { Spinner } from '@/components/Spinner/Spinner';
import CollectionPage from '@/app/collection/page';
import { useProfileByNickname } from '../useProfileByNickname';
import { UserNotFound } from '../components/UserNotFound';
```

Add:

```tsx
import { useProfileShell } from '../ProfileShellContext';
```

Replace the entire `export default function UserCollectionPage() { ... }` (the whole block, including its docstring) with:

```tsx
/**
 * Collection tab of the profile shell. Always the public collection view; the
 * owner gets editable cards / owner menu via `isOwner`. Identity comes from the
 * layout via ProfileShellContext — this page does not resolve the nickname.
 */
export default function UserCollectionPage() {
	const { ownerId, isOwner } = useProfileShell();
	return <PublicCollectionView ownerId={ownerId} filterLayout="modal" isOwner={isOwner} />;
}
```

Leave the `PublicCollectionView` function (the named export) exactly as-is.

- [ ] **Step 2: Verify**

Run: `npm run check`
Expected: PASS. If ESLint flags a remaining unused import, remove it.

- [ ] **Step 3: Runtime check**

In the browser:

- As a visitor, visit `/users/<nickname>/collection` → profile shell with Collection tab active, read-only cards.
- As the owner (signed in, own nickname), same URL → cards clickable / owner menu / deck badges.
  Expected: matches; the shell header + tabs stay mounted (no reload) when switching between Decks/Collection/Wishlist.

- [ ] **Step 4: Commit**

```bash
git add src/app/users/[userId]/collection/page.tsx
git commit -m "feat: collection sub-page renders public view from shell context"
```

---

## Task 5: Wishlist sub-page renders the public view from context

Same transformation as Task 4, for wishlist.

**Files:**

- Modify: `src/app/users/[userId]/wishlist/page.tsx`

**Interfaces:**

- Consumes (Task 1): `useProfileShell()` → `{ ownerId, isOwner }`.
- Produces: default export = the wishlist tab content.

- [ ] **Step 1: Edit the default export**

In `src/app/users/[userId]/wishlist/page.tsx`:

Remove these now-unused imports:

```tsx
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { Spinner } from '@/components/Spinner/Spinner';
import WishlistPage from '@/app/wishlist/page';
import { useProfileByNickname } from '../useProfileByNickname';
import { UserNotFound } from '../components/UserNotFound';
```

Add:

```tsx
import { useProfileShell } from '../ProfileShellContext';
```

Replace the entire `export default function UserWishlistPage() { ... }` (including its docstring) with:

```tsx
/**
 * Wishlist tab of the profile shell. Always the public wishlist view; the owner
 * gets editable cards / owner menu via `isOwner`. Identity comes from the layout
 * via ProfileShellContext — this page does not resolve the nickname.
 */
export default function UserWishlistPage() {
	const { ownerId, isOwner } = useProfileShell();
	return <PublicWishlistView ownerId={ownerId} filterLayout="modal" isOwner={isOwner} />;
}
```

Leave the `PublicWishlistView` function (the named export) exactly as-is.

- [ ] **Step 2: Verify**

Run: `npm run check`
Expected: PASS. Remove any remaining unused import ESLint flags.

- [ ] **Step 3: Runtime check**

In the browser, visit `/users/<nickname>/wishlist` as visitor (read-only) and as owner (editable). Expected: matches; shell stays mounted across tab switches.

- [ ] **Step 4: Commit**

```bash
git add src/app/users/[userId]/wishlist/page.tsx
git commit -m "feat: wishlist sub-page renders public view from shell context"
```

---

## Task 6: Decks sub-page renders the public view from context

Strip `decks/page.tsx` to the shell tab content: always `PublicDecksView`, identity from context. Keep the `PublicDecksView` function as-is (it already takes `ownerId` + `handle`); remove nickname resolution, the owner branch (`DecksPageClient`), and now-unused imports.

**Files:**

- Modify: `src/app/users/[userId]/decks/page.tsx`

**Interfaces:**

- Consumes (Task 1): `useProfileShell()` → `{ ownerId, handle }`.
- Consumes: existing `PublicDecksView({ ownerId, handle })` in the same file.
- Produces: default export = the decks tab content.

- [ ] **Step 1: Edit the default export**

In `src/app/users/[userId]/decks/page.tsx`:

Remove these now-unused imports:

```tsx
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import DecksPageClient from '@/app/decks/DecksPageClient';
import { useProfileByNickname } from '../useProfileByNickname';
import { UserNotFound } from '../components/UserNotFound';
```

Keep `useRouter`/`useSearchParams` (used by `PublicDecksView`). Do NOT remove the `Spinner` import — `PublicDecksView` uses it for its own loading state.

Add:

```tsx
import { useProfileShell } from '../ProfileShellContext';
```

Replace the entire `export default function UserDecksPage() { ... }` (including its docstring) with:

```tsx
/**
 * Decks tab of the profile shell. Always the public decks view (folders + all
 * decks, read-only). Identity comes from the layout via ProfileShellContext —
 * this page does not resolve the nickname.
 */
export default function UserDecksPage() {
	const { ownerId, handle } = useProfileShell();
	return <PublicDecksView ownerId={ownerId} handle={handle} />;
}
```

Leave the `PublicDecksView` function exactly as-is.

- [ ] **Step 2: Verify**

Run: `npm run check`
Expected: PASS. If `styles` import (from `@/app/decks/page.module.css`) is now only used by `PublicDecksView`, that is fine — it is still used. Remove only imports ESLint actually flags as unused.

- [ ] **Step 3: Runtime check**

In the browser, visit `/users/<nickname>/decks`. Expected: profile shell with Decks tab active, showing the public decks/folders view; folder navigation (`?folder=` links) still works; clicking a deck opens `/decks/<id>`.

- [ ] **Step 4: Commit**

```bash
git add src/app/users/[userId]/decks/page.tsx
git commit -m "feat: decks sub-page renders public view from shell context"
```

---

## Task 7: Final verification pass

Confirm the whole feature end-to-end and that nothing under `/users/` still references the removed owner wrappers.

**Files:** none (verification only).

- [ ] **Step 1: Grep for leftover references**

Run:

```bash
grep -rn "CollectionPage\|WishlistPage\|DecksPageClient" src/app/users
```

Expected: NO matches (the standalone owner pages are no longer imported under `/users/`). If any match remains, it is a leftover import to remove.

- [ ] **Step 2: Full check**

Run: `npm run check`
Expected: PASS (TypeScript + ESLint + Prettier clean).

- [ ] **Step 3: End-to-end runtime walkthrough**

In the browser, signed OUT (or as a non-owner):

- `/users/<nickname>` → redirects to `/users/<nickname>/decks`, shell renders.
- Click Collection tab → URL becomes `/users/<nickname>/collection`, header + tabs stay put (no full reload), read-only collection shows.
- Click Wishlist tab → URL `/users/<nickname>/wishlist`, read-only wishlist.
- Copy `/users/<nickname>/collection` into a fresh tab → lands directly on the Collection tab.

Signed IN as the owner (own nickname):

- Each tab shows the Edit-profile button in the header and editable cards (owner menu / deck badges) in collection/wishlist.
- `/collection`, `/wishlist`, `/decks` (navbar) still open the original private working pages, unaffected.

Expected: all of the above hold.

- [ ] **Step 4: Nothing to commit** (verification only). If Step 1 or 2 required a fix, commit it:

```bash
git add -A
git commit -m "chore: remove leftover owner-page references under /users"
```

---

## Self-Review Notes

- **Spec coverage:** shell layout (Task 3), context (Task 1), Link tabs + pathname-derived active + children (Task 2), root redirect to `/decks` (Task 3 Step 3), three sub-pages always-public reading context (Tasks 4–6), owner keeps editable via `isOwner` (Tasks 4–6 pass `isOwner`), navbar/original routes untouched (Global Constraints + Task 7). All covered.
- **Divergence from spec note:** spec item 3 says "read `ownerId`/`isOwner` from context and render just Public\*View." The Decks tab additionally needs `handle` (for its folder links / see-through URLs), which the context also carries — consistent.
- **Removed preview `DecksTab`:** the old `ProfileView` inlined a 12-deck preview with a "See all" link. Since the Decks tab is now its own route rendering the full `PublicDecksView`, the preview is redundant and removed. `PREVIEW_LIMIT` (exported from `useProfileSummary.ts`) was used ONLY by that preview; after Task 2 it becomes an unused export — harmless (ESLint does not flag unused exports), so no dangling reference and no need to touch `useProfileSummary.ts`. `useProfileSummary` itself stays, used by the new `ProfileView` for tab counts.
- **Type consistency:** `ProfileShell` fields (`ownerId`, `isOwner`, `handle`) are used identically in Tasks 3–6. `ProfileView` new props (`handle`, `children`) match between Task 2 (definition) and Task 3 (call site).
