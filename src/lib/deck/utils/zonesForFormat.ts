import type { DeckFormat, DeckZone } from '@/types/decks';

/** Formats that use a dedicated commander zone. */
export const COMMANDER_FORMATS: DeckFormat[] = ['commander', 'brawl', 'oathbreaker'];

export function isCommanderFormat(format: DeckFormat | null | undefined): boolean {
	return format != null && COMMANDER_FORMATS.includes(format);
}

/**
 * Zones a user can add a card to, for a given deck format. Commander zone only
 * appears for commander-style formats. `tokens` is excluded — tokens are not
 * added manually via the "add to deck" flow.
 */
export function zonesForFormat(format: DeckFormat | null | undefined): DeckZone[] {
	const zones: DeckZone[] = ['mainboard', 'sideboard'];
	if (isCommanderFormat(format)) zones.push('commander');
	zones.push('maybeboard');
	return zones;
}

export const ZONE_LABELS: Record<DeckZone, string> = {
	mainboard: 'Mainboard',
	sideboard: 'Sideboard',
	maybeboard: 'Maybeboard',
	commander: 'Commander',
	tokens: 'Tokens',
};
