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
