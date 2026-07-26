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

export function buildScope(styleSource: string, gameScript: string): Scope {
	const functions = new Map<string, string>();
	// Le script de la partie EN PREMIER : le style écrase ensuite ce qu'il
	// redéfinit, puisque Map.set remplace la valeur existante.
	collectDefinitions(gameScript, functions);
	collectDefinitions(styleSource, functions);
	return { functions, variables: new Map(Object.entries(CANONICAL_CARD)) };
}
