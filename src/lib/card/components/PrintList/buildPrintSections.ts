import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CustomCard } from '@/lib/mpc/types';
import type { AnyCard, CardListSection } from '@/lib/card/components/CardList/CardList.types';
import { groupPrintsByLang } from './PrintList.types';

export interface BuildPrintSectionsInput {
	/** Official Scryfall prints (may be empty while loading). */
	prints: ScryfallCard[];
	/** Official-prints fetch still in flight. */
	officialLoading: boolean;
	/** Official-prints fetch error, if any. */
	officialError: string | null;
	/** Custom prints for this oracle (independent of the official fetch). */
	customPrints: CustomCard[];
	currentLang: string;
	preferredLang?: string;
	label: { officialPrints: string; customCards: string };
}

export interface BuildPrintSectionsResult {
	sections: CardListSection[];
	/**
	 * True only when there is nothing at all to show yet — no custom prints and the
	 * official section produced no groups. The caller renders its loading/empty
	 * placeholder in that case. When custom prints exist this is always false, so
	 * they render immediately regardless of the official fetch's progress.
	 */
	fullyEmpty: boolean;
}

/**
 * Compose the print-picker sections. Custom and official prints load
 * independently: the custom section renders as soon as `customPrints` is ready
 * even while the official Scryfall fetch is still paginating (basic lands return
 * thousands of prints across many throttled pages — gating the whole list on that
 * fetch used to leave custom prints invisible for tens of seconds).
 *
 * - Custom prints present → always emit the custom section (never `fullyEmpty`).
 * - Official prints ready → emit their per-language groups; nest them under an
 *   "Official prints" parent only when a custom section coexists.
 * - Official still loading (or errored) → simply omit the official section; the
 *   custom section, if any, still shows.
 */
export function buildPrintSections(input: BuildPrintSectionsInput): BuildPrintSectionsResult {
	const {
		prints,
		officialLoading,
		officialError,
		customPrints,
		currentLang,
		preferredLang,
		label,
	} = input;

	const hasCustom = customPrints.length > 0;

	let officialSections: CardListSection[] = [];
	// Only attempt to group official prints once they've loaded without error.
	if (!officialLoading && !officialError && prints.length > 0) {
		const byLang = groupPrintsByLang(prints, currentLang, preferredLang);
		if (byLang.length > 0) {
			officialSections = hasCustom
				? [{ label: label.officialPrints, cards: [], children: byLang }]
				: byLang;
		}
	}

	const customSection: CardListSection | null = hasCustom
		? { label: label.customCards, cards: customPrints as unknown as AnyCard[] }
		: null;

	const sections = [...officialSections, ...(customSection ? [customSection] : [])];

	return { sections, fullyEmpty: sections.length === 0 };
}
