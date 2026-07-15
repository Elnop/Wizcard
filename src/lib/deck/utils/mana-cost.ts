import type { ScryfallCard, ScryfallCardFace } from '@/lib/scryfall/types/scryfall';

export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G';
export type ProdColor = ManaColor | 'C';
export type BalanceKey = ManaColor | 'C' | 'ANY';
export type TypeCategory =
	| 'Creature'
	| 'Instant'
	| 'Sorcery'
	| 'Enchantment'
	| 'Artifact'
	| 'Planeswalker'
	| 'Land'
	| 'Other';

export type FaceLike = {
	mana_cost?: string;
	cmc?: number;
	type_line?: string;
};

const COLORS: ManaColor[] = ['W', 'U', 'B', 'R', 'G'];

function emptyPips(): Record<ManaColor | 'C', number> {
	return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
}

/**
 * Compte les pips colorés + incolores d'un coût de mana Scryfall (ex: "{1}{G}{G}", "{G/U}", "{2}{C}{C}").
 * - Mono-couleur ({R})            → +1 pour la couleur
 * - Hybride couleur/couleur ({G/U}) → +0.5 pour chaque couleur
 * - Phyrexian ({G/P})            → +1 pour la couleur
 * - Incolore pur ({C})           → +1 pour C
 * - Générique ({2}, {X}), snow ({S}) → ignoré
 */
export function parseColorPips(manaCost: string): Record<ManaColor | 'C', number> {
	const pips = emptyPips();
	if (!manaCost) return pips;
	// eslint-disable-next-line sonarjs/super-linear-regex -- safe: [^}] negation prevents backtracking
	const symbols = manaCost.match(/\{[^}]*\}/g) ?? [];
	for (const raw of symbols) {
		const inner = raw.slice(1, -1).toUpperCase(); // "G/U", "B/P", "R", "2", "X", "C"
		// incolore pur {C} (jamais hybride)
		if (inner === 'C') {
			pips.C += 1;
			continue;
		}
		const parts = inner.split('/');
		const colorParts = parts.filter((p): p is ManaColor => (COLORS as string[]).includes(p));
		if (colorParts.length === 0) continue; // générique / X / snow
		if (colorParts.length === 1) {
			// mono-couleur, ou Phyrexian (couleur + "P"), ou couleur + générique ({2/G})
			pips[colorParts[0]] += 1;
		} else {
			// hybride couleur/couleur → 0.5 chacun
			for (const c of colorParts) pips[c] += 0.5;
		}
	}
	return pips;
}

/** Normalise mono/double-face en une liste de faces exploitables (cost/curve/types). */
export function iterateFaces(card: ScryfallCard): FaceLike[] {
	if (card.card_faces && card.card_faces.length > 0) {
		return card.card_faces.map((f: ScryfallCardFace) => ({
			mana_cost: f.mana_cost,
			cmc: f.cmc ?? card.cmc,
			type_line: f.type_line,
		}));
	}
	return [{ mana_cost: card.mana_cost, cmc: card.cmc, type_line: card.type_line }];
}

/** Catégorie primaire d'une face selon son type_line (priorité MTG). */
export function categorizeType(typeLine: string): TypeCategory {
	const t = (typeLine ?? '').toLowerCase();
	if (t.includes('land')) return 'Land';
	if (t.includes('creature')) return 'Creature';
	if (t.includes('planeswalker')) return 'Planeswalker';
	if (t.includes('instant')) return 'Instant';
	if (t.includes('sorcery')) return 'Sorcery';
	if (t.includes('enchantment')) return 'Enchantment';
	if (t.includes('artifact')) return 'Artifact';
	return 'Other';
}
