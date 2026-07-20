'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';

export function useLandingSearchUrlState() {
	const router = useRouter();
	const searchParams = useSearchParams();

	const [term, setTerm] = useState(() => searchParams.get('q') ?? '');

	// Voir useDeckSearchUrlState : évite d'écraser un lien partagé au montage.
	const isInitialMount = useRef(true);

	useEffect(() => {
		if (isInitialMount.current) {
			isInitialMount.current = false;
			return;
		}
		const params = new URLSearchParams();
		if (term) params.set('q', term);
		const queryString = params.toString();
		router.replace(queryString ? `/search?${queryString}` : '/search', { scroll: false });
	}, [term, router]);

	return { term, setTerm };
}
