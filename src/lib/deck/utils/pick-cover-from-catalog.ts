import type { CoverPrintInfo } from '@/lib/deck/db/cover-art-catalog';

/** One deck card as the cover picker sees it, before any card is resolved. */
export type CoverEntry = { scryfallId: string; tags: string[] | null };

function hasCommanderTag(tags: string[] | null | undefined): boolean {
	return tags?.some((t) => t === 'deck:commander') ?? false;
}

/**
 * The subset of a deck's ids that could ever win the cover, in priority order.
 *
 * Mirrors `pickCoverArt`: commander first, then any non-land, then anything.
 * Because the winner is almost always the commander (or the first card), the
 * caller can look up just the head of this list instead of the whole deck —
 * which is the entire point of resolving covers separately from deck stats.
 */
export function coverCandidateIds(entries: CoverEntry[]): string[] {
	const commanders = entries.filter((e) => hasCommanderTag(e.tags)).map((e) => e.scryfallId);
	const rest = entries.filter((e) => !hasCommanderTag(e.tags)).map((e) => e.scryfallId);
	return [...new Set([...commanders, ...rest])];
}

/**
 * Pick a deck cover from catalog info alone.
 *
 * Walks `entries` in `pickCoverArt`'s priority order (commander > non-land >
 * any) but consults the narrow catalog map rather than resolved Cards. Ids the
 * catalog doesn't know are skipped, so a partially-seeded catalog yields a
 * slightly different pick rather than no pick.
 *
 * Returns null when nothing usable was found — the caller then falls back to the
 * network path, which is authoritative.
 */
export function pickCoverFromCatalog(
	entries: CoverEntry[],
	info: Map<string, CoverPrintInfo>
): string | null {
	const withInfo = entries
		.map((e) => ({ entry: e, info: info.get(e.scryfallId) }))
		.filter((c): c is { entry: CoverEntry; info: CoverPrintInfo } => c.info != null);

	const priorities: Array<(c: { entry: CoverEntry; info: CoverPrintInfo }) => boolean> = [
		({ entry }) => hasCommanderTag(entry.tags),
		({ info }) => !info.isLand,
		() => true,
	];

	for (const predicate of priorities) {
		for (const candidate of withInfo) {
			if (predicate(candidate) && candidate.info.artCropUrl) {
				return candidate.info.artCropUrl;
			}
		}
	}
	return null;
}
