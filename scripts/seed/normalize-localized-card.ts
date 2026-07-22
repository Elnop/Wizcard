// Normalisation "Option 1" : transforme un objet carte Scryfall en une ligne
// localized_cards dont card_faces est TOUJOURS un tableau de 1 ou 2 entrées.
// Toute la logique de discrimination (racine vs faces, selon le layout Scryfall)
// vit ICI — les lecteurs itèrent card_faces sans jamais tester "racine ou faces".

import type {
	ScryfallCard,
	ScryfallImageUris,
	ScryfallImageStatus,
} from '@/lib/scryfall/types/scryfall';
import { hasRealScan } from '@/lib/scryfall/types/scryfall';

export interface LocalizedFace {
	image_uris?: ScryfallImageUris;
	printed_name?: string;
	printed_type_line?: string;
	printed_text?: string;
}

export interface LocalizedCardRow {
	set: string;
	collector_number: string;
	lang: string;
	scryfall_id: string;
	oracle_id: string | null;
	image_status: ScryfallImageStatus;
	card_faces: LocalizedFace[];
}

/**
 * Normalise un ScryfallCard en LocalizedCardRow, ou null si la carte ne doit pas
 * entrer dans le cache localisé (anglais, pas de scan réel, champs clés absents).
 *
 * - lang === 'en'            → null (l'anglais ne déclenche jamais de localisation)
 * - set/collector_number/id absents → null
 * - image_uris à la racine (mono-face, split/flip/adventure) → 1 face
 * - image_uris par card_face (transform, modal_dfc)          → 2 faces
 * - aucune face ne porte de scan réel → null
 */
export function toLocalizedCardRow(card: ScryfallCard): LocalizedCardRow | null {
	if (card.lang === 'en') return null;
	if (!card.set || !card.collector_number || !card.id) return null;

	const faces: LocalizedFace[] = [];

	if (card.image_uris) {
		// Racine : une seule image physique (mono-face, split/flip/adventure).
		if (hasRealScan(card.image_status)) {
			faces.push({
				image_uris: card.image_uris,
				printed_name: card.printed_name,
				printed_type_line: card.printed_type_line,
				printed_text: card.printed_text,
			});
		}
	} else if (
		hasRealScan(card.image_status) &&
		card.card_faces &&
		card.card_faces.some((f) => f.image_uris)
	) {
		// Faces : deux images physiques (transform, modal_dfc). image_status est au
		// niveau CARTE chez Scryfall (pas par face) → on gate ici avec le MÊME
		// hasRealScan(card.image_status) que la racine, sinon un placeholder DFC
		// (servi à une URL 200 valide) passerait le filtre.
		for (const f of card.card_faces) {
			if (!f.image_uris) continue;
			faces.push({
				image_uris: f.image_uris,
				printed_name: f.printed_name,
				printed_type_line: f.printed_type_line,
				printed_text: f.printed_text,
			});
		}
	}

	if (faces.length === 0) return null;

	return {
		set: card.set,
		collector_number: card.collector_number,
		lang: card.lang,
		scryfall_id: card.id,
		oracle_id: card.oracle_id ?? null,
		image_status: card.image_status,
		card_faces: faces,
	};
}
