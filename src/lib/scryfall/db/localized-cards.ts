// Préchargement batch des images/textes localisés depuis la table serveur partagée
// `localized_cards`. Lit en UN batch les triplets (set, collector_number, lang≠en)
// d'une vue et injecte les hits dans le cache IndexedDB `localized-images`, que
// useLocalizedImage lit déjà. Résultat : useLocalizedImage trouve un cache chaud →
// 0 appel api.scryfall.com. Un miss retombe sur le fallback API existant, inchangé.

import { fetchLocalizedCardRows } from '@/lib/supabase/queries/localized-cards';
import {
	getLocalizedImageFromCache,
	putLocalizedImageInCache,
} from '@/lib/scryfall/utils/card-cache';

interface PrefetchCard {
	set?: string;
	collector_number?: string;
	lang?: string;
}

/**
 * Précharge les localisations d'une liste de cartes depuis la table serveur.
 * - ne considère que les cartes lang≠en avec set + collector_number
 * - saute les clés déjà présentes dans le cache IndexedDB (hit ou miss mémorisé)
 * - 1 seule requête serveur pour toute la liste restante
 * - injecte les hits au format card_faces uniforme
 */
export async function prefetchLocalizedCards(cards: PrefetchCard[]): Promise<void> {
	// 1. Retenir les clés localisables (lang≠en, set+number présents), dédupées.
	const keyMap = new Map<string, { set: string; collector_number: string; lang: string }>();
	for (const c of cards) {
		if (!c.set || !c.collector_number || !c.lang || c.lang === 'en') continue;
		keyMap.set(`${c.set}/${c.collector_number}/${c.lang}`, {
			set: c.set,
			collector_number: c.collector_number,
			lang: c.lang,
		});
	}
	if (keyMap.size === 0) return;

	// 2. Écarter les clés déjà en cache (évite une requête et une réécriture inutiles).
	const misses: Array<{ set: string; collector_number: string; lang: string }> = [];
	await Promise.all(
		[...keyMap.entries()].map(async ([key, triplet]) => {
			const cached = await getLocalizedImageFromCache(key);
			if (!cached) misses.push(triplet);
		})
	);
	if (misses.length === 0) return;

	// 3. UN batch serveur.
	const rows = await fetchLocalizedCardRows(misses);

	// 4. Injecter les hits dans le cache IndexedDB (format card_faces uniforme).
	await Promise.all(
		rows.map((r) =>
			putLocalizedImageInCache({
				key: `${r.set}/${r.collector_number}/${r.lang}`,
				card_faces: r.card_faces,
				image_status: r.image_status,
				cachedAt: Date.now(),
			})
		)
	);
}
