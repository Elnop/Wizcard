// Scryfall set management functions

import { scryfallGet } from '../fetcher';
import type {
	ScryfallSet,
	ScryfallList,
	ScryfallUUID,
	ScryfallCardSearchResult,
	ScryfallSearchOptions,
} from '../types/scryfall';

export async function getAllSets(): Promise<ScryfallList<ScryfallSet>> {
	return scryfallGet<ScryfallList<ScryfallSet>>('/sets');
}

export async function getSetById(id: ScryfallUUID): Promise<ScryfallSet> {
	return scryfallGet<ScryfallSet>(`/sets/${id}`);
}

export async function getSetByCode(code: string): Promise<ScryfallSet> {
	return scryfallGet<ScryfallSet>(`/sets/${code}`);
}

export async function getSetByTcgplayerId(id: number): Promise<ScryfallSet> {
	return scryfallGet<ScryfallSet>(`/sets/tcgplayer/${id}`);
}

export async function getSetsByType(setType: string): Promise<ScryfallSet[]> {
	const allSets = await getAllSets();
	return allSets.data.filter((set) => set.set_type === setType);
}

export async function getSetsByBlock(block: string): Promise<ScryfallSet[]> {
	const allSets = await getAllSets();
	return allSets.data.filter((set) => set.block === block);
}

export async function getRecentSets(months: number = 6): Promise<ScryfallSet[]> {
	const cutoffDate = new Date();
	cutoffDate.setMonth(cutoffDate.getMonth() - months);

	const allSets = await getAllSets();
	return allSets.data.filter((set) => {
		if (!set.released_at) return false;
		return new Date(set.released_at) >= cutoffDate;
	});
}

export async function getSetsByYear(year: number): Promise<ScryfallSet[]> {
	const allSets = await getAllSets();
	return allSets.data.filter((set) => {
		if (!set.released_at) return false;
		return new Date(set.released_at).getFullYear() === year;
	});
}

export async function searchSetsByName(name: string): Promise<ScryfallSet[]> {
	const allSets = await getAllSets();
	const searchTerm = name.toLowerCase();
	return allSets.data.filter((set) => set.name.toLowerCase().includes(searchTerm));
}

export async function getSetsSortedByDate(ascending: boolean = false): Promise<ScryfallSet[]> {
	const allSets = await getAllSets();
	return allSets.data
		.filter((set) => set.released_at)
		.sort((a, b) => {
			const dateA = new Date(a.released_at ?? '').getTime();
			const dateB = new Date(b.released_at ?? '').getTime();
			return ascending ? dateA - dateB : dateB - dateA;
		});
}

export async function getSetCards(
	setCode: string,
	options?: Partial<ScryfallSearchOptions>
): Promise<ScryfallCardSearchResult> {
	const params: Record<string, string> = {
		q: `s:${setCode}`,
		unique: options?.unique ?? 'cards',
		order: options?.order ?? 'set',
		dir: options?.dir ?? 'asc',
		include_extras: String(options?.include_extras ?? false),
		include_variations: String(options?.include_variations ?? false),
		page: String(options?.page ?? 1),
	};
	return scryfallGet<ScryfallCardSearchResult>('/cards/search', params);
}

export async function getSetCardCount(setCode: string): Promise<number> {
	const set = await getSetByCode(setCode);
	return set.card_count;
}

export async function setExists(setCode: string): Promise<boolean> {
	try {
		await getSetByCode(setCode);
		return true;
	} catch {
		return false;
	}
}

export async function getBlockSets(setCode: string): Promise<ScryfallSet[]> {
	const set = await getSetByCode(setCode);
	if (!set.block) return [set];
	return getSetsByBlock(set.block);
}

export async function getParentSet(setCode: string): Promise<ScryfallSet | null> {
	const set = await getSetByCode(setCode);
	if (!set.parent_set_code) return null;

	try {
		return await getSetByCode(set.parent_set_code);
	} catch {
		return null;
	}
}

export async function getChildSets(setCode: string): Promise<ScryfallSet[]> {
	const allSets = await getAllSets();
	return allSets.data.filter((set) => set.parent_set_code === setCode);
}
