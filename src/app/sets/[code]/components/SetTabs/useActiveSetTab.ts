'use client';

import { useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import type { SetGroup } from '@/lib/scryfall/utils/set-classification';

export interface UseActiveSetTabResult {
	activeId: string;
	setTab: (code: string) => void;
}

/**
 * Resolves the currently active set tab from the `?tab=` URL param, falling back
 * to the group's root set. Lifted out of SetTabs so the header rings and the grid
 * stay in sync with the viewed tab.
 */
export function useActiveSetTab(group: SetGroup): UseActiveSetTabResult {
	const searchParams = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();

	const tabs = group.sets;
	const validIds = new Set(tabs.map((s) => s.code));
	const rawTab = searchParams.get('tab');
	const activeId = rawTab && validIds.has(rawTab) ? rawTab : tabs[0].code;

	const setTab = useCallback(
		(code: string) => {
			const params = new URLSearchParams(searchParams.toString());
			if (code === tabs[0].code) {
				params.delete('tab');
			} else {
				params.set('tab', code);
			}
			const qs = params.toString();
			router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
		},
		[searchParams, router, pathname, tabs]
	);

	return { activeId, setTab };
}
