'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { StackBy } from '@/types/cards';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import { useProfileContext } from '@/lib/profile/context/ProfileContext';
import { parseStoredStackBy, stackByToArray } from '@/lib/card/utils/stack-by';

export type StackList = 'collection' | 'wishlist' | 'deck';

const PROFILE_FIELD = {
	collection: 'collectionStackBy',
	wishlist: 'wishlistStackBy',
	deck: 'deckStackBy',
} as const;

const storageKey = (list: StackList) => `wizcard-stack-by-${list}`;

// Same-tab writes don't fire `storage`; notify subscribers by hand.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
	listeners.add(onChange);
	window.addEventListener('storage', onChange);
	return () => {
		listeners.delete(onChange);
		window.removeEventListener('storage', onChange);
	};
}

function readRaw(list: StackList): string | null {
	try {
		return window.localStorage.getItem(storageKey(list));
	} catch {
		return null;
	}
}

/**
 * The stacking setting of one card list. Signed in: the profile column
 * (optimistic write + sync queue via updateProfile). Signed out: localStorage.
 * By name ([]) while the profile loads; no merge on sign-in — the profile wins.
 */
export function useStackBy(list: StackList): [StackBy, (next: StackBy) => void] {
	const { user } = useAuth();
	const { profile, updateProfile } = useProfileContext();
	const raw = useSyncExternalStore(
		subscribe,
		() => readRaw(list),
		() => null
	);
	const localValue = useMemo(() => parseStoredStackBy(raw), [raw]);

	// Memoised so a loading profile doesn't hand consumers a fresh [] every render.
	const profileValue = user ? profile?.[PROFILE_FIELD[list]] : undefined;
	const value = useMemo<StackBy>(
		() => (user ? (profileValue ?? []) : localValue),
		[user, profileValue, localValue]
	);

	const setValue = useCallback(
		(next: StackBy) => {
			if (user) {
				updateProfile({ [PROFILE_FIELD[list]]: next });
				return;
			}
			try {
				window.localStorage.setItem(storageKey(list), JSON.stringify(stackByToArray(next)));
			} catch {
				// Storage unavailable (private mode): the setting just won't persist.
			}
			for (const l of listeners) l();
		},
		[user, list, updateProfile]
	);

	return [value, setValue];
}
