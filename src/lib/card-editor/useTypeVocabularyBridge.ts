'use client';

import { useEffect } from 'react';
import { useScryfallStore } from '@/lib/scryfall/store/scryfall-store';
import { setTypeVocabularyResolver } from './type-line';

/**
 * Donne au module `type-line` l'accès au vocabulaire Scryfall.
 *
 * `hasCardType` — donc le choix du cadre terrain et du layout jeton — est
 * appelé depuis des fonctions pures qui ne peuvent pas consommer un hook. On
 * leur passe donc un resolver qui lit le store Zustand par `getState()`.
 *
 * Le store est asynchrone : il vaut `null` au premier rendu, et la lecture
 * retombe alors sur le repli « tout à gauche dans types », qui reste juste.
 *
 * Le débranchement au démontage évite qu'un resolver survive à l'arbre qui
 * l'a posé. En Strict Mode l'effet est joué deux fois (montage, démontage,
 * remontage) : la séquence se termine sur un branchement, donc l'état final
 * est correct. `useCardEditor` n'a qu'un seul appelant
 * (`CardEditorStudio.tsx:77`), il n'y a donc pas deux ponts concurrents.
 */
export function useTypeVocabularyBridge(): void {
	useEffect(() => {
		setTypeVocabularyResolver(() => useScryfallStore.getState().typeVocabulary);
		return () => setTypeVocabularyResolver(() => null);
	}, []);
}
