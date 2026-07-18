# Google OAuth Sign-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google OAuth sign-in alongside email OTP, with a generic multi-provider client API and a DB trigger that derives the nickname from the Google display name.

**Architecture:** OAuth lands on the existing `/auth/confirm` PKCE branch (no new route). The existing `handle_new_user` trigger — already the single profile-creation path — is enriched to derive the nickname from `raw_user_meta_data` (Google name), normalized in SQL, with numeric-suffix collision handling and a `wizard_<hex>` fallback. A generic `signInWithOAuth(provider)` client helper wires the UI.

**Tech Stack:** Supabase (self-hosted, GoTrue), Postgres (plpgsql, `unaccent`), Next.js App Router, `@supabase/supabase-js`, next-intl.

## Global Constraints

- No test framework (vitest/jest absent). Verify via `npm run check` (no NEW problems on changed files; baseline is RED ~60 pre-existing) + runtime.
- Nickname rules mirrored across three layers: `src/lib/profile/validation.ts` (3–30, charset `^[\p{L}\p{Nd}. _-]+$`, reserved list), DB unique index `profiles_nickname_lower_key` on `lower(nickname)`, DB CHECK `profiles_nickname_valid` (posix `^[[:alnum:]._ -]+$`, reserved list `admin,api,settings,login,logout,signup,users,wizard,null,undefined`).
- Generated nicknames MUST satisfy the DB CHECK (posix alnum + `._ -`), so normalized output must be ASCII → use `unaccent`.
- Secrets never committed. Real values go in `.env.local` (gitignored); `config.toml` references `env(...)` only.
- Editing `config.toml` requires `npm run sb:restart` (recreates containers), NOT `sb:reset`. GoTrue env baked at container creation.
- Migration files must be idempotent (drop-then-create / `create or replace` / `if not exists`) for the prod migration workflow.

---

### Task 1: Migration — derive nickname from OAuth metadata

**Files:**

- Create: `supabase/migrations/20260718120000_oauth_nickname_from_metadata.sql`

**Interfaces:**

- Consumes: existing `public.generate_unique_nickname(uid uuid)`, `public.default_nickname_base(uid uuid)` from `20260704000000_default_unique_nickname.sql`.
- Produces: `public.normalize_oauth_nickname(raw text) returns text`; overloaded `public.generate_unique_nickname(base text) returns text`; rewritten `public.handle_new_user()` trigger fn.

- [ ] **Step 1: Write the migration**

```sql
-- Derive a new profile's nickname from OAuth provider metadata (e.g. Google
-- full_name) instead of the generic wizard_<hex>. Normalized in SQL so the
-- trigger stays the single, atomic profile-creation path. Falls back to
-- wizard_<hex> when no usable name is present. Idempotent.

create extension if not exists unaccent;

-- Normalize a raw display name into a nickname candidate that satisfies the
-- profiles_nickname_valid CHECK (posix alnum + dot/underscore/hyphen/space,
-- 3..30 chars, not reserved). Returns null when no valid candidate remains.
create or replace function public.normalize_oauth_nickname(raw text)
  returns text
  language plpgsql
  immutable
as $$
declare
  candidate text;
begin
  if raw is null then
    return null;
  end if;
  -- ASCII-fold accents, then keep only charset-legal characters.
  candidate := unaccent(raw);
  candidate := regexp_replace(candidate, '[^[:alnum:]._ -]', '', 'g');
  -- Collapse whitespace runs and trim.
  candidate := btrim(regexp_replace(candidate, '\s+', ' ', 'g'));
  -- Enforce max length (truncate), then re-trim in case truncation left a space.
  candidate := btrim(substr(candidate, 1, 30));
  if char_length(candidate) < 3 then
    return null;
  end if;
  if lower(candidate) in (
    'admin','api','settings','login','logout','signup','users','wizard','null','undefined'
  ) then
    return null;
  end if;
  return candidate;
end;
$$;

-- Collision-safe generator from an arbitrary text base: return base as-is if
-- free, else append _2, _3, ... until free (bounded), respecting the 30-char cap.
create or replace function public.generate_unique_nickname(base text)
  returns text
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  candidate text := base;
  n int := 2;
  suffix text;
begin
  loop
    exit when not exists (
      select 1 from public.profiles where lower(nickname) = lower(candidate)
    );
    suffix := '_' || n::text;
    -- Keep total length <= 30 by trimming the base to make room for the suffix.
    candidate := substr(base, 1, 30 - char_length(suffix)) || suffix;
    n := n + 1;
    if n > 10000 then
      candidate := 'wizard_' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
      exit when not exists (
        select 1 from public.profiles where lower(nickname) = lower(candidate)
      );
    end if;
  end loop;
  return candidate;
end;
$$;

-- Rewrite the signup trigger: prefer a nickname derived from provider metadata
-- (Google full_name -> name -> email local-part), else the wizard_<hex> base.
create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  base text;
begin
  base := public.normalize_oauth_nickname(coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(coalesce(new.email, ''), '@', 1)
  ));
  if base is null then
    base := public.default_nickname_base(new.id);  -- wizard_<6hex>
  end if;

  insert into public.profiles (id, nickname)
    values (new.id, public.generate_unique_nickname(base))
    on conflict (id) do nothing;
  return new;
end;
$$;
```

- [ ] **Step 2: Apply the migration locally**

Run: `npm run sb:migrate`
Expected: applies `20260718120000_oauth_nickname_from_metadata.sql` with no error. (If it reports the trigger fn already exists in a conflicting way, `npm run sb:reset` re-applies all migrations clean — destructive to local data only.)

- [ ] **Step 3: Runtime-verify the SQL helpers in Studio SQL editor**

Run these in `npm run sb:studio` → SQL editor:

```sql
select public.normalize_oauth_nickname('Léon P');      -- expect: 'Leon P'
select public.normalize_oauth_nickname('ab');           -- expect: null (too short)
select public.normalize_oauth_nickname('admin');        -- expect: null (reserved)
select public.normalize_oauth_nickname('José!!@#');     -- expect: 'Jose'
select public.generate_unique_nickname('wizard_abc123');-- expect: free base returned as-is
```

Expected: outputs match the comments. `generate_unique_nickname('Leon P')` twice (insert one profile with that nickname in between, or just eyeball the suffix logic) should yield `Leon P` then `Leon P_2`.

- [ ] **Step 4: Verify schema audit passes**

Run: `npm run sb:verify`
Expected: no new failures introduced by this migration (function/trigger present).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260718120000_oauth_nickname_from_metadata.sql
git commit -m "feat(auth): derive profile nickname from OAuth metadata in handle_new_user"
```

---

### Task 2: Enable Google provider in local config

**Files:**

- Modify: `supabase/config.toml` (the `[auth.external.apple]` block region, ~line 305)
- Modify: `.env.local` (gitignored — add real credentials)
- Modify: `.env.example` (add placeholder keys, committed)

**Interfaces:**

- Consumes: nothing.
- Produces: `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`, `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` env vars consumed by `config.toml`.

- [ ] **Step 1: Add the Google provider block to `config.toml`**

Insert directly after the existing `[auth.external.apple]` block (after its `email_optional = false` line, ~line 318):

```toml
[auth.external.google]
enabled = true
client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"
# Required for local sign in with Google auth (skips nonce check).
skip_nonce_check = true
```

- [ ] **Step 2: Add real credentials to `.env.local`**

Append (values provided by the user — never commit these; `.env.local` is gitignored):

```
# Google OAuth (Supabase Auth external provider)
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=415044201605-044j23kf0irsqopfdr0rrchv3eldt8pl.apps.googleusercontent.com
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=<paste-secret-here>
```

- [ ] **Step 3: Add placeholders to `.env.example`**

Append:

```
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=your-google-oauth-client-id
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=your-google-oauth-client-secret
```

- [ ] **Step 4: Restart Supabase so GoTrue picks up the provider**

Run: `npm run sb:restart`
Expected: containers stop and start; no error about missing env. (The CLI substitutes `env(...)` from the shell / dotenv. If GoTrue doesn't see the vars, export them in the shell before `sb:restart`, or confirm the Supabase CLI dotenv loading picks up `.env.local`.)

- [ ] **Step 5: Verify the provider endpoint is live**

Run: `curl -s "http://127.0.0.1:54321/auth/v1/authorize?provider=google" -o /dev/null -w "%{http_code} %{redirect_url}\n"`
Expected: a `302` redirecting to `https://accounts.google.com/...` (not a 400 "provider not enabled").

- [ ] **Step 6: Commit (config + example only, NOT .env.local)**

```bash
git add supabase/config.toml .env.example
git commit -m "feat(auth): enable Google external provider in local Supabase config"
```

---

### Task 3: Generic `signInWithOAuth` client helper + provider-aware login tracking

**Files:**

- Modify: `src/lib/supabase/auth/auth-client.ts`
- Modify: `src/app/[locale]/auth/confirm/route.ts:17-26` (make PKCE branch's `method` dynamic)

**Interfaces:**

- Consumes: `createClient` from `@/lib/supabase/client`.
- Produces: `type OAuthProvider = 'google';` and `signInWithOAuth(provider: OAuthProvider): Promise<{ error: AuthError | null }>` — a full-page redirect helper (no return on success). The confirm route reads a `provider` query param to attribute the login event.

- [ ] **Step 1: Add the helper to `auth-client.ts`**

Append after `signInWithEmailOtp` (imports already present: `AuthError`, `createClient`):

```ts
/** OAuth providers wired for sign-in. Extend the union to add more. */
export type OAuthProvider = 'google';

/**
 * Start an OAuth sign-in. On success the browser is redirected to the provider
 * and this promise never resolves in-page; only failures return an error.
 * `provider` is echoed back via the redirect URL so /auth/confirm can attribute
 * the login analytics event to the right method.
 */
export async function signInWithOAuth(
	provider: OAuthProvider
): Promise<{ error: AuthError | null }> {
	const supabase = createClient();
	const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?provider=${provider}`;
	const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
	return { error };
}
```

- [ ] **Step 2: Make the confirm route's login `method` dynamic**

In `src/app/[locale]/auth/confirm/route.ts`, read the provider from the query and use it in the PKCE branch's track call. Change the top of `GET` to also read:

```ts
const provider = searchParams.get('provider');
```

Then in the `if (code)` branch, replace the hardcoded track props:

```ts
await trackServer(
	{ name: 'login', props: { method: provider ?? 'oauth' } },
	getPosthogDistinctId(request.headers.get('cookie'))
);
```

Leave the OTP (`token_hash`) branch as `method: 'email'`.

- [ ] **Step 3: Verify types/lint on changed files**

Run: `npx eslint src/lib/supabase/auth/auth-client.ts "src/app/[locale]/auth/confirm/route.ts"`
Expected: no NEW problems (compare against baseline). Also `npx tsc --noEmit` should not add errors in these files.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/auth/auth-client.ts "src/app/[locale]/auth/confirm/route.ts"
git commit -m "feat(auth): generic signInWithOAuth helper + provider-aware login tracking"
```

---

### Task 4: "Continue with Google" button in LoginForm

**Files:**

- Modify: `src/app/[locale]/auth/login/LoginForm.tsx`
- Modify: i18n message files — add `auth.login.continueWithGoogle` and `auth.login.orDivider` keys (locate via the existing `auth.login` namespace; add to every locale JSON).
- Possibly modify: `src/app/[locale]/auth/login/page.module.css` (button + divider styles)

**Interfaces:**

- Consumes: `signInWithOAuth`, `OAuthProvider` from `@/lib/supabase/auth/auth-client`.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Locate the i18n message files for the `auth.login` namespace**

Run: `grep -rl '"login"' src/ messages/ locales/ i18n/ 2>/dev/null | grep -i json`
(Adjust path once found. Note existing keys like `email`, `sendLink`, `otpLabel` under `auth.login`.)

- [ ] **Step 2: Add the new message keys to every locale file**

Under `auth.login`, add (translate per locale; English/French shown):

```json
"continueWithGoogle": "Continue with Google",
"orDivider": "or"
```

```json
"continueWithGoogle": "Continuer avec Google",
"orDivider": "ou"
```

- [ ] **Step 3: Wire the button in `LoginForm.tsx`**

Add the import:

```ts
import {
	signInWithEmailOtp,
	verifyEmailOtpClient,
	signInWithOAuth,
} from '@/lib/supabase/auth/auth-client';
```

Add a handler inside the component (before the `if (!sent)` return):

```ts
async function handleGoogle() {
	setError(null);
	setIsLoading(true);
	const { error } = await signInWithOAuth('google');
	// On success the browser redirects away; only reached on error.
	if (error) {
		setError(error.message);
		setIsLoading(false);
	}
}
```

In the `if (!sent)` branch, render the Google button + a divider above the existing `<form>` (so it shows on the email-entry screen, not the OTP screen):

```tsx
if (!sent) {
	return (
		<div className={styles.loginOptions}>
			<button
				type="button"
				className={styles.googleBtn}
				onClick={handleGoogle}
				disabled={isLoading}
			>
				{t('continueWithGoogle')}
			</button>
			<div className={styles.divider}>{t('orDivider')}</div>
			<form className={styles.form} onSubmit={handleSubmitEmail}>
				{/* ...existing email field, error, submit button unchanged... */}
			</form>
		</div>
	);
}
```

(Keep the existing form contents byte-for-byte; only wrap them.)

- [ ] **Step 4: Add styles for `.loginOptions`, `.googleBtn`, `.divider`**

In `page.module.css`, add minimal styles consistent with existing `.submitBtn` (reuse its look for `.googleBtn`, add a simple centered divider). Match existing spacing tokens.

- [ ] **Step 5: Verify lint on changed files**

Run: `npx eslint "src/app/[locale]/auth/login/LoginForm.tsx"`
Expected: no NEW problems.

- [ ] **Step 6: Runtime end-to-end test**

With `npm run dev` and Supabase running, and Google Console redirect URI `http://127.0.0.1:54321/auth/v1/callback` configured:

1. Go to the login page → click "Continue with Google".
2. Complete Google consent (use the test user email).
3. Expect redirect to `/auth/confirm?provider=google` → session set → land on `/collection`.
4. In `npm run sb:studio`, inspect `public.profiles`: nickname derived from your Google name (accents folded, suffix on collision), NOT `wizard_<hex>` unless your name was unusable.

- [ ] **Step 7: Commit**

```bash
git add "src/app/[locale]/auth/login/LoginForm.tsx" "src/app/[locale]/auth/login/page.module.css" <locale-json-files>
git commit -m "feat(auth): add Continue with Google button to login form"
```

---

### Task 5: Document production (Coolify) rollout

**Files:**

- Modify: `.env.supabase.coolify` (add Google GoTrue vars as commented template)
- Modify: the design spec's prod section is already written; add a short runbook note if a prod runbook doc exists.

**Interfaces:** none (documentation/config template only).

- [ ] **Step 1: Add Google GoTrue vars to the Coolify env template**

Append to `.env.supabase.coolify` (real secret set in Coolify UI, not committed here):

```
# Google OAuth (external provider). Set real values in the Coolify UI.
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=
GOTRUE_EXTERNAL_GOOGLE_SECRET=
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://<supabase-domain>/auth/v1/callback
```

- [ ] **Step 2: Commit**

```bash
git add .env.supabase.coolify
git commit -m "docs(auth): document Google OAuth GoTrue vars for Coolify prod"
```

**Prod deploy (manual, when ready — not part of local verification):**

1. Add the Google redirect URI `https://<supabase-domain>/auth/v1/callback` to the Google Console OAuth client.
2. Set the four `GOTRUE_EXTERNAL_GOOGLE_*` vars (real client id/secret) in Coolify → restart/redeploy the `supabase-auth` service.
3. Ship the migration via the prod migration workflow (diff `main..origin/deploy`, apply idempotent script in prod SQL editor, sync `schema_migrations`, advance `deploy`).
4. Smoke-test the Google button on prod.

---

## Self-Review

- **Spec coverage:** Migration (Task 1), local config (Task 2), generic client + tracking (Task 3), UI button + i18n (Task 4), prod docs (Task 5). All four spec components + Google Console (guided separately) covered.
- **Placeholder scan:** `<paste-secret-here>` and `<supabase-domain>` are deliberate user-supplied values, not plan placeholders. Locale-file path (`<locale-json-files>`) resolved in Task 4 Step 1 before use.
- **Type consistency:** `OAuthProvider` and `signInWithOAuth` names identical across Tasks 3 and 4. `generate_unique_nickname(base text)` overload + `normalize_oauth_nickname` + `default_nickname_base` consistent within Task 1 and match existing migration signatures.
- **Constraint alignment:** normalized output is ASCII (unaccent) + posix-charset-filtered + reserved-checked → satisfies `profiles_nickname_valid` CHECK. Length capped at 30 including suffix.
