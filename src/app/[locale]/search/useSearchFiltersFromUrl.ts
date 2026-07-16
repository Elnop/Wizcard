'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import type { ScryfallColor } from '@/lib/scryfall/types/scryfall';
import type { ScryfallSortOrder, ScryfallSortDir } from '@/lib/scryfall/types/sort';
import { countActiveFilters } from '@/lib/search/types';
import type { ColorMatch } from '@/lib/search/types';
import type { SearchMode } from '@/lib/search/types';
import type { MpcTagsFilterValue } from '@/lib/search/components/filters/MpcTagsFilter/MpcTagsFilter';
import { usePreferredCardLang } from '@/lib/scryfall/hooks/useLocalizedImage';

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
const VALID_COLOR_IDENTITY_MATCHES = new Set(['atMost', 'exact']);
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

function parseColorIdentityMatch(param: string | null): 'atMost' | 'exact' {
	if (param && VALID_COLOR_IDENTITY_MATCHES.has(param)) return param as 'atMost' | 'exact';
	return 'atMost';
}

function parseRarities(param: string | null): string[] {
	if (!param) return [];
	return param.split(',').filter((r) => VALID_RARITIES.has(r));
}

type UrlSyncState = {
	name: string;
	colors: ScryfallColor[];
	colorMatch: 'exact' | 'include' | 'atMost';
	colorIdentity: ScryfallColor[];
	colorIdentityMatch: 'atMost' | 'exact';
	type: string[];
	set: string;
	rarities: string[];
	oracleText: string;
	cmc: string;
	order: ScryfallSortOrder;
	dir: ScryfallSortDir;
	mode: SearchMode;
	customSourceId: string | null;
	mpcTags: MpcTagsFilterValue;
	includeMultilingual: boolean;
	// The by-language default for includeMultilingual, so the writer can emit an
	// explicit ml=0 when the user turns it off against a default of on.
	multilingualDefaultsOn: boolean;
};

/** The value to persist for the `ml` param, or null to omit it: emitted only
 * when the toggle diverges from its by-language default, so English URLs stay
 * clean while a non-English user's explicit off (ml=0) survives reload. */
function mlParamValue(state: Pick<UrlSyncState, 'includeMultilingual' | 'multilingualDefaultsOn'>) {
	if (state.includeMultilingual === state.multilingualDefaultsOn) return null;
	return state.includeMultilingual ? '1' : '0';
}

/** Builds the `/search` URL query string from current filter state. Extracted
 * from the sync effect so the effect body stays under the cognitive-complexity
 * limit; this function's only job is the flat sequence of "set if non-default"
 * checks. */
function buildSearchParams(state: UrlSyncState): URLSearchParams {
	const params = new URLSearchParams();
	if (state.name) params.set('name', state.name);
	if (state.colors.length > 0) params.set('colors', state.colors.join(','));
	if (state.colorMatch !== 'include') params.set('colorMatch', state.colorMatch);
	if (state.colorIdentity.length > 0) params.set('ci', state.colorIdentity.join(','));
	if (state.colorIdentityMatch !== 'atMost') params.set('cim', state.colorIdentityMatch);
	if (state.type.length > 0) params.set('type', state.type.join(','));
	if (state.set) params.set('set', state.set);
	if (state.rarities.length > 0) params.set('rarities', state.rarities.join(','));
	if (state.oracleText) params.set('oracle', state.oracleText);
	if (state.cmc) params.set('cmc', state.cmc);
	if (state.order !== 'name') params.set('order', state.order);
	if (state.dir !== 'auto') params.set('dir', state.dir);
	if (state.mode !== 'official') params.set('mode', state.mode);
	if (state.customSourceId) params.set('source', state.customSourceId);
	if (state.mpcTags.mustHave.length > 0) params.set('mpcMust', state.mpcTags.mustHave.join(','));
	// Omit mpcNot when it's the default ['NSFW']; use mpcNot= (empty) to signal "cleared by user"
	const isDefaultMpcNot =
		state.mpcTags.mustNotHave.length === 1 && state.mpcTags.mustNotHave[0] === 'NSFW';
	if (!isDefaultMpcNot) params.set('mpcNot', state.mpcTags.mustNotHave.join(','));
	const ml = mlParamValue(state);
	if (ml !== null) params.set('ml', ml);
	return params;
}

export type SearchFilters = {
	colors: ScryfallColor[];
	colorMatch: 'exact' | 'include' | 'atMost';
	colorIdentity: ScryfallColor[];
	colorIdentityMatch: 'atMost' | 'exact';
	type: string[];
	set: string;
	rarities: string[];
	oracleText: string;
	cmc: string;
	order: ScryfallSortOrder;
	dir: ScryfallSortDir;
	customSourceId: string | null;
	mpcTags: MpcTagsFilterValue;
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
	const [colorIdentityMatch, setColorIdentityMatch] = useState<'atMost' | 'exact'>(() =>
		parseColorIdentityMatch(searchParams.get('cim'))
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
	const preferredLang = usePreferredCardLang();
	// Default: on when the user's preferred card language is non-English.
	const multilingualDefaultsOn = preferredLang !== undefined && preferredLang !== 'en';
	const [includeMultilingual, setIncludeMultilingual] = useState<boolean>(() => {
		const raw = searchParams.get('ml');
		if (raw === '1') return true;
		if (raw === '0') return false;
		return multilingualDefaultsOn;
	});

	const isInitialMount = useRef(true);

	useEffect(() => {
		if (isInitialMount.current) {
			isInitialMount.current = false;
			return;
		}
		const params = buildSearchParams({
			name,
			colors,
			colorMatch,
			colorIdentity,
			colorIdentityMatch,
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
			includeMultilingual,
			multilingualDefaultsOn,
		});

		const queryString = params.toString();
		router.replace(queryString ? `/search?${queryString}` : '/search', { scroll: false });
	}, [
		name,
		colors,
		colorMatch,
		colorIdentity,
		colorIdentityMatch,
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
		includeMultilingual,
		multilingualDefaultsOn,
		router,
	]);

	const applyFilters = (filters: SearchFilters) => {
		setColors(filters.colors);
		setColorMatch(filters.colorMatch);
		setColorIdentity(filters.colorIdentity);
		setColorIdentityMatch(filters.colorIdentityMatch);
		setType(filters.type);
		setSet(filters.set);
		setRarities(filters.rarities);
		setOracleText(filters.oracleText);
		setCmc(filters.cmc);
		setOrder(filters.order);
		setDir(filters.dir);
		setCustomSourceId(filters.customSourceId);
		setMpcTags(filters.mpcTags);
	};

	const activeFilterCount = countActiveFilters({
		name: '',
		colors,
		colorMatch,
		colorIdentity,
		colorIdentityMatch,
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
		colorIdentityMatch,
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
		applyFilters,
		includeMultilingual,
		setIncludeMultilingual,
		activeFilterCount,
	};
}
