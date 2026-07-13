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
