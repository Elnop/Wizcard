'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { searchProfiles, type ProfileSearchResult } from '@/lib/search/db/searchProfiles';

const PAGE = 24;

export function useProfileSearch(term: string, enabled = true) {
	const [profiles, setProfiles] = useState<ProfileSearchResult[]>([]);
	const [total, setTotal] = useState(0);
	const [isLoading, setIsLoading] = useState(false);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const offsetRef = useRef(0);

	useEffect(() => {
		// Voir useDeckSearch : la landing sans terme ne doit émettre aucune requête.
		if (!enabled) {
			// eslint-disable-next-line react-hooks/set-state-in-effect -- clears state when disabled
			setProfiles([]);
			setTotal(0);
			offsetRef.current = 0;
			return;
		}
		let cancelled = false;

		setIsLoading(true);
		offsetRef.current = 0;
		searchProfiles(term, { limit: PAGE, offset: 0 })
			.then((res) => {
				if (cancelled) return;
				setProfiles(res.profiles);
				setTotal(res.total);
				offsetRef.current = res.profiles.length;
			})
			.catch(() => {
				if (!cancelled) {
					setProfiles([]);
					setTotal(0);
				}
			})
			.finally(() => {
				if (!cancelled) setIsLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [term, enabled]);

	const loadMore = useCallback(() => {
		if (isLoadingMore || profiles.length >= total) return;
		setIsLoadingMore(true);
		searchProfiles(term, { limit: PAGE, offset: offsetRef.current })
			.then((res) => {
				setProfiles((prev) => [...prev, ...res.profiles]);
				offsetRef.current += res.profiles.length;
			})
			.catch(() => {})
			.finally(() => setIsLoadingMore(false));
	}, [term, isLoadingMore, profiles.length, total]);

	return {
		profiles,
		isLoading,
		isLoadingMore,
		hasMore: profiles.length < total,
		total,
		loadMore,
	};
}
