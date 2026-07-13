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
