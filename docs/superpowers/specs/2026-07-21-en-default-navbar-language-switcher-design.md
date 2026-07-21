# EN default locale + navbar language switcher

**Date:** 2026-07-21
**Status:** Approved (design)

## Goal

Make **English the default language** of the app, and add a **language dropdown in the navbar** so any visitor — logged in or not — can switch language easily. Today the only place to change language is the Settings page, and the default locale is French.

## Current state (as of this spec)

- next-intl routing: `locales: ['fr', 'en']`, `defaultLocale: 'fr'`, `localePrefix: 'always'`. `/` issues a 307 to the resolved locale; every page is locale-prefixed (`/fr/...`, `/en/...`). Source: `src/i18n/routing.ts`.
- Middleware is composed in `src/proxy.ts`: next-intl middleware first (owns the redirect + `NEXT_LOCALE` cookie + `x-next-intl-locale` header), then Supabase session refresh layered on the same response.
- `profiles.language` DB column: `not null default 'fr'`, `CHECK (language in ('en','fr'))` (migration `20260713120000_add_profile_preferences.sql`).
- `LocaleSync` (`src/lib/profile/components/LocaleSync.tsx`): after auth, reconciles URL locale with `profile.language`, one-shot per session via `useRef` + `sessionStorage`.
- Language switching UI: only `src/app/[locale]/settings/sections/LanguageSection.tsx`. It calls `updateProfile({ language })` then `router.replace(pathname, { locale })`.
- Navbar: `src/components/Navbar/Navbar.tsx` (desktop) + `NavbarDrawer.tsx` (mobile) + `ProfileMenu.tsx` (account dropdown). Right side has a `syncSection` (SyncIndicator) and `authSection` (ProfileMenu when logged in, else `/auth/login` link).
- Messages: `messages/en.json`, `messages/fr.json`. `nav.*` keys exist; `settings.language.{french,english}` provide endonym labels.

## Decisions

1. **Anonymous default = EN, honoring browser language.** `defaultLocale` → `'en'`. Keep next-intl's `Accept-Language` detection (`localeDetection` stays at its default of `true`). Result: a French-preferring browser still lands on `/fr`; everyone else lands on `/en`.
2. **DB default = EN for new accounts.** New migration sets `profiles.language` default to `'en'`. Existing rows untouched — current `fr` users keep their preference. CHECK unchanged.
3. **Shared switch logic.** Extract the "navigate to new locale + persist to profile if logged in" behavior into a shared hook, consumed by both the new navbar switcher and Settings' `LanguageSection`.
4. **Navbar switch persists to profile when logged in.** Same durable behavior as Settings, so the preference follows the user across devices and `LocaleSync` never fights the switch.
5. **Placement:** desktop navbar right-side sync/auth cluster; also surfaced in the mobile drawer.

## Components

### 1. Routing default (`src/i18n/routing.ts`)

Change `defaultLocale: 'fr'` → `'en'`. Update the doc comment: EN is now the default (SEO/GEO target), FR retained via `Accept-Language` detection and explicit `/fr` prefix. `localePrefix: 'always'` and the `locales` array are unchanged. `localeDetection` is intentionally left unset (defaults to `true`).

### 2. DB migration (`supabase/migrations/20260721120000_default_language_en.sql`)

```sql
alter table public.profiles
  alter column language set default 'en';
```

Idempotent (re-running is a no-op). No data backfill — existing `fr` preferences are deliberately preserved. Apply locally via `sb:migrate` per project workflow (no test framework; verify via `npm run check` + runtime).

### 3. Shared hook — `useLanguageSwitch`

**Location:** `src/lib/profile/hooks/useLanguageSwitch.ts` (co-located with profile context it depends on). Follow existing file conventions.

**Responsibility:** single source of truth for changing the interface language.

```ts
// returns { locale, switchLocale }
function switchLocale(next: Locale) {
	// URL is the render authority; also updates NEXT_LOCALE cookie:
	router.replace(pathname, { locale: next });
	// persist durable preference when authenticated:
	if (profile) updateProfile({ language: next });
}
```

- Uses `useLocale()`, `useRouter`/`usePathname` from `@/i18n/navigation`, and `useProfileContext()`.
- Logged-out: `profile` is null → URL + cookie only, no DB write. No error.
- No-op guard: if `next === locale`, do nothing.

**Interface / dependencies:** depends on next-intl navigation + ProfileContext. Must be called within `NextIntlClientProvider` and `ProfileProvider` (already true wherever navbar and settings render).

### 4. `LanguageSection` refactor (`.../settings/sections/LanguageSection.tsx`)

Replace its inline `router.replace` + `updateProfile` calls with `useLanguageSwitch()`. Keep the save-status UI (`useSaveStatus` / `markSaving`) and the `Select` component. Behavior unchanged for the user.

### 5. Navbar `LanguageSwitcher` (`src/components/Navbar/LanguageSwitcher.tsx`)

Compact dropdown mirroring the `ProfileMenu` pattern:

- Trigger button shows the current locale (endonym or uppercase code, e.g. `EN` / `FR`), `aria-haspopup="menu"`, `aria-expanded`.
- Open menu lists both locales (endonym labels from `settings.language.{english,french}`); selecting one calls `switchLocale(next)` and closes.
- Dismissal: click-outside (`mousedown`) + `Escape`, same effect pattern as `ProfileMenu`.
- `role="menu"` / `role="menuitem"`, keyboard accessible.
- Works identically logged-in and logged-out (hook handles the persistence branch).
- Styling reuses `Navbar.module.css` dropdown classes where possible; add minimal classes as needed.

**Placement:**

- Desktop: inside the right-side sync/auth cluster in `Navbar.tsx` (near `SyncIndicator` / auth node). Rendered for all users regardless of auth state.
- Mobile: add to `NavbarDrawer.tsx` in a sensible slot (e.g. near the account/menu controls), using the same component (an `inline` variant if the drawer needs non-floating layout, consistent with how `ProfileMenu` exposes `inline`).

### 6. Messages

Reuse existing `settings.language.{french,english}` endonyms for labels. Add any new nav-scoped strings only if needed (e.g. an `aria-label` like `nav.language` = "Language" / "Langue") to both `messages/en.json` and `messages/fr.json`. Keep both catalogs in sync.

## Data flow

1. Visitor hits `/` → next-intl middleware resolves locale from `Accept-Language` (default EN) → 307 to `/en` or `/fr`, sets `NEXT_LOCALE`.
2. User clicks the navbar `LanguageSwitcher` → `switchLocale(next)` → `router.replace(pathname,{locale:next})` re-renders under new prefix and updates `NEXT_LOCALE`; if logged in, `updateProfile({language:next})` persists.
3. On next authenticated load, `LocaleSync` sees `profile.language === URL locale` (because navbar switch persisted) → no redirect. Its `sessionStorage` one-shot guard already prevents snap-back within a session.

## Error handling

- `switchLocale` on an unchanged locale is a no-op.
- Logged-out switch performs no DB write; nothing can fail there.
- `updateProfile` failures surface through the existing ProfileContext/update path (unchanged); the URL change still succeeds independently.

## Testing / verification

No test framework in this project (per project memory). Verify via:

- `npm run check` — gate on **no NEW** problems vs the known-RED baseline; run `npx eslint` on changed files specifically.
- Runtime (dev + `sb:migrate`): `/` redirects to `/en` on a non-FR browser and `/fr` on a FR browser; navbar dropdown switches locale logged-out (URL + cookie) and logged-in (URL + persisted `profile.language`, verified in Studio); Settings language change still works; no `LocaleSync` snap-back after a navbar switch.

## Out of scope (YAGNI)

- Changing card-data language (the Settings hint already notes card language stays English).
- More than two locales.
- Backfilling existing `fr` users to `en`.
- Any redesign of the navbar beyond adding the switcher.
