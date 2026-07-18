'use client';

import type { AuthError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { getAnalytics } from '@/lib/analytics/context/AnalyticsContext';

export async function signInWithEmailOtp(
	email: string,
	emailRedirectTo: string
): Promise<{ error: AuthError | null }> {
	const supabase = createClient();
	const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } });
	return { error };
}

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

export async function verifyEmailOtpClient(
	email: string,
	token: string
): Promise<{ error: AuthError | null }> {
	const supabase = createClient();
	const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
	if (!error) {
		getAnalytics().track({ name: 'login', props: { method: 'email' } });
	}
	return { error };
}

/**
 * Verify the confirmation code Supabase mails to the NEW address during an
 * email change. With double_confirm_changes disabled, only the new address is
 * confirmed here — control of the current address is already proven by the
 * emailed link (see /api/account/email/request). `email` is the new address.
 */
export async function verifyEmailChangeOtp(
	email: string,
	token: string
): Promise<{ error: AuthError | null }> {
	const supabase = createClient();
	const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email_change' });
	return { error };
}
