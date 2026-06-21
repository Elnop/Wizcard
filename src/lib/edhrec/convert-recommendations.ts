import type { EdhrecCommanderResponse, EdhrecSection } from './types';

/**
 * Normalize a raw EDHREC commander response into a flat list of sections,
 * dropping any sections that contain no cards.
 */
export function convertEdhrecRecommendations(response: EdhrecCommanderResponse): EdhrecSection[] {
	const cardlists = response.container?.json_dict?.cardlists ?? [];
	return cardlists
		.map((cl) => ({
			tag: cl.tag,
			header: cl.header,
			cards: cl.cardviews ?? [],
		}))
		.filter((section) => section.cards.length > 0);
}
