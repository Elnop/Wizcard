import type { AuthError, EmailOtpType, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/** Server-side current user (RLS-scoped). Returns null when anonymous. */
export async function getCurrentUser(): Promise<User | null> {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	return user ?? null;
}

export async function exchangeCodeForSession(code: string): Promise<{ error: AuthError | null }> {
	const supabase = await createClient();
	const { error } = await supabase.auth.exchangeCodeForSession(code);
	return { error };
}

export async function verifyEmailOtp(params: {
	type: EmailOtpType;
	token_hash: string;
}): Promise<{ error: AuthError | null }> {
	const supabase = await createClient();
	const { error } = await supabase.auth.verifyOtp(params);
	return { error };
}
