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
 * Ordre canonique des supertypes, relevé sur les cartes réelles :
 * « Legendary Snow Land » (Dark Depths), jamais « Snow Legendary ».
 */
const SUPERTYPE_ORDER = ['Basic', 'Legendary', 'Snow', 'World', 'Ongoing', 'Elite', 'Token'];

/**
 * Ordre canonique des types quand une carte en cumule plusieurs :
 * « Artifact Creature — Beast » (Arcbound Ravager), « Land Creature — Forest
 * Dryad » (Dryad Arbor), « Enchantment Land » (Urza's Saga). Le type
 * « permanent porteur » vient en premier, la Créature ferme la marche.
 */
const TYPE_ORDER = [
	'Kindred',
	'Tribal',
	'Enchantment',
	'Artifact',
	'Land',
	'Battle',
	'Planeswalker',
	'Creature',
	'Instant',
	'Sorcery',
];

/** Trie selon un ordre de référence ; l'inconnu passe à la fin, ordre d'ajout. */
function sortByReference(values: string[], reference: string[]): string[] {
	const rank = (value: string) => {
		const index = reference.findIndex((entry) => entry.toLowerCase() === value.toLowerCase());
		return index === -1 ? reference.length : index;
	};
	return [...values].sort((a, b) => rank(a) - rank(b));
}

/** Dédoublonne sans tenir compte de la casse, en gardant la première forme. */
function dedupe(values: string[]): string[] {
	const seen = new Set<string>();
	return values.filter((value) => {
		const key = value.toLowerCase();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/**
 * Reconstruit la ligne en respectant les règles de composition de Magic.
 *
 * - supertypes puis types, chacun dans son ordre canonique — une carte ne dit
 *   pas « Snow Legendary Land » ni « Creature Artifact » ;
 * - doublons retirés (« Creature Creature ») ;
 * - le tiret n'apparaît qu'entre une gauche ET une droite non vides :
 *   « Instant — » n'existe pas, « — Human » non plus. Des sous-types sans type
 *   sont donc rendus seuls, en attendant que l'utilisateur complète la ligne.
 */
export function composeTypeLine(parts: TypeLineParts): string {
	const supertypes = sortByReference(dedupe(parts.supertypes), SUPERTYPE_ORDER);
	const types = sortByReference(dedupe(parts.types), TYPE_ORDER);
	const left = [...supertypes, ...types].join(' ').trim();
	const right = dedupe(parts.subtypes).join(' ').trim();

	if (!left) return right;
	if (!right) return left;
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
 * Teste la présence d'un type/supertype, sur les MOTS de la ligne.
 *
 * Les appelants utilisaient des regex du genre `/\b(land|terrain)\b/i` sur la
 * ligne entière : « Creature — Landwalker » ou un sous-type contenant le mot
 * déclenchait alors le cas terrain. On compare ici des entrées ventilées, en
 * ignorant les sous-types — « Elemental Shaman » n'est pas un terrain.
 */
export function hasCardType(typeLine: string, type: string): boolean {
	const { supertypes, types } = parseTypeLine(typeLine, null);
	const needle = type.toLowerCase();
	return [...supertypes, ...types].some((entry) => entry.toLowerCase() === needle);
}

/**
 * Terrain ? Accepte l'anglais et le français, la saisie n'étant pas contrainte
 * à une langue.
 */
export function isLandTypeLine(typeLine: string): boolean {
	return hasCardType(typeLine, 'land') || hasCardType(typeLine, 'terrain');
}

/**
 * Jeton ? Se lit sur le SUPERTYPE (« Token Creature — Soldier »), pas sur le
 * layout : on peut dessiner un jeton avec n'importe quel gabarit.
 */
export function isTokenTypeLine(typeLine: string): boolean {
	return hasCardType(typeLine, 'token') || hasCardType(typeLine, 'jeton');
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
