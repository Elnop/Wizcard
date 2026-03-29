import type { ScryfallColor } from '@/lib/scryfall/types/scryfall';

export interface ScryfallQueryParams {
	name?: string;
	colors?: ScryfallColor[];
	colorMatch?: 'exact' | 'include' | 'atMost';
	type?: string;
	set?: string;
	rarities?: string[];
	text?: string;
	cmc?: string;
}

export function buildScryfallQuery(params: ScryfallQueryParams): string {
	const parts: string[] = [];

	if (params.name) {
		parts.push(params.name);
	}

	if (params.colors && params.colors.length > 0) {
		const colorString = params.colors.join('');
		switch (params.colorMatch) {
			case 'exact':
				parts.push(`c=${colorString}`);
				break;
			case 'atMost':
				parts.push(`c<=${colorString}`);
				break;
			case 'include':
			default:
				parts.push(`c:${colorString}`);
				break;
		}
	}

	if (params.type) {
		parts.push(`t:${params.type}`);
	}

	if (params.set) {
		parts.push(`s:${params.set}`);
	}

	if (params.rarities && params.rarities.length > 0) {
		if (params.rarities.length === 1) {
			parts.push(`r:${params.rarities[0]}`);
		} else {
			const rarityParts = params.rarities.map((r) => `r:${r}`).join(' OR ');
			parts.push(`(${rarityParts})`);
		}
	}

	if (params.text) {
		parts.push(`o:"${params.text}"`);
	}

	if (params.cmc) {
		const cmcStr = String(params.cmc);
		if (/^(>=|<=|>|<)/.test(cmcStr)) {
			parts.push(`cmc${cmcStr}`);
		} else {
			parts.push(`cmc:${cmcStr}`);
		}
	}

	return parts.join(' ');
}

export function getScryfallCardImageUriBySize(
	card: {
		image_uris?: { normal?: string; small?: string; large?: string };
		card_faces?: Array<{ image_uris?: { normal?: string; small?: string; large?: string } }>;
	},
	size: 'small' | 'normal' | 'large' = 'normal'
): string {
	return card.image_uris?.[size] ?? card.card_faces?.[0]?.image_uris?.[size] ?? '';
}
