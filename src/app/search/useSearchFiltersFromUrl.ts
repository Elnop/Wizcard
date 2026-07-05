'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ScryfallColor } from '@/lib/scryfall/types/scryfall';
import type { ScryfallSortOrder, ScryfallSortDir } from '@/lib/scryfall/types/sort';
import { countActiveFilters } from '@/lib/search/types';
import type { ColorMatch } from '@/lib/search/types';
import type { SearchMode } from '@/lib/search/types';
import type { OracleIdFilterValue } from '@/lib/search/components/filters/OracleIdFilter/OracleIdFilter';
import type { MpcTagsFilterValue } from '@/lib/search/components/filters/MpcTagsFilter/MpcTagsFilter';

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
const VALID_MODES = new Set(['official', 'custom', 'backs']);

function parseMode(param: string | null): SearchMode {
	if (param && VALID_MODES.has(param)) return param as SearchMode;
	return 'official';
}

function parseTags(param: string | null): string[] {
	if (!param) return [];
	return param.split(',').filter(Boolean);
}

function parseMpcTags(
	mustHaveParam: string | null,
	mustNotHaveParam: string | null
): MpcTagsFilterValue {
	const mustHave = parseTags(mustHaveParam);
	const mustNotHave = mustNotHaveParam !== null ? parseTags(mustNotHaveParam) : ['NSFW'];
	return { mustHave, mustNotHave };
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
	colorIdentity: ScryfallColor[];
	type: string[];
	set: string;
	rarities: string[];
	oracleText: string;
	cmc: string;
	order: ScryfallSortOrder;
	dir: ScryfallSortDir;
	customSourceId: string | null;
	mpcTags: MpcTagsFilterValue;
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
	const [colorIdentity, setColorIdentity] = useState<ScryfallColor[]>(() =>
		parseColors(searchParams.get('ci'))
	);
	const [type, setType] = useState<string[]>(
		() => searchParams.get('type')?.split(',').filter(Boolean) ?? []
	);
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
	const [mpcTags, setMpcTags] = useState<MpcTagsFilterValue>(() =>
		parseMpcTags(searchParams.get('mpcMust'), searchParams.get('mpcNot'))
	);
	const [oracleIdFilter, setOracleIdFilter] = useState<OracleIdFilterValue>(() => {
		const raw = searchParams.get('oracleId');
		if (raw === 'defined' || raw === 'undefined') return raw;
		return 'all';
	});

	const isInitialMount = useRef(true);

	useEffect(() => {
		if (isInitialMount.current) {
			isInitialMount.current = false;
			return;
		}
		const params = new URLSearchParams();
		if (name) params.set('name', name);
		if (colors.length > 0) params.set('colors', colors.join(','));
		if (colorMatch !== 'include') params.set('colorMatch', colorMatch);
		if (colorIdentity.length > 0) params.set('ci', colorIdentity.join(','));
		if (type.length > 0) params.set('type', type.join(','));
		if (set) params.set('set', set);
		if (rarities.length > 0) params.set('rarities', rarities.join(','));
		if (oracleText) params.set('oracle', oracleText);
		if (cmc) params.set('cmc', cmc);
		if (order !== 'name') params.set('order', order);
		if (dir !== 'auto') params.set('dir', dir);
		if (mode !== 'official') params.set('mode', mode);
		if (customSourceId) params.set('source', customSourceId);
		if (mpcTags.mustHave.length > 0) params.set('mpcMust', mpcTags.mustHave.join(','));
		// Omit mpcNot when it's the default ['NSFW']; use mpcNot= (empty) to signal "cleared by user"
		const isDefaultMpcNot = mpcTags.mustNotHave.length === 1 && mpcTags.mustNotHave[0] === 'NSFW';
		if (!isDefaultMpcNot) params.set('mpcNot', mpcTags.mustNotHave.join(','));
		if (oracleIdFilter !== 'all') params.set('oracleId', oracleIdFilter);

		const queryString = params.toString();
		router.replace(queryString ? `/search?${queryString}` : '/search', { scroll: false });
	}, [
		name,
		colors,
		colorMatch,
		colorIdentity,
		type,
		set,
		rarities,
		oracleText,
		cmc,
		order,
		dir,
		mode,
		customSourceId,
		mpcTags,
		oracleIdFilter,
		router,
	]);

	const applyFilters = (filters: SearchFilters) => {
		setColors(filters.colors);
		setColorMatch(filters.colorMatch);
		setColorIdentity(filters.colorIdentity);
		setType(filters.type);
		setSet(filters.set);
		setRarities(filters.rarities);
		setOracleText(filters.oracleText);
		setCmc(filters.cmc);
		setOrder(filters.order);
		setDir(filters.dir);
		setCustomSourceId(filters.customSourceId);
		setMpcTags(filters.mpcTags);
		setOracleIdFilter(filters.oracleIdFilter);
	};

	const activeFilterCount = countActiveFilters({
		name: '',
		colors,
		colorMatch,
		colorIdentity,
		type,
		set,
		rarities,
		oracleText,
		cmc,
		order,
		dir,
	});

	return {
		name,
		setName,
		colors,
		colorMatch,
		colorIdentity,
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
		mpcTags,
		oracleIdFilter,
		applyFilters,
		activeFilterCount,
	};
}
