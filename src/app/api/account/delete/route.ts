import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getApiTranslations } from '@/i18n/api';

export async function POST() {
	const t = await getApiTranslations({ namespace: 'apiErrors' });
	// Identify the caller from their session cookie (SSR client).
	const supabase = await createServerClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) {
		return NextResponse.json({ error: t('notAuthenticated') }, { status: 401 });
	}

	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !serviceKey) {
		return NextResponse.json({ error: t('serverNotConfigured') }, { status: 500 });
	}

	// Admin client (service-role) is the only way to delete an auth user.
	// This key is read server-side only and never reaches the client bundle.
	const admin = createAdminClient(url, serviceKey, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
	// Always delete the caller's own id — never trust an id from the request.
	const { error } = await admin.auth.admin.deleteUser(user.id);
	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
	// profiles + owned rows cascade via `on delete cascade`.
	return NextResponse.json({ ok: true });
}
