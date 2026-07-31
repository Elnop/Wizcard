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
 * seule la chaîne est stockée, il faut donc savoir la relire.
 *
 * Deux régimes, selon que la ligne porte un tiret ou non :
 *
 * - AVEC tiret, la grammaire est explicite — gauche = supertypes puis types,
 *   droite = sous-types. Un mot inconnu à gauche reste un type.
 * - SANS tiret, la ventilation est une déduction : on s'appuie sur le
 *   vocabulaire. « Creature » est un type, « Humain » un sous-type. Sans cette
 *   règle, des sous-types saisis seuls restaient bloqués dans le champ Types et
 *   n'en ressortaient jamais.
 *
 * Sans vocabulaire (chemin serveur, ou premier rendu avant que le store soit
 * rempli), on retombe sur l'ancien comportement : tout à gauche dans `types`.
 */
export function parseTypeLine(
	typeLine: string,
	vocabulary: { supertypes: string[]; types: string[] } | null
): TypeLineParts {
	// Seuls les tirets de SÉPARATION coupent la ligne : cadratin (celui
	// qu'écrit `composeTypeLine`) et demi-cadratin (confusion de saisie
	// plausible). PAS le trait d'union : le vocabulaire officiel contient
	// `Assembly-Worker` et `Power-Plant`, et couper dessus les déchirait en
	// deux. On cherche l'index plutôt qu'une regex encadrée d'espaces
	// optionnels, qui backtracke (sonarjs/super-linear-regex).
	const dashIndex = typeLine.search(/[—–]/);
	const hasDash = dashIndex !== -1;
	const leftRaw = hasDash ? typeLine.slice(0, dashIndex) : typeLine;
	const rightRaw = hasDash ? typeLine.slice(dashIndex + 1) : '';
	const knownSupertypes = new Set((vocabulary?.supertypes ?? []).map((v) => v.toLowerCase()));
	const knownTypes = new Set((vocabulary?.types ?? []).map((v) => v.toLowerCase()));

	const supertypes: string[] = [];
	const types: string[] = [];
	const looseSubtypes: string[] = [];
	for (const word of leftRaw.split(/\s+/).filter(Boolean)) {
		if (knownSupertypes.has(word.toLowerCase())) supertypes.push(word);
		else if (hasDash || !vocabulary) types.push(word);
		else if (knownTypes.has(word.toLowerCase())) types.push(word);
		else looseSubtypes.push(word);
	}

	return {
		supertypes,
		types,
		subtypes: [...looseSubtypes, ...rightRaw.split(/\s+/).filter(Boolean)],
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

/** Forme minimale du vocabulaire dont la lecture a besoin. */
export type TypeVocabularySource = { supertypes: string[]; types: string[] } | null;

/**
 * Source de vocabulaire, injectée depuis le client.
 *
 * Ce module est atteint CÔTÉ SERVEUR (`db/custom-card-editor.ts` importe
 * `draft.ts`, qui importe `isTokenTypeLine`). Un import de store Zustand au
 * niveau module casserait alors le build Turbopack — un piège que ni `tsc` ni
 * ESLint n'attrapent, seul `npm run build`. D'où cette injection : le serveur
 * ne branche rien et lit `null`, ce qui est le repli sûr.
 */
let vocabularyResolver: () => TypeVocabularySource = () => null;

export function setTypeVocabularyResolver(resolver: () => TypeVocabularySource): void {
	vocabularyResolver = resolver;
}

export function resolveTypeVocabulary(): TypeVocabularySource {
	return vocabularyResolver();
}

/**
 * Teste la présence d'un type/supertype, sur les MOTS de la ligne.
 *
 * Les appelants utilisaient des regex du genre `/\b(land|terrain)\b/i` sur la
 * ligne entière : « Creature — Landwalker » ou un sous-type contenant le mot
 * déclenchait alors le cas terrain. On compare ici des entrées ventilées.
 *
 * Le vivier dépend de la présence d'un tiret :
 *
 * - AVEC tiret, la grammaire est explicite : on ignore les sous-types, sinon
 *   « Creature — Land Golem » passerait pour un terrain.
 * - SANS tiret, la ventilation n'est qu'une déduction fondée sur un
 *   vocabulaire ANGLAIS : « Terrain » y est inconnu et atterrit en sous-type.
 *   S'y fier pour choisir un cadre reviendrait à donner à une heuristique le
 *   poids d'une certitude, et ferait perdre le cadre de terrain sur une
 *   saisie française. On cherche donc dans les trois listes.
 */
export function hasCardType(typeLine: string, type: string): boolean {
	const parts = parseTypeLine(typeLine, resolveTypeVocabulary());
	const pool = /[—–]/.test(typeLine)
		? [...parts.supertypes, ...parts.types]
		: [...parts.supertypes, ...parts.types, ...parts.subtypes];
	const needle = type.toLowerCase();
	return pool.some((entry) => entry.toLowerCase() === needle);
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
