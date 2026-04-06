import type { CardCondition } from '@/types/cards';

export const DELVER_LANGUAGE_TO_SCRYFALL: Record<string, string> = {
	EN: 'en',
	FR: 'fr',
	ES: 'es',
	DE: 'de',
	IT: 'it',
	PT: 'pt',
	JA: 'ja',
	KO: 'ko',
	RU: 'ru',
	ZHS: 'zhs',
	ZHT: 'zht',
	HE: 'he',
	LA: 'la',
	GRC: 'grc',
	AR: 'ar',
	SA: 'sa',
	PH: 'ph',
	ENGLISH: 'en',
	FRENCH: 'fr',
	SPANISH: 'es',
	GERMAN: 'de',
	ITALIAN: 'it',
	PORTUGUESE: 'pt',
	JAPANESE: 'ja',
	KOREAN: 'ko',
	RUSSIAN: 'ru',
	CHINESE: 'zhs',
	HEBREW: 'he',
	LATIN: 'la',
	ARABIC: 'ar',
	SANSKRIT: 'sa',
	PHYREXIAN: 'ph',
};

const DELVER_CONDITION_MAP: Record<string, CardCondition> = {
	'Near Mint': 'NM',
	NM: 'NM',
	'Lightly Played': 'LP',
	LP: 'LP',
	'Moderately Played': 'MP',
	MP: 'MP',
	'Heavily Played': 'HP',
	HP: 'HP',
	Damaged: 'DMG',
	DMG: 'DMG',
};

export function normalizeDelverLanguage(raw: string | null | undefined): string | undefined {
	if (!raw) return undefined;
	const mapped = DELVER_LANGUAGE_TO_SCRYFALL[raw.toUpperCase()];
	return mapped ?? raw.toLowerCase();
}

export function normalizeDelverCondition(
	raw: string | null | undefined
): CardCondition | undefined {
	if (!raw) return undefined;
	return DELVER_CONDITION_MAP[raw] ?? undefined;
}

const DELVER_SUFFIX_RE = /^(\d+)[eps]$/i;

export function cleanCollectorNumber(raw: string): string {
	const match = DELVER_SUFFIX_RE.exec(raw);
	return match ? match[1] : raw;
}

const INCOMPATIBLE_SETS = new Set(['plst', 'plist']);

export function isIncompatibleSet(setCode: string): boolean {
	return INCOMPATIBLE_SETS.has(setCode.toLowerCase());
}
