import type { ScryfallColor } from '@/lib/scryfall/types/scryfall';

export interface ScryfallQueryParams {
	name?: string;
	colors?: ScryfallColor[];
	colorMatch?: 'exact' | 'include' | 'atMost';
	type?: string[];
	set?: string;
	rarities?: string[];
	text?: string;
	cmc?: string;
	legal?: string;
	colorIdentity?: ScryfallColor[];
	colorIdentityMatch?: 'atMost' | 'exact';
	isToken?: boolean;
	matchNothing?: boolean;
}

function buildColorQuery(
	colors: ScryfallColor[],
	colorMatch?: 'exact' | 'include' | 'atMost'
): string {
	const colorString = colors.join('');
	switch (colorMatch) {
		case 'exact':
			return `c=${colorString}`;
		case 'atMost':
			return `c<=${colorString}`;
		case 'include':
		default:
			return `c:${colorString}`;
	}
}

function buildTypeQuery(types: string[]): string {
	// Multiple `t:` parts are conjunctive in Scryfall (AND), e.g. `t:cat t:legendary`.
	return types
		.map((t) => {
			const quoted = t.includes(' ') ? `"${t}"` : t;
			return `t:${quoted}`;
		})
		.join(' ');
}

function buildRarityQuery(rarities: string[]): string {
	if (rarities.length === 1) {
		return `r:${rarities[0]}`;
	}
	const rarityParts = rarities.map((r) => `r:${r}`).join(' OR ');
	return `(${rarityParts})`;
}

export function buildScryfallQuery(params: ScryfallQueryParams): string {
	// A non-empty user color-identity selection that is disjoint from the commander's
	// identity is an impossible constraint: no card can satisfy `ci<=colorless` AND
	// `ci>={w,u,b,r,g}` simultaneously, so this always yields zero results.
	if (params.matchNothing) {
		return 'id<=c id>=wubrg';
	}

	const parts: string[] = [];

	if (params.isToken) {
		parts.push('t:token');
	}

	if (params.name) {
		parts.push(`name:${params.name}`);
	}

	if (params.colors && params.colors.length > 0) {
		parts.push(buildColorQuery(params.colors, params.colorMatch));
	}

	if (params.type && params.type.length > 0) {
		parts.push(buildTypeQuery(params.type));
	}

	if (params.set) {
		parts.push(`s:${params.set}`);
	}

	if (params.rarities && params.rarities.length > 0) {
		parts.push(buildRarityQuery(params.rarities));
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

	if (params.legal) {
		parts.push(`legal:${params.legal}`);
	}

	if (params.colorIdentity && params.colorIdentity.length > 0) {
		const op = params.colorIdentityMatch === 'exact' ? '=' : '<=';
		parts.push(`ci${op}${params.colorIdentity.join('')}`);
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

/**
 * Returns the image URI(s) for a card's faces at the given size.
 *
 * Double-faced cards (transform, modal_dfc, double_faced_token, reversible)
 * carry a distinct `image_uris` on each entry of `card_faces`. When the first
 * two faces both have an image for `size`, this returns `[front, back]` so the
 * PDF export can render both. Single-image cards — including split/flip/
 * adventure, which share the root `image_uris` and have no per-face image —
 * return a single-element array (the same value as getScryfallCardImageUriBySize).
 */
export function getScryfallCardFaceImageUris(
	card: {
		image_uris?: { normal?: string; small?: string; large?: string };
		card_faces?: Array<{ image_uris?: { normal?: string; small?: string; large?: string } }>;
	},
	size: 'small' | 'normal' | 'large' = 'normal'
): string[] {
	const faces = card.card_faces;
	const front = faces?.[0]?.image_uris?.[size];
	const back = faces?.[1]?.image_uris?.[size];
	if (front && back) return [front, back];
	return [getScryfallCardImageUriBySize(card, size)];
}
