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

export async function exchangeCodeForSession(
	code: string
): Promise<{ error: AuthError | null; user: User | null }> {
	const supabase = await createClient();
	const { data, error } = await supabase.auth.exchangeCodeForSession(code);
	return { error, user: data.user ?? null };
}

export async function verifyEmailOtp(params: {
	type: EmailOtpType;
	token_hash: string;
}): Promise<{ error: AuthError | null; user: User | null }> {
	const supabase = await createClient();
	const { data, error } = await supabase.auth.verifyOtp(params);
	return { error, user: data.user ?? null };
}

/**
 * First sign-in detection: on account creation Supabase stamps `last_sign_in_at`
 * equal to `created_at`. A later login advances `last_sign_in_at`, so equality
 * (within a small tolerance) marks a brand-new user — used to emit `signup` once.
 */
export function isNewUser(user: User | null): boolean {
	if (!user?.created_at || !user.last_sign_in_at) return false;
	const created = new Date(user.created_at).getTime();
	const lastSignIn = new Date(user.last_sign_in_at).getTime();
	return Math.abs(lastSignIn - created) < 5000;
}
