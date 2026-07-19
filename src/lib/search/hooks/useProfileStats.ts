'use client';

import { useEffect, useState } from 'react';
import { fetchProfileStats, type ProfileStats } from '@/lib/search/db/searchProfiles';

/**
 * Batched deck + collection-card counts for the given profile owner ids, in two
 * queries total (see fetchProfileStats). Re-runs when the set of ids changes.
 * Returns a map keyed by owner id; missing entries mean "not loaded yet".
 */
export function useProfileStats(ownerIds: string[]): Record<string, ProfileStats> {
	const [stats, setStats] = useState<Record<string, ProfileStats>>({});
	const key = ownerIds.join(',');

	useEffect(() => {
		if (ownerIds.length === 0) return;
		let cancelled = false;
		fetchProfileStats(ownerIds)
			.then((res) => {
				if (!cancelled) setStats(res);
			})
			.catch(() => {
				if (!cancelled) setStats({});
			});
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key]);

	return stats;
}
