'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ScryfallColor } from '@/lib/scryfall/types/scryfall';
import type { ScryfallSortOrder, ScryfallSortDir } from '@/lib/scryfall/types/sort';
import { countActiveFilters } from '@/lib/search/types';
import type { ColorMatch } from '@/lib/search/types';
import type { SearchMode } from '@/lib/search/types';
import type { OracleIdFilterValue } from '@/lib/search/components/filters/OracleIdFilter/OracleIdFilter';

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
const VALID_MODES = new Set(['official', 'all', 'custom']);

function parseMode(param: string | null): SearchMode {
	if (param && VALID_MODES.has(param)) return param as SearchMode;
	return 'official';
}

function parseMpcTags(param: string | null): string[] {
	if (!param) return [];
	return param.split(',').filter(Boolean);
}

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

function parseColorMatch(param: string | null): ColorMatch {
	if (param && VALID_COLOR_MATCHES.has(param)) return param as ColorMatch;
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
	customSourceId: string | null;
	mpcTagsFilter: string[];
	oracleIdFilter: OracleIdFilterValue;
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
	const [mode, setMode] = useState<SearchMode>(() => parseMode(searchParams.get('mode')));
	const [customSourceId, setCustomSourceId] = useState<string | null>(
		() => searchParams.get('source') ?? null
	);
	const [mpcTagsFilter, setMpcTagsFilter] = useState<string[]>(() =>
		parseMpcTags(searchParams.get('mpcTags'))
	);
	const [oracleIdFilter, setOracleIdFilter] = useState<OracleIdFilterValue>(() => {
		const raw = searchParams.get('oracleId');
		if (raw === 'defined' || raw === 'undefined') return raw;
		return 'all';
	});

	const isInitialMount = useRef(true);

	// Sync state to URL when filters change
	useEffect(() => {
		if (isInitialMount.current) {
			isInitialMount.current = false;
			return;
		}
		const params = new URLSearchParams();
		if (name) params.set('name', name);
		if (colors.length > 0) params.set('colors', colors.join(','));
		if (colorMatch !== 'include') params.set('colorMatch', colorMatch);
		if (type) params.set('type', type);
		if (set) params.set('set', set);
		if (rarities.length > 0) params.set('rarities', rarities.join(','));
		if (oracleText) params.set('oracle', oracleText);
		if (cmc) params.set('cmc', cmc);
		if (order !== 'name') params.set('order', order);
		if (dir !== 'auto') params.set('dir', dir);
		if (mode !== 'official') params.set('mode', mode);
		if (customSourceId) params.set('source', customSourceId);
		if (mpcTagsFilter.length > 0) params.set('mpcTags', mpcTagsFilter.join(','));
		if (oracleIdFilter !== 'all') params.set('oracleId', oracleIdFilter);

		const queryString = params.toString();
		router.replace(queryString ? `/search?${queryString}` : '/search', { scroll: false });
	}, [
		name,
		colors,
		colorMatch,
		type,
		set,
		rarities,
		oracleText,
		cmc,
		order,
		dir,
		mode,
		customSourceId,
		mpcTagsFilter,
		oracleIdFilter,
		router,
	]);

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
		setCustomSourceId(filters.customSourceId);
		setMpcTagsFilter(filters.mpcTagsFilter);
		setOracleIdFilter(filters.oracleIdFilter);
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
		mode,
		setMode,
		customSourceId,
		mpcTagsFilter,
		oracleIdFilter,
		// Aggregate
		applyFilters,
		activeFilterCount,
	};
}
