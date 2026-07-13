import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { sendMail } from '@/lib/email/sendMail';
import { emailChangeRequest } from '@/lib/email/templates/emailChangeRequest';
import { generateToken } from '@/lib/account/emailChangeToken';
import { getApiTranslations } from '@/i18n/api';

export async function POST() {
	const t = await getApiTranslations();
	const supabase = await createServerClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user?.email) {
		return NextResponse.json({ error: t('notAuthenticated') }, { status: 401 });
	}

	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
	const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
	if (!url || !serviceKey || !siteUrl) {
		return NextResponse.json({ error: t('serverNotConfigured') }, { status: 500 });
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
		return NextResponse.json({ error: t('emailChangeInProgress') }, { status: 429 });
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
		// Roll back the just-created request so the rate-limit doesn't lock the
		// user out of retrying after a mail-send failure.
		await admin
			.from('email_change_requests')
			.delete()
			.eq('user_id', user.id)
			.eq('token_hash', tokenHash);
		return NextResponse.json({ error: t('emailSendFailed') }, { status: 500 });
	}
	return NextResponse.json({ ok: true });
}
