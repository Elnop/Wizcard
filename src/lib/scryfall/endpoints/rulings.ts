// Scryfall rulings and clarifications functions

import { scryfallGet } from '../fetcher';
import type { ScryfallRuling, ScryfallList, ScryfallUUID } from '../types/scryfall';

export async function getRulingsByCardId(id: ScryfallUUID): Promise<ScryfallList<ScryfallRuling>> {
	return scryfallGet<ScryfallList<ScryfallRuling>>(`/cards/${id}/rulings`);
}

export async function getRulingsBySetNumber(
	setCode: string,
	collectorNumber: string
): Promise<ScryfallList<ScryfallRuling>> {
	return scryfallGet<ScryfallList<ScryfallRuling>>(`/cards/${setCode}/${collectorNumber}/rulings`);
}

export async function getRulingsByMultiverseId(id: number): Promise<ScryfallList<ScryfallRuling>> {
	return scryfallGet<ScryfallList<ScryfallRuling>>(`/cards/multiverse/${id}/rulings`);
}

export async function getRulingsByMtgoId(id: number): Promise<ScryfallList<ScryfallRuling>> {
	return scryfallGet<ScryfallList<ScryfallRuling>>(`/cards/mtgo/${id}/rulings`);
}

export async function getRulingsByArenaId(id: number): Promise<ScryfallList<ScryfallRuling>> {
	return scryfallGet<ScryfallList<ScryfallRuling>>(`/cards/arena/${id}/rulings`);
}

export async function getRulingsByTcgplayerId(id: number): Promise<ScryfallList<ScryfallRuling>> {
	return scryfallGet<ScryfallList<ScryfallRuling>>(`/cards/tcgplayer/${id}/rulings`);
}

export async function getRulingsByCardmarketId(id: number): Promise<ScryfallList<ScryfallRuling>> {
	return scryfallGet<ScryfallList<ScryfallRuling>>(`/cards/cardmarket/${id}/rulings`);
}

export async function getLatestRulings(
	cardId: ScryfallUUID,
	limit: number = 5
): Promise<ScryfallRuling[]> {
	const allRulings = await getRulingsByCardId(cardId);
	return allRulings.data
		.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
		.slice(0, limit);
}

export async function getRulingsBySource(
	cardId: ScryfallUUID,
	source: string
): Promise<ScryfallRuling[]> {
	const allRulings = await getRulingsByCardId(cardId);
	return allRulings.data.filter((ruling) => ruling.source.toLowerCase() === source.toLowerCase());
}

export async function searchRulings(
	cardId: ScryfallUUID,
	searchTerm: string,
	caseSensitive: boolean = false
): Promise<ScryfallRuling[]> {
	const allRulings = await getRulingsByCardId(cardId);
	const term = caseSensitive ? searchTerm : searchTerm.toLowerCase();

	return allRulings.data.filter((ruling) => {
		const comment = caseSensitive ? ruling.comment : ruling.comment.toLowerCase();
		return comment.includes(term);
	});
}

export async function groupRulingsByYear(
	cardId: ScryfallUUID
): Promise<Record<number, ScryfallRuling[]>> {
	const allRulings = await getRulingsByCardId(cardId);
	const grouped: Record<number, ScryfallRuling[]> = {};

	for (const ruling of allRulings.data) {
		const year = new Date(ruling.published_at).getFullYear();
		if (!grouped[year]) grouped[year] = [];
		grouped[year].push(ruling);
	}

	// Sort rulings within each year
	for (const year of Object.keys(grouped)) {
		grouped[Number(year)]?.sort(
			(a, b) => new Date(a.published_at).getTime() - new Date(b.published_at).getTime()
		);
	}

	return grouped;
}
