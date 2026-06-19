'use client';

import { useEffect } from 'react';
import { useScryfallStore } from '@/lib/scryfall/store/scryfall-store';

export function useScryfallCardTypes(): {
	cardTypes: string[];
	isLoading: boolean;
	error: Error | null;
} {
	const cardTypes = useScryfallStore((s) => s.cardTypes);
	const isLoadingCardTypes = useScryfallStore((s) => s.isLoadingCardTypes);
	const cardTypesError = useScryfallStore((s) => s.cardTypesError);
	const fetchCardTypes = useScryfallStore((s) => s.fetchCardTypes);

	useEffect(() => {
		fetchCardTypes();
	}, [fetchCardTypes]);

	return {
		cardTypes,
		isLoading: isLoadingCardTypes,
		error: cardTypesError !== null ? new Error(cardTypesError) : null,
	};
}
