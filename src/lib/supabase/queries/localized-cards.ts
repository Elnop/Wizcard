import { createClient } from '@/lib/supabase/client';
import type { ScryfallImageUris, ScryfallImageStatus } from '@/lib/scryfall/types/scryfall';

/**
 * Raw Supabase access for `localized_cards`. Ce fichier est le SEUL endroit qui
 * fait client.from('localized_cards'). Le mapping row -> cache client vit dans
 * src/lib/scryfall/db/localized-cards.ts.
 *
 * La table n'a pas de FK vers auth.users (données publiques partagées), donc pas
 * d'embed PostgREST : on lit à plat par (set, collector_number, lang).
 */

export interface LocalizedFaceRow {
	image_uris?: ScryfallImageUris;
	printed_name?: string;
	printed_type_line?: string;
	printed_text?: string;
}

export interface LocalizedCardDbRow {
	set: string;
	collector_number: string;
	lang: string;
	scryfall_id: string;
	oracle_id: string | null;
	image_status: ScryfallImageStatus;
	card_faces: LocalizedFaceRow[];
}

// PostgREST n'exprime pas facilement un IN sur un tuple composite. On requête par
// (set, lang) groupés — en pratique une vue partage peu de sets/langues — puis on
// filtre les collector_number côté client. Simple et suffisant pour une grille.
export async function fetchLocalizedCardRows(
	keys: Array<{ set: string; collector_number: string; lang: string }>
): Promise<LocalizedCardDbRow[]> {
	if (keys.length === 0) return [];
	const supabase = createClient();

	// Dédupe les clés et collecte les sets/langs à interroger.
	const wanted = new Set(keys.map((k) => `${k.set}/${k.collector_number}/${k.lang}`));
	const sets = [...new Set(keys.map((k) => k.set))];
	const langs = [...new Set(keys.map((k) => k.lang))];

	const { data, error } = await supabase
		.from('localized_cards')
		.select('set, collector_number, lang, scryfall_id, oracle_id, image_status, card_faces')
		.in('set', sets)
		.in('lang', langs);

	if (error) {
		console.error('[queries/localized-cards] fetchLocalizedCardRows error:', error);
		return [];
	}

	// Ne garder que les triplets réellement demandés (le IN croise set × lang).
	return (data as LocalizedCardDbRow[]).filter((r) =>
		wanted.has(`${r.set}/${r.collector_number}/${r.lang}`)
	);
}
