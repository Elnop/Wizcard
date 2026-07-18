# Google OAuth Sign-in (Supabase self-hosted)

**Date:** 2026-07-18
**Status:** Approved — ready for implementation plan

## Goal

Add Google OAuth sign-in alongside the existing email OTP flow, with a
generic multi-provider client API ready for future providers (Apple, GitHub…).
Works end-to-end in local dev (via `config.toml`) and in production
(self-hosted Supabase on Coolify, via GoTrue env vars).

## Context (current state)

- **Auth today:** email OTP only. `LoginForm.tsx` → `signInWithEmailOtp` →
  magic link → `/auth/confirm` route. That route already handles the PKCE
  `code` branch (`exchangeCodeForSession`, lines 17–26), so OAuth lands there
  with no new route needed.
- **Profile creation:** a DB trigger `handle_new_user` (migration
  `20260704000000_default_unique_nickname.sql`) fires on `auth.users` insert
  and creates `public.profiles` with an auto-generated unique nickname
  `wizard_<6-hex>`. This already fires for OAuth signups — so a Google user
  gets a working (ugly) nickname today with zero code.
- **Nickname rules** (`src/lib/profile/validation.ts`): 3–30 chars, charset
  `^[\p{L}\p{Nd}. _-]+$`, reserved-word list, case-insensitive uniqueness
  (DB unique index on `lower(nickname)`), DB CHECK backstop
  (`20260714120000_profile_field_constraints.sql`).
- **Config:** `supabase/config.toml` drives local dev only; prod is GoTrue on
  Coolify configured by env vars.

## Design decisions (settled)

1. **Nickname source for Google users:** derive from the Google display name,
   not `wizard_<hex>`. Fallback cascade: `full_name` → `name` → email local-part
   → `wizard_<hex>`.
2. **Invalid/taken handling:** normalize + numeric suffix on collision. User is
   signed in directly (zero friction) and can change the nickname later in
   settings.
3. **Logic location:** in the SQL trigger `handle_new_user` (atomic, single
   source of truth, survives an app crash, no ugly-nickname window).
4. **Scope:** Google + generic multi-provider client API, local + prod.

## Components

### 1. Migration — enrich `handle_new_user`

New migration `20260718xxxxxx_oauth_nickname_from_metadata.sql`:

- `create extension if not exists unaccent;`
- **Generalize** `generate_unique_nickname` to accept a text base and append a
  numeric suffix (`_2`, `_3`, …) on collision, keeping the existing
  `wizard_<hex>` behavior as the default base. (Verify existing signature/callers
  during implementation; keep a `uid`-only overload or default arg so current
  callers still work.)
- New helper `normalize_oauth_nickname(raw text) returns text`:
  - `unaccent` → trim → collapse internal whitespace to single space
  - strip characters outside the nickname charset
  - truncate to 30
  - return `null` when result length < 3 or is a reserved word (reserved list
    mirrored in SQL).
- Rewrite `handle_new_user`:
  - `base := normalize_oauth_nickname(coalesce(raw_user_meta_data->>'full_name',
raw_user_meta_data->>'name', split_part(new.email, '@', 1)))`
  - if `base is not null` → `generate_unique_nickname(base)`
    else → `generate_unique_nickname` with the `wizard_<hex>` base (current behavior)
  - insert into `profiles (id, nickname)` … `on conflict (id) do nothing`.

Trigger remains the **only** profile-creation path. Email signups (no Google
metadata, email local-part may still be usable) and Google signups both flow
through it. The DB CHECK constraint stays the ultimate backstop.

### 2. `config.toml` — local dev

```toml
[auth.external.google]
enabled = true
client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"
skip_nonce_check = true   # required for local Google sign-in (see config.toml note)
```

- Add the two values to `.env` (never commit the secret).
- Ensure `redirectTo` targets are in `additional_redirect_urls`
  (`/auth/confirm` already present).
- Apply with `npm run sb:restart` (recreates containers — **not** `sb:reset`;
  GoTrue reads these env vars at container start).

### 3. Client — generic `signInWithOAuth`

- `src/lib/supabase/auth/auth-client.ts`: add
  `signInWithOAuth(provider: OAuthProvider)` where
  `type OAuthProvider = 'google'` (union, extensible), calling
  `supabase.auth.signInWithOAuth({ provider, options: { redirectTo:
`${window.location.origin}/auth/confirm` } })`.
- `LoginForm.tsx`: add a "Continuer avec Google" button wired to it.
- `/auth/confirm/route.ts`: the login analytics event currently hardcodes
  `method: 'email'` on the PKCE branch — make it dynamic (pass the provider,
  e.g. via a query param the client sets, or infer from session). OTP branch
  stays `email`.

### 4. Production (Coolify) — documented steps

GoTrue env vars on the `supabase-auth` service:

```
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=...
GOTRUE_EXTERNAL_GOOGLE_SECRET=...
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://<supabase-domain>/auth/v1/callback
```

Then restart/redeploy the auth container. Migration ships via the normal prod
migration workflow (diff `main..origin/deploy`, apply idempotent script, sync
`schema_migrations`).

## Google Cloud Console setup (manual, user does this)

Project "Wizcard" already created. Remaining steps (guided at implementation):

1. OAuth consent screen (External, app name, support email, scopes
   email/profile).
2. Credentials → OAuth 2.0 Client ID → Web application.
3. **Authorized redirect URIs** point to the GoTrue callback, not Next.js:
   - Local: `http://127.0.0.1:54321/auth/v1/callback`
   - Prod: `https://<supabase-domain>/auth/v1/callback`
4. Copy `client_id` + `client_secret` into `.env` (local) and Coolify (prod).

## Testing / verification

No test framework in this repo (`project_no_test_framework`). Verify via:

- `npm run check` — no NEW problems on changed files (baseline is RED,
  ~60 pre-existing).
- `npm run sb:restart` then `sb:migrate` (or `sb:reset`) applies the migration
  clean.
- Runtime: click "Continuer avec Google" in dev → Google consent → redirect to
  `/auth/confirm` → session established → `/collection`. Inspect
  `public.profiles` in Studio: nickname derived from Google name, suffix on
  collision, `wizard_<hex>` fallback when metadata absent.
- Edge cases: name with accents (`Léon` → `Leon`), name < 3 chars, reserved
  word, duplicate name (→ `_2`).

## Out of scope

- Other providers (Apple, GitHub…) — API is ready but not wired.
- Account linking (same email via OTP and Google) — GoTrue default behavior;
  not customized here.
