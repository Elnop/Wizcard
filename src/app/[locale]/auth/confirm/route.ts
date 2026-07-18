import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForSession, verifyEmailOtp } from '@/lib/supabase/auth/auth-server';
import { trackServer, getPosthogDistinctId } from '@/lib/analytics/server/track-server';

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ locale: string }> }
) {
	const { locale } = await params;
	const { searchParams } = new URL(request.url);
	const token_hash = searchParams.get('token_hash');
	const type = searchParams.get('type') as EmailOtpType | null;
	const code = searchParams.get('code');
	const provider = searchParams.get('provider');
	const loginMethod = provider === 'google' ? provider : 'oauth';

	// PKCE flow (Supabase local / newer versions)
	if (code) {
		const { error } = await exchangeCodeForSession(code);
		if (!error) {
			await trackServer(
				{ name: 'login', props: { method: loginMethod } },
				getPosthogDistinctId(request.headers.get('cookie'))
			);
			return NextResponse.redirect(new URL(`/${locale}/collection`, request.url));
		}
	}

	// OTP flow (token_hash)
	if (token_hash && type) {
		const { error } = await verifyEmailOtp({ type, token_hash });
		if (!error) {
			await trackServer(
				{ name: 'login', props: { method: 'email' } },
				getPosthogDistinctId(request.headers.get('cookie'))
			);
			return NextResponse.redirect(new URL(`/${locale}/collection`, request.url));
		}
	}

	return NextResponse.redirect(
		new URL(`/${locale}/auth/error?error_code=confirmation_failed`, request.url)
	);
}
