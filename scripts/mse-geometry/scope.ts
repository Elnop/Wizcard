import { Unresolved, evaluate } from './evaluate';
import { manaCostWidth } from './font-metrics';
import { parseExpression } from './parser';
import type { FieldFontInfo } from './style-file';

/**
 * Portée de noms pour l'évaluation.
 *
 * 375 des 376 styles définissent leur propre `init script:`, qui MASQUE les
 * définitions partagées de magic.mse-game. La résolution va donc du plus
 * spécifique au plus général : style, puis script de la partie. Sans cet ordre,
 * un style qui redéfinit `art_left` recevrait la géométrie d'un autre.
 */
export interface Scope {
	/** nom -> corps de la définition (source, analysée à la demande). */
	functions: Map<string, string>;
	variables: Map<string, number | string | boolean>;
}

/** Relève les définitions `nom := { corps }` d'une source de script. */
function collectDefinitions(source: string, into: Map<string, string>): void {
	const pattern = /^[\t ]*([a-z_][a-z_0-9]*)\s*:=\s*\{/gim;
	for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
		// Équilibrage des accolades pour capturer un corps multi-ligne.
		let depth = 1;
		let index = match.index + match[0].length;
		while (index < source.length && depth > 0) {
			if (source[index] === '{') depth += 1;
			else if (source[index] === '}') depth -= 1;
			index += 1;
		}
		into.set(match[1], source.slice(match.index + match[0].length, index - 1));
	}
}

/**
 * Variables de contexte : la carte CANONIQUE contre laquelle on fige la
 * géométrie (cf. spec). Le choix est explicite pour rester auditable — une
 * carte sans indicateur de couleur, avec force/endurance et bordure visible.
 */
export const CANONICAL_CARD: Record<string, number | string | boolean> = {
	'card.card_symbol': 'none',
	'card.card_color': 'white',
	'styling.border_visible': true,
	'styling.stretch_image_to_whole_card': false,
	'styling.stretch_art_to_whole_card': false,
	'styling.three_cards': false,
	'styling.image_size': 'normal',
};

/**
 * Coût de mana CANONIQUE (tâche 6) : un pip générique + un pip coloré, ex.
 * « {1}{W} ». Choix documenté et auditable — pas la carte la plus simple
 * possible (un seul pip), mais la plus REPRÉSENTATIVE d'un coût à deux
 * symboles sans cas particulier (ni hybride, ni phyrexian, ni nombre à deux
 * chiffres) : ces codes existent tels quels dans la quasi-totalité des
 * paquets `.mse-symbol-font` du corpus (magic-mana-large, magic-mana-small,
 * …), donc mesurables sans approximation. Un paquet qui ne les définit pas
 * (ex. magic-mana-future, entièrement thématique) lève `Unresolved` — ce
 * n'est pas contourné.
 */
const CANONICAL_MANA_COST = ['1', 'W'];

const CASTING_COST_CONTENT_WIDTH = 'card_style.casting_cost.content_width';
const RARITY_CONTENT_WIDTH = 'card_style.rarity.content_width';

/**
 * Calcule `card_style.casting_cost.content_width`.
 *
 * Le coût de mana s'affiche entièrement en symboles dans le corpus
 * (`always symbol: true` sur 188/195 usages mesurés) : on ignore donc la
 * police de texte du champ et on mesure uniquement la police à symboles,
 * seule responsable de la largeur rendue.
 */
function castingCostContentWidth(info: FieldFontInfo | undefined): number {
	if (!info?.symbolFont?.name || !info.symbolFont.size) {
		throw new Unresolved(CASTING_COST_CONTENT_WIDTH);
	}
	const size = Number(info.symbolFont.size);
	if (Number.isNaN(size)) throw new Unresolved(CASTING_COST_CONTENT_WIDTH);
	// Un nom de police à symboles donné par une expression ({...}) dépend d'une
	// variable de style non fixée par la carte canonique : pas d'approximation,
	// on refuse plutôt que de choisir un paquet au hasard.
	if (info.symbolFont.name.startsWith('{')) {
		throw new Unresolved(CASTING_COST_CONTENT_WIDTH);
	}
	return manaCostWidth(info.symbolFont.name, size, CANONICAL_MANA_COST);
}

/**
 * Calcule `card_style.rarity.content_width`.
 *
 * Le corpus ne rend JAMAIS `rarity` avec une police (0 des 273 blocs inline
 * observés n'a de `font:` exploitable) : c'est un choix d'image scripté selon
 * la rareté (`render style: image` + `choice images:`). MSE expose malgré
 * tout `content_width` pour ce champ ; la valeur qu'il rapporte est celle de
 * la largeur déjà déclarée sur le champ LUI-MÊME (`width:`), puisque l'image
 * est ajustée à sa boîte. On relit donc cette valeur — un nombre dans 174/195
 * cas, une expression simple (souvent un if/then sur `styling.side`) dans le
 * reste, évaluée dans la MÊME portée. Aucun de ces cas ne référence sa propre
 * `content_width` (vérifié sur les 376 styles), donc pas de boucle possible.
 */
function rarityContentWidth(info: FieldFontInfo | undefined, scope: Scope): number {
	if (info?.width === undefined) throw new Unresolved(RARITY_CONTENT_WIDTH);
	const node = parseExpression(info.width);
	const value = evaluate(node, scope);
	if (typeof value !== 'number') throw new Unresolved(RARITY_CONTENT_WIDTH);
	return value;
}

export function buildScope(
	styleSource: string,
	gameScript: string,
	fontFields?: { 'casting cost'?: FieldFontInfo; rarity?: FieldFontInfo }
): Scope {
	const functions = new Map<string, string>();
	// Le script de la partie EN PREMIER : le style écrase ensuite ce qu'il
	// redéfinit, puisque Map.set remplace la valeur existante.
	collectDefinitions(gameScript, functions);
	collectDefinitions(styleSource, functions);
	const scope: Scope = { functions, variables: new Map(Object.entries(CANONICAL_CARD)) };

	// `content_width` est injecté comme variable de portée (résolue une fois
	// par style) plutôt que comme fonction : dans l'AST, `card_style.x.y` est
	// un noeud `member`, jamais un `call` — cf. evaluate.ts, qui cherche ces
	// chemins dans `scope.variables`. Chaque calcul est protégé : un échec de
	// mesure (police introuvable, expression non résolue) laisse simplement la
	// variable absente, et l'évaluateur lève `Unresolved` comme pour tout nom
	// manquant — pas de fallback silencieux.
	try {
		scope.variables.set(
			CASTING_COST_CONTENT_WIDTH,
			castingCostContentWidth(fontFields?.['casting cost'])
		);
	} catch {
		/* laissé non résolu, cf. commentaire ci-dessus */
	}
	try {
		scope.variables.set(RARITY_CONTENT_WIDTH, rarityContentWidth(fontFields?.rarity, scope));
	} catch {
		/* laissé non résolu, cf. commentaire ci-dessus */
	}

	return scope;
}
