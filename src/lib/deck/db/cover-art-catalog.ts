// Cover-art resolution straight from the DB catalog, without assembling whole Cards.
//
// A deck cover needs three things per print: is it a land (to skip lands), and an
// image to crop from. Going through `byCollection` would additionally load
// definitions, faces and sets for every id — far more work and more round-trips
// than a thumbnail justifies. These two narrow queries replace that.

import { createCatalogClient } from '@/lib/supabase/catalog';
import { deriveArtCropUrl } from '@/lib/deck/utils/derive-art-crop';
import type { ScryfallImageUris } from '@/lib/scryfall/types/scryfall';

/** What the cover picker needs to know about one print. */
export interface CoverPrintInfo {
	/** Art-crop URL, derived from the catalog's stored sizes. Null when underivable. */
	artCropUrl: string | null;
	/** Whether the card is a land — lands are the cover of last resort. */
	isLand: boolean;
}

// A GET with an `in.(…)` list of UUIDs is capped by the server's URI length: 300
// answers 414, 200 is comfortably under. Same bound as catalog-db's ID_LOOKUP_CHUNK.
const ID_LOOKUP_CHUNK = 200;

interface PrintImageRow {
	id: string;
	oracle_id: string;
	image_uris: ScryfallImageUris | null;
}

interface FaceImageRow {
	print_id: string;
	face_index: number;
	image_uris: ScryfallImageUris | null;
}

interface DefinitionTypeRow {
	oracle_id: string;
	type_line: string | null;
}

async function chunked<T>(values: string[], run: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
	const out: T[] = [];
	for (let i = 0; i < values.length; i += ID_LOOKUP_CHUNK) {
		out.push(...(await run(values.slice(i, i + ID_LOOKUP_CHUNK))));
	}
	return out;
}

/**
 * Look up cover info for the given print ids in the DB catalog.
 *
 * Ids the catalog doesn't know (including `mpc:` custom cards, which live in
 * another table) are simply absent from the returned map — the caller falls back
 * to resolving those through Scryfall.
 *
 * Best-effort: on any query error the ids resolved so far are returned, so a
 * catalog hiccup degrades to the network path rather than losing the cover.
 */
export async function fetchCoverInfoByPrintIds(
	printIds: string[]
): Promise<Map<string, CoverPrintInfo>> {
	const unique = [...new Set(printIds)].filter((id) => !id.startsWith('mpc:'));
	const result = new Map<string, CoverPrintInfo>();
	if (unique.length === 0) return result;

	const sb = createCatalogClient();

	try {
		const prints = await chunked(unique, async (chunk) => {
			const { data } = await sb
				.from('card_prints')
				.select('id, oracle_id, image_uris')
				.in('id', chunk);
			return (data as PrintImageRow[] | null) ?? [];
		});
		if (prints.length === 0) return result;

		// Double-faced prints carry no print-level image_uris; their art lives on
		// face 0. Only fetch faces for the prints that actually lack an image.
		const facelessIds = prints.filter((p) => !p.image_uris).map((p) => p.id);
		const faceImageByPrint = new Map<string, ScryfallImageUris>();
		if (facelessIds.length > 0) {
			const faces = await chunked(facelessIds, async (chunk) => {
				const { data } = await sb
					.from('card_print_faces')
					.select('print_id, face_index, image_uris')
					.in('print_id', chunk);
				return (data as FaceImageRow[] | null) ?? [];
			});
			// Front face wins, mirroring pickCoverArt's card_faces[0] fallback.
			for (const face of faces.sort((a, b) => a.face_index - b.face_index)) {
				if (face.image_uris && !faceImageByPrint.has(face.print_id)) {
					faceImageByPrint.set(face.print_id, face.image_uris);
				}
			}
		}

		const oracleIds = [...new Set(prints.map((p) => p.oracle_id))];
		const defs = await chunked(oracleIds, async (chunk) => {
			const { data } = await sb
				.from('card_definitions')
				.select('oracle_id, type_line')
				.in('oracle_id', chunk);
			return (data as DefinitionTypeRow[] | null) ?? [];
		});
		const typeLineByOracle = new Map(defs.map((d) => [d.oracle_id, d.type_line]));

		for (const print of prints) {
			const images = print.image_uris ?? faceImageByPrint.get(print.id) ?? null;
			// Prefer the stored art_crop; fall back to deriving it from another size.
			// The seed stores art_crop, but rows written before that change (or by an
			// older seed) only carry small/normal/large, so the derivation keeps those
			// working until the catalog is fully re-seeded.
			const artCropUrl =
				images?.art_crop ??
				deriveArtCropUrl(images?.normal ?? images?.large ?? images?.small ?? null);
			result.set(print.id, {
				artCropUrl,
				isLand: (typeLineByOracle.get(print.oracle_id) ?? '').toLowerCase().includes('land'),
			});
		}
	} catch (err) {
		console.error('[cover-art-catalog] lookup failed, falling back to network:', err);
	}

	return result;
}
