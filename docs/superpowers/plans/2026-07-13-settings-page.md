# Settings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/settings` page centralizing account management and user preferences, with preferences persisted as typed columns on `public.profiles`.

**Architecture:** Preferences (`language`, `price_currency`, `show_prices`, `theme_preference`, `is_public`) become typed columns on the existing `profiles` table. The UI reuses the existing profile pipeline: edits call `useProfileContext().updateProfile(patch)`, which optimistically updates the Zustand store and enqueues a `profile-update` sync op (handled by `upsertProfile`). Auto-save state is read from the existing sync-queue status. Account actions (email/password/delete) go through Supabase Auth; deletion needs a service-role API route. Profile editing (nickname/bio/avatar) migrates from the `/users/[id]` modal into `/settings`.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase (Postgres + Auth + Storage), Zustand, TypeScript.

## Global Constraints

- No test framework in this project — verify via `npm run check` + runtime + Supabase tooling (`sb:reset`, `sb:verify`, `sb:mail`). Do NOT add vitest/jest.
- UI copy is in French — match surrounding French copy.
- Preferences are **typed columns**, never jsonb.
- `language` is a **single global** preference (cards + future UI), values `'en' | 'fr'`, default `'fr'`.
- `theme_preference` is **stored only** in v1 — no CSS/visual effect. Real theming is a separate future spec.
- No i18n library is installed and none is added here.
- Profile writes flow through the existing sync-queue (`enqueue` + `triggerSync`), not direct DB writes from components.
- Migrations are idempotent (`if not exists` / `create or replace`) for the prod SQL-editor workflow.
- `npm run check` must pass before every commit.

---

### Task 1: DB migration — preference columns + RLS

**Files:**

- Create: `supabase/migrations/20260713120000_add_profile_preferences.sql`

**Interfaces:**

- Produces: columns `language`, `price_currency`, `show_prices`, `theme_preference`, `is_public` on `public.profiles`; the `profiles` SELECT policy is renamed/replaced to filter by visibility.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260713120000_add_profile_preferences.sql`:

```sql
-- Add typed preference columns to profiles (no jsonb). Each has a default so
-- existing rows backfill automatically. `is_public` gates profile visibility.

alter table public.profiles
  add column if not exists language text not null default 'fr',
  add column if not exists price_currency text not null default 'eur',
  add column if not exists show_prices boolean not null default true,
  add column if not exists theme_preference text not null default 'system',
  add column if not exists is_public boolean not null default true;

-- Value constraints (idempotent: drop-if-exists then add).
alter table public.profiles drop constraint if exists profiles_language_check;
alter table public.profiles
  add constraint profiles_language_check check (language in ('en', 'fr'));

alter table public.profiles drop constraint if exists profiles_price_currency_check;
alter table public.profiles
  add constraint profiles_price_currency_check check (price_currency in ('eur', 'usd'));

alter table public.profiles drop constraint if exists profiles_theme_preference_check;
alter table public.profiles
  add constraint profiles_theme_preference_check
  check (theme_preference in ('light', 'dark', 'system'));

-- Visibility-aware SELECT policy: owner always sees own row; others only if public.
drop policy if exists "Public can view profiles" on public.profiles;
drop policy if exists "Visible profiles are viewable" on public.profiles;
create policy "Visible profiles are viewable"
  on public.profiles for select
  to anon, authenticated
  using (is_public or auth.uid() = id);
```

- [ ] **Step 2: Apply the migration on a fresh DB**

Run: `npm run sb:reset`
Expected: completes without error; all migrations including `20260713120000_add_profile_preferences` apply.

- [ ] **Step 3: Verify columns and policy exist**

Run:

```bash
npm run sb:studio
```

In Studio SQL editor (or via psql), confirm:

```sql
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'profiles'
  and column_name in ('language','price_currency','show_prices','theme_preference','is_public');
```

Expected: 5 rows with the defaults above. Confirm policy `Visible profiles are viewable` exists on `profiles`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260713120000_add_profile_preferences.sql
git commit -m "feat(db): add profile preference columns + visibility RLS"
```

---

### Task 2: Extend Profile types and DB mapping

**Files:**

- Modify: `src/lib/profile/types.ts`
- Modify: `src/lib/profile/db/profiles.ts`
- Modify: `src/lib/profile/db/profile.server.ts:9-25`
- Modify: `src/lib/profile/store/profile-store.ts:27-34` (default profile shape)

**Interfaces:**

- Consumes: existing `Profile`, `ProfileUpdate`, `rowToProfile`, `upsertProfile`.
- Produces: `Profile` gains `language: 'en'|'fr'`, `priceCurrency: 'eur'|'usd'`, `showPrices: boolean`, `themePreference: 'light'|'dark'|'system'`, `isPublic: boolean`. `ProfileUpdate` covers all of them. `fetchProfile`/`fetchProfileByNickname`/`upsertProfile` round-trip the new columns.

- [ ] **Step 1: Extend the types**

In `src/lib/profile/types.ts`, replace the file contents:

```ts
export type Language = 'en' | 'fr';
export type PriceCurrency = 'eur' | 'usd';
export type ThemePreference = 'light' | 'dark' | 'system';

export type Profile = {
	id: string;
	nickname: string | null;
	description: string | null;
	avatarUrl: string | null;
	language: Language;
	priceCurrency: PriceCurrency;
	showPrices: boolean;
	themePreference: ThemePreference;
	isPublic: boolean;
	createdAt: string;
	updatedAt: string;
};

export type ProfileUpdate = Partial<
	Pick<
		Profile,
		| 'nickname'
		| 'description'
		| 'avatarUrl'
		| 'language'
		| 'priceCurrency'
		| 'showPrices'
		| 'themePreference'
		| 'isPublic'
	>
>;
```

- [ ] **Step 2: Update the client DB mapping**

In `src/lib/profile/db/profiles.ts`:

Extend `ProfileRow`:

```ts
type ProfileRow = {
	id: string;
	nickname: string | null;
	description: string | null;
	avatar_url: string | null;
	language: string;
	price_currency: string;
	show_prices: boolean;
	theme_preference: string;
	is_public: boolean;
	created_at: string;
	updated_at: string;
};
```

Extend `rowToProfile`:

```ts
function rowToProfile(row: ProfileRow): Profile {
	return {
		id: row.id,
		nickname: row.nickname,
		description: row.description,
		avatarUrl: row.avatar_url,
		language: (row.language as Profile['language']) ?? 'fr',
		priceCurrency: (row.price_currency as Profile['priceCurrency']) ?? 'eur',
		showPrices: row.show_prices ?? true,
		themePreference: (row.theme_preference as Profile['themePreference']) ?? 'system',
		isPublic: row.is_public ?? true,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}
```

Update BOTH select lists in `fetchProfile` and `fetchProfileByNickname` from
`'id, nickname, description, avatar_url, created_at, updated_at'` to:

```ts
'id, nickname, description, avatar_url, language, price_currency, show_prices, theme_preference, is_public, created_at, updated_at';
```

Extend `upsertProfile` to map the new fields:

```ts
export async function upsertProfile(userId: string, updates: ProfileUpdate): Promise<void> {
	const supabase = createClient();
	const cols: Record<string, unknown> = { id: userId, updated_at: new Date().toISOString() };
	if (updates.nickname !== undefined) cols.nickname = updates.nickname;
	if (updates.description !== undefined) cols.description = updates.description;
	if (updates.avatarUrl !== undefined) cols.avatar_url = updates.avatarUrl;
	if (updates.language !== undefined) cols.language = updates.language;
	if (updates.priceCurrency !== undefined) cols.price_currency = updates.priceCurrency;
	if (updates.showPrices !== undefined) cols.show_prices = updates.showPrices;
	if (updates.themePreference !== undefined) cols.theme_preference = updates.themePreference;
	if (updates.isPublic !== undefined) cols.is_public = updates.isPublic;
	const { error } = await supabase.from('profiles').upsert(cols);
	if (error) throw error;
}
```

Add the `Language`, `PriceCurrency`, `ThemePreference` imports if TS needs them (they are referenced only via `Profile[...]` here, so the existing `Profile`/`ProfileUpdate` import suffices).

- [ ] **Step 3: Update the server mapping**

In `src/lib/profile/db/profile.server.ts`, update the select list to include the new columns (same string as Step 2) and extend the returned object:

```ts
const { data, error } = await supabase
	.from('profiles')
	.select(
		'id, nickname, description, avatar_url, language, price_currency, show_prices, theme_preference, is_public, created_at, updated_at'
	)
	.eq('nickname', nickname)
	.maybeSingle();
if (error || !data) return null;
return {
	id: data.id as string,
	nickname: (data.nickname ?? null) as string | null,
	description: (data.description ?? null) as string | null,
	avatarUrl: (data.avatar_url ?? null) as string | null,
	language: ((data.language as string) ?? 'fr') as Profile['language'],
	priceCurrency: ((data.price_currency as string) ?? 'eur') as Profile['priceCurrency'],
	showPrices: (data.show_prices as boolean) ?? true,
	themePreference: ((data.theme_preference as string) ?? 'system') as Profile['themePreference'],
	isPublic: (data.is_public as boolean) ?? true,
	createdAt: data.created_at as string,
	updatedAt: data.updated_at as string,
};
```

- [ ] **Step 4: Update the store's fallback profile shape**

In `src/lib/profile/store/profile-store.ts`, the `hydrateProfile` fallback object (the `profile ?? { ... }`) must satisfy the extended `Profile` type:

```ts
				profile: profile ?? {
					id: userId,
					nickname: null,
					description: null,
					avatarUrl: null,
					language: 'fr',
					priceCurrency: 'eur',
					showPrices: true,
					themePreference: 'system',
					isPublic: true,
					createdAt: '',
					updatedAt: '',
				},
```

- [ ] **Step 5: Verify typecheck/lint passes**

Run: `npm run check`
Expected: PASS (no TS errors from the new fields; the sync-queue handler and ProfileContext already pass `ProfileUpdate` through generically).

- [ ] **Step 6: Commit**

```bash
git add src/lib/profile/types.ts src/lib/profile/db/profiles.ts src/lib/profile/db/profile.server.ts src/lib/profile/store/profile-store.ts
git commit -m "feat(profile): map preference columns through types and DB layer"
```

---

### Task 3: Settings route shell + auth guard

**Files:**

- Create: `src/app/settings/page.tsx`
- Create: `src/app/settings/SettingsView.tsx`
- Create: `src/app/settings/SettingsView.module.css`

**Interfaces:**

- Consumes: `getCurrentUser` from `@/lib/supabase/auth/auth-server`, `useProfileContext`.
- Produces: `/settings` route rendering section placeholders; `SettingsView` client component that reads `useProfileContext()` and renders section children (added in later tasks).

- [ ] **Step 1: Create the server page with auth guard**

Create `src/app/settings/page.tsx` (mirror `src/app/profile/page.tsx`'s guard style):

```tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase/auth/auth-server';
import SettingsView from './SettingsView';

export const metadata: Metadata = {
	title: 'Paramètres',
	robots: { index: false, follow: false },
};

export default async function SettingsPage() {
	const user = await getCurrentUser();
	if (!user) redirect('/auth/login');
	return <SettingsView />;
}
```

- [ ] **Step 2: Create the client view shell**

Create `src/app/settings/SettingsView.tsx`:

```tsx
'use client';

import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { Spinner } from '@/components/Spinner/Spinner';
import styles from './SettingsView.module.css';

export default function SettingsView() {
	const { profile, isLoading } = useProfileContext();

	if (isLoading || !profile) {
		return (
			<div className={styles.loading}>
				<Spinner />
			</div>
		);
	}

	return (
		<main className={styles.page}>
			<h1 className={styles.title}>Paramètres</h1>
			{/* Sections added in later tasks */}
		</main>
	);
}
```

- [ ] **Step 3: Create the stylesheet**

Create `src/app/settings/SettingsView.module.css`:

```css
.page {
	max-width: 720px;
	margin: 0 auto;
	padding: 2rem 1rem 4rem;
	display: flex;
	flex-direction: column;
	gap: 2rem;
}

.title {
	font-size: 1.75rem;
	font-weight: 700;
}

.loading {
	display: flex;
	justify-content: center;
	padding: 4rem;
}
```

- [ ] **Step 4: Verify the route renders**

Run: `npm run dev`, visit `http://localhost:3000/settings` while logged in.
Expected: "Paramètres" heading renders; logged-out visit redirects to `/auth/login`.

- [ ] **Step 5: Verify check passes and commit**

Run: `npm run check`
Expected: PASS

```bash
git add src/app/settings/
git commit -m "feat(settings): add /settings route shell with auth guard"
```

---

### Task 4: Shared SettingsSection + save-status hook

**Files:**

- Create: `src/app/settings/components/SettingsSection.tsx`
- Create: `src/app/settings/components/SettingsSection.module.css`
- Create: `src/app/settings/useSaveStatus.ts`

**Interfaces:**

- Consumes: `useSyncQueueContext` (for sync status), `SyncStatus` type from `@/lib/supabase/useSyncQueue`.
- Produces:
  - `<SettingsSection title status?>` — a titled card wrapper with an optional status badge.
  - `useSaveStatus()` → `{ status: 'idle'|'saving'|'saved'|'error'; markSaving: () => void }`. Derives display state from the sync queue: calling `markSaving()` sets a local "saving" flag; when the queue returns to `idle` it flips to `saved` for ~2s then `idle`; queue `error` maps to `error`.

- [ ] **Step 1: Inspect the sync-queue context shape**

Run: `grep -n "SyncStatus\|useSyncQueueContext\|status" src/lib/supabase/contexts/SyncQueueContext.tsx`
Expected: confirms the context exposes a `status: SyncStatus` (and `triggerSync`). Use the actual exported names in the hook below; if the field is named differently, adapt.

- [ ] **Step 2: Write the save-status hook**

Create `src/app/settings/useSaveStatus.ts`:

```ts
'use client';

import { useEffect, useRef, useState } from 'react';
import { useSyncQueueContext } from '@/lib/supabase/contexts/SyncQueueContext';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Per-section save indicator derived from the shared sync queue. A field change
 * calls markSaving(); we then watch the queue status: 'error' -> error, and the
 * transition back to 'idle' after a save -> a brief 'saved' pulse.
 */
export function useSaveStatus(): { status: SaveStatus; markSaving: () => void } {
	const { status: queueStatus } = useSyncQueueContext();
	const [status, setStatus] = useState<SaveStatus>('idle');
	const pendingRef = useRef(false);

	const markSaving = () => {
		pendingRef.current = true;
		setStatus('saving');
	};

	useEffect(() => {
		if (queueStatus === 'error') {
			setStatus('error');
			pendingRef.current = false;
			return;
		}
		if (queueStatus === 'idle' && pendingRef.current) {
			pendingRef.current = false;
			setStatus('saved');
			const t = setTimeout(() => setStatus('idle'), 2000);
			return () => clearTimeout(t);
		}
	}, [queueStatus]);

	return { status, markSaving };
}
```

- [ ] **Step 3: Write the section wrapper**

Create `src/app/settings/components/SettingsSection.tsx`:

```tsx
'use client';

import type { SaveStatus } from '../useSaveStatus';
import styles from './SettingsSection.module.css';

const STATUS_LABEL: Record<SaveStatus, string> = {
	idle: '',
	saving: 'Enregistrement…',
	saved: 'Enregistré',
	error: 'Échec de l’enregistrement',
};

export function SettingsSection({
	title,
	status = 'idle',
	children,
}: {
	title: string;
	status?: SaveStatus;
	children: React.ReactNode;
}) {
	return (
		<section className={styles.section}>
			<header className={styles.header}>
				<h2 className={styles.title}>{title}</h2>
				{status !== 'idle' && (
					<span className={`${styles.status} ${styles[status]}`}>{STATUS_LABEL[status]}</span>
				)}
			</header>
			<div className={styles.body}>{children}</div>
		</section>
	);
}
```

- [ ] **Step 4: Write the stylesheet**

Create `src/app/settings/components/SettingsSection.module.css`:

```css
.section {
	border: 1px solid var(--border, #e2e2e2);
	border-radius: 12px;
	padding: 1.25rem 1.5rem;
	display: flex;
	flex-direction: column;
	gap: 1rem;
}
.header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
}
.title {
	font-size: 1.1rem;
	font-weight: 600;
}
.body {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}
.status {
	font-size: 0.85rem;
}
.saving {
	opacity: 0.7;
}
.saved {
	color: #16a34a;
}
.error {
	color: #dc2626;
}
```

- [ ] **Step 5: Verify check passes and commit**

Run: `npm run check`
Expected: PASS

```bash
git add src/app/settings/components/SettingsSection.tsx src/app/settings/components/SettingsSection.module.css src/app/settings/useSaveStatus.ts
git commit -m "feat(settings): shared section wrapper + save-status hook"
```

---

### Task 5: Language section

**Files:**

- Create: `src/app/settings/sections/LanguageSection.tsx`
- Modify: `src/app/settings/SettingsView.tsx` (mount the section)

**Interfaces:**

- Consumes: `useProfileContext().profile.language` + `updateProfile`, `useSaveStatus`, `SettingsSection`.
- Produces: `<LanguageSection />` — a language select that persists `language` and a disabled "interface bientôt" note.

- [ ] **Step 1: Write the section**

Create `src/app/settings/sections/LanguageSection.tsx`:

```tsx
'use client';

import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import type { Language } from '@/lib/profile/types';
import { SettingsSection } from '../components/SettingsSection';
import { useSaveStatus } from '../useSaveStatus';

const LANGUAGES: { value: Language; label: string }[] = [
	{ value: 'fr', label: 'Français' },
	{ value: 'en', label: 'English' },
];

export function LanguageSection() {
	const { profile, updateProfile } = useProfileContext();
	const { status, markSaving } = useSaveStatus();
	if (!profile) return null;

	return (
		<SettingsSection title="Langue" status={status}>
			<label>
				<span>Langue des cartes et de l’interface</span>
				<select
					value={profile.language}
					onChange={(e) => {
						markSaving();
						updateProfile({ language: e.target.value as Language });
					}}
				>
					{LANGUAGES.map((l) => (
						<option key={l.value} value={l.value}>
							{l.label}
						</option>
					))}
				</select>
			</label>
			<p style={{ fontSize: '0.85rem', opacity: 0.7 }}>
				La traduction de l’interface arrive bientôt. Ce réglage s’applique aujourd’hui à l’affichage
				des cartes.
			</p>
		</SettingsSection>
	);
}
```

- [ ] **Step 2: Mount it in SettingsView**

In `src/app/settings/SettingsView.tsx`, import and render inside `<main>` (replace the `{/* Sections... */}` comment):

```tsx
import { LanguageSection } from './sections/LanguageSection';
// ...
<LanguageSection />;
```

- [ ] **Step 3: Verify runtime persistence**

Run: `npm run dev`, visit `/settings`, change the language select, reload the page.
Expected: the badge shows "Enregistrement…" then "Enregistré"; after reload the new value is still selected (persisted via sync-queue → `upsertProfile`).

- [ ] **Step 4: Verify check passes and commit**

Run: `npm run check`
Expected: PASS

```bash
git add src/app/settings/sections/LanguageSection.tsx src/app/settings/SettingsView.tsx
git commit -m "feat(settings): language section (persists language preference)"
```

---

### Task 6: Display section (theme stored-only, prices, currency)

**Files:**

- Create: `src/app/settings/sections/DisplaySection.tsx`
- Modify: `src/app/settings/SettingsView.tsx` (mount)

**Interfaces:**

- Consumes: `useProfileContext()` (`themePreference`, `showPrices`, `priceCurrency`), `useSaveStatus`, `SettingsSection`.
- Produces: `<DisplaySection />` persisting `themePreference`, `showPrices`, `priceCurrency`.

- [ ] **Step 1: Write the section**

Create `src/app/settings/sections/DisplaySection.tsx`:

```tsx
'use client';

import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import type { PriceCurrency, ThemePreference } from '@/lib/profile/types';
import { SettingsSection } from '../components/SettingsSection';
import { useSaveStatus } from '../useSaveStatus';

const THEMES: { value: ThemePreference; label: string }[] = [
	{ value: 'system', label: 'Système' },
	{ value: 'light', label: 'Clair' },
	{ value: 'dark', label: 'Sombre' },
];
const CURRENCIES: { value: PriceCurrency; label: string }[] = [
	{ value: 'eur', label: '€ EUR (Cardmarket)' },
	{ value: 'usd', label: '$ USD (TCGplayer)' },
];

export function DisplaySection() {
	const { profile, updateProfile } = useProfileContext();
	const { status, markSaving } = useSaveStatus();
	if (!profile) return null;

	return (
		<SettingsSection title="Affichage" status={status}>
			<label>
				<span>Thème</span>
				<select
					value={profile.themePreference}
					onChange={(e) => {
						markSaving();
						updateProfile({ themePreference: e.target.value as ThemePreference });
					}}
				>
					{THEMES.map((t) => (
						<option key={t.value} value={t.value}>
							{t.label}
						</option>
					))}
				</select>
			</label>

			<label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
				<input
					type="checkbox"
					checked={profile.showPrices}
					onChange={(e) => {
						markSaving();
						updateProfile({ showPrices: e.target.checked });
					}}
				/>
				<span>Afficher les prix</span>
			</label>

			<label>
				<span>Devise</span>
				<select
					value={profile.priceCurrency}
					disabled={!profile.showPrices}
					onChange={(e) => {
						markSaving();
						updateProfile({ priceCurrency: e.target.value as PriceCurrency });
					}}
				>
					{CURRENCIES.map((c) => (
						<option key={c.value} value={c.value}>
							{c.label}
						</option>
					))}
				</select>
			</label>
		</SettingsSection>
	);
}
```

- [ ] **Step 2: Mount it in SettingsView**

In `SettingsView.tsx`, import `DisplaySection` and render it after `<LanguageSection />`.

- [ ] **Step 3: Verify runtime persistence**

Run: `npm run dev`, visit `/settings`, toggle each control, reload.
Expected: values persist across reload; the currency select is disabled when "Afficher les prix" is off.

- [ ] **Step 4: Verify check passes and commit**

Run: `npm run check`
Expected: PASS

```bash
git add src/app/settings/sections/DisplaySection.tsx src/app/settings/SettingsView.tsx
git commit -m "feat(settings): display section (theme stored-only, prices, currency)"
```

---

### Task 7: Privacy section

**Files:**

- Create: `src/app/settings/sections/PrivacySection.tsx`
- Modify: `src/app/settings/SettingsView.tsx` (mount)

**Interfaces:**

- Consumes: `useProfileContext()` (`isPublic`), `useSaveStatus`, `SettingsSection`.
- Produces: `<PrivacySection />` persisting `isPublic`.

- [ ] **Step 1: Write the section**

Create `src/app/settings/sections/PrivacySection.tsx`:

```tsx
'use client';

import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { SettingsSection } from '../components/SettingsSection';
import { useSaveStatus } from '../useSaveStatus';

export function PrivacySection() {
	const { profile, updateProfile } = useProfileContext();
	const { status, markSaving } = useSaveStatus();
	if (!profile) return null;

	return (
		<SettingsSection title="Confidentialité" status={status}>
			<label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
				<input
					type="checkbox"
					checked={profile.isPublic}
					onChange={(e) => {
						markSaving();
						updateProfile({ isPublic: e.target.checked });
					}}
				/>
				<span>Profil public</span>
			</label>
			<p style={{ fontSize: '0.85rem', opacity: 0.7 }}>
				Lorsque votre profil est privé, votre page publique et vos collections partagées ne sont
				plus visibles par les autres utilisateurs.
			</p>
		</SettingsSection>
	);
}
```

- [ ] **Step 2: Mount it in SettingsView**

In `SettingsView.tsx`, import `PrivacySection` and render it after `<DisplaySection />`.

- [ ] **Step 3: Verify RLS behavior end-to-end**

Run: `npm run dev`. As user A, set profile to private (uncheck "Profil public"). In a separate logged-out/incognito window, visit `/users/<A-nickname>`.
Expected: logged-out visitor sees the not-found state (`UserNotFound`); user A still sees their own profile at `/users/<A-nickname>`. (Task 9 hardens the not-found path; verify the RLS filter itself here — the row is simply absent for the anon client.)

- [ ] **Step 4: Verify check passes and commit**

Run: `npm run check`
Expected: PASS

```bash
git add src/app/settings/sections/PrivacySection.tsx src/app/settings/SettingsView.tsx
git commit -m "feat(settings): privacy section (public/private profile toggle)"
```

---

### Task 8: Profile section — migrate edit into settings

**Files:**

- Create: `src/app/settings/sections/ProfileSection.tsx`
- Modify: `src/app/users/[userId]/ProfileShell.tsx:28,59,65` (replace edit modal with a link to `/settings`)
- Modify: `src/app/settings/SettingsView.tsx` (mount ProfileSection first)

**Interfaces:**

- Consumes: `useProfileContext()` (`nickname`, `description`, `avatarUrl`) + `updateProfile`; `isNicknameTaken`, `uploadAvatar` from `@/lib/profile/db/profiles`; `useAuth` for `user.id`.
- Produces: `<ProfileSection />` — nickname (with taken-check on blur), description, avatar upload. ProfileShell's "Edit" now navigates to `/settings`; `ProfileEditModal` is no longer mounted.

- [ ] **Step 1: Write the ProfileSection**

Create `src/app/settings/sections/ProfileSection.tsx`. Reuse the existing DB helpers; nickname validation mirrors the retired modal's behavior (case-insensitive taken-check before saving):

```tsx
'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { isNicknameTaken, uploadAvatar } from '@/lib/profile/db/profiles';
import { SettingsSection } from '../components/SettingsSection';
import { useSaveStatus } from '../useSaveStatus';

export function ProfileSection() {
	const { user } = useAuth();
	const { profile, updateProfile } = useProfileContext();
	const { status, markSaving } = useSaveStatus();
	const [nickname, setNickname] = useState(profile?.nickname ?? '');
	const [description, setDescription] = useState(profile?.description ?? '');
	const [nicknameError, setNicknameError] = useState<string | null>(null);
	const [avatarBusy, setAvatarBusy] = useState(false);

	if (!profile || !user) return null;

	const commitNickname = async () => {
		const trimmed = nickname.trim();
		setNicknameError(null);
		if (trimmed === (profile.nickname ?? '')) return;
		if (trimmed.length < 3) {
			setNicknameError('Le pseudo doit contenir au moins 3 caractères.');
			return;
		}
		try {
			if (await isNicknameTaken(trimmed, user.id)) {
				setNicknameError('Ce pseudo est déjà pris.');
				return;
			}
		} catch {
			setNicknameError('Impossible de vérifier le pseudo pour le moment.');
			return;
		}
		markSaving();
		updateProfile({ nickname: trimmed });
	};

	const commitDescription = () => {
		if (description === (profile.description ?? '')) return;
		markSaving();
		updateProfile({ description: description.trim() || null });
	};

	const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		setAvatarBusy(true);
		try {
			const url = await uploadAvatar(user.id, file);
			markSaving();
			updateProfile({ avatarUrl: url });
		} finally {
			setAvatarBusy(false);
		}
	};

	return (
		<SettingsSection title="Profil" status={status}>
			<label>
				<span>Pseudo</span>
				<input
					value={nickname}
					onChange={(e) => setNickname(e.target.value)}
					onBlur={commitNickname}
				/>
			</label>
			{nicknameError && (
				<span style={{ color: '#dc2626', fontSize: '0.85rem' }}>{nicknameError}</span>
			)}

			<label>
				<span>Description</span>
				<textarea
					value={description}
					onChange={(e) => setDescription(e.target.value)}
					onBlur={commitDescription}
					rows={3}
				/>
			</label>

			<div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
				{profile.avatarUrl && (
					<Image
						src={profile.avatarUrl}
						alt="Avatar"
						width={64}
						height={64}
						style={{ borderRadius: '50%', objectFit: 'cover' }}
						unoptimized
					/>
				)}
				<label>
					<span>{avatarBusy ? 'Téléversement…' : 'Changer l’avatar'}</span>
					<input type="file" accept="image/*" onChange={onAvatarChange} disabled={avatarBusy} />
				</label>
			</div>
		</SettingsSection>
	);
}
```

Note: this reproduces the existing modal's nickname rules. If the retired
`ProfileEditModal` used different validation (e.g. a different minimum length or
allowed-character regex), open `src/app/users/[userId]/components/ProfileEditModal.tsx`
and match its exact rules instead of the 3-char rule above.

- [ ] **Step 2: Read the modal being retired to match its rules**

Run: `sed -n '1,200p' src/app/users/[userId]/components/ProfileEditModal.tsx`
Adjust `commitNickname`/`commitDescription`/avatar handling in Step 1 to match any validation or avatar-constraint the modal enforced (max lengths, allowed chars, file size). Keep behavior identical — this is a move, not a redesign.

- [ ] **Step 3: Point ProfileShell's Edit to /settings and drop the modal**

In `src/app/users/[userId]/ProfileShell.tsx`:

- Remove the `useState` for `editing` (line 28) and the `ProfileEditModal` import (line 12) and its render (line 65).
- Change the `onEdit` prop into a navigation to `/settings`. Replace the `onEdit={isOwner ? () => setEditing(true) : undefined}` with `onEdit={isOwner ? () => router.push('/settings') : undefined}` and add `import { useRouter } from 'next/navigation';` + `const router = useRouter();`.

Concretely, the edited ProfileShell drops these lines:

```tsx
import { ProfileEditModal } from './components/ProfileEditModal';
```

```tsx
const [editing, setEditing] = useState(false);
```

```tsx
{
	editing && <ProfileEditModal onClose={() => setEditing(false)} />;
}
```

and changes the `onEdit` to use `router.push('/settings')`. Remove the now-unused `useState` import if nothing else uses it (`ProfileShell` uses no other `useState` — remove it from the react import).

- [ ] **Step 4: Mount ProfileSection first in SettingsView**

In `SettingsView.tsx`, import `ProfileSection` and render it as the FIRST section (before `<LanguageSection />`).

- [ ] **Step 5: Verify the full move works**

Run: `npm run dev`.

- On `/users/<own-nickname>`, click "Edit" → navigates to `/settings`.
- In `/settings` Profil section: change pseudo (try a taken one → error; a free one → saves), change description, upload an avatar. Reload → all persist. Confirm the avatar shows on `/users/<own-nickname>`.
- Confirm `ProfileEditModal` no longer opens anywhere.

- [ ] **Step 6: Verify check passes and commit**

Run: `npm run check`
Expected: PASS (no unused-import/`ProfileEditModal` reference errors).

```bash
git add src/app/settings/sections/ProfileSection.tsx src/app/settings/SettingsView.tsx src/app/users/[userId]/ProfileShell.tsx
git commit -m "feat(settings): move profile editing into settings; link from profile"
```

---

### Task 9: Harden /users/[id] not-found for private profiles

**Files:**

- Modify: `src/app/users/[userId]/useProfileByNickname.ts`
- Verify: `src/app/users/[userId]/components/UserNotFound.tsx` (existing not-found UI)

**Interfaces:**

- Consumes: existing `useProfileByNickname` returning `{ profile, status }` with `status: 'loading'|'not-found'|...`.
- Produces: private profiles (row absent under RLS for non-owners) resolve to `status: 'not-found'`.

- [ ] **Step 1: Confirm current behavior**

Run: `sed -n '1,120p' src/app/users/[userId]/useProfileByNickname.ts`
Expected: it calls `fetchProfileByNickname` and maps a null result to `'not-found'`. Because RLS now hides private profiles from non-owners, `fetchProfileByNickname` already returns `null` for them → the hook already yields `'not-found'`.

- [ ] **Step 2: Add regression guard only if needed**

If Step 1 shows the null→not-found mapping already exists, NO code change is needed — the RLS filter does the work. In that case, this task is verification-only: proceed to Step 3. If instead the hook assumes a non-null row anywhere (e.g. throws), add an explicit `if (!profile) return { profile: null, status: 'not-found' };` guard following the file's existing style.

- [ ] **Step 3: Verify end-to-end**

Run: `npm run dev`.

- User A sets profile private in `/settings`.
- Logged-out incognito visits `/users/<A-nickname>` → `UserNotFound` renders (not a blank/errored page).
- User A visits their own `/users/<A-nickname>` → profile renders normally.
- Set public again → visitor sees it again.

- [ ] **Step 4: Verify check passes and commit**

Run: `npm run check`
Expected: PASS

```bash
git add src/app/users/[userId]/useProfileByNickname.ts
git commit -m "fix(profile): private profiles resolve to not-found for visitors"
```

(If Step 2 required no change, commit only if you touched a file; otherwise skip the commit for this verification-only task.)

---

### Task 10: Account section — email & password

**Files:**

- Create: `src/app/settings/sections/AccountSection.tsx`
- Modify: `src/app/settings/SettingsView.tsx` (mount)

**Interfaces:**

- Consumes: `createClient` from `@/lib/supabase/client` (browser client with `auth.updateUser`), `useAuth` for current email, `SettingsSection`.
- Produces: `<AccountSection />` with email-change and password-change subforms (delete added in Task 11). Local submit state per subform (not the sync-queue).

- [ ] **Step 1: Write the account section (email + password)**

Create `src/app/settings/sections/AccountSection.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { SettingsSection } from '../components/SettingsSection';

export function AccountSection() {
	const { user } = useAuth();
	const [email, setEmail] = useState(user?.email ?? '');
	const [emailMsg, setEmailMsg] = useState<string | null>(null);
	const [password, setPassword] = useState('');
	const [passwordConfirm, setPasswordConfirm] = useState('');
	const [pwMsg, setPwMsg] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const changeEmail = async () => {
		setEmailMsg(null);
		if (!email || email === user?.email) return;
		setBusy(true);
		try {
			const { error } = await createClient().auth.updateUser({ email });
			setEmailMsg(
				error ? `Erreur : ${error.message}` : 'Vérifiez votre boîte mail pour confirmer.'
			);
		} finally {
			setBusy(false);
		}
	};

	const changePassword = async () => {
		setPwMsg(null);
		if (password.length < 8) {
			setPwMsg('Le mot de passe doit contenir au moins 8 caractères.');
			return;
		}
		if (password !== passwordConfirm) {
			setPwMsg('Les mots de passe ne correspondent pas.');
			return;
		}
		setBusy(true);
		try {
			const { error } = await createClient().auth.updateUser({ password });
			setPwMsg(error ? `Erreur : ${error.message}` : 'Mot de passe mis à jour.');
			if (!error) {
				setPassword('');
				setPasswordConfirm('');
			}
		} finally {
			setBusy(false);
		}
	};

	return (
		<SettingsSection title="Compte">
			<label>
				<span>Adresse e-mail</span>
				<input
					type="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					disabled={busy}
				/>
			</label>
			<button type="button" onClick={changeEmail} disabled={busy}>
				Changer l’e-mail
			</button>
			{emailMsg && <span style={{ fontSize: '0.85rem' }}>{emailMsg}</span>}

			<hr style={{ opacity: 0.2, width: '100%' }} />

			<label>
				<span>Nouveau mot de passe</span>
				<input
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					disabled={busy}
				/>
			</label>
			<label>
				<span>Confirmer le mot de passe</span>
				<input
					type="password"
					value={passwordConfirm}
					onChange={(e) => setPasswordConfirm(e.target.value)}
					disabled={busy}
				/>
			</label>
			<button type="button" onClick={changePassword} disabled={busy}>
				Changer le mot de passe
			</button>
			{pwMsg && <span style={{ fontSize: '0.85rem' }}>{pwMsg}</span>}
		</SettingsSection>
	);
}
```

- [ ] **Step 2: Verify `createClient` browser client + AuthContext field names**

Run: `grep -n "export" src/lib/supabase/client.ts && grep -n "email\|user" src/lib/supabase/contexts/AuthContext.tsx | head`
Expected: confirm `createClient` is exported and returns a Supabase browser client exposing `.auth.updateUser`; confirm `useAuth()` exposes `user` with `.email`. Adapt names if they differ.

- [ ] **Step 3: Mount it in SettingsView**

In `SettingsView.tsx`, import `AccountSection` and render it LAST.

- [ ] **Step 4: Verify runtime (email + password)**

Run: `npm run dev` and `npm run sb:mail` (Inbucket at :54324).

- Change email → confirmation message; the confirmation mail appears in Inbucket.
- Change password with mismatched fields → error; with a valid matching password ≥8 chars → "Mot de passe mis à jour."

- [ ] **Step 5: Verify check passes and commit**

Run: `npm run check`
Expected: PASS

```bash
git add src/app/settings/sections/AccountSection.tsx src/app/settings/SettingsView.tsx
git commit -m "feat(settings): account section — change email and password"
```

---

### Task 11: Account deletion (service-role API route + danger zone)

**Files:**

- Create: `src/app/api/account/delete/route.ts`
- Modify: `src/app/settings/sections/AccountSection.tsx` (add danger zone)

**Interfaces:**

- Consumes: `createClient` (server) to read the session; a service-role admin client to delete the user; existing `ConfirmModal` component.
- Produces: `POST /api/account/delete` — deletes the authenticated user's `auth.users` row (cascades to `profiles`). The danger zone triggers it after a `ConfirmModal` nickname re-type, then signs out and redirects home.

- [ ] **Step 1: Confirm service-role env + server client pattern**

Run: `grep -rn "SERVICE_ROLE\|service_role\|createServerClient\|createClient" src/lib/supabase/server.ts && grep -rn "SERVICE_ROLE" .env* 2>/dev/null`
Expected: identify the server-side Supabase creation helper and the service-role key env var name (commonly `SUPABASE_SERVICE_ROLE_KEY`). Use the actual env var name in Step 2. If no service-role key is configured locally, add it to `.env.local` from `supabase status` output (the `service_role key`).

- [ ] **Step 2: Write the API route**

Create `src/app/api/account/delete/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export async function POST() {
	// Identify the caller from their session cookie (SSR client).
	const supabase = await createServerClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) {
		return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
	}

	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !serviceKey) {
		return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
	}

	// Admin client (service-role) is the only way to delete an auth user.
	const admin = createAdminClient(url, serviceKey, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
	const { error } = await admin.auth.admin.deleteUser(user.id);
	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
	// profiles + owned rows cascade via `on delete cascade`.
	return NextResponse.json({ ok: true });
}
```

(Match the server-client import name and env var to what Step 1 found.)

- [ ] **Step 3: Add the danger zone to AccountSection**

In `src/app/settings/sections/AccountSection.tsx`, add deletion UI using the existing `ConfirmModal`. First confirm its API:

Run: `sed -n '1,60p' src/components/ConfirmModal/ConfirmModal.tsx`
Then add (adapting prop names to the real `ConfirmModal` signature):

```tsx
// add to imports
import { useRouter } from 'next/navigation';
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';

// inside the component:
const router = useRouter();
const { profile } = useProfileContext();
const [confirming, setConfirming] = useState(false);
const [deleteErr, setDeleteErr] = useState<string | null>(null);

const deleteAccount = async () => {
	setDeleteErr(null);
	setBusy(true);
	try {
		const res = await fetch('/api/account/delete', { method: 'POST' });
		if (!res.ok) {
			const body = (await res.json().catch(() => ({}))) as { error?: string };
			setDeleteErr(body.error ?? 'Échec de la suppression.');
			return;
		}
		await createClient().auth.signOut();
		router.push('/');
	} finally {
		setBusy(false);
		setConfirming(false);
	}
};
```

And render at the end of the `<SettingsSection>` body:

```tsx
			<hr style={{ opacity: 0.2, width: '100%' }} />
			<button
				type="button"
				onClick={() => setConfirming(true)}
				disabled={busy}
				style={{ color: '#dc2626' }}
			>
				Supprimer mon compte
			</button>
			{deleteErr && <span style={{ color: '#dc2626', fontSize: '0.85rem' }}>{deleteErr}</span>}
			{confirming && (
				<ConfirmModal
					title="Supprimer le compte"
					message={`Cette action est irréversible. Retapez « ${profile?.nickname ?? ''} » pour confirmer.`}
					confirmWord={profile?.nickname ?? undefined}
					onConfirm={deleteAccount}
					onCancel={() => setConfirming(false)}
				/>
			)}
```

Adapt `ConfirmModal`'s props to its actual signature from the sed output (it may not support a `confirmWord` re-type; if not, use its plain confirm/cancel form and drop the re-type requirement, keeping the irreversibility warning).

- [ ] **Step 4: Verify deletion end-to-end**

Run: `npm run dev`. Create a throwaway account, sign in, go to `/settings`, delete it.
Expected: after confirm, the user is signed out and redirected to `/`. In Studio, `select * from auth.users where id = '<id>'` returns no row and the `profiles` row is gone (cascade). Attempting to log back in fails.

- [ ] **Step 5: Verify check passes and commit**

Run: `npm run check`
Expected: PASS

```bash
git add src/app/api/account/delete/route.ts src/app/settings/sections/AccountSection.tsx
git commit -m "feat(settings): account deletion via service-role API route"
```

---

### Task 12: Extend schema verification script

**Files:**

- Modify: `supabase/verify_prod_schema.sql`

**Interfaces:**

- Consumes: existing `pg_temp.chk(category, object, cond, detail)` helper and the column/policy assertion patterns already in the file.
- Produces: assertions for the 5 new columns (presence + default + check) and the replaced `profiles` SELECT policy.

- [ ] **Step 1: Read the existing assertion patterns**

Run: `grep -n "chk(\|profiles\|policy\|column" supabase/verify_prod_schema.sql | head -40`
Expected: shows how existing column/default/policy checks are written (the helper + `information_schema` / `pg_policies` queries). Follow that exact style.

- [ ] **Step 2: Add column assertions**

Following the file's existing column-check style, add checks that `public.profiles` has each of `language`, `price_currency`, `show_prices`, `theme_preference`, `is_public` with the expected default. Example in the file's idiom (adapt to the real helper usage found in Step 1):

```sql
perform pg_temp.chk('columns', 'profiles.language',
  exists (select 1 from information_schema.columns
          where table_schema='public' and table_name='profiles'
            and column_name='language' and column_default like '%fr%'),
  'expected profiles.language text default fr');
-- repeat for price_currency (eur), show_prices (true),
-- theme_preference (system), is_public (true)
```

- [ ] **Step 3: Add the SELECT policy assertion**

Add a check that the `profiles` SELECT policy is the visibility-aware one:

```sql
perform pg_temp.chk('policies', 'profiles select visibility',
  exists (select 1 from pg_policies
          where schemaname='public' and tablename='profiles'
            and cmd='SELECT' and qual ilike '%is_public%'),
  'expected profiles SELECT policy to filter by is_public');
```

- [ ] **Step 4: Run the verifier against the local DB**

Run: `npm run sb:verify`
Expected: report shows the new assertions PASS; overall summary reflects the added checks with 0 failures.

- [ ] **Step 5: Commit**

```bash
git add supabase/verify_prod_schema.sql
git commit -m "chore(db): verify profile preference columns + visibility policy"
```

---

### Task 13: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Clean typecheck/lint/format**

Run: `npm run check`
Expected: PASS with no errors or warnings introduced by this branch.

- [ ] **Step 2: Fresh DB + schema audit**

Run: `npm run sb:reset && npm run sb:verify`
Expected: reset applies all migrations including `20260713120000`; verify reports 0 failures.

- [ ] **Step 3: Runtime smoke of every section**

Run: `npm run dev` (and `npm run sb:mail`).
Walk through `/settings` end to end:

- Profil: pseudo (taken + free), description, avatar → persist across reload; avatar visible on `/users/<nick>`.
- Langue: switch fr/en → persists.
- Affichage: theme (stored, no visual change expected), show prices toggle, currency (disabled when prices off) → persist.
- Confidentialité: toggle private → visitor gets not-found on `/users/<nick>`, owner still sees it.
- Compte: email change (mail in Inbucket), password change, account delete (throwaway user).

- [ ] **Step 4: Confirm the profile edit modal is fully retired**

Run: `grep -rn "ProfileEditModal" src/`
Expected: no remaining references (the modal file itself may remain unused; if so, delete it and its `.module.css`, then re-run `npm run check`). If you delete them:

```bash
git rm src/app/users/[userId]/components/ProfileEditModal.tsx src/app/users/[userId]/components/ProfileEditModal.module.css
git commit -m "chore(profile): remove retired ProfileEditModal"
```

- [ ] **Step 5: Final commit if any cleanup remains**

Ensure the working tree is clean (`git status`). The branch `feat/settings-page` now holds the full feature.
