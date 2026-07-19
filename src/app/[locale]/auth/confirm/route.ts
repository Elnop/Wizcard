import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForSession, verifyEmailOtp, isNewUser } from '@/lib/supabase/auth/auth-server';
import { trackServer, getPosthogDistinctId } from '@/lib/analytics/server/track-server';

/**
 * Base absolue à utiliser pour les redirections de ce route handler.
 *
 * `request.url` ne convient pas seul : derrière le reverse-proxy (Coolify), la
 * requête arrive sur le port interne du container et `request.url` vaut
 * `http://localhost:3000/...`. Une redirection construite dessus renvoie donc
 * l'utilisateur sur localhost au lieu du domaine public.
 *
 * Ordre de préférence : NEXT_PUBLIC_SITE_URL (valeur canonique configurée) →
 * headers X-Forwarded-* posés par le proxy → `request.url` (dev local, où il
 * est déjà correct).
 */
function resolveOrigin(request: NextRequest): string {
	const configured = process.env.NEXT_PUBLIC_SITE_URL;
	if (configured) return configured;

	const forwardedHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
	if (forwardedHost) {
		const proto = request.headers.get('x-forwarded-proto') ?? 'https';
		return `${proto}://${forwardedHost}`;
	}

	return new URL(request.url).origin;
}

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ locale: string }> }
) {
	const { locale } = await params;
	const { searchParams } = new URL(request.url);
	const origin = resolveOrigin(request);
	const token_hash = searchParams.get('token_hash');
	const type = searchParams.get('type') as EmailOtpType | null;
	const code = searchParams.get('code');
	const provider = searchParams.get('provider');
	const loginMethod = provider === 'google' ? provider : 'oauth';

	// PKCE flow (Supabase local / newer versions)
	if (code) {
		const { error, user } = await exchangeCodeForSession(code);
		if (!error) {
			const distinctId = getPosthogDistinctId(request.headers.get('cookie'));
			if (isNewUser(user)) {
				await trackServer({ name: 'signup', props: { method: loginMethod } }, distinctId);
			}
			await trackServer({ name: 'login', props: { method: loginMethod } }, distinctId);
			return NextResponse.redirect(new URL(`/${locale}/collection`, origin));
		}
	}

	// OTP flow (token_hash)
	if (token_hash && type) {
		const { error, user } = await verifyEmailOtp({ type, token_hash });
		if (!error) {
			const distinctId = getPosthogDistinctId(request.headers.get('cookie'));
			if (isNewUser(user)) {
				await trackServer({ name: 'signup', props: { method: 'email' } }, distinctId);
			}
			await trackServer({ name: 'login', props: { method: 'email' } }, distinctId);
			return NextResponse.redirect(new URL(`/${locale}/collection`, origin));
		}
	}

	return NextResponse.redirect(
		new URL(`/${locale}/auth/error?error_code=confirmation_failed`, origin)
	);
}
