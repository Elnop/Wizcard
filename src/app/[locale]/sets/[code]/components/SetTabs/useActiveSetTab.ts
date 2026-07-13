'use client';

import { useCallback } from 'react';
import { useRouter } from '@/i18n/navigation';
import type { SetGroup } from '@/lib/scryfall/utils/set-classification';

export interface UseActiveSetTabResult {
	activeId: string;
	setTab: (code: string) => void;
}

/**
 * Resolves the active set tab directly from the URL set code (`/sets/<code>`):
 * each tab is its own route, so switching tabs navigates to `/sets/<tabCode>`.
 * Falls back to the group's root set when the URL code isn't a member of the
 * group (shouldn't happen, but keeps the header in sync).
 */
export function useActiveSetTab(group: SetGroup, urlCode: string): UseActiveSetTabResult {
	const router = useRouter();

	const target = urlCode.toLowerCase();
	const match = group.sets.find((s) => s.code === target);
	const activeId = match ? match.code : group.sets[0].code;

	const setTab = useCallback(
		(code: string) => {
			router.push(`/sets/${code}`, { scroll: false });
		},
		[router]
	);

	return { activeId, setTab };
}
