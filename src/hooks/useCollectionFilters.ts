import { useMemo } from 'react';
import type { ScryfallCard, ScryfallColor } from '@/lib/scryfall/types/scryfall';
import type { ScryfallSortOrder } from '@/lib/scryfall/hooks/useScryfallCardSearch';
import type { Card } from '@/types/cards';
import { type CardFilters, DEFAULT_CARD_FILTERS } from '@/lib/filters/types';

export type CollectionSortOrder = ScryfallSortOrder | 'language';

export interface CollectionFilters extends Omit<CardFilters, 'order'> {
	order: CollectionSortOrder;
}

export const defaultCollectionFilters: CollectionFilters = {
	...DEFAULT_CARD_FILTERS,
	order: 'name',
};

function parseCmc(raw: string): ((cmc: number) => boolean) | null {
	if (!raw) return null;
	const match = raw.match(/^(>=|<=|>|<|:)?(\d+)$/);
	if (!match) return null;
	const op = match[1] ?? ':';
	const num = parseInt(match[2], 10);
	switch (op) {
		case '>=':
			return (c) => c >= num;
		case '<=':
			return (c) => c <= num;
		case '>':
			return (c) => c > num;
		case '<':
			return (c) => c < num;
		default:
			return (c) => c === num;
	}
}

function parseOracleTokens(raw: string): string[] {
	// Normalize all quote variants to ASCII double-quote
	const normalized = raw.replace(/["""]/g, '"');
	const tokens: string[] = [];
	const re = /"([^"]*)"?|(\S+)/g;
	let match: RegExpExecArray | null;
	while ((match = re.exec(normalized)) !== null) {
		// match[1]: inside quotes (closed or unclosed), match[2]: bare word
		const token = (match[1] ?? match[2]).replace(/"/g, '').trim().toLowerCase();
		if (token) tokens.push(token);
	}
	return tokens;
}

function matchColors(
	cardColors: ScryfallColor[] | undefined,
	selected: ScryfallColor[],
	mode: 'exact' | 'include' | 'atMost'
): boolean {
	if (selected.length === 0) return true;
	const colors = cardColors ?? [];
	switch (mode) {
		case 'exact':
			return colors.length === selected.length && selected.every((c) => colors.includes(c));
		case 'include':
			return selected.every((c) => colors.includes(c));
		case 'atMost':
			return colors.every((c) => selected.includes(c));
	}
}

export function getSortValue(
	card: ScryfallCard | Card,
	order: CollectionSortOrder
): string | number {
	if (order === 'language') {
		return 'entry' in card ? (card.entry.language ?? '') : '';
	}
	switch (order) {
		case 'name':
			return card.name.toLowerCase();
		case 'cmc':
			return card.cmc;
		case 'rarity': {
			const rarityOrder: Record<string, number> = {
				common: 0,
				uncommon: 1,
				rare: 2,
				mythic: 3,
				special: 4,
				bonus: 5,
			};
			return rarityOrder[card.rarity] ?? 0;
		}
		case 'set':
			return `${card.set}-${card.collector_number.padStart(6, '0')}`;
		case 'released':
			return card.released_at;
		case 'color':
			return (card.colors ?? []).sort().join('');
		case 'usd':
			return parseFloat(card.prices.usd ?? '0');
		case 'eur':
			return parseFloat(card.prices.eur ?? '0');
		case 'tix':
			return parseFloat(card.prices.tix ?? '0');
		case 'power':
			return parseFloat(card.power ?? '0');
		case 'toughness':
			return parseFloat(card.toughness ?? '0');
		case 'edhrec':
			return card.edhrec_rank ?? 9999999;
		case 'penny':
			return card.penny_rank ?? 9999999;
		case 'artist':
			return (card.artist ?? '').toLowerCase();
		default:
			return card.name.toLowerCase();
	}
}

export function useCollectionFilters<T extends ScryfallCard | Card>(
	cards: T[],
	filters: CollectionFilters
): T[] {
	return useMemo(() => {
		const cmcTest = parseCmc(filters.cmc);

		let filtered = cards.filter((card) => {
			if (filters.name && !card.name.toLowerCase().includes(filters.name.toLowerCase()))
				return false;
			if (!matchColors(card.colors, filters.colors, filters.colorMatch)) return false;
			if (filters.type && !card.type_line.toLowerCase().includes(filters.type.toLowerCase()))
				return false;
			if (filters.set && card.set !== filters.set) return false;
			if (filters.rarities.length > 0 && !filters.rarities.includes(card.rarity)) return false;
			if (filters.oracleText) {
				const tokens = parseOracleTokens(filters.oracleText);
				const text = card.oracle_text?.toLowerCase() ?? '';
				if (tokens.length > 0 && !tokens.every((t) => text.includes(t))) return false;
			}
			if (cmcTest && !cmcTest(card.cmc)) return false;
			return true;
		});

		if (filtered.length <= 1) return filtered;

		const dir = filters.dir;

		filtered = [...filtered].sort((a, b) => {
			const av = getSortValue(a, filters.order);
			const bv = getSortValue(b, filters.order);
			let cmp: number;
			if (typeof av === 'number' && typeof bv === 'number') {
				cmp = av - bv;
			} else {
				cmp = String(av).localeCompare(String(bv));
			}
			// 'auto' behaves like 'asc' for local filtering
			if (dir === 'desc') cmp = -cmp;
			return cmp;
		});

		return filtered;
	}, [cards, filters]);
}
