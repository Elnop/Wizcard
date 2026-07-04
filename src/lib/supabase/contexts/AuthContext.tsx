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
		supabase.auth
			.getUser()
			.then(({ data: { user }, error }) => {
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
			})
			.catch(() => {
				// Network/unexpected failure — resolve loading so the UI doesn't
				// hang on an empty auth slot forever.
				setSession(null);
				setUser(null);
				setIsLoading(false);
			});

		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((event, session) => {
			// The INITIAL_SESSION event fires on mount before getUser() has
			// validated the token. Ignore it — getUser() above owns the initial
			// determination — so we don't briefly flip to a null user (which
			// flashes the "Connexion" link before the profile menu). Only react
			// to real transitions (SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED / ...).
			if (event === 'INITIAL_SESSION') return;
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
