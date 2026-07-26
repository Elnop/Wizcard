'use client';

import { useEffect } from 'react';
import { useScryfallStore } from '@/lib/scryfall/store/scryfall-store';
import type { CardTypeVocabulary } from '@/lib/scryfall/endpoints/catalog';

/**
 * Vocabulaire de la ligne de type, ventilé par rôle (supertypes / types /
 * subtypes).
 *
 * Le store dédoublonne la requête et la persiste 24 h : appeler ce hook depuis
 * plusieurs composants ne déclenche qu'un seul aller-retour réseau.
 *
 * Retourne null tant que le chargement n'a pas abouti — l'appelant doit rester
 * utilisable en saisie libre dans cet intervalle.
 */
export function useCardTypeVocabulary(): CardTypeVocabulary | null {
	const vocabulary = useScryfallStore((state) => state.typeVocabulary);
	const fetchTypeVocabulary = useScryfallStore((state) => state.fetchTypeVocabulary);

	useEffect(() => {
		void fetchTypeVocabulary();
	}, [fetchTypeVocabulary]);

	return vocabulary;
}
