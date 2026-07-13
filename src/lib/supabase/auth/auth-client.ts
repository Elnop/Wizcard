'use client';

import type { AuthError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

export async function signInWithEmailOtp(
	email: string,
	emailRedirectTo: string
): Promise<{ error: AuthError | null }> {
	const supabase = createClient();
	const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } });
	return { error };
}

export async function verifyEmailOtpClient(
	email: string,
	token: string
): Promise<{ error: AuthError | null }> {
	const supabase = createClient();
	const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
	return { error };
}

/**
 * Verify one leg of a secure (double-confirm) email change. Supabase sends a
 * token to BOTH the current and the new address; each is verified against its
 * own address with type 'email_change'. The change completes once both legs
 * succeed. `email` is the address the token was delivered to.
 */
export async function verifyEmailChangeOtp(
	email: string,
	token: string
): Promise<{ error: AuthError | null }> {
	const supabase = createClient();
	const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email_change' });
	return { error };
}
