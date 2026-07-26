/**
 * Composition et lecture de la ligne de type.
 *
 * Une ligne de type Magic suit toujours la même grammaire :
 *
 *     [supertypes] types — [subtypes]
 *     « Legendary Creature — Human Wizard »
 *
 * L'éditeur manipule donc trois listes plutôt qu'une chaîne libre, et
 * reconstruit la ligne à partir d'elles. La chaîne reste la source de vérité
 * stockée (c'est le format de la carte), mais l'UI ne demande plus à
 * l'utilisateur de connaître la place du tiret.
 */

export interface TypeLineParts {
	supertypes: string[];
	types: string[];
	subtypes: string[];
}

/** Le tiret cadratin sépare types et sous-types. */
const DASH = '—';

export const EMPTY_TYPE_LINE: TypeLineParts = { supertypes: [], types: [], subtypes: [] };

/**
 * Reconstruit la ligne à partir des trois listes.
 *
 * Le tiret n'apparaît que s'il y a des sous-types — « Instant — » n'existe pas.
 */
export function composeTypeLine(parts: TypeLineParts): string {
	const left = [...parts.supertypes, ...parts.types].join(' ').trim();
	const right = parts.subtypes.join(' ').trim();
	if (!right) return left;
	if (!left) return `${DASH} ${right}`;
	return `${left} ${DASH} ${right}`;
}

/**
 * Lit une ligne existante et la ventile dans les trois listes.
 *
 * Sert à réhydrater l'éditeur depuis un brouillon ou une carte enregistrée :
 * seule la chaîne est stockée, il faut donc savoir la relire. Un mot inconnu du
 * vocabulaire est classé en `types` s'il est à gauche du tiret, en `subtypes`
 * sinon — de cette façon une saisie libre survit à un aller-retour.
 */
export function parseTypeLine(
	typeLine: string,
	vocabulary: { supertypes: string[]; types: string[] } | null
): TypeLineParts {
	// Accepte aussi le tiret simple, courant quand la ligne est tapée à la main.
	// On coupe sur le premier tiret trouvé plutôt qu'avec une regex encadrée
	// d'espaces optionnels, qui backtracke (sonarjs/super-linear-regex).
	const dashIndex = typeLine.search(/[—-]/);
	const leftRaw = dashIndex === -1 ? typeLine : typeLine.slice(0, dashIndex);
	const rightRaw = dashIndex === -1 ? '' : typeLine.slice(dashIndex + 1);
	const knownSupertypes = new Set((vocabulary?.supertypes ?? []).map((v) => v.toLowerCase()));

	const supertypes: string[] = [];
	const types: string[] = [];
	for (const word of leftRaw.split(/\s+/).filter(Boolean)) {
		if (knownSupertypes.has(word.toLowerCase())) supertypes.push(word);
		else types.push(word);
	}

	return {
		supertypes,
		types,
		subtypes: rightRaw.split(/\s+/).filter(Boolean),
	};
}

/**
 * Découpe une saisie séparée par des virgules en valeurs propres.
 *
 * Le champ accepte « Human, Wizard » ou « human,wizard, » : on nettoie les
 * espaces et les entrées vides plutôt que d'imposer une forme à l'utilisateur.
 */
export function splitTypeInput(raw: string): string[] {
	return raw
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean);
}

/**
 * Normalise la casse sur le vocabulaire officiel.
 *
 * « human » saisi à la main devient « Human », pour que la ligne composée
 * ressemble à une vraie carte. Une valeur hors vocabulaire est conservée telle
 * quelle : le studio sert aussi à inventer des types.
 */
export function normalizeTypeValue(value: string, vocabulary: string[]): string {
	const match = vocabulary.find((entry) => entry.toLowerCase() === value.toLowerCase());
	return match ?? value;
}
