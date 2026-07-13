# Secure Email Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the email-change flow so the user's CURRENT address is proven first (via a home-grown email with a link to a dedicated page) before the new address is engaged.

**Architecture:** Step 1 — a service-role route mails a one-time token to the current address (nodemailer over the existing SMTP infra: Inbucket in dev, OVH in prod). Step 2 — a login-gated page `/account/change-email?token=…` collects the new address; a second service-role route validates the token (hashed, single-use, owner-scoped) then calls `admin.updateUserById({ email })`, which sends a confirmation code to the new address. Step 3 — the page collects that code and calls the existing `verifyEmailChangeOtp`. A `email_change_requests` table (RLS on, no policy) holds the tokens.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase (Postgres + Auth admin), nodemailer, TypeScript.

## Global Constraints

- No test framework — verify via `npm run check` + runtime + Supabase tooling (`sb:reset`, `sb:verify`, `sb:mail`). Do NOT add vitest/jest.
- UI copy in French.
- Token: 32 random bytes, base64url; stored in DB only as its SHA-256 hash (never plaintext); single-use (`used_at`); expires 30 min.
- `email_change_requests`: RLS enabled, NO policy for anon/authenticated — touched only by service-role routes.
- Both routes require a session (401 if anon) AND the request row must belong to the session `user_id`.
- Service-role key read server-side only (`SUPABASE_SERVICE_ROLE_KEY`), never `NEXT_PUBLIC_`. Server/admin client pattern mirrors `src/app/api/account/delete/route.ts`.
- Email link base URL: `process.env.NEXT_PUBLIC_SITE_URL` (dev `http://localhost:3000`).
- SMTP: nodemailer; dev → local Inbucket SMTP, prod → OVH via `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`. Select prod when those env vars are present, else Inbucket.
- This flow REPLACES the two-simultaneous-code OTP UI in `AccountSection` (commit `b3f7902`); that UI is removed.
- `double_confirm_changes` set to `false` (config.toml local; prod dashboard at deploy).
- Migrations idempotent (`if not exists` / `create or replace`) for the prod SQL-editor workflow.
- `npm run check` must pass before every commit.

---

### Task 1: DB migration — `email_change_requests`

**Files:**

- Create: `supabase/migrations/20260713140000_email_change_requests.sql`

**Interfaces:**

- Produces: table `public.email_change_requests(id, user_id, token_hash, expires_at, used_at, created_at)` with RLS enabled and no policy; index on `token_hash`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260713140000_email_change_requests.sql`:

```sql
-- One-time tokens proving control of a user's CURRENT email address, used by
-- the secure email-change flow. RLS is enabled with NO policy: the table is
-- reachable only by the service-role routes (which bypass RLS), never the
-- client. Idempotent for the prod SQL-editor workflow.

create table if not exists public.email_change_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_change_requests_token_hash_idx
  on public.email_change_requests (token_hash);

create index if not exists email_change_requests_user_id_idx
  on public.email_change_requests (user_id);

alter table public.email_change_requests enable row level security;
-- Deliberately no policy: service-role only.
```

- [ ] **Step 2: Apply on a fresh DB**

Run: `npm run sb:reset`
Expected: completes without error; migration `20260713140000_email_change_requests` applies.

- [ ] **Step 3: Verify the table + RLS via a non-interactive query**

Run (find the DB container and query it):

```bash
CID=$(docker ps --format '{{.Names}}' | grep -i supabase_db | head -1)
docker exec -i "$CID" psql -U postgres -d postgres -c "select relrowsecurity from pg_class where relname='email_change_requests';"
docker exec -i "$CID" psql -U postgres -d postgres -c "select count(*) from pg_policies where tablename='email_change_requests';"
```

Expected: `relrowsecurity = t`; policy count = `0`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260713140000_email_change_requests.sql
git commit -m "feat(db): email_change_requests table (RLS on, service-role only)"
```

---

### Task 2: SMTP helper (nodemailer)

**Files:**

- Create: `src/lib/email/sendMail.ts`
- Modify: `package.json` (add `nodemailer` + `@types/nodemailer`)

**Interfaces:**

- Produces: `sendMail({ to, subject, html, text }: { to: string; subject: string; html: string; text: string }): Promise<void>` — sends via prod SMTP env when configured, else local Inbucket. Throws on transport error.

- [ ] **Step 1: Add nodemailer**

Run:

```bash
npm install nodemailer && npm install -D @types/nodemailer
```

Expected: both install; `package.json` + `package-lock.json` updated.

- [ ] **Step 2: Confirm the local Inbucket SMTP port**

Run: `supabase status | grep -i inbucket` (or `npx supabase status`).
Expected: shows the Inbucket URLs. The web UI is `54324` (per config.toml). The SMTP port for local Supabase Inbucket is conventionally `54325` — confirm from the status output (look for an SMTP/mailpit port). Use the confirmed port as the dev default below; if status shows a different port, use that.

- [ ] **Step 3: Write the helper**

Create `src/lib/email/sendMail.ts`:

```ts
import 'server-only';
import nodemailer from 'nodemailer';

type Mail = { to: string; subject: string; html: string; text: string };

// Prod uses the configured SMTP (OVH); dev falls back to the local Supabase
// Inbucket SMTP server so mails show up in `npm run sb:mail`. Selection is by
// presence of the prod host env var.
function buildTransport() {
	const host = process.env.SMTP_HOST;
	if (host) {
		return nodemailer.createTransport({
			host,
			port: Number(process.env.SMTP_PORT ?? 587),
			secure: Number(process.env.SMTP_PORT ?? 587) === 465,
			auth:
				process.env.SMTP_USER && process.env.SMTP_PASS
					? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
					: undefined,
		});
	}
	// Local Inbucket: no auth, plain SMTP. Port confirmed in Step 2 (54325).
	return nodemailer.createTransport({
		host: '127.0.0.1',
		port: Number(process.env.INBUCKET_SMTP_PORT ?? 54325),
		secure: false,
	});
}

export async function sendMail({ to, subject, html, text }: Mail): Promise<void> {
	const from = process.env.SMTP_FROM ?? 'Wizcard <noreply@wizcard.xyz>';
	await buildTransport().sendMail({ from, to, subject, html, text });
}
```

- [ ] **Step 4: Verify typecheck/lint**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/email/sendMail.ts
git commit -m "feat(email): nodemailer SMTP helper (Inbucket dev / OVH prod)"
```

---

### Task 3: Email-change request template

**Files:**

- Create: `src/lib/email/templates/emailChangeRequest.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `emailChangeRequest(link: string): { subject: string; html: string; text: string }`.

- [ ] **Step 1: Write the template**

Create `src/lib/email/templates/emailChangeRequest.ts`:

```ts
// Home-grown "email change requested" message sent to the user's CURRENT
// address. Deliberately NOT a login/magiclink email — it explains a change was
// requested and links to the page where the new address is entered.
export function emailChangeRequest(link: string): {
	subject: string;
	html: string;
	text: string;
} {
	const subject = 'Demande de changement d’adresse e-mail';
	const text = [
		'Une demande de changement d’adresse e-mail a été faite sur votre compte Wizcard.',
		'',
		'Pour continuer et saisir votre nouvelle adresse, ouvrez ce lien :',
		link,
		'',
		'Ce lien expire dans 30 minutes. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail — aucune modification ne sera faite.',
	].join('\n');
	const html = `
	<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1a1a1a;">
		<h2 style="margin: 0 0 12px;">Demande de changement d’adresse e-mail</h2>
		<p>Une demande de changement d’adresse e-mail a été faite sur votre compte Wizcard.</p>
		<p>Pour continuer et saisir votre nouvelle adresse&nbsp;:</p>
		<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#c9a84c;color:#0b0c10;text-decoration:none;border-radius:8px;font-weight:600;">Changer mon adresse e-mail</a></p>
		<p style="color:#666;font-size:14px;">Ce lien expire dans 30 minutes. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail — aucune modification ne sera faite.</p>
	</div>`.trim();
	return { subject, html, text };
}
```

- [ ] **Step 2: Verify typecheck/lint**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/templates/emailChangeRequest.ts
git commit -m "feat(email): email-change request template"
```

---

### Task 4: Token helpers

**Files:**

- Create: `src/lib/account/emailChangeToken.ts`

**Interfaces:**

- Produces:
  - `generateToken(): { token: string; tokenHash: string }` — 32 random bytes base64url + its SHA-256 hash (hex).
  - `hashToken(token: string): string` — SHA-256 hex of a token (for lookup).

- [ ] **Step 1: Write the helpers**

Create `src/lib/account/emailChangeToken.ts`:

```ts
import 'server-only';
import { createHash, randomBytes } from 'crypto';

/** SHA-256 hex of a token — used both to store and to look up (never store plaintext). */
export function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/** A fresh URL-safe token and its hash. The plaintext lives only in the email link. */
export function generateToken(): { token: string; tokenHash: string } {
	const token = randomBytes(32).toString('base64url');
	return { token, tokenHash: hashToken(token) };
}
```

- [ ] **Step 2: Verify typecheck/lint**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/account/emailChangeToken.ts
git commit -m "feat(account): email-change token helpers"
```

---

### Task 5: Request route (`POST /api/account/email/request`)

**Files:**

- Create: `src/app/api/account/email/request/route.ts`

**Interfaces:**

- Consumes: `sendMail` (Task 2), `emailChangeRequest` (Task 3), `generateToken` (Task 4).
- Produces: `POST /api/account/email/request` → `{ ok: true }` (200) | `{ error }` (401 anon, 429 active request exists, 500 misconfig/transport).

- [ ] **Step 1: Write the route**

Create `src/app/api/account/email/request/route.ts` (mirror the server/admin pattern from `src/app/api/account/delete/route.ts`):

```ts
import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { sendMail } from '@/lib/email/sendMail';
import { emailChangeRequest } from '@/lib/email/templates/emailChangeRequest';
import { generateToken } from '@/lib/account/emailChangeToken';

export async function POST() {
	const supabase = await createServerClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user?.email) {
		return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
	}

	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
	const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
	if (!url || !serviceKey || !siteUrl) {
		return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
	}
	const admin = createAdminClient(url, serviceKey, {
		auth: { autoRefreshToken: false, persistSession: false },
	});

	// Rate-limit: one active (unused, unexpired) request per user at a time.
	const nowIso = new Date().toISOString();
	const { data: active } = await admin
		.from('email_change_requests')
		.select('id')
		.eq('user_id', user.id)
		.is('used_at', null)
		.gt('expires_at', nowIso)
		.limit(1);
	if (active && active.length > 0) {
		return NextResponse.json(
			{ error: 'Une demande est déjà en cours. Vérifiez votre boîte mail.' },
			{ status: 429 }
		);
	}

	const { token, tokenHash } = generateToken();
	const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
	const { error: insertErr } = await admin.from('email_change_requests').insert({
		user_id: user.id,
		token_hash: tokenHash,
		expires_at: expiresAt,
	});
	if (insertErr) {
		return NextResponse.json({ error: insertErr.message }, { status: 500 });
	}

	const link = `${siteUrl}/account/change-email?token=${encodeURIComponent(token)}`;
	const mail = emailChangeRequest(link);
	try {
		// Sent to the CURRENT address to prove control before any new-address step.
		await sendMail({ to: user.email, ...mail });
	} catch {
		return NextResponse.json({ error: 'Échec de l’envoi de l’e-mail.' }, { status: 500 });
	}
	return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify typecheck/lint**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Runtime — request sends a mail to the current address**

Run: `npm run dev` (logged in) and `npm run sb:mail`. Trigger the route:

```bash
# From the browser devtools console while authenticated on the app origin:
# await fetch('/api/account/email/request', { method: 'POST' }).then(r => r.status)
```

Expected: `200`; a « Demande de changement » email appears in Inbucket addressed to your current address, containing a `/account/change-email?token=…` link. A second immediate call returns `429`.

If you cannot drive an authenticated browser session, report runtime as not-exercised and rely on `npm run check` + reasoning (Task 8 does the full runtime pass).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/account/email/request/route.ts
git commit -m "feat(account): request route mails a token to the current address"
```

---

### Task 6: Confirm route (`POST /api/account/email/confirm`)

**Files:**

- Create: `src/app/api/account/email/confirm/route.ts`

**Interfaces:**

- Consumes: `hashToken` (Task 4).
- Produces: `POST /api/account/email/confirm` with body `{ token: string; newEmail: string }` → `{ ok: true }` (200) | `{ error }` (400 invalid token / invalid email, 401 anon, 500 misconfig/admin error).

- [ ] **Step 1: Write the route**

Create `src/app/api/account/email/confirm/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { hashToken } from '@/lib/account/emailChangeToken';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
	const supabase = await createServerClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user?.email) {
		return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
	}

	const body = (await request.json().catch(() => ({}))) as {
		token?: string;
		newEmail?: string;
	};
	const token = body.token?.trim();
	const newEmail = body.newEmail?.trim().toLowerCase();
	if (!token || !newEmail || !EMAIL_RE.test(newEmail)) {
		return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
	}
	if (newEmail === user.email.toLowerCase()) {
		return NextResponse.json(
			{ error: 'La nouvelle adresse est identique à l’actuelle.' },
			{ status: 400 }
		);
	}

	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !serviceKey) {
		return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
	}
	const admin = createAdminClient(url, serviceKey, {
		auth: { autoRefreshToken: false, persistSession: false },
	});

	// The token must be unused, unexpired, AND belong to the session user.
	const nowIso = new Date().toISOString();
	const { data: rows } = await admin
		.from('email_change_requests')
		.select('id')
		.eq('user_id', user.id)
		.eq('token_hash', hashToken(token))
		.is('used_at', null)
		.gt('expires_at', nowIso)
		.limit(1);
	const req = rows?.[0];
	if (!req) {
		return NextResponse.json({ error: 'Lien invalide ou expiré.' }, { status: 400 });
	}

	// Single-use: burn the token before triggering the change.
	await admin.from('email_change_requests').update({ used_at: nowIso }).eq('id', req.id);

	// Triggers Supabase to email a confirmation code to the NEW address.
	const { error } = await admin.auth.admin.updateUserById(user.id, { email: newEmail });
	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
	return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify typecheck/lint**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/account/email/confirm/route.ts
git commit -m "feat(account): confirm route validates token then triggers change"
```

---

### Task 7: Front — page, view, AccountSection simplification, config

**Files:**

- Create: `src/app/account/change-email/page.tsx`
- Create: `src/app/account/change-email/ChangeEmailView.tsx`
- Modify: `src/app/settings/sections/AccountSection.tsx`
- Modify: `src/lib/supabase/auth/auth-client.ts` (update `verifyEmailChangeOtp` doc comment)
- Modify: `supabase/config.toml:207` (`double_confirm_changes = false`)

**Interfaces:**

- Consumes: `verifyEmailChangeOtp(email, token)` (existing), `getCurrentUser` (existing, `@/lib/supabase/auth/auth-server`), `Button`, `settingsStyles`.
- Produces: page `/account/change-email`; `AccountSection` email block reduced to a single "request" button.

- [ ] **Step 1: Set config double_confirm_changes to false**

In `supabase/config.toml`, change line 207 from `double_confirm_changes = true` to:

```toml
double_confirm_changes = false
```

(Since the current address is now proven by the emailed link, only the new address needs a confirmation code.)

- [ ] **Step 2: Create the server page**

Create `src/app/account/change-email/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase/auth/auth-server';
import ChangeEmailView from './ChangeEmailView';

export const metadata: Metadata = {
	title: 'Changer d’adresse e-mail',
	robots: { index: false, follow: false },
};

export default async function ChangeEmailPage({
	searchParams,
}: {
	searchParams: Promise<{ token?: string }>;
}) {
	const user = await getCurrentUser();
	if (!user) redirect('/auth/login');
	const { token } = await searchParams;
	return <ChangeEmailView token={token ?? ''} />;
}
```

- [ ] **Step 3: Create the client view (state machine)**

Create `src/app/account/change-email/ChangeEmailView.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { verifyEmailChangeOtp } from '@/lib/supabase/auth/auth-client';
import { Button } from '@/components/Button/Button';
import { settingsStyles as s } from '@/app/settings/components/SettingsSection';

type Step = 'enter-email' | 'enter-code' | 'done';

export default function ChangeEmailView({ token }: { token: string }) {
	const router = useRouter();
	const [step, setStep] = useState<Step>('enter-email');
	const [newEmail, setNewEmail] = useState('');
	const [code, setCode] = useState('');
	const [err, setErr] = useState<string | null>(null);
	const [msg, setMsg] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const submitNewEmail = async () => {
		setErr(null);
		const email = newEmail.trim().toLowerCase();
		if (!email) {
			setErr('Entrez une adresse e-mail.');
			return;
		}
		setBusy(true);
		try {
			const res = await fetch('/api/account/email/confirm', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token, newEmail: email }),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				setErr(body.error ?? 'Échec de la demande.');
				return;
			}
			setStep('enter-code');
			setMsg(`Un code de confirmation a été envoyé à ${email}.`);
		} finally {
			setBusy(false);
		}
	};

	const submitCode = async () => {
		setErr(null);
		const c = code.trim();
		if (c.length < 6) {
			setErr('Entrez le code à 6 chiffres.');
			return;
		}
		setBusy(true);
		try {
			const { error } = await verifyEmailChangeOtp(newEmail.trim().toLowerCase(), c);
			if (error) {
				setErr(`Code invalide : ${error.message}`);
				return;
			}
			setStep('done');
			setMsg('Adresse e-mail mise à jour.');
			setTimeout(() => router.push('/settings'), 1200);
		} finally {
			setBusy(false);
		}
	};

	return (
		<main style={{ maxWidth: 480, margin: '0 auto', padding: '2rem 1rem' }}>
			<h1 className={s.label} style={{ fontSize: 'var(--text-2xl)', marginBottom: '1.5rem' }}>
				Changer d’adresse e-mail
			</h1>

			{step === 'enter-email' && (
				<div className={s.field}>
					<span className={s.label}>Nouvelle adresse e-mail</span>
					<input
						className={s.input}
						type="email"
						value={newEmail}
						onChange={(e) => setNewEmail(e.target.value)}
						placeholder="nouvelle@adresse.fr"
						disabled={busy}
					/>
					<Button variant="secondary" size="sm" onClick={submitNewEmail} disabled={busy}>
						Continuer
					</Button>
				</div>
			)}

			{step === 'enter-code' && (
				<div className={s.field}>
					<span className={s.label}>Code reçu sur la nouvelle adresse</span>
					<input
						className={s.input}
						type="text"
						inputMode="numeric"
						autoComplete="one-time-code"
						pattern="[0-9]*"
						maxLength={6}
						value={code}
						onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
						placeholder="123456"
						disabled={busy}
					/>
					<Button variant="secondary" size="sm" onClick={submitCode} disabled={busy}>
						Vérifier le code
					</Button>
				</div>
			)}

			{msg && <p className={s.successText}>{msg}</p>}
			{err && <p className={s.errorText}>{err}</p>}
		</main>
	);
}
```

- [ ] **Step 4: Simplify AccountSection's email block**

In `src/app/settings/sections/AccountSection.tsx`, REMOVE the two-code OTP machine and replace the email block with a request trigger. The full new file:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { Button } from '@/components/Button/Button';
import { ConfirmModal } from '@/components/ConfirmModal/ConfirmModal';
import { SettingsSection, settingsStyles as s } from '../components/SettingsSection';

export function AccountSection() {
	const { user, signOut } = useAuth();
	const router = useRouter();
	const [emailMsg, setEmailMsg] = useState<string | null>(null);
	const [emailErr, setEmailErr] = useState<string | null>(null);
	const [password, setPassword] = useState('');
	const [passwordConfirm, setPasswordConfirm] = useState('');
	const [pwMsg, setPwMsg] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const [deleteErr, setDeleteErr] = useState<string | null>(null);

	const requestEmailChange = async () => {
		setEmailMsg(null);
		setEmailErr(null);
		setBusy(true);
		try {
			const res = await fetch('/api/account/email/request', { method: 'POST' });
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				setEmailErr(body.error ?? 'Échec de la demande.');
				return;
			}
			setEmailMsg('Un e-mail de confirmation a été envoyé à votre adresse actuelle.');
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
			await signOut();
			router.push('/');
		} finally {
			setBusy(false);
			setConfirming(false);
		}
	};

	return (
		<SettingsSection title="Compte">
			<div className={s.field}>
				<span className={s.label}>Adresse e-mail</span>
				<input className={s.input} type="email" value={user?.email ?? ''} disabled readOnly />
			</div>
			<Button variant="secondary" size="sm" onClick={requestEmailChange} disabled={busy}>
				Changer l&apos;e-mail
			</Button>
			{emailMsg && <span className={s.successText}>{emailMsg}</span>}
			{emailErr && <span className={s.errorText}>{emailErr}</span>}

			<hr className={s.divider} />

			<div className={s.field}>
				<span className={s.label}>Nouveau mot de passe</span>
				<input
					className={s.input}
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					disabled={busy}
				/>
			</div>
			<div className={s.field}>
				<span className={s.label}>Confirmer le mot de passe</span>
				<input
					className={s.input}
					type="password"
					value={passwordConfirm}
					onChange={(e) => setPasswordConfirm(e.target.value)}
					disabled={busy}
				/>
			</div>
			<Button variant="secondary" size="sm" onClick={changePassword} disabled={busy}>
				Changer le mot de passe
			</Button>
			{pwMsg && <span className={s.successText}>{pwMsg}</span>}

			<hr className={s.divider} />

			<div className={s.dangerZone}>
				<span className={s.dangerTitle}>Zone sensible</span>
				<Button variant="danger" size="sm" onClick={() => setConfirming(true)} disabled={busy}>
					Supprimer mon compte
				</Button>
				{deleteErr && <span className={s.errorText}>{deleteErr}</span>}
			</div>
			{confirming && (
				<ConfirmModal
					message="Cette action est irréversible : votre compte et toutes vos données (collection, decks) seront définitivement supprimés."
					confirmLabel="Supprimer mon compte"
					onConfirm={deleteAccount}
					onClose={() => setConfirming(false)}
				/>
			)}
		</SettingsSection>
	);
}
```

- [ ] **Step 5: Update the verifyEmailChangeOtp doc comment**

In `src/lib/supabase/auth/auth-client.ts`, replace the `verifyEmailChangeOtp` doc comment (which describes the old two-leg flow) with:

```ts
/**
 * Verify the confirmation code Supabase mails to the NEW address during an
 * email change. With double_confirm_changes disabled, only the new address is
 * confirmed here — control of the current address is already proven by the
 * emailed link (see /api/account/email/request). `email` is the new address.
 */
```

Leave the function body unchanged.

- [ ] **Step 6: Verify typecheck/lint**

Run: `npm run check`
Expected: PASS (watch for now-unused imports removed from AccountSection: `verifyEmailChangeOtp` is no longer imported there).

- [ ] **Step 7: Apply config change to a fresh DB**

Run: `npm run sb:reset`
Expected: local Supabase restarts with `double_confirm_changes = false`.

- [ ] **Step 8: Commit**

```bash
git add src/app/account/change-email/page.tsx src/app/account/change-email/ChangeEmailView.tsx src/app/settings/sections/AccountSection.tsx src/lib/supabase/auth/auth-client.ts supabase/config.toml
git commit -m "feat(account): change-email page + settings request button; single-confirm"
```

---

### Task 8: Verify script + full verification pass

**Files:**

- Modify: `supabase/verify_schema.sql`

**Interfaces:**

- Consumes: existing `pg_temp.chk` / assertion idiom in the verify script.
- Produces: assertions for the `email_change_requests` table (existence, columns, RLS enabled, zero policies, token_hash index).

- [ ] **Step 1: Read the existing verify-script idiom**

Run: `grep -n "chk(\|has_table\|has_col\|enable row level\|relrowsecurity\|has_policy\|has_index\|pg_indexes" supabase/verify_schema.sql | head -40`
Expected: shows the helpers available (table/column/RLS/policy/index checks). Follow the file's exact idiom for the assertions below; if a helper (e.g. an index check) doesn't exist, use a direct `exists (select 1 from pg_indexes …)` inside `pg_temp.chk` like the policy assertions do.

- [ ] **Step 2: Add the assertions**

Following the file's idiom, add a block (near the other table/security assertions) that checks:

- table `public.email_change_requests` exists with columns `id, user_id, token_hash, expires_at, used_at, created_at`;
- RLS is enabled: `exists (select 1 from pg_class where relname='email_change_requests' and relrowsecurity)`;
- it has NO policy: `not exists (select 1 from pg_policies where tablename='email_change_requests')` — labelled as a security assertion (service-role-only table);
- an index on `token_hash` exists: `exists (select 1 from pg_indexes where tablename='email_change_requests' and indexdef ilike '%token_hash%')`.

Example in the file's idiom (adapt to the real helper names from Step 1):

```sql
select pg_temp.chk('security', 'email_change_requests :: RLS enabled, no policy',
  exists (select 1 from pg_class where relname='email_change_requests' and relrowsecurity)
    and not exists (select 1 from pg_policies where tablename='email_change_requests'),
  'table doit avoir RLS activée et AUCUNE policy (service-role only)');
select pg_temp.chk('index', 'email_change_requests.token_hash',
  exists (select 1 from pg_indexes where tablename='email_change_requests'
          and indexdef ilike '%token_hash%'),
  'index token_hash absent');
```

- [ ] **Step 3: Run the verifier**

Run: `npm run sb:verify`
Expected: report shows the new assertions PASS; 0 failures overall.

- [ ] **Step 4: Full check + fresh DB**

Run: `npm run check && npm run sb:reset && npm run sb:verify`
Expected: check clean; reset applies all migrations incl. `20260713140000`; verify 0 failures.

- [ ] **Step 5: Runtime end-to-end (dev + Inbucket)**

Run: `npm run dev` and `npm run sb:mail`.

- On `/settings`, click « Changer l'e-mail » → success message; a « Demande de changement » mail lands in Inbucket for the CURRENT address, with a `/account/change-email?token=…` link.
- Click the link → the change-email page loads (redirects to login if logged out).
- Enter a new address → « Continuer » → a confirmation code mail lands in Inbucket for the NEW address.
- Enter the code → « Adresse e-mail mise à jour » → redirect to `/settings`; the email field shows the new address.
- Error cases: reuse the same link twice (2nd → « Lien invalide ou expiré »); request twice in a row (2nd → 429 message); new address equal to current (→ 400 message).

If an authenticated browser session cannot be driven here, report which checks were exercised vs. deferred to the user.

- [ ] **Step 6: Commit**

```bash
git add supabase/verify_schema.sql
git commit -m "chore(db): verify email_change_requests table (RLS on, no policy, index)"
```
