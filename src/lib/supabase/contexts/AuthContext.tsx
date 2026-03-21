'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

type AuthContextValue = {
	user: User | null;
	session: Session | null;
	isLoading: boolean;
	signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const [session, setSession] = useState<Session | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const supabase = createClient();

		// getUser() validates the token server-side — if the user no longer exists, sign out
		supabase.auth.getUser().then(({ data: { user }, error }) => {
			if (error || !user) {
				void supabase.auth.signOut();
				setSession(null);
				setUser(null);
				setIsLoading(false);
				return;
			}
			supabase.auth.getSession().then(({ data: { session } }) => {
				setSession(session);
				setUser(user);
				setIsLoading(false);
			});
		});

		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((_event, session) => {
			setSession(session);
			setUser(session?.user ?? null);
			setIsLoading(false);
		});

		return () => subscription.unsubscribe();
	}, []);

	const signOut = async () => {
		const supabase = createClient();
		await supabase.auth.signOut();
	};

	return <AuthContext value={{ user, session, isLoading, signOut }}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
	const ctx = useContext(AuthContext);
	if (!ctx) {
		throw new Error('useAuth must be used within an AuthProvider');
	}
	return ctx;
}
