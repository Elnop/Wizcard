import type { CardCondition } from '@/types/cards';
import type { MtgLanguage } from '@/lib/mtg/languages';
import { SCRYFALL_CODE_TO_LANGUAGE, LANGUAGE_TO_SCRYFALL_CODE } from '@/lib/mtg/languages';
import type { CardNexusFinish } from './types';

// ── Condition ──────────────────────────────────────────────────────────────

const CARDNEXUS_CONDITION_MAP: Record<string, CardCondition> = {
	'near mint': 'NM',
	nm: 'NM',
	mint: 'NM',
	m: 'NM',
	'lightly played': 'LP',
	lp: 'LP',
	'slightly played': 'LP',
	sp: 'LP',
	'moderately played': 'MP',
	mp: 'MP',
	played: 'MP',
	'heavily played': 'HP',
	hp: 'HP',
	poor: 'DMG',
	damaged: 'DMG',
	dmg: 'DMG',
};

export function normalizeCardNexusCondition(
	raw: string | null | undefined
): CardCondition | undefined {
	if (!raw) return undefined;
	return CARDNEXUS_CONDITION_MAP[raw.trim().toLowerCase()] ?? undefined;
}

const CONDITION_TO_CARDNEXUS: Record<CardCondition, string> = {
	NM: 'Near Mint',
	LP: 'Lightly Played',
	MP: 'Moderately Played',
	HP: 'Heavily Played',
	DMG: 'Damaged',
};

export function cardConditionToCardNexus(condition: CardCondition | undefined): string {
	return condition ? CONDITION_TO_CARDNEXUS[condition] : 'Near Mint';
}

// ── Finish (foil treatment) ──────────────────────────────────────────────────

export interface CardNexusFinishResult {
	isFoil: boolean;
	foilType?: 'foil' | 'etched';
}

export function normalizeCardNexusFinish(raw: string | null | undefined): CardNexusFinishResult {
	const value = (raw ?? '').trim().toLowerCase();
	if (value === 'etched') return { isFoil: true, foilType: 'etched' };
	// "Reverse Holo" is a Pokémon treatment; treat any remaining foil variant as foil.
	if (value === 'foil' || value === 'reverse holo' || value === 'rainbow foil') {
		return { isFoil: true, foilType: 'foil' };
	}
	return { isFoil: false };
}

export function foilToCardNexusFinish(
	isFoil: boolean | undefined,
	foilType: 'foil' | 'etched' | undefined
): CardNexusFinish {
	if (foilType === 'etched') return 'etched';
	if (foilType === 'foil' || isFoil) return 'foil';
	return '';
}

export function cardNexusFinishLabel(finish: CardNexusFinish): string {
	if (finish === 'etched') return 'Etched';
	if (finish === 'foil') return 'Foil';
	// CardNexus labels non-foil cards "Standard" in its exports.
	return 'Standard';
}

// ── Language ─────────────────────────────────────────────────────────────────

// Accepts long English labels, Scryfall codes, and a few common localized labels.
const CARDNEXUS_LANGUAGE_TO_MTG: Record<string, MtgLanguage> = {
	// Localized / alternate spellings not covered by the Scryfall maps below.
	anglais: 'English',
	francais: 'French',
	français: 'French',
	allemand: 'German',
	espagnol: 'Spanish',
	italien: 'Italian',
	portugais: 'Portuguese',
	japonais: 'Japanese',
	coreen: 'Korean',
	coréen: 'Korean',
	russe: 'Russian',
	chinois: 'Simplified Chinese',
};

// Lower-cased index of canonical MtgLanguage labels, built once.
const MTG_LANGUAGE_BY_LOWER: Record<string, MtgLanguage> = Object.fromEntries(
	Object.values(SCRYFALL_CODE_TO_LANGUAGE).map((lang) => [lang.toLowerCase(), lang])
);

export function normalizeCardNexusLanguage(
	raw: string | null | undefined
): MtgLanguage | undefined {
	if (!raw) return undefined;
	const value = raw.trim();
	if (!value) return undefined;
	const lower = value.toLowerCase();

	// Scryfall code (e.g. "en", "ja")
	if (SCRYFALL_CODE_TO_LANGUAGE[lower]) return SCRYFALL_CODE_TO_LANGUAGE[lower];

	// Canonical English label (e.g. "Japanese", "Simplified Chinese")
	const titled = MTG_LANGUAGE_BY_LOWER[lower];
	if (titled) return titled;

	// Localized label
	return CARDNEXUS_LANGUAGE_TO_MTG[lower] ?? undefined;
}

export function mtgLanguageToCardNexus(language: MtgLanguage | undefined): string {
	if (!language) return 'English';
	// Emit the Scryfall code when known, else the long label — both round-trip cleanly.
	return LANGUAGE_TO_SCRYFALL_CODE[language] ?? language;
}
