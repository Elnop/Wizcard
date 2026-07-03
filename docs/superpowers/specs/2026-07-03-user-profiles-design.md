# User Profiles — Design

**Date:** 2026-07-03
**Status:** Approved, ready for implementation plan

## Context

Today a Wizcard user is represented only by `auth.users`. There is **no `profiles` table** and the only user-identifying info shown anywhere is the raw **email** in the navbar (`Navbar.tsx`, `NavbarDrawer.tsx`). The public sharing pages under `/users/[userId]/{decks,collection}` identify the owner only by the UUID in the URL — no name, no avatar.

This feature adds a real user profile: a `profiles` table (nickname, description, avatar), a public profile page that the owner can edit inline, avatar uploads to Supabase Storage, and replaces the raw email in the navbar with the user's nickname + avatar.

**Intended outcome:** users have an identity (picture, nickname, bio) that shows in the navbar and on a shareable public profile page, following the app's existing owner/visitor (`isOwner`) and offline-sync conventions.

## Existing patterns to reuse (do not reinvent)

- Current user, client: `useAuth()` — `src/lib/supabase/contexts/AuthContext.tsx`
- Current user, server: `getCurrentUser()` — `src/lib/supabase/auth/auth-server.ts`
- Route redirect + `isOwner` split: `src/app/decks/page.tsx`, `src/app/users/[userId]/decks/page.tsx`
- Owner-parameterized read hook (public RLS): `src/app/users/[userId]/decks/usePublicDecks.ts`
- Domain store + context that hydrates on user change: `src/lib/deck/store/deck-store.ts`, `src/lib/deck/context/DeckContext.tsx`
- Sync-queue op union + enqueue: `src/lib/supabase/sync-queue.ts`; dispatcher `executeOp` in `src/lib/supabase/useSyncQueue.ts`
- Row↔model camelCase↔snake_case mapping + DB helper: `updateDeckMeta` in `src/lib/deck/db/decks.ts`
- Storage upload + public URL: `scripts/ingest/image-pipeline.ts`, `src/lib/mpc/db/custom-cards.ts`
- Public-read RLS + owner-write reference: `supabase/migrations/20260616000000_public_read_sharing.sql`
- Storage bucket + policy reference: `supabase/migrations/20260601000002_create_custom_cards_bucket.sql`
- Modal / Button / input styling: `src/components/Modal/Modal.tsx`, `src/components/Button/Button.tsx`, `src/app/decks/components/CreateDeckModal/CreateDeckModal.tsx` (+ its `.module.css`)
- Providers tree: `src/contexts/Providers.tsx`

Conventions: CSS Modules with design tokens (`--primary`, `--border`, `--text-muted`…), no i18n library (hardcode **English** literals inline), plain `useState` + native `<form>` (no form library).

## 1. Database

### New migration `supabase/migrations/<timestamp>_create_profiles.sql`

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

-- Public read (mirrors public_read_sharing.sql); owner-only writes.
create policy "Public can view profiles"
  on public.profiles for select
  to anon, authenticated using (true);

create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create a profile row on signup (standard Supabase trigger).
create function public.handle_new_user()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

**Existing users:** the trigger only covers new signups. Add a backfill in the same migration:
`insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;`

### New migration `supabase/migrations/<timestamp>_create_avatars_bucket.sql`

Mirrors the custom-cards bucket but with a **user-scoped write policy** (custom-cards is service-role-only; avatars must be user-writable):

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

Avatar object path convention: `${userId}/avatar.<ext>` so `foldername(name)[1] = userId`.

### Mirror into `supabase/bootstrap/init_schema.sql`

Add the `profiles` table, its RLS policies, the trigger/function, and the bucket + storage policies to the from-scratch schema so `npm run sb:reset` produces the same state.

## 2. Domain layer — `src/lib/profile/`

- **`types.ts`** — `export type Profile = { id: string; nickname: string | null; description: string | null; avatarUrl: string | null; createdAt: string; updatedAt: string };`
- **`db/profiles.ts`**:
  - `fetchProfile(userId: string): Promise<Profile | null>` — owner-parameterized select (relies on public SELECT policy, same as `usePublicDecks` loaders). Maps row → `Profile` (`avatar_url` → `avatarUrl`, etc.). Returns `null` if no row.
  - `upsertProfile(userId, updates: Partial<Pick<Profile,'nickname'|'description'|'avatarUrl'>>)` — maps camelCase → snake_case (mirror `updateDeckMeta`), sets `updated_at = now()`, `supabase.from('profiles').upsert({ id: userId, ...cols })`.
  - `uploadAvatar(userId, file: File): Promise<string>` — `createClient().storage.from('avatars').upload(\`${userId}/avatar.${ext}\`, file, { upsert: true, contentType: file.type })`, then build/return the public URL (`getPublicUrl`or manual`${supabaseUrl}/storage/v1/object/public/avatars/${path}`as in`custom-cards.ts`). Append a cache-busting `?t=${Date.now()}` since the path is stable across re-uploads.

## 3. Persistence via sync-queue

- **`sync-queue.ts`** — add to the `SyncOp` union:
  ```ts
  | { id: string; type: 'profile-update';
      payload: { userId: string; updates: Partial<Pick<Profile,'nickname'|'description'|'avatarUrl'>> };
      retries: number; createdAt: string }
  ```
- **`useSyncQueue.ts`** — import `upsertProfile`; add a branch in `executeOp`:
  `else if (op.type === 'profile-update') { await upsertProfile(op.payload.userId, op.payload.updates); }`
- **Avatar files are NOT queued.** A binary `File` can't live in the localStorage queue. `uploadAvatar` runs directly (awaited) in the edit-modal submit; only the resulting `avatarUrl` **string** flows through the queue alongside nickname/description. If the upload fails, surface the error and don't enqueue.
- **`store/profile-store.ts`** (Zustand, mirror `deck-store.ts`): holds `{ profile: Profile | null; isLoading }`, action `hydrateProfile(userId)` → `fetchProfile`, action `applyProfileUpdate(patch)` (optimistic in-memory merge).
- **`context/ProfileContext.tsx`** (mirror `DeckContext.tsx`): on `useAuth()` user change calls `hydrateProfile(user.id)`; exposes `{ profile, isLoading, updateProfile(patch) }` where `updateProfile` optimistically calls `applyProfileUpdate`, then `enqueue({ type: 'profile-update', payload: { userId, updates: patch } })` + `triggerSync()`.
- **`Providers.tsx`** — add `<ProfileProvider>` under `SyncQueueRunner` (needs auth + sync context), e.g. just inside `SyncQueueRunner`, wrapping the rest.

## 4. UI

### Public/editable profile page — `src/app/users/[userId]/page.tsx` (client)

Currently missing (only `decks/` and `collection/` subroutes exist under `[userId]`). Follow the `isOwner` pattern from `users/[userId]/decks/page.tsx`:

- Read `useParams().userId` and `useAuth()`; `const isOwner = !!user && user.id === userId`.
- For a **visitor**, fetch the target profile with a small read hook `useProfile(userId)` (mirror `usePublicDecks`: `useState` + `useEffect` calling `fetchProfile`). For the **owner**, prefer the profile already in `ProfileContext`.
- Render `ProfileView` (new component in `src/app/users/[userId]/components/`): avatar (fallback to a default/initials when `avatarUrl` is null), nickname (fallback to a generic label — do **not** expose the email of another user to visitors), description, and links to that user's Decks (`/users/${userId}/decks`) and Collection (`/users/${userId}/collection`).
- If `isOwner`, show an **Edit** button opening `ProfileEditModal`.

### Edit modal — `ProfileEditModal` (new, under the page's `components/`)

- Reuse `<Modal>` + `<Button>`; native `<form>` + `useState` per field (nickname, description) copying `CreateDeckModal.module.css` input/textarea/label styling.
- Avatar: file `<input type="file" accept="image/*">` with a preview. On submit: if a new file was chosen, `await uploadAvatar(user.id, file)` first, then call `updateProfile({ nickname, description, avatarUrl })` (only the changed fields). Close on success.
- Validate/trim; show a spinner while uploading (Button `isLoading`); surface upload errors inline.

### Shortcut route — `src/app/profile/page.tsx` (server component)

Mirror `src/app/decks/page.tsx`: `const user = await getCurrentUser(); if (!user) redirect('/auth/login'); redirect(\`/users/${user.id}\`);`

### Navbar — `src/components/Navbar/Navbar.tsx` + `NavbarDrawer.tsx`

- Read `profile` from `ProfileContext`. Replace the `{user.email}` span with a link to `/profile` showing the avatar (small round `<img>`, fallback initials/default) + `profile?.nickname || user.email`.
- Keep the existing Log out button and sign-out flush behavior unchanged.

## Files touched (summary)

**New:**

- `supabase/migrations/<ts>_create_profiles.sql`, `supabase/migrations/<ts>_create_avatars_bucket.sql`
- `src/lib/profile/types.ts`, `src/lib/profile/db/profiles.ts`, `src/lib/profile/store/profile-store.ts`, `src/lib/profile/context/ProfileContext.tsx`
- `src/app/profile/page.tsx`
- `src/app/users/[userId]/page.tsx`, `src/app/users/[userId]/useProfile.ts`
- `src/app/users/[userId]/components/ProfileView.tsx` (+ `.module.css`), `ProfileEditModal.tsx` (+ `.module.css`)

**Modified:**

- `supabase/bootstrap/init_schema.sql` (mirror new schema)
- `src/lib/supabase/sync-queue.ts` (`profile-update` op)
- `src/lib/supabase/useSyncQueue.ts` (`executeOp` branch)
- `src/contexts/Providers.tsx` (`ProfileProvider`)
- `src/components/Navbar/Navbar.tsx`, `src/components/Navbar/NavbarDrawer.tsx`

## Verification

1. **Migrations apply cleanly:** `npm run sb:reset` (destructive, local) — confirms `init_schema.sql` mirror is valid — and `npm run sb:migrate` on the existing DB — confirms the incremental migrations apply. Verify in Studio (`npm run sb:studio`) that `profiles` exists, RLS is on, the `avatars` bucket exists, and existing users got backfilled profile rows.
2. **Trigger:** create a new user via the login flow and confirm a `profiles` row auto-appears.
3. **Edit flow (owner):** as a logged-in user, open `/profile` (redirects to `/users/<me>`), Edit → set nickname + description, upload an avatar. Confirm optimistic UI update, then reload to confirm it persisted (sync-queue drained). Confirm the avatar file landed in the `avatars` bucket under `<userId>/`.
4. **Navbar:** confirm the navbar now shows the avatar + nickname (falls back to email when nickname is null) on desktop and in the mobile drawer.
5. **Public view (visitor):** in a separate/anon session, open `/users/<other-id>` and confirm nickname/description/avatar render read-only, no Edit button, and the other user's email is **not** exposed.
6. **RLS negative check:** confirm an authenticated user cannot update another user's profile row (Supabase update against a foreign `id` is rejected).
7. `npm run check` passes (TypeScript + ESLint + Prettier).
