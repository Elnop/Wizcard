import { deriveScryfallImageUrl } from '@/lib/scryfall/utils/scryfall-image-size';

/**
 * Derive an `art_crop` URL from another Scryfall image URL of the same print.
 *
 * FALLBACK ONLY. The seed now stores `art_crop` alongside small/normal/large, so
 * readers should prefer the stored value (see cover-art-catalog) and use this
 * when it is absent — rows written by an older seed carry just the three sizes,
 * and a full re-seed of ~159k prints is not instant. Once the catalog is fully
 * re-seeded this path stops being exercised for covers.
 *
 * Scryfall serves every size from the same path with only the leading size
 * segment changing, so the crop is reachable by substituting that one segment:
 *   https://cards.scryfall.io/normal/front/0/0/<id>.jpg?<ts>
 *   https://cards.scryfall.io/art_crop/front/0/0/<id>.jpg?<ts>
 * Confirmed 200 for front and back faces, and the response really is the crop
 * (745x460 landscape) rather than a full-card fallback (488x680).
 *
 * IMPORTANT: that URL layout is a Scryfall implementation detail, not a
 * documented contract. Callers must treat this as a best-effort fast path and
 * keep a real resolve as fallback, so a future CDN change degrades to "slower
 * cover" instead of "no cover".
 */

export function deriveArtCropUrl(imageUrl: string | null | undefined): string | null {
	return deriveScryfallImageUrl(imageUrl, 'art_crop');
}
