/** Print attributes preferPrint reasons about — a structural subset of ScryfallCard. */
export interface PrintLike {
	digital?: boolean;
	promo?: boolean;
	set_type?: string;
	released_at?: string;
}

/**
 * Scores a print for "normal copy" preference: paper (non-digital) outranks
 * digital, non-promo outranks promo, and an ordinary set outranks funny/memorabilia.
 */
function printScore(c: PrintLike): number {
	let s = 0;
	if (!c.digital) s += 4;
	if (!c.promo) s += 2;
	if (c.set_type !== 'funny' && c.set_type !== 'memorabilia') s += 1;
	return s;
}

/**
 * Picks the preferred print between two candidates for the same logical card.
 * Prefers a paper (non-digital), non-promo, non-special set, then the most recent
 * release — so a representative print is a "normal" copy rather than an arbitrary
 * digital/promo/oversized one that happened to come back first.
 */
export function preferPrint<T extends PrintLike>(current: T, candidate: T): T {
	const sc = printScore(current);
	const sn = printScore(candidate);
	if (sn !== sc) return sn > sc ? candidate : current;
	// Tie-break on release date (most recent wins); missing dates sort last.
	return (candidate.released_at ?? '') > (current.released_at ?? '') ? candidate : current;
}
