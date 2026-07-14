# Profile Input Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate and normalize profile nickname/description at the client and enforce them with DB CHECK constraints, so the URL-identifier nickname is always URL-safe, correctly sized, unique, and free of reserved words.

**Architecture:** A single shared TS module (`validation.ts`) is the source of truth for normalization + validation. The settings form calls it before the existing uniqueness check. A DB migration adds CHECK constraints mirroring the rules as the ultimate backstop. The pre-existing case-insensitive unique index remains the uniqueness authority.

**Tech Stack:** TypeScript, Next.js App Router, next-intl (messages in `messages/*.json`), Supabase/Postgres migrations.

## Global Constraints

- No test framework in this repo — verify via `npm run check` (tsc + eslint + prettier) and runtime/SQL. Do NOT add vitest/jest.
- Locales: exactly `['fr', 'en']`. Every new i18n key MUST be added to BOTH `messages/en.json` and `messages/fr.json`.
- Nickname rules (verbatim): length 3–30 after normalization; charset `^[\p{L}\p{N}. _-]+$` (unicode letters, digits, `.`, `_`, `-`, space); reserved (case-insensitive): `admin, api, settings, login, logout, signup, users, wizard, null, undefined`; casing preserved, uniqueness case-insensitive.
- Description rule: max length 500.
- Migrations must be idempotent (each `add constraint` preceded by `drop constraint if exists`), consistent with the prod migration workflow.
- `updateProfile` is fire-and-forget (optimistic store + async sync-queue). Do NOT try to surface DB unique-violation to the form synchronously — out of scope.
- No test framework means Step "run test" phases are replaced by `npm run check` and explicit manual runtime/SQL checks.

---

### Task 1: Shared validation module

**Files:**

- Create: `src/lib/profile/validation.ts`

**Interfaces:**

- Consumes: nothing (pure module).
- Produces:
  - `NICKNAME_MIN = 3`, `NICKNAME_MAX = 30`, `DESCRIPTION_MAX = 500` (numbers)
  - `RESERVED_NICKNAMES: ReadonlySet<string>` (lowercased)
  - `NICKNAME_CHARSET: RegExp`
  - `normalizeNickname(raw: string): string`
  - `type NicknameErrorCode = 'tooShort' | 'tooLong' | 'invalidChars' | 'reserved'`
  - `type NicknameValidation = { ok: true } | { ok: false; code: NicknameErrorCode }`
  - `validateNickname(normalized: string): NicknameValidation`

- [ ] **Step 1: Create the module with the exact implementation**

```ts
// src/lib/profile/validation.ts

/**
 * Single source of truth for profile field validation. Shared by the settings
 * form (UI messages) and mirrored by the DB CHECK constraint (ultimate backstop).
 * Nicknames are URL identifiers (/users/<nickname>), so the charset is deliberately
 * URL-safe. Casing is preserved for display; uniqueness is case-insensitive (DB index).
 */

export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 30;
export const DESCRIPTION_MAX = 500;

/** Reserved words that would collide with routes or impersonate the site. */
export const RESERVED_NICKNAMES: ReadonlySet<string> = new Set([
	'admin',
	'api',
	'settings',
	'login',
	'logout',
	'signup',
	'users',
	'wizard',
	'null',
	'undefined',
]);

/** Unicode letters/digits + dot, underscore, hyphen, space. */
export const NICKNAME_CHARSET = /^[\p{L}\p{N}. _-]+$/u;

export type NicknameErrorCode = 'tooShort' | 'tooLong' | 'invalidChars' | 'reserved';
export type NicknameValidation = { ok: true } | { ok: false; code: NicknameErrorCode };

/** Trim and collapse internal whitespace runs to a single space. */
export function normalizeNickname(raw: string): string {
	return raw.trim().replace(/\s+/g, ' ');
}

/**
 * Validate an ALREADY-normalized nickname. Does not check uniqueness (async, DB) —
 * that is the caller's job via isNicknameTaken.
 */
export function validateNickname(normalized: string): NicknameValidation {
	if (normalized.length < NICKNAME_MIN) return { ok: false, code: 'tooShort' };
	if (normalized.length > NICKNAME_MAX) return { ok: false, code: 'tooLong' };
	if (!NICKNAME_CHARSET.test(normalized)) return { ok: false, code: 'invalidChars' };
	if (RESERVED_NICKNAMES.has(normalized.toLowerCase())) return { ok: false, code: 'reserved' };
	return { ok: true };
}
```

- [ ] **Step 2: Verify it typechecks and lints**

Run: `npm run check`
Expected: PASS (no tsc/eslint/prettier errors). The module is unused so far; that is fine — it is consumed in Task 3.

- [ ] **Step 3: Sanity-check the logic at runtime**

Run:

```bash
npx tsx -e "
import { normalizeNickname as n, validateNickname as v } from './src/lib/profile/validation.ts';
const cases = ['leon le testeur','leon  le   testeur','ab','José Müller','a/b','admin','WIZARD','wizard_ab12cd','x'.repeat(31)];
for (const c of cases) { const nn = n(c); console.log(JSON.stringify(c), '->', JSON.stringify(nn), v(nn)); }
"
```

Expected (key rows): `"leon le testeur"` → ok; `"leon  le   testeur"` → normalized `"leon le testeur"` ok; `"ab"` → tooShort; `"José Müller"` → ok; `"a/b"` → invalidChars; `"admin"` → reserved; `"WIZARD"` → reserved; `"wizard_ab12cd"` → ok; 31×`x` → tooLong.
(If `tsx` is unavailable, skip and rely on Task 3 runtime check.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/profile/validation.ts
git commit -m "feat(profile): shared nickname/description validation module"
```

---

### Task 2: DB CHECK constraints migration

**Files:**

- Create: `supabase/migrations/20260714120000_profile_field_constraints.sql`

**Interfaces:**

- Consumes: existing `public.profiles` table (columns `nickname text`, `description text`) and index `profiles_nickname_lower_key`.
- Produces: constraints `profiles_nickname_valid`, `profiles_description_len`.

- [ ] **Step 1: Write the migration**

```sql
-- Enforce nickname/description rules at the DB layer as the ultimate backstop,
-- mirroring src/lib/profile/validation.ts. Idempotent: drop-then-add so it can be
-- re-run in the prod migration workflow. The case-insensitive unique index
-- (profiles_nickname_lower_key) already enforces uniqueness and is left untouched.

alter table public.profiles drop constraint if exists profiles_nickname_valid;
alter table public.profiles drop constraint if exists profiles_description_len;

alter table public.profiles
  add constraint profiles_nickname_valid check (
    nickname is null or (
      char_length(nickname) between 3 and 30
      -- Unicode letters/digits + dot, underscore, hyphen, space. \p classes need
      -- the case-insensitive-free posix path; use an explicit unicode-aware regex.
      and nickname ~ '^[[:alnum:]._ -]+$'
      and lower(nickname) not in (
        'admin','api','settings','login','logout','signup','users','wizard','null','undefined'
      )
    )
  ),
  add constraint profiles_description_len check (
    description is null or char_length(description) <= 500
  );
```

- [ ] **Step 2: Verify `[[:alnum:]]` accepts accented letters on this DB's locale**

Run:

```bash
docker exec supabase_db_scute_swarm psql -U postgres -d postgres -tAc "select 'José Müller' ~ '^[[:alnum:]._ -]+\$';"
```

Expected: `t` (true). If it returns `f`, the DB locale is not unicode-aware for `[[:alnum:]]` — in that case replace the regex in the migration with an explicit class that includes the Latin ranges actually needed, e.g. `'^[A-Za-z0-9À-ÖØ-öø-ÿ._ -]+$'`, and re-run this step until it returns `t`. Record the final regex used.

- [ ] **Step 3: Apply the migration**

Run: `npm run sb:migrate`
Expected: migration applies with no error (existing 2 profiles already conform — audited: 0 violations).

- [ ] **Step 4: Verify constraints reject bad values and accept good ones**

Run:

```bash
docker exec supabase_db_scute_swarm psql -U postgres -d postgres -c "
-- these must all FAIL:
do \$\$ begin
  begin update public.profiles set nickname='ab' where nickname='leon le testeur'; raise exception 'SHOULD HAVE FAILED short'; exception when check_violation then raise notice 'ok: short rejected'; end;
  begin update public.profiles set nickname='a/b' where nickname='leon le testeur'; raise exception 'SHOULD HAVE FAILED charset'; exception when check_violation then raise notice 'ok: charset rejected'; end;
  begin update public.profiles set nickname='admin' where nickname='leon le testeur'; raise exception 'SHOULD HAVE FAILED reserved'; exception when check_violation then raise notice 'ok: reserved rejected'; end;
end \$\$;
-- this must SUCCEED (accent + space), then revert:
update public.profiles set nickname='José Müller' where nickname='leon le testeur';
update public.profiles set nickname='leon le testeur' where nickname='José Müller';
"
```

Expected: three `NOTICE: ok: ... rejected` lines, the accented update succeeds, and the revert restores `leon le testeur`. No `SHOULD HAVE FAILED` error raised.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260714120000_profile_field_constraints.sql
git commit -m "feat(db): CHECK constraints for profile nickname/description"
```

---

### Task 3: Wire validation into the settings form + i18n

**Files:**

- Modify: `src/app/[locale]/settings/sections/ProfileSection.tsx`
- Modify: `messages/en.json`
- Modify: `messages/fr.json`

**Interfaces:**

- Consumes from Task 1: `normalizeNickname`, `validateNickname`, `NicknameErrorCode`, `NICKNAME_MAX`.
- Produces: none (leaf UI change).

- [ ] **Step 1: Add the four error keys to `messages/en.json`**

Under `settings.profile`, add (keep existing keys):

```json
"nicknameTooShort": "Nickname must be at least {min} characters.",
"nicknameTooLong": "Nickname must be at most {max} characters.",
"nicknameInvalidChars": "Nickname can only contain letters, numbers, spaces, and . _ -",
"nicknameReserved": "This nickname is reserved and cannot be used."
```

- [ ] **Step 2: Add the four error keys to `messages/fr.json`**

Under `settings.profile`, add:

```json
"nicknameTooShort": "Le pseudo doit contenir au moins {min} caractères.",
"nicknameTooLong": "Le pseudo doit contenir au plus {max} caractères.",
"nicknameInvalidChars": "Le pseudo ne peut contenir que des lettres, chiffres, espaces et . _ -",
"nicknameReserved": "Ce pseudo est réservé et ne peut pas être utilisé."
```

- [ ] **Step 3: Import the validation helpers in ProfileSection**

In `src/app/[locale]/settings/sections/ProfileSection.tsx`, add to the imports:

```ts
import {
	normalizeNickname,
	validateNickname,
	NICKNAME_MIN,
	NICKNAME_MAX,
	type NicknameErrorCode,
} from '@/lib/profile/validation';
```

- [ ] **Step 4: Replace `commitNickname` to normalize + validate before the taken-check**

Replace the whole `commitNickname` function (currently lines ~25-44) with:

```ts
const nicknameErrorKey: Record<NicknameErrorCode, string> = {
	tooShort: 'nicknameTooShort',
	tooLong: 'nicknameTooLong',
	invalidChars: 'nicknameInvalidChars',
	reserved: 'nicknameReserved',
};

const commitNickname = async () => {
	const normalized = normalizeNickname(nickname);
	setNicknameError(null);
	// Reflect the normalized value back into the field so the user sees what is saved.
	if (normalized !== nickname) setNickname(normalized);
	if (normalized === (profile.nickname ?? '')) return;
	if (normalized) {
		const v = validateNickname(normalized);
		if (!v.ok) {
			setNicknameError(t(nicknameErrorKey[v.code], { min: NICKNAME_MIN, max: NICKNAME_MAX }));
			return;
		}
		try {
			if (await isNicknameTaken(normalized, user.id)) {
				setNicknameError(t('nicknameTaken'));
				return;
			}
		} catch {
			setNicknameError(t('nicknameCheckFailed'));
			return;
		}
	}
	markSaving();
	updateProfile({ nickname: normalized || null });
};
```

Note: `nicknameErrorKey` uses `NICKNAME_MIN`/`NICKNAME_MAX` in the `t()` call — add `NICKNAME_MIN` to the import from Step 3 (`import { normalizeNickname, validateNickname, NICKNAME_MIN, NICKNAME_MAX, type NicknameErrorCode }`). Place the `nicknameErrorKey` const at module scope (top of file, after imports) or inside the component above `commitNickname` — module scope is cleaner since it is static.

- [ ] **Step 5: Lower the input maxLength to the nickname cap**

Change the nickname `<input>` attribute `maxLength={50}` to `maxLength={NICKNAME_MAX}`.

- [ ] **Step 6: Verify typecheck/lint/format**

Run: `npm run check`
Expected: PASS. If eslint flags `NICKNAME_MIN` unused or missing, adjust the import to exactly the identifiers used.

- [ ] **Step 7: Runtime verification in the settings form**

Start dev if not running (`npm run dev`), open the settings profile section, and confirm on blur:

- `ab` → shows "at least 3 characters" error, not saved.
- `a/b` → shows invalid-chars error.
- `admin` → shows reserved error.
- `leon  le   testeur` (double spaces) → field collapses to `leon le testeur`, saves.
- `José Müller` → saves.
  Then visit `/en/users/<the saved nickname>` and confirm the profile resolves (covered by the earlier `decodeURIComponent` fix).

- [ ] **Step 8: Commit**

```bash
git add src/app/[locale]/settings/sections/ProfileSection.tsx messages/en.json messages/fr.json
git commit -m "feat(profile): validate & normalize nickname in settings form"
```

---

## Notes / Out of scope

- Surfacing an async sync-queue DB error (e.g. a unique-violation lost race) back to the settings form is NOT handled here — `updateProfile` is fire-and-forget. The pre-submit `isNicknameTaken` check plus the DB unique index are the guards. Improving sync-queue error surfacing is a separate concern.
- The already-shipped `decodeURIComponent` fix in `ProfileShell.tsx` is the resolution-side counterpart and is not re-touched by this plan.
