import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

/** Art crop URL for a card, falling back to the first face for multi-face cards. */
export function getArtCropUrl(card: ScryfallCard): string | null {
	return card.image_uris?.art_crop ?? card.card_faces?.[0]?.image_uris?.art_crop ?? null;
}

function isLand(card: ScryfallCard): boolean {
	return (card.type_line ?? '').toLowerCase().includes('land');
}

function hasCommanderTag(tags: string[] | null | undefined): boolean {
	return tags?.some((t) => t === 'deck:commander') ?? false;
}

type CoverCandidate = { card: ScryfallCard; tags: string[] | null | undefined };

/**
 * Pick the "cover" art for a deck.
 * Priority: commander (tagged `deck:commander`) > non-land > any card.
 */
export function pickCoverArt(cards: CoverCandidate[]): string | undefined {
	const priorities: Array<(c: CoverCandidate) => boolean> = [
		({ tags }) => hasCommanderTag(tags),
		({ card }) => !isLand(card),
		() => true,
	];
	for (const predicate of priorities) {
		const match = cards.find(predicate);
		if (match) {
			const url = getArtCropUrl(match.card);
			if (url) return url;
		}
	}
	return undefined;
}
