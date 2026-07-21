# EN Default Locale + Navbar Language Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make English the default app language and add a language dropdown to the navbar usable whether or not the user is logged in.

**Architecture:** Change the next-intl `defaultLocale` to `en` (keeping browser-language detection) and the `profiles.language` DB default to `en`. Extract the existing Settings language-switch logic into a shared `useLanguageSwitch` hook, then consume it from both the Settings section and a new compact navbar `LanguageSwitcher` component (desktop navbar + mobile drawer). The navbar switcher reuses the existing portal-based `Select` component.

**Tech Stack:** Next.js (App Router, `[locale]` segment), next-intl, React client components, Supabase (self-hosted), TypeScript, CSS Modules.

## Global Constraints

- **No test framework** (no vitest/jest). Verify via `npx eslint <changed files>`, `npm run build`, and runtime checks. Never introduce a test runner.
- **`npm run check` is RED at baseline** (~60 pre-existing problems in unrelated files). Gate on **no NEW problems** — run `npx eslint` on the specific changed files, which must be clean.
- **Locales are always URL-prefixed** (`localePrefix: 'always'`); `/` 307-redirects. Do not change this.
- **URL is the render authority**; `profile.language` is the durable preference. Switching locale = `router.replace(pathname, { locale })`; persist to profile only when logged in.
- **Navigation imports:** use `Link`, `useRouter`, `usePathname` from `@/i18n/navigation` (NOT `next/link` / `next/navigation`).
- **Language type:** `type Language = 'en' | 'fr'` from `@/lib/profile/types`; `Locale` from `@/i18n/routing`. They are structurally identical (`'en' | 'fr'`).
- **Message catalogs must stay in sync:** any key added to `messages/en.json` must be added to `messages/fr.json`.
- **Migrations:** timestamped, idempotent, no destructive backfill. Apply locally via `sb:migrate`.

---

## File Structure

- `src/i18n/routing.ts` — MODIFY: `defaultLocale` → `'en'`, update doc comment.
- `supabase/migrations/20260721120000_default_language_en.sql` — CREATE: set `profiles.language` default to `'en'`.
- `src/lib/profile/hooks/useLanguageSwitch.ts` — CREATE: shared switch hook.
- `src/app/[locale]/settings/sections/LanguageSection.tsx` — MODIFY: consume the hook.
- `src/components/Navbar/LanguageSwitcher.tsx` — CREATE: compact navbar dropdown.
- `src/components/Navbar/Navbar.tsx` — MODIFY: render switcher in the right-side cluster.
- `src/components/Navbar/NavbarDrawer.tsx` — MODIFY: render switcher in the mobile drawer.
- `messages/en.json`, `messages/fr.json` — MODIFY: add `nav.language` label if used for `ariaLabel`.

---

## Task 1: Default locale → EN

**Files:**

- Modify: `src/i18n/routing.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `routing` with `defaultLocale: 'en'` (unchanged export shape; `Locale` type still `'fr' | 'en'`).

- [ ] **Step 1: Change the default locale and update the comment**

Replace the file contents of `src/i18n/routing.ts` with:

```ts
import { defineRouting } from 'next-intl/routing';

/**
 * Source unique du routing i18n. Les locales sont TOUJOURS préfixées dans
 * l'URL (`/en/...`, `/fr/...`) ; `/` fait un 307 vers la locale résolue.
 * Choix dicté par le SEO/GEO : hreflang symétrique + contenu localisé rendu
 * côté serveur. `en` est la locale par défaut (cible internationale) ; `fr`
 * reste servi via la détection `Accept-Language` et le préfixe `/fr` explicite.
 * `localeDetection` est laissé à sa valeur par défaut (`true`) : un navigateur
 * préférant le français atterrit sur `/fr`, tous les autres sur `/en`.
 */
export const routing = defineRouting({
	locales: ['fr', 'en'],
	defaultLocale: 'en',
	localePrefix: 'always',
});

export type Locale = (typeof routing.locales)[number];
```

- [ ] **Step 2: Lint the changed file**

Run: `npx eslint src/i18n/routing.ts`
Expected: no output (clean).

- [ ] **Step 3: Runtime check — anonymous redirect**

Run the dev server (`npm run dev`) if not already running. In a fresh/incognito browser with a non-French `Accept-Language`, visit `http://localhost:3000/` → expect a 307 to `/en`. (Optional CLI check: `curl -sI -H 'Accept-Language: en-US' http://localhost:3000/ | grep -i location` shows `/en`; `curl -sI -H 'Accept-Language: fr-FR' http://localhost:3000/ | grep -i location` shows `/fr`.)
Expected: default (non-FR) → `/en`; explicit FR → `/fr`.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/routing.ts
git commit -m "feat(i18n): default locale to English (keep Accept-Language detection)"
```

---

## Task 2: DB default language → EN

**Files:**

- Create: `supabase/migrations/20260721120000_default_language_en.sql`

**Interfaces:**

- Consumes: nothing.
- Produces: `profiles.language` column default = `'en'` (CHECK and NOT NULL unchanged).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260721120000_default_language_en.sql`:

```sql
-- New accounts default to English, matching the app's default locale.
-- Existing profiles keep their stored preference (no backfill).
alter table public.profiles
  alter column language set default 'en';
```

- [ ] **Step 2: Apply the migration locally**

Run: `sb:migrate` (project alias for applying local Supabase migrations).
Expected: migration applies without error.

- [ ] **Step 3: Verify the new default in Supabase Studio**

In Studio (or via SQL), confirm the column default:

```sql
select column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name = 'language';
```

Expected: `'en'::text`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260721120000_default_language_en.sql
git commit -m "feat(db): default profiles.language to 'en' for new accounts"
```

---

## Task 3: Shared `useLanguageSwitch` hook

**Files:**

- Create: `src/lib/profile/hooks/useLanguageSwitch.ts`

**Interfaces:**

- Consumes: `useLocale()` (next-intl), `useRouter`/`usePathname` (`@/i18n/navigation`), `useProfileContext()` (`@/lib/profile/context/ProfileContext`), `Language` (`@/lib/profile/types`).
- Produces:

  ```ts
  function useLanguageSwitch(): {
  	locale: Language; // current URL locale
  	switchLocale: (next: Language) => void;
  };
  ```

  `switchLocale(next)`: no-op if `next === locale`; otherwise `router.replace(pathname, { locale: next })` and, when a profile exists (logged in), `updateProfile({ language: next })`.

- [ ] **Step 1: Write the hook**

Create `src/lib/profile/hooks/useLanguageSwitch.ts`:

```ts
'use client';

import { useCallback } from 'react';
import { useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import type { Language } from '@/lib/profile/types';

/**
 * Source unique du changement de langue de l'interface.
 *
 * L'URL préfixée est l'autorité de rendu : on navigue vers la nouvelle locale
 * (ce qui met aussi à jour le cookie `NEXT_LOCALE`). Si l'utilisateur est
 * connecté (`profile` non nul), on persiste aussi la préférence durable dans
 * `profile.language` — de sorte qu'elle le suive entre appareils et que
 * `LocaleSync` ne ré-écrase pas le choix.
 *
 * Utilisable connecté OU non connecté : sans profil, seuls l'URL et le cookie
 * changent, sans écriture DB.
 *
 * Doit être appelé dans `NextIntlClientProvider` et `ProfileProvider`.
 */
export function useLanguageSwitch(): {
	locale: Language;
	switchLocale: (next: Language) => void;
} {
	const locale = useLocale() as Language;
	const { profile, updateProfile } = useProfileContext();
	const router = useRouter();
	const pathname = usePathname();

	const switchLocale = useCallback(
		(next: Language) => {
			if (next === locale) return;
			router.replace(pathname, { locale: next });
			if (profile) updateProfile({ language: next });
		},
		[locale, pathname, router, profile, updateProfile]
	);

	return { locale, switchLocale };
}
```

- [ ] **Step 2: Lint the changed file**

Run: `npx eslint src/lib/profile/hooks/useLanguageSwitch.ts`
Expected: no output (clean).

- [ ] **Step 3: Type-check via build (deferred to Task 6)**

No standalone run here; the hook is exercised by Tasks 4 and 5. Proceed.

- [ ] **Step 4: Commit**

```bash
git add src/lib/profile/hooks/useLanguageSwitch.ts
git commit -m "feat(i18n): shared useLanguageSwitch hook (URL + persist when logged in)"
```

---

## Task 4: Refactor `LanguageSection` to use the hook

**Files:**

- Modify: `src/app/[locale]/settings/sections/LanguageSection.tsx`

**Interfaces:**

- Consumes: `useLanguageSwitch` (Task 3), existing `useSaveStatus`, `Select`, `useProfileContext`.
- Produces: no new exports (behavior preserved).

- [ ] **Step 1: Rewrite the section to consume the hook**

Replace the contents of `src/app/[locale]/settings/sections/LanguageSection.tsx` with:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Select } from '@/components/Select/Select';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { useLanguageSwitch } from '@/lib/profile/hooks/useLanguageSwitch';
import type { Language } from '@/lib/profile/types';
import { SettingsSection, settingsStyles as s } from '../components/SettingsSection';
import { useSaveStatus } from '../useSaveStatus';

export function LanguageSection() {
	const t = useTranslations('settings.language');
	const { profile } = useProfileContext();
	const { switchLocale } = useLanguageSwitch();
	const { status, markSaving } = useSaveStatus();
	if (!profile) return null;

	// Endonymes : le libellé d'une langue s'écrit dans sa propre langue, donc
	// identique fr/en dans le catalogue.
	const languages: { value: Language; label: string }[] = [
		{ value: 'fr', label: t('french') },
		{ value: 'en', label: t('english') },
	];

	return (
		<SettingsSection title={t('title')} status={status}>
			<div className={s.field}>
				<span className={s.label}>{t('fieldLabel')}</span>
				<Select
					value={profile.language}
					options={languages}
					ariaLabel={t('fieldLabel')}
					onChange={(value) => {
						markSaving();
						// Navigation + persistance profil centralisées dans le hook.
						switchLocale(value);
					}}
				/>
			</div>
			<p className={s.hint}>{t('hint')}</p>
		</SettingsSection>
	);
}
```

Note: `switchLocale` already persists to the profile (logged-in), so the previous explicit `updateProfile` call is gone; `markSaving()` still drives the save-status UI.

- [ ] **Step 2: Lint the changed file**

Run: `npx eslint "src/app/[locale]/settings/sections/LanguageSection.tsx"`
Expected: no output (clean).

- [ ] **Step 3: Runtime check — Settings switch still works**

With dev running and logged in, go to `/en/settings`, change language to Français via the Language section → URL becomes `/fr/settings`, save-status shows saving/saved. Reload → stays FR. In Studio, `profiles.language` = `fr` for your row.
Expected: locale switches, persists, save status renders.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/settings/sections/LanguageSection.tsx"
git commit -m "refactor(settings): LanguageSection uses shared useLanguageSwitch"
```

---

## Task 5: Navbar `LanguageSwitcher` component + message label

**Files:**

- Create: `src/components/Navbar/LanguageSwitcher.tsx`
- Modify: `messages/en.json`, `messages/fr.json`
- Modify: `src/components/Navbar/Navbar.tsx`
- Modify: `src/components/Navbar/NavbarDrawer.tsx`

**Interfaces:**

- Consumes: `useLanguageSwitch` (Task 3), `Select` (`@/components/Select/Select`), `useTranslations` (next-intl).
- Produces: `export function LanguageSwitcher({ className }: { className?: string }): JSX.Element` — a compact locale dropdown reflecting the current URL locale and calling `switchLocale` on change. No auth-state props; works logged-in and logged-out.

- [ ] **Step 1: Add the `nav.language` label to both catalogs**

In `messages/en.json`, inside the `"nav"` object, add:

```json
"language": "Language"
```

In `messages/fr.json`, inside the `"nav"` object, add:

```json
"language": "Langue"
```

(Place the key alongside the existing `nav` entries such as `menu`/`profile`; keep valid JSON — mind trailing commas.)

- [ ] **Step 2: Create the switcher component**

Create `src/components/Navbar/LanguageSwitcher.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Select } from '@/components/Select/Select';
import { useLanguageSwitch } from '@/lib/profile/hooks/useLanguageSwitch';
import type { Language } from '@/lib/profile/types';

/**
 * Sélecteur de langue compact pour la navbar (desktop) et le tiroir (mobile).
 * Fonctionne connecté OU non connecté : la logique de bascule (URL + cookie,
 * et persistance profil si connecté) vit dans `useLanguageSwitch`.
 *
 * Réutilise le `Select` portail de l'app (mécanique d'ouverture, clavier et
 * positionnement déjà gérés) plutôt que de re-coder un dropdown.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
	const t = useTranslations('nav');
	const tLang = useTranslations('settings.language');
	const { locale, switchLocale } = useLanguageSwitch();

	// Endonymes (identiques fr/en dans le catalogue).
	const options: { value: Language; label: string }[] = [
		{ value: 'fr', label: tLang('french') },
		{ value: 'en', label: tLang('english') },
	];

	return (
		<Select
			value={locale}
			options={options}
			ariaLabel={t('language')}
			className={className}
			onChange={switchLocale}
		/>
	);
}
```

- [ ] **Step 3: Render it in the desktop navbar**

In `src/components/Navbar/Navbar.tsx`:

Add the import near the other Navbar-local imports (after the `ProfileMenu` import):

```tsx
import { LanguageSwitcher } from './LanguageSwitcher';
```

Then place the switcher in the right-side cluster — between the `syncSection` and `authSection` divs. Change:

```tsx
					<div className={styles.syncSection}>
						<SyncIndicator />
					</div>
					<div className={styles.authSection}>{authNode}</div>
```

to:

```tsx
					<div className={styles.syncSection}>
						<SyncIndicator />
					</div>
					<LanguageSwitcher />
					<div className={styles.authSection}>{authNode}</div>
```

- [ ] **Step 4: Render it in the mobile drawer**

In `src/components/Navbar/NavbarDrawer.tsx`:

Add the import after the `ProfileMenu` import:

```tsx
import { LanguageSwitcher } from './LanguageSwitcher';
```

Then add the switcher just before the divider that precedes `authNode`. Change:

```tsx
<div className={styles.drawerDivider} />;

{
	authNode;
}
```

to:

```tsx
				<div className={styles.drawerDivider} />

				<LanguageSwitcher />

				{authNode}
```

- [ ] **Step 5: Lint the changed files**

Run:

```bash
npx eslint src/components/Navbar/LanguageSwitcher.tsx src/components/Navbar/Navbar.tsx src/components/Navbar/NavbarDrawer.tsx
```

Expected: no output (clean).

- [ ] **Step 6: Validate JSON catalogs parse**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8')); JSON.parse(require('fs').readFileSync('messages/fr.json','utf8')); console.log('ok')"
```

Expected: `ok`.

- [ ] **Step 7: Runtime check — navbar switcher, logged out AND logged in**

With dev running:

- **Logged out:** on `/en`, open the navbar language dropdown, pick Français → URL → `/fr`, UI in French. Pick English → `/en`. No console errors. (Mobile: open the hamburger drawer, same check.)
- **Logged in:** repeat; after switching, reload the page → locale sticks; in Studio `profiles.language` matches the chosen language. Confirm you are NOT snapped back to the old locale by `LocaleSync`.

Expected: switching works in both states; persists when logged in; no snap-back.

- [ ] **Step 8: Commit**

```bash
git add src/components/Navbar/LanguageSwitcher.tsx src/components/Navbar/Navbar.tsx src/components/Navbar/NavbarDrawer.tsx messages/en.json messages/fr.json
git commit -m "feat(navbar): language switcher dropdown (desktop + mobile, logged-in or out)"
```

---

## Task 6: Full build verification

**Files:** none (verification only).

- [ ] **Step 1: Build the app**

Run: `npm run build`
Expected: build succeeds. (This is the only check that catches certain TS depth/typing issues; per project notes, per-file tsc does not.)

- [ ] **Step 2: Confirm no NEW lint problems on the full changed set**

Run:

```bash
npx eslint src/i18n/routing.ts src/lib/profile/hooks/useLanguageSwitch.ts "src/app/[locale]/settings/sections/LanguageSection.tsx" src/components/Navbar/LanguageSwitcher.tsx src/components/Navbar/Navbar.tsx src/components/Navbar/NavbarDrawer.tsx
```

Expected: no output (clean) — all touched files pass, independent of the RED baseline elsewhere.

- [ ] **Step 3: Final end-to-end runtime pass**

With `sb:migrate` applied and dev running, verify the full acceptance set:

1. Anonymous `/` (non-FR browser) → `/en`; FR browser → `/fr`.
2. Navbar dropdown switches locale logged-out (URL + cookie) and logged-in (also persists `profiles.language`, verified in Studio).
3. Settings language change still works and persists.
4. No `LocaleSync` snap-back after a navbar switch.
5. New account (fresh signup) gets `profiles.language = 'en'` in Studio.

Expected: all pass.

- [ ] **Step 4: Commit (if any final tweaks were needed)**

```bash
git add -A
git commit -m "chore(i18n): verification pass for EN default + navbar switcher"
```

(Skip if nothing changed in this task.)

---

## Self-Review

**Spec coverage:**

- Decision 1 (EN default, honor browser) → Task 1. ✓
- Decision 2 (DB default EN) → Task 2 + verified in Task 6 step 3.5. ✓
- Decision 3 (shared switch logic) → Task 3, consumed by Tasks 4 & 5. ✓
- Decision 4 (navbar persists when logged in) → hook branch in Task 3, verified Task 5 step 7. ✓
- Decision 5 (placement: right-side cluster + drawer) → Task 5 steps 3–4. ✓
- Spec §5 navbar component (dropdown, a11y, endonyms) → Task 5 (via `Select`, which provides menu/keyboard/portal + `ariaLabel`). ✓
- Spec §6 messages (endonym reuse + optional `nav.language` aria-label) → Task 5 step 1. ✓
- Spec §4 LanguageSection refactor → Task 4. ✓
- LocaleSync interaction (no change needed) → confirmed unchanged; verified no snap-back in Task 5 step 7 / Task 6 step 3. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**Type consistency:** `useLanguageSwitch` returns `{ locale: Language; switchLocale: (next: Language) => void }` in Task 3; consumed with those exact names/types in Tasks 4 and 5. `Select<T>` `onChange: (value: T) => void` matches `switchLocale: (next: Language) => void` since options are typed `Language`. `LanguageSwitcher` prop `{ className?: string }` matches its usage (no props passed → optional). ✓
