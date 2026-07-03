# User Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each user an editable, shareable profile (nickname, description, avatar) shown in the navbar and at `/users/[userId]`.

**Architecture:** New `public.profiles` table (1:1 with `auth.users`, public-read / owner-write RLS, auto-created via trigger + backfill) and a user-writable `avatars` storage bucket. A `src/lib/profile/` domain layer (db helpers, Zustand store, React context) hydrates the current user's profile on auth change. Text fields (nickname/description/avatarUrl) persist through the existing offline sync-queue via a new `profile-update` op; the avatar binary uploads directly to Storage and only its URL is queued. UI: an `isOwner`-split page at `/users/[userId]`, a `ProfileEditModal`, a `/profile` redirect shortcut, and navbar showing avatar + nickname.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (`@supabase/ssr`), Zustand + React Context, CSS Modules. No test framework, no i18n library.

## Global Constraints

- **No test framework exists.** Do not add one. Each task's verification gate is `npm run check` (tsc `--noEmit` + eslint + prettier) plus, where noted, a runtime check (Supabase reset/migrate, Studio inspection, or driving the flow in `npm run dev`). Never claim a task passes without running its gate.
- **No i18n library.** Hardcode all UI strings as **English** literals inline (matches current convention).
- **No form library, no Tailwind, no styled-components.** Forms use plain `useState` + native `<form>`; styling is CSS Modules using design tokens (`--primary`, `--border`, `--text-muted`, `--text-base`, `--foreground`, `--text-xl`). Compose classes with `[a, b].filter(Boolean).join(' ')`.
- **Owner/visitor split** uses the established pattern: `const isOwner = !!user && user.id === userId`.
- **Never expose another user's email to visitors.** Public views fall back to a generic label, never `user.email`, for non-owners.
- **Commit after every task** once its gate passes. Commit messages: `feat: …` / `chore: …`, no attribution footer needed unless the user asks.
- Spec: `docs/superpowers/specs/2026-07-03-user-profiles-design.md`.

---

### Task 1: Database migrations — profiles table + avatars bucket

Creates the `profiles` table (RLS, trigger, backfill) and the `avatars` bucket, and mirrors both into `init_schema.sql`. Deliverable: a local DB that has the table/bucket after both a fresh reset and an incremental migrate.

**Files:**

- Create: `supabase/migrations/20260703000000_create_profiles.sql`
- Create: `supabase/migrations/20260703000001_create_avatars_bucket.sql`
- Modify: `supabase/bootstrap/init_schema.sql` (append profiles table + policies + trigger, and avatars bucket + policies)

**Interfaces:**

- Produces: table `public.profiles(id uuid pk → auth.users, nickname text, description text, avatar_url text, created_at timestamptz, updated_at timestamptz)`; storage bucket `avatars` (public read, owner-write). Later tasks map columns `nickname/description/avatar_url` ↔ app fields `nickname/description/avatarUrl`.

- [ ] **Step 1: Write `supabase/migrations/20260703000000_create_profiles.sql`**

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  description text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Public can view profiles"
  on public.profiles for select
  to anon, authenticated using (true);

create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill existing users
insert into public.profiles (id)
  select id from auth.users
  on conflict (id) do nothing;
```

- [ ] **Step 2: Write `supabase/migrations/20260703000001_create_avatars_bucket.sql`**

```sql
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "public read avatars bucket"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "users write own avatar"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 3: Mirror into `supabase/bootstrap/init_schema.sql`**

Append the **same** SQL from Steps 1 and 2 to the end of `init_schema.sql` (the from-scratch schema used by `sb:reset`), so a clean DB matches migrated state. Keep the backfill `insert … select from auth.users` — it is a harmless no-op on an empty fresh DB.

- [ ] **Step 4: Apply incrementally and verify**

Ensure local Supabase is running (`npm run sb:start` if needed), then:
Run: `npm run sb:migrate`
Expected: both migrations apply with no error.

- [ ] **Step 5: Verify a full reset also produces the schema**

Run: `npm run sb:reset`
Expected: completes without error (this rebuilds from `init_schema.sql` + migrations). Confirms the mirror is valid.

- [ ] **Step 6: Inspect in Studio**

Run: `npm run sb:studio` and confirm: `profiles` table exists with RLS enabled and the 3 policies; Storage shows the `avatars` bucket. (If any local user existed before reset, note that reset wipes auth — backfill is only observable against a DB with pre-existing users; the trigger is verified at runtime in Task 8.)

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260703000000_create_profiles.sql supabase/migrations/20260703000001_create_avatars_bucket.sql supabase/bootstrap/init_schema.sql
git commit -m "feat: add profiles table and avatars storage bucket"
```

---

### Task 2: Profile type + DB helpers

The domain type and the three Supabase functions everything else builds on.

**Files:**

- Create: `src/lib/profile/types.ts`
- Create: `src/lib/profile/db/profiles.ts`

**Interfaces:**

- Consumes: `createClient` from `@/lib/supabase/client`; env `NEXT_PUBLIC_SUPABASE_URL` (already used in `src/lib/mpc/db/custom-cards.ts`).
- Produces:
  - `type Profile = { id: string; nickname: string | null; description: string | null; avatarUrl: string | null; createdAt: string; updatedAt: string }`
  - `type ProfileUpdate = Partial<Pick<Profile, 'nickname' | 'description' | 'avatarUrl'>>`
  - `fetchProfile(userId: string): Promise<Profile | null>`
  - `upsertProfile(userId: string, updates: ProfileUpdate): Promise<void>`
  - `uploadAvatar(userId: string, file: File): Promise<string>` (returns cache-busted public URL)

- [ ] **Step 1: Write `src/lib/profile/types.ts`**

```ts
export type Profile = {
	id: string;
	nickname: string | null;
	description: string | null;
	avatarUrl: string | null;
	createdAt: string;
	updatedAt: string;
};

export type ProfileUpdate = Partial<Pick<Profile, 'nickname' | 'description' | 'avatarUrl'>>;
```

- [ ] **Step 2: Write `src/lib/profile/db/profiles.ts`**

Mirror the row↔model mapping style of `updateDeckMeta` in `src/lib/deck/db/decks.ts` and the public-URL construction in `src/lib/mpc/db/custom-cards.ts`.

```ts
import { createClient } from '@/lib/supabase/client';
import type { Profile, ProfileUpdate } from '@/lib/profile/types';

type ProfileRow = {
	id: string;
	nickname: string | null;
	description: string | null;
	avatar_url: string | null;
	created_at: string;
	updated_at: string;
};

function rowToProfile(row: ProfileRow): Profile {
	return {
		id: row.id,
		nickname: row.nickname,
		description: row.description,
		avatarUrl: row.avatar_url,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from('profiles')
		.select('id, nickname, description, avatar_url, created_at, updated_at')
		.eq('id', userId)
		.maybeSingle();
	if (error) throw error;
	return data ? rowToProfile(data as ProfileRow) : null;
}

export async function upsertProfile(userId: string, updates: ProfileUpdate): Promise<void> {
	const supabase = createClient();
	const cols: Record<string, unknown> = { id: userId, updated_at: new Date().toISOString() };
	if (updates.nickname !== undefined) cols.nickname = updates.nickname;
	if (updates.description !== undefined) cols.description = updates.description;
	if (updates.avatarUrl !== undefined) cols.avatar_url = updates.avatarUrl;
	const { error } = await supabase.from('profiles').upsert(cols);
	if (error) throw error;
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
	const supabase = createClient();
	const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
	const path = `${userId}/avatar.${ext}`;
	const { error } = await supabase.storage
		.from('avatars')
		.upload(path, file, { upsert: true, contentType: file.type });
	if (error) throw error;
	const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
	return `${base}/storage/v1/object/public/avatars/${path}?t=${Date.now()}`;
}
```

- [ ] **Step 3: Gate — typecheck/lint/format**

Run: `npm run check`
Expected: PASS (no errors introduced by the two new files).

- [ ] **Step 4: Commit**

```bash
git add src/lib/profile/types.ts src/lib/profile/db/profiles.ts
git commit -m "feat: add profile type and supabase db helpers"
```

---

### Task 3: Sync-queue `profile-update` op

Wire profile text writes into the existing offline sync-queue.

**Files:**

- Modify: `src/lib/supabase/sync-queue.ts` (add op to `SyncOp` union + import type)
- Modify: `src/lib/supabase/useSyncQueue.ts` (add `executeOp` branch + import)

**Interfaces:**

- Consumes: `ProfileUpdate` from `@/lib/profile/types`; `upsertProfile` from `@/lib/profile/db/profiles`.
- Produces: `SyncOp` variant `{ type: 'profile-update'; payload: { userId: string; updates: ProfileUpdate } }` usable by `enqueue(...)` in later tasks.

- [ ] **Step 1: Add the op to the `SyncOp` union in `src/lib/supabase/sync-queue.ts`**

Add this import near the top (with the other type imports at lines 1-2):

```ts
import type { ProfileUpdate } from '@/lib/profile/types';
```

Add this variant to the `SyncOp` union (e.g. after the `deck-move` variant, before the closing `;` of the union — keep the same shape as the other variants):

```ts
	| {
			id: string;
			type: 'profile-update';
			payload: { userId: string; updates: ProfileUpdate };
			retries: number;
			createdAt: string;
	  }
```

- [ ] **Step 2: Add the dispatch branch in `src/lib/supabase/useSyncQueue.ts`**

Add the import alongside the other db imports (near lines 4-21):

```ts
import { upsertProfile } from '@/lib/profile/db/profiles';
```

In `executeOp`, add a branch before the final `else` (which currently handles `update`):

```ts
	} else if (op.type === 'profile-update') {
		await upsertProfile(op.payload.userId, op.payload.updates);
	} else {
```

(i.e. insert the `profile-update` branch, keeping the existing `else { await updateEntry(... ) }` as the final fallback for the `update` op.)

- [ ] **Step 3: Gate**

Run: `npm run check`
Expected: PASS. TypeScript's exhaustiveness over the union stays satisfied because `update` remains the fallback `else`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/sync-queue.ts src/lib/supabase/useSyncQueue.ts
git commit -m "feat: add profile-update sync-queue op"
```

---

### Task 4: Profile store + context

Zustand store holding the current user's profile and a context that hydrates on auth change and exposes `updateProfile`.

**Files:**

- Create: `src/lib/profile/store/profile-store.ts`
- Create: `src/lib/profile/context/ProfileContext.tsx`

**Interfaces:**

- Consumes: `fetchProfile` from `@/lib/profile/db/profiles`; `useAuth` from `@/lib/supabase/contexts/AuthContext`; `useSyncQueueContext` from `@/lib/supabase/contexts/SyncQueueContext` (provides `triggerSync`); `enqueue` from `@/lib/supabase/sync-queue`; `Profile`, `ProfileUpdate` types.
- Produces: `useProfileContext(): { profile: Profile | null; isLoading: boolean; updateProfile: (patch: ProfileUpdate) => void }`; `ProfileProvider`.

> Model these on `src/lib/deck/store/deck-store.ts` (create store) and `src/lib/deck/context/DeckContext.tsx` (hydrate on `useAuth()` user change, expose actions that optimistically mutate the store then `enqueue` + `triggerSync`). First open both files to match their exact idioms (how `create<...>()` is called, how the provider reads `useSyncQueueContext`).

- [ ] **Step 1: Write `src/lib/profile/store/profile-store.ts`**

```ts
import { create } from 'zustand';
import type { Profile, ProfileUpdate } from '@/lib/profile/types';
import { fetchProfile } from '@/lib/profile/db/profiles';

type ProfileState = {
	profile: Profile | null;
	isLoading: boolean;
};

type ProfileActions = {
	hydrateProfile: (userId: string) => Promise<void>;
	applyProfileUpdate: (patch: ProfileUpdate) => void;
	reset: () => void;
};

export const useProfileStore = create<ProfileState & ProfileActions>()((set, get) => ({
	profile: null,
	isLoading: false,
	hydrateProfile: async (userId) => {
		set({ isLoading: true });
		try {
			const profile = await fetchProfile(userId);
			set({
				profile: profile ?? {
					id: userId,
					nickname: null,
					description: null,
					avatarUrl: null,
					createdAt: '',
					updatedAt: '',
				},
				isLoading: false,
			});
		} catch {
			set({ isLoading: false });
		}
	},
	applyProfileUpdate: (patch) => {
		const current = get().profile;
		if (!current) return;
		set({ profile: { ...current, ...patch } });
	},
	reset: () => set({ profile: null, isLoading: false }),
}));
```

- [ ] **Step 2: Write `src/lib/profile/context/ProfileContext.tsx`**

Match `DeckContext.tsx`'s structure (open it first). The hydrate-on-user-change effect and the `updateProfile` action:

```tsx
'use client';

import { createContext, useContext, useEffect } from 'react';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useSyncQueueContext } from '@/lib/supabase/contexts/SyncQueueContext';
import { enqueue } from '@/lib/supabase/sync-queue';
import { useProfileStore } from '@/lib/profile/store/profile-store';
import type { Profile, ProfileUpdate } from '@/lib/profile/types';

type ProfileContextValue = {
	profile: Profile | null;
	isLoading: boolean;
	updateProfile: (patch: ProfileUpdate) => void;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
	const { user } = useAuth();
	const { triggerSync } = useSyncQueueContext();
	const profile = useProfileStore((s) => s.profile);
	const isLoading = useProfileStore((s) => s.isLoading);
	const hydrateProfile = useProfileStore((s) => s.hydrateProfile);
	const applyProfileUpdate = useProfileStore((s) => s.applyProfileUpdate);
	const reset = useProfileStore((s) => s.reset);

	useEffect(() => {
		if (user) {
			void hydrateProfile(user.id);
		} else {
			reset();
		}
	}, [user, hydrateProfile, reset]);

	function updateProfile(patch: ProfileUpdate) {
		if (!user) return;
		applyProfileUpdate(patch);
		enqueue({ type: 'profile-update', payload: { userId: user.id, updates: patch } });
		triggerSync();
	}

	return <ProfileContext value={{ profile, isLoading, updateProfile }}>{children}</ProfileContext>;
}

export function useProfileContext(): ProfileContextValue {
	const ctx = useContext(ProfileContext);
	if (!ctx) throw new Error('useProfileContext must be used within a ProfileProvider');
	return ctx;
}
```

> Note: confirm against `DeckContext.tsx` whether this project uses the React 19 `<Context value=...>` shorthand (AuthContext.tsx line 56 does) or `<Context.Provider>`. Match whichever the codebase uses.

- [ ] **Step 3: Gate**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/profile/store/profile-store.ts src/lib/profile/context/ProfileContext.tsx
git commit -m "feat: add profile store and context"
```

---

### Task 5: Mount ProfileProvider

Add the provider to the tree so the navbar and pages can read it.

**Files:**

- Modify: `src/contexts/Providers.tsx`

**Interfaces:**

- Consumes: `ProfileProvider` from `@/lib/profile/context/ProfileContext`.

- [ ] **Step 1: Add the import and wrap in `src/contexts/Providers.tsx`**

Add import:

```tsx
import { ProfileProvider } from '@/lib/profile/context/ProfileContext';
```

Place `<ProfileProvider>` **inside** `<SyncQueueRunner>` (it needs `SyncQueueContext` for `triggerSync`) and wrapping the existing children — e.g. as the outermost provider under `SyncQueueRunner`, just before `<CollectionProvider>`:

```tsx
<AuthProvider>
	<SyncQueueRunner>
		<ProfileProvider>
			<CollectionProvider>{/* …unchanged existing providers… */}</CollectionProvider>
		</ProfileProvider>
	</SyncQueueRunner>
</AuthProvider>
```

(Keep every existing provider and its nesting order; only insert `ProfileProvider` as shown.)

- [ ] **Step 2: Gate + runtime smoke**

Run: `npm run check`
Expected: PASS.
Then run `npm run dev`, load any page while logged in, and confirm no console error about `ProfileProvider`/`SyncQueueContext` and the app renders normally.

- [ ] **Step 3: Commit**

```bash
git add src/contexts/Providers.tsx
git commit -m "feat: mount ProfileProvider in the provider tree"
```

---

### Task 6: Navbar shows avatar + nickname

Replace the raw email with avatar + nickname (fallback to email for the logged-in owner only) linking to `/profile`.

**Files:**

- Modify: `src/components/Navbar/Navbar.tsx`
- Modify: `src/components/Navbar/NavbarDrawer.tsx`
- Modify: `src/components/Navbar/Navbar.module.css` (add avatar/link styles)

**Interfaces:**

- Consumes: `useProfileContext` from `@/lib/profile/context/ProfileContext`.

> The navbar shows the **logged-in user's own** profile, so falling back to `user.email` here is correct (it is their own email, not another user's).

- [ ] **Step 1: Update `src/components/Navbar/Navbar.tsx`**

Add import:

```tsx
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
```

Read the profile in the component body (near the other hooks around line 22-26):

```tsx
const { profile } = useProfileContext();
```

Replace the authenticated `<span className={styles.userEmail}>{user.email}</span>` (line 93) with a link to `/profile` showing avatar + nickname:

```tsx
<Link href="/profile" className={styles.profileLink}>
	{profile?.avatarUrl ? (
		// eslint-disable-next-line @next/next/no-img-element -- external Supabase storage URL, no next/image loader configured for it
		<img src={profile.avatarUrl} alt="" className={styles.avatar} />
	) : (
		<span className={styles.avatarFallback}>
			{(profile?.nickname || user.email || '?').charAt(0).toUpperCase()}
		</span>
	)}
	<span className={styles.userName}>{profile?.nickname || user.email}</span>
</Link>
```

Keep the existing Log out button and `handleSignOut` unchanged.

- [ ] **Step 2: Update `src/components/Navbar/NavbarDrawer.tsx`**

Apply the same change to the mobile drawer: import `useProfileContext`, read `profile`, and replace the `{user.email}` display (around line 110) with the same avatar + nickname link to `/profile` (reuse the same class names). Keep the drawer's existing structure/close-on-navigate behavior.

- [ ] **Step 3: Add styles to `src/components/Navbar/Navbar.module.css`**

Add classes using existing design tokens (open the file first to match spacing conventions):

```css
.profileLink {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	color: var(--text-base);
	text-decoration: none;
}
.avatar,
.avatarFallback {
	width: 28px;
	height: 28px;
	border-radius: 50%;
	object-fit: cover;
	flex-shrink: 0;
}
.avatarFallback {
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--border);
	color: var(--text-muted);
	font-size: 0.85rem;
}
.userName {
	font-size: 0.9rem;
}
```

If the drawer uses a separate CSS module, add equivalent classes there or reuse these via shared className props.

- [ ] **Step 4: Gate + runtime**

Run: `npm run check`
Expected: PASS.
Then `npm run dev`, log in, and confirm the navbar shows the avatar fallback (initial) + email (since nickname is null before Task 7/8) and links to `/profile`. Check the mobile drawer too.

- [ ] **Step 5: Commit**

```bash
git add src/components/Navbar/Navbar.tsx src/components/Navbar/NavbarDrawer.tsx src/components/Navbar/Navbar.module.css
git commit -m "feat: show avatar and nickname in navbar"
```

---

### Task 7: Profile page (view + edit) and `/profile` shortcut

The `isOwner`-split page at `/users/[userId]`, the edit modal, the public read hook, and the `/profile` redirect.

**Files:**

- Create: `src/app/users/[userId]/useProfile.ts` (public read hook)
- Create: `src/app/users/[userId]/components/ProfileView.tsx` + `ProfileView.module.css`
- Create: `src/app/users/[userId]/components/ProfileEditModal.tsx` + `ProfileEditModal.module.css`
- Create: `src/app/users/[userId]/page.tsx`
- Create: `src/app/profile/page.tsx`

**Interfaces:**

- Consumes: `useParams` (`next/navigation`), `useAuth`, `useProfileContext`, `fetchProfile`, `uploadAvatar`, `Modal`, `Button`, `getCurrentUser` (`@/lib/supabase/auth/auth-server`), `redirect` (`next/navigation`).

> Open these reference files first: `src/app/users/[userId]/decks/page.tsx` (isOwner split + `useParams`), `src/app/users/[userId]/decks/usePublicDecks.ts` (read-hook shape), `src/app/decks/page.tsx` (server redirect), `src/app/decks/components/CreateDeckModal/CreateDeckModal.tsx` + `.module.css` (form + input styling), `src/components/Modal/Modal.tsx`, `src/components/Button/Button.tsx`.

- [ ] **Step 1: Write `src/app/users/[userId]/useProfile.ts`**

```ts
'use client';

import { useEffect, useState } from 'react';
import type { Profile } from '@/lib/profile/types';
import { fetchProfile } from '@/lib/profile/db/profiles';

export function useProfile(userId: string): { profile: Profile | null; isLoading: boolean } {
	const [profile, setProfile] = useState<Profile | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setIsLoading(true);
			try {
				const p = await fetchProfile(userId);
				if (!cancelled) setProfile(p);
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		}
		void load();
		return () => {
			cancelled = true;
		};
	}, [userId]);

	return { profile, isLoading };
}
```

- [ ] **Step 2: Write `src/app/users/[userId]/components/ProfileView.tsx` (+ `.module.css`)**

Presentational: avatar (or initial fallback), nickname (fallback to a generic label — **never** an email for non-owners), description, and links to that user's Decks/Collection. Accepts an optional `onEdit` to render an Edit button.

```tsx
'use client';

import Link from 'next/link';
import type { Profile } from '@/lib/profile/types';
import { Button } from '@/components/Button/Button';
import styles from './ProfileView.module.css';

export function ProfileView({
	userId,
	profile,
	onEdit,
}: {
	userId: string;
	profile: Profile | null;
	onEdit?: () => void;
}) {
	const displayName = profile?.nickname || 'Wizard';
	return (
		<div className={styles.container}>
			<div className={styles.header}>
				{profile?.avatarUrl ? (
					// eslint-disable-next-line @next/next/no-img-element -- external Supabase storage URL
					<img src={profile.avatarUrl} alt="" className={styles.avatar} />
				) : (
					<span className={styles.avatarFallback}>{displayName.charAt(0).toUpperCase()}</span>
				)}
				<div className={styles.headerText}>
					<h1 className={styles.name}>{displayName}</h1>
					{onEdit && (
						<Button variant="secondary" size="sm" onClick={onEdit}>
							Edit profile
						</Button>
					)}
				</div>
			</div>
			{profile?.description && <p className={styles.description}>{profile.description}</p>}
			<div className={styles.links}>
				<Link href={`/users/${userId}/decks`} className={styles.link}>
					Decks
				</Link>
				<Link href={`/users/${userId}/collection`} className={styles.link}>
					Collection
				</Link>
			</div>
		</div>
	);
}
```

`ProfileView.module.css`: use tokens; give `.avatar`/`.avatarFallback` a larger size (e.g. 96px, `border-radius:50%`), `.name` uses `--text-xl`, `.description` uses `--text-muted`. Keep `.container` centered with a max-width consistent with other pages (check `users/[userId]/decks` page CSS for the convention).

- [ ] **Step 3: Write `src/app/users/[userId]/components/ProfileEditModal.tsx` (+ `.module.css`)**

Native `<form>` + `useState`; copy input/label/textarea styling from `CreateDeckModal.module.css`. On submit: upload avatar file first (if chosen), then `updateProfile`.

```tsx
'use client';

import { useState } from 'react';
import { Modal } from '@/components/Modal/Modal';
import { Button } from '@/components/Button/Button';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { uploadAvatar } from '@/lib/profile/db/profiles';
import styles from './ProfileEditModal.module.css';

export function ProfileEditModal({ onClose }: { onClose: () => void }) {
	const { user } = useAuth();
	const { profile, updateProfile } = useProfileContext();
	const [nickname, setNickname] = useState(profile?.nickname ?? '');
	const [description, setDescription] = useState(profile?.description ?? '');
	const [file, setFile] = useState<File | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!user) return;
		setIsSaving(true);
		setError(null);
		try {
			let avatarUrl: string | undefined;
			if (file) avatarUrl = await uploadAvatar(user.id, file);
			updateProfile({
				nickname: nickname.trim() || null,
				description: description.trim() || null,
				...(avatarUrl !== undefined ? { avatarUrl } : {}),
			});
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to save profile');
			setIsSaving(false);
		}
	}

	return (
		<Modal onClose={onClose}>
			<form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
				<h2 className={styles.title}>Edit profile</h2>
				<label className={styles.label}>
					Nickname
					<input
						className={styles.input}
						value={nickname}
						onChange={(e) => setNickname(e.target.value)}
						maxLength={50}
					/>
				</label>
				<label className={styles.label}>
					Description
					<textarea
						className={styles.textarea}
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						rows={4}
						maxLength={500}
					/>
				</label>
				<label className={styles.label}>
					Avatar
					<input
						type="file"
						accept="image/*"
						onChange={(e) => setFile(e.target.files?.[0] ?? null)}
					/>
				</label>
				{error && <p className={styles.error}>{error}</p>}
				<div className={styles.actions}>
					<Button type="button" variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button type="submit" variant="primary" isLoading={isSaving}>
						Save
					</Button>
				</div>
			</form>
		</Modal>
	);
}
```

`ProfileEditModal.module.css`: copy `.label`, `.input`, `.textarea`, focus `border-color: var(--primary)` from `CreateDeckModal.module.css`; add `.form` (column flex, gap), `.title`, `.actions` (row, right-aligned), `.error` (`color: var(--danger)` or red token).

> Verify `Button` accepts `type` and `isLoading` props (Button.tsx does per exploration). If `type` isn't forwarded, add `type="button"`/`"submit"` via the native button inside, or extend Button — but first confirm by reading Button.tsx.

- [ ] **Step 4: Write `src/app/users/[userId]/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { useProfile } from './useProfile';
import { ProfileView } from './components/ProfileView';
import { ProfileEditModal } from './components/ProfileEditModal';

export default function ProfilePage() {
	const params = useParams();
	const userId = params.userId as string;
	const { user } = useAuth();
	const isOwner = !!user && user.id === userId;
	const [editing, setEditing] = useState(false);

	const ownerCtx = useProfileContext();
	const visitor = useProfile(userId);
	const profile = isOwner ? ownerCtx.profile : visitor.profile;

	return (
		<>
			<ProfileView
				userId={userId}
				profile={profile}
				onEdit={isOwner ? () => setEditing(true) : undefined}
			/>
			{editing && <ProfileEditModal onClose={() => setEditing(false)} />}
		</>
	);
}
```

> Note: `useProfile(userId)` runs for the owner too but its result is unused when `isOwner` — acceptable (a redundant read). If you prefer to avoid it, guard the hook is not possible (hooks can't be conditional); leaving it is the clean choice.

- [ ] **Step 5: Write `src/app/profile/page.tsx` (server redirect)**

Mirror `src/app/decks/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase/auth/auth-server';

export default async function ProfileRedirectPage() {
	const user = await getCurrentUser();
	if (!user) redirect('/auth/login');
	redirect(`/users/${user.id}`);
}
```

- [ ] **Step 6: Gate**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/users/[userId]/useProfile.ts src/app/users/[userId]/components src/app/users/[userId]/page.tsx src/app/profile/page.tsx
git commit -m "feat: add profile page, edit modal, and /profile redirect"
```

---

### Task 8: End-to-end verification

Drive the whole feature against local Supabase. No code unless a check fails (then fix + re-verify).

**Files:** none (verification only).

- [ ] **Step 1: Fresh environment**

Ensure local Supabase is up (`npm run sb:start`), migrations applied (`npm run sb:migrate` or a prior `sb:reset`). Start the app: `npm run dev`.

- [ ] **Step 2: Trigger creates a profile on signup**

Sign up / log in a new user via the email OTP flow (`npm run sb:mail` for the Inbucket inbox). In Studio (`npm run sb:studio`), confirm a `public.profiles` row was auto-created for the new user id.

- [ ] **Step 3: Owner edit flow**

Navigate to `/profile` → confirm redirect to `/users/<me>`. Click **Edit profile**, set a nickname + description, choose an image file, Save. Confirm: modal closes, `ProfileView` shows the new values immediately (optimistic), and the navbar updates to the nickname + avatar. In Studio, confirm the `profiles` row updated (sync-queue drained) and the file exists in the `avatars` bucket under `<userId>/avatar.*`.

- [ ] **Step 4: Persistence across reload**

Reload the page. Confirm nickname/description/avatar persist (came from DB, not just optimistic state).

- [ ] **Step 5: Visitor view + no email leak**

Open `/users/<other-user-id>` in a logged-out/incognito session (or as a different user). Confirm the profile renders read-only, there is **no** Edit button, and no email is shown for that user (nickname or the generic "Wizard" fallback only).

- [ ] **Step 6: RLS negative check**

In Studio SQL editor (or via a second user's session), attempt `update public.profiles set nickname='x' where id='<other-user-id>'` as a non-owner authenticated context. Confirm it affects 0 rows / is rejected by RLS.

- [ ] **Step 7: Final gate**

Run: `npm run check`
Expected: PASS. If everything above holds, the feature is complete.

## Self-Review notes

- **Spec coverage:** DB table/RLS/trigger/backfill + avatars bucket (Task 1) ✓; domain type/db/upload (Task 2) ✓; sync-queue op (Task 3) ✓; store+context (Task 4); provider mount (Task 5); navbar (Task 6); public/editable page + edit modal + `/profile` shortcut (Task 7) ✓; all verification steps from the spec (Task 8) ✓.
- **Avatar-not-queued** caveat is honored: `uploadAvatar` is awaited directly in the modal (Task 7 Step 3); only the URL string is passed to `updateProfile` → queue.
- **Email-leak** guard is enforced in `ProfileView` (generic "Wizard" fallback, Task 7 Step 2) and re-checked in Task 8 Step 5. Navbar's email fallback (Task 6) is the owner's own email — allowed.
- **Type consistency:** `Profile`/`ProfileUpdate` (Task 2) are the only field-name source; `avatarUrl`↔`avatar_url` mapping lives only in `db/profiles.ts`. `updateProfile(patch: ProfileUpdate)` name matches across Tasks 4/6/7.
- **Open-before-write reminders** are placed on Tasks 4 and 7 because those must match subtle project idioms (React 19 context shorthand, Button props, page CSS conventions) that vary by file.
