import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { hasRealScan } from '@/lib/scryfall/types/scryfall';
import { preferPrint } from '@/lib/card/utils/prefer-print';

/**
 * Picks the better of two prints of the same logical card for display in
 * multilingual search results. A real scan always beats a placeholder; among
 * equals, the preferred-language print wins; otherwise falls back to the
 * general print-representativeness rule (paper > non-promo > recent).
 */
function preferSearchPrint(
	current: ScryfallCard,
	candidate: ScryfallCard,
	preferredLang: string | undefined
): ScryfallCard {
	const curReal = hasRealScan(current.image_status);
	const candReal = hasRealScan(candidate.image_status);
	if (curReal !== candReal) return candReal ? candidate : current;

	if (preferredLang) {
		const curPref = current.lang === preferredLang;
		const candPref = candidate.lang === preferredLang;
		if (curPref !== candPref) return candPref ? candidate : current;
	}

	return preferPrint(current, candidate);
}

/**
 * Collapses a `unique=prints` multilingual result to one print per logical card
 * (keyed by oracle_id, falling back to card id). Scryfall's own `unique=cards`
 * dedupe can surface a placeholder-only localized print and drop the English
 * scan entirely; picking the print ourselves lets a real scan always win.
 *
 * Insertion order of first-seen cards is preserved so the overall sort Scryfall
 * applied is respected.
 */
export function dedupeSearchPrints(
	prints: ScryfallCard[],
	preferredLang: string | undefined
): ScryfallCard[] {
	const byCard = new Map<string, ScryfallCard>();
	const order: string[] = [];
	for (const print of prints) {
		const key = print.oracle_id ?? print.id;
		const existing = byCard.get(key);
		if (existing) {
			byCard.set(key, preferSearchPrint(existing, print, preferredLang));
		} else {
			order.push(key);
			byCard.set(key, print);
		}
	}
	return order.map((key) => byCard.get(key)!);
}
