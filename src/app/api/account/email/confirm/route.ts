import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { hashToken } from '@/lib/account/emailChangeToken';

// eslint-disable-next-line sonarjs/slow-regex
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
