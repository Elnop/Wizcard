'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ScryfallColor } from '@/lib/scryfall/types/scryfall';
import type {
	ScryfallSortOrder,
	ScryfallSortDir,
} from '@/lib/scryfall/hooks/useScryfallCardSearch';
import { useDebounce } from '@/hooks/useDebounce';
import { countActiveFilters } from '@/lib/filters/types';

const VALID_COLORS = new Set(['W', 'U', 'B', 'R', 'G']);
const VALID_ORDERS = new Set([
	'name',
	'set',
	'released',
	'rarity',
	'color',
	'usd',
	'tix',
	'eur',
	'cmc',
	'power',
	'toughness',
	'edhrec',
	'penny',
	'artist',
	'review',
]);
const VALID_DIRS = new Set(['auto', 'asc', 'desc']);
const VALID_COLOR_MATCHES = new Set(['exact', 'include', 'atMost']);
const VALID_RARITIES = new Set(['common', 'uncommon', 'rare', 'mythic']);

function parseColors(param: string | null): ScryfallColor[] {
	if (!param) return [];
	return param.split(',').filter((c) => VALID_COLORS.has(c)) as ScryfallColor[];
}

function parseOrder(param: string | null): ScryfallSortOrder {
	if (param && VALID_ORDERS.has(param)) return param as ScryfallSortOrder;
	return 'name';
}

function parseDir(param: string | null): ScryfallSortDir {
	if (param && VALID_DIRS.has(param)) return param as ScryfallSortDir;
	return 'auto';
}

function parseColorMatch(param: string | null): 'exact' | 'include' | 'atMost' {
	if (param && VALID_COLOR_MATCHES.has(param)) return param as 'exact' | 'include' | 'atMost';
	return 'include';
}

function parseRarities(param: string | null): string[] {
	if (!param) return [];
	return param.split(',').filter((r) => VALID_RARITIES.has(r));
}

export type SearchFilters = {
	colors: ScryfallColor[];
	colorMatch: 'exact' | 'include' | 'atMost';
	type: string;
	set: string;
	rarities: string[];
	oracleText: string;
	cmc: string;
	order: ScryfallSortOrder;
	dir: ScryfallSortDir;
};

export function useSearchFiltersFromUrl() {
	const router = useRouter();
	const searchParams = useSearchParams();

	const [name, setName] = useState(() => searchParams.get('name') ?? '');
	const [colors, setColors] = useState<ScryfallColor[]>(() =>
		parseColors(searchParams.get('colors'))
	);
	const [colorMatch, setColorMatch] = useState<'exact' | 'include' | 'atMost'>(() =>
		parseColorMatch(searchParams.get('colorMatch'))
	);
	const [type, setType] = useState(() => searchParams.get('type') ?? '');
	const [set, setSet] = useState(() => searchParams.get('set') ?? '');
	const [rarities, setRarities] = useState<string[]>(() =>
		parseRarities(searchParams.get('rarities'))
	);
	const [oracleText, setOracleText] = useState(() => searchParams.get('oracle') ?? '');
	const [cmc, setCmc] = useState(() => searchParams.get('cmc') ?? '');
	const [order, setOrder] = useState<ScryfallSortOrder>(() =>
		parseOrder(searchParams.get('order'))
	);
	const [dir, setDir] = useState<ScryfallSortDir>(() => parseDir(searchParams.get('dir')));

	const debouncedName = useDebounce(name, 300);
	const isInitialMount = useRef(true);

	// Sync state to URL when filters change
	useEffect(() => {
		if (isInitialMount.current) {
			isInitialMount.current = false;
			return;
		}
		const params = new URLSearchParams();
		if (debouncedName) params.set('name', debouncedName);
		if (colors.length > 0) params.set('colors', colors.join(','));
		if (colorMatch !== 'include') params.set('colorMatch', colorMatch);
		if (type) params.set('type', type);
		if (set) params.set('set', set);
		if (rarities.length > 0) params.set('rarities', rarities.join(','));
		if (oracleText) params.set('oracle', oracleText);
		if (cmc) params.set('cmc', cmc);
		if (order !== 'name') params.set('order', order);
		if (dir !== 'auto') params.set('dir', dir);

		const queryString = params.toString();
		router.replace(queryString ? `/search?${queryString}` : '/search', { scroll: false });
	}, [debouncedName, colors, colorMatch, type, set, rarities, oracleText, cmc, order, dir, router]);

	const applyFilters = (filters: SearchFilters) => {
		setColors(filters.colors);
		setColorMatch(filters.colorMatch);
		setType(filters.type);
		setSet(filters.set);
		setRarities(filters.rarities);
		setOracleText(filters.oracleText);
		setCmc(filters.cmc);
		setOrder(filters.order);
		setDir(filters.dir);
	};

	const activeFilterCount = countActiveFilters({
		name: '',
		colors,
		colorMatch,
		type,
		set,
		rarities,
		oracleText,
		cmc,
		order,
		dir,
	});

	return {
		// Individual filter values (needed by useScryfallCardSearch and FilterModal)
		name,
		setName,
		colors,
		colorMatch,
		type,
		set,
		rarities,
		oracleText,
		cmc,
		order,
		setOrder,
		dir,
		setDir,
		// Aggregate
		applyFilters,
		activeFilterCount,
	};
}
