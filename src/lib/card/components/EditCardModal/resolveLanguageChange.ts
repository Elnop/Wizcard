import { LANGUAGE_TO_SCRYFALL_CODE, type MtgLanguage } from '@/lib/mtg/languages';

export type LanguageChangeAction =
	| { kind: 'skip' }
	| { kind: 'fetch'; set: string; collectorNumber: string; langCode: string };

export function resolveLanguageChange(
	language: MtgLanguage | undefined,
	print: { set?: string; collector_number?: string }
): LanguageChangeAction {
	if (!language) return { kind: 'skip' };
	const langCode = LANGUAGE_TO_SCRYFALL_CODE[language];
	if (!langCode) return { kind: 'skip' };
	if (!print.set || !print.collector_number) return { kind: 'skip' };
	return {
		kind: 'fetch',
		set: print.set,
		collectorNumber: print.collector_number,
		langCode,
	};
}
