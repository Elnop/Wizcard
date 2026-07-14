import type { CardCondition } from '@/types/cards';
import type { MtgLanguage } from '@/lib/mtg/languages';
import { SCRYFALL_CODE_TO_LANGUAGE } from '@/lib/mtg/languages';

// ── Condition ────────────────────────────────────────────────────────────────

// Moxfield exports the short codes; the long labels are accepted for CSVs
// hand-edited or re-exported by other tools.
const MOXFIELD_CONDITION_MAP: Record<string, CardCondition> = {
	nm: 'NM',
	'near mint': 'NM',
	mint: 'NM',
	m: 'NM',
	lp: 'LP',
	'lightly played': 'LP',
	sp: 'LP',
	'slightly played': 'LP',
	mp: 'MP',
	'moderately played': 'MP',
	played: 'MP',
	hp: 'HP',
	'heavily played': 'HP',
	dmg: 'DMG',
	damaged: 'DMG',
	poor: 'DMG',
};

export function normalizeMoxfieldCondition(
	raw: string | null | undefined
): CardCondition | undefined {
	if (!raw) return undefined;
	return MOXFIELD_CONDITION_MAP[raw.trim().toLowerCase()] ?? undefined;
}

// ── Language ─────────────────────────────────────────────────────────────────

// Lower-cased index of canonical MtgLanguage labels, built once.
const MTG_LANGUAGE_BY_LOWER: Record<string, MtgLanguage> = Object.fromEntries(
	Object.values(SCRYFALL_CODE_TO_LANGUAGE).map((lang) => [lang.toLowerCase(), lang])
);

export function normalizeMoxfieldLanguage(raw: string | null | undefined): MtgLanguage | undefined {
	if (!raw) return undefined;
	const lower = raw.trim().toLowerCase();
	if (!lower) return undefined;
	// Scryfall code (e.g. "en", "ja") or canonical label (e.g. "Japanese").
	return SCRYFALL_CODE_TO_LANGUAGE[lower] ?? MTG_LANGUAGE_BY_LOWER[lower] ?? undefined;
}
