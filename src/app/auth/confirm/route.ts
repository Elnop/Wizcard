import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url);
	const token_hash = searchParams.get('token_hash');
	const type = searchParams.get('type') as EmailOtpType | null;
	const code = searchParams.get('code');

	const supabase = await createClient();

	// PKCE flow (Supabase local / newer versions)
	if (code) {
		const { error } = await supabase.auth.exchangeCodeForSession(code);
		if (!error) {
			return NextResponse.redirect(new URL('/collection', request.url));
		}
	}

	// OTP flow (token_hash)
	if (token_hash && type) {
		const { error } = await supabase.auth.verifyOtp({ type, token_hash });
		if (!error) {
			return NextResponse.redirect(new URL('/collection', request.url));
		}
	}

	return NextResponse.redirect(new URL('/auth/error?error_code=confirmation_failed', request.url));
}
