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

/**
 * Séparateurs reconnus entre types et sous-types : cadratin (celui qu'écrit
 * `composeTypeLine`), demi-cadratin (confusion de saisie plausible), et
 * deux-points.
 *
 * Le deux-points n'est pas une tolérance de saisie : c'est la ponctuation que
 * Scryfall imprime sur une partie du corpus français. Relevé sur 720
 * impressions françaises distinctes, `printed_type_line` porte 569 cadratins et
 * 137 deux-points — ces derniers surtout sur les planeswalkers et les cartes
 * tribales (« Créature légendaire : time lord et soldat »). Sans lui, la ligne
 * entière partait à gauche et les sous-types n'étaient jamais reconnus.
 *
 * PAS le trait d'union : le vocabulaire officiel de Scryfall ne contient que
 * deux entrées avec un trait d'union — « Assembly-Worker » (type de créature)
 * et « Power-Plant » (type de terrain) — et aucune dans `card-types` ni
 * `supertypes`. Le français s'en sert au contraire pour SOUDER des types
 * cumulés (« Créature-artefact »), ce que traite `LOCALIZED_GRAMMAR`.
 *
 * Partagée par `parseTypeLine` et `hasCardType` pour que la lecture et la
 * sélection du vivier restent synchronisées si un séparateur est ajouté un jour.
 *
 * Pas de flag `g` : cette regex est module-level et testée avec `.test()`
 * (voir plus bas) ; un flag global ferait persister `lastIndex` entre deux
 * appels et renverrait des résultats alternativement faux.
 */
const SEPARATOR = /[—–:]/;

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
	// La langue se déduit des entrées elles-mêmes, faute d'être passée : composer
	// une ligne française avec la grammaire anglaise produisait « légendaire
	// Créature — time lord soldat », qui n'est ni correct ni relisible — le
	// supertype antéposé et les sous-types recollés à l'espace.
	const grammar = detectGrammar([...parts.supertypes, ...parts.types].join(' '));
	const supertypes = sortByReference(dedupe(parts.supertypes), SUPERTYPE_ORDER);
	const types = sortByReference(dedupe(parts.types), TYPE_ORDER);
	const subtypes = dedupe(parts.subtypes);

	if (grammar) return composeLocalizedTypeLine(supertypes, types, subtypes, grammar);

	const left = [...supertypes, ...types].join(' ').trim();
	const right = subtypes.join(' ').trim();

	if (!left) return right;
	if (!right) return left;
	return `${left} ${DASH} ${right}`;
}

/**
 * Recompose une ligne dans une langue dont la grammaire est mesurée.
 *
 * Miroir exact de `splitLocalizedLeft` / `splitSubtypes` : supertypes
 * POSTPOSÉS, types cumulés SOUDÉS par un trait d'union, sous-types reliés par
 * la conjonction. Ce qui en sort doit se relire à l'identique, sans quoi
 * rouvrir un brouillon dégraderait la ligne à chaque passage.
 *
 * Le cadratin est préféré au deux-points : les deux existent dans le corpus,
 * mais c'est le séparateur majoritaire (569 contre 137) et celui que
 * `composeTypeLine` écrit déjà en anglais.
 */
function composeLocalizedTypeLine(
	supertypes: string[],
	types: string[],
	subtypes: string[],
	grammar: LocalizedTypeGrammar
): string {
	const core = grammar.fusedTypes ? types.join('-') : types.join(' ');
	const left = [core, ...supertypes].filter(Boolean).join(' ').trim();
	const right = subtypes.join(grammar.subtypeJoinerText).trim();

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
	// Seuls les tirets de SÉPARATION coupent la ligne (voir `SEPARATOR`). On
	// cherche l'index plutôt qu'une regex encadrée d'espaces optionnels, qui
	// backtracke (sonarjs/super-linear-regex).
	const dashIndex = typeLine.search(SEPARATOR);
	const hasDash = dashIndex !== -1;
	const leftRaw = hasDash ? typeLine.slice(0, dashIndex) : typeLine;
	const rightRaw = hasDash ? typeLine.slice(dashIndex + 1) : '';
	const knownSupertypes = new Set((vocabulary?.supertypes ?? []).map((v) => v.toLowerCase()));
	const knownTypes = new Set((vocabulary?.types ?? []).map((v) => v.toLowerCase()));

	// Une ligne écrite dans une langue dont la grammaire est mesurée se lit avec
	// SA grammaire : découper « time lord et soldat » sur l'espace produirait
	// trois sous-types fantômes. On ne s'y engage que si la ligne porte vraiment
	// des marqueurs de cette langue (cf. `detectGrammar`), pour ne pas relire de
	// l'anglais avec des règles françaises.
	const localized = detectGrammar(typeLine);
	if (localized) {
		const left = splitLocalizedLeft(leftRaw, localized);
		return { ...left, subtypes: splitSubtypes(rightRaw, localized) };
	}

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
 * Grammaire de la ligne de type, par langue.
 *
 * L'anglais juxtapose ses sous-types par des espaces ; le français les relie
 * par « et » et peut en écrire qui contiennent eux-mêmes une espace (« time
 * lord », « tortue terrestre »). Découper sur l'espace produisait alors des
 * types fantômes : « time lord et docteur » donnait quatre entrées au lieu de
 * deux.
 *
 * Les valeurs sont MESURÉES sur le corpus (720 impressions françaises
 * distinctes tirées de `printed_type_line`), pas devinées :
 *
 * - `subtypeJoiner` : découper sur « et » redonne exactement le nombre de
 *   sous-types anglais sur 706 lignes / 706 comparables. Aucun écart.
 * - `supertypeSuffix` : le français POSTPOSE le supertype (« Créature
 *   légendaire », « Terrain de base »), là où l'anglais l'antépose.
 * - `fusedTypes` : le français SOUDE les types cumulés par un trait d'union
 *   (« Créature-artefact », « Terrain-enchantement »), là où l'anglais les
 *   juxtapose.
 *
 * Seul le français est renseigné : c'est la seule langue mesurée, et inventer
 * des règles pour les huit autres reviendrait à donner à une supposition le
 * poids d'un relevé. La table est indexée par langue pour que les suivantes se
 * branchent sans refonte, une fois mesurées à leur tour.
 */
interface LocalizedTypeGrammar {
	/** Conjonction qui sépare deux sous-types, si la langue en emploie une. */
	subtypeJoiner: RegExp;
	/** La même conjonction, sous la forme à ÉCRIRE lors de la composition. */
	subtypeJoinerText: string;
	/** Supertypes reconnus en position finale du bloc gauche. */
	supertypeSuffix: string[];
	/** Types cumulés soudés par un trait d'union dans cette langue. */
	fusedTypes: boolean;
	/** Libellé localisé de chaque supertype/type anglais, en minuscules. */
	equivalents: Record<string, string>;
	/** Ceux des `equivalents` qui diffèrent de l'anglais (cf. `distinctiveMarkers`). */
	markers: Set<string>;
}

const FRENCH_EQUIVALENTS: Record<string, string> = {
	legendary: 'légendaire',
	basic: 'de base',
	snow: 'neigeux',
	world: 'mondial',
	land: 'terrain',
	creature: 'créature',
	artifact: 'artefact',
	enchantment: 'enchantement',
	instant: 'éphémère',
	sorcery: 'rituel',
	planeswalker: 'planeswalker',
	battle: 'bataille',
	token: 'jeton',
	// « Kindred » a deux rendus selon l'époque (« tribal » jusqu'aux rééditions
	// récentes, « de clan » ensuite) ; les deux se lisent, seul le premier est
	// cité ici car `equivalents` mappe UN libellé.
	kindred: 'tribal',
};

const LOCALIZED_GRAMMAR: Record<string, LocalizedTypeGrammar> = {
	fr: {
		// ` et ` plutôt que /\s+et\s+/ : deux quantificateurs gloutons encadrant un
		// littéral backtrackent sur une suite d'espaces (sonarjs/super-linear-regex),
		// et Scryfall n'écrit qu'une espace simple de chaque côté.
		subtypeJoiner: / et /,
		subtypeJoinerText: ' et ',
		supertypeSuffix: ['légendaire', 'de base', 'neigeux', 'neigeuse', 'mondial', 'mondiale'],
		fusedTypes: true,
		equivalents: FRENCH_EQUIVALENTS,
		markers: distinctiveMarkers(FRENCH_EQUIVALENTS),
	},
};

/**
 * Marqueurs qui prouvent qu'une ligne est écrite dans cette langue.
 *
 * Sous-ensemble STRICT des équivalents : on retire ceux qui s'écrivent comme
 * l'anglais. « Planeswalker » est identique dans les deux langues, donc sa
 * présence ne prouve rien — le laisser marqueur faisait lire « Legendary
 * Planeswalker — Venser » avec la grammaire française, qui n'y trouvait aucun
 * supertype postposé et rendait « Legendary Planeswalker » comme un seul type.
 * Mesuré sur 1040 lignes anglaises distinctes : 92 étaient relues de travers.
 */
function distinctiveMarkers(equivalents: Record<string, string>): Set<string> {
	return new Set(
		Object.entries(equivalents)
			.filter(([english, localized]) => english !== localized.toLowerCase())
			.map(([, localized]) => localized.toLowerCase())
	);
}

/**
 * Équivalents localisés d'un type anglais, toutes langues confondues.
 *
 * `hasCardType` reçoit un besoin ANGLAIS (« land », « token ») mais lit une
 * ligne qui peut être écrite dans n'importe quelle langue. Cette table lui
 * donne les formes à accepter, pour que les appelants n'aient plus à énumérer
 * les traductions à la main — ce que faisaient `isLandTypeLine` et
 * `isTokenTypeLine`, chacun avec sa propre liste incomplète.
 */
function localizedFormsOf(type: string): string[] {
	const needle = type.toLowerCase();
	const forms = new Set([needle]);
	for (const grammar of Object.values(LOCALIZED_GRAMMAR)) {
		const localized = grammar.equivalents[needle];
		if (localized) forms.add(localized.toLowerCase());
	}
	return [...forms];
}

/**
 * Reconnaît la langue d'une ligne à ses marqueurs, pour la relire avec sa
 * grammaire.
 *
 * La langue du brouillon n'est PAS disponible ici : `parseTypeLine` est appelé
 * depuis le canvas, le serveur et `hasCardType`, qui ne reçoivent que la
 * chaîne. On la déduit donc de la ligne elle-même.
 *
 * Volontairement CONSERVATEUR : il faut un type ou un supertype localisé
 * reconnu pour basculer. Un mot français isolé ne suffit pas — le studio sert à
 * inventer des cartes, et « Creature — Chat » doit rester lu comme de l'anglais
 * plutôt que de voir ses types déliés par des règles françaises.
 *
 * L'anglais n'a pas d'entrée dans la table et reste donc le chemin par défaut,
 * ce qui garantit qu'aucune ligne anglaise existante ne change de lecture.
 */
function detectGrammar(typeLine: string): LocalizedTypeGrammar | undefined {
	// On regarde le bloc GAUCHE seul : les sous-types sont libres (« Chat » est
	// un sous-type valide d'une carte anglaise inventée) et ne disent rien de la
	// langue de la grammaire.
	const sepIndex = typeLine.search(SEPARATOR);
	const left = (sepIndex === -1 ? typeLine : typeLine.slice(0, sepIndex)).toLowerCase();
	if (!left.trim()) return undefined;

	for (const grammar of Object.values(LOCALIZED_GRAMMAR)) {
		// Le mot doit apparaître comme MOT, pas en sous-chaîne : « enchantement »
		// contient « chant », et on ne veut pas qu'un sous-type déclenche la
		// bascule.
		const words = left.split(/[\s-]+/).filter(Boolean);
		const hit =
			words.some((word) => grammar.markers.has(word)) ||
			grammar.supertypeSuffix.some((suffix) => left.endsWith(` ${suffix}`));
		if (hit) return grammar;
	}
	return undefined;
}

/**
 * Découpe le bloc des sous-types selon la grammaire de la langue.
 *
 * Sans grammaire connue on retombe sur l'espace, qui est la règle anglaise et
 * le repli sûr : c'est le comportement qu'avaient toutes les langues avant que
 * le français soit mesuré.
 */
function splitSubtypes(raw: string, grammar: LocalizedTypeGrammar | undefined): string[] {
	const parts = grammar ? raw.split(grammar.subtypeJoiner) : raw.split(/\s+/);
	return parts.map((value) => value.trim()).filter(Boolean);
}

/**
 * Ventile le bloc gauche d'une ligne localisée en supertypes et types.
 *
 * Deux règles, dans cet ordre : on détache d'abord le supertype postposé
 * (« Créature légendaire » → supertype « légendaire »), puis on délie les types
 * soudés (« Créature-artefact » → deux types). L'inverse casserait sur
 * « Créature-artefact légendaire », où les deux règles s'appliquent.
 *
 * Le trait d'union ne délie QUE si la langue soude ses types (`fusedTypes`) :
 * « Assembly-Worker » est un seul sous-type anglais, pas deux types.
 */
function splitLocalizedLeft(raw: string, grammar: LocalizedTypeGrammar): TypeLineParts {
	let remainder = raw.trim();
	const supertypes: string[] = [];

	// Boucle plutôt qu'un seul passage : une carte peut cumuler deux supertypes
	// postposés (« Terrain neigeux légendaire »).
	let matched = true;
	while (matched) {
		matched = false;
		for (const suffix of grammar.supertypeSuffix) {
			const lowered = remainder.toLowerCase();
			if (lowered.endsWith(` ${suffix}`)) {
				supertypes.unshift(remainder.slice(remainder.length - suffix.length));
				remainder = remainder.slice(0, remainder.length - suffix.length - 1).trim();
				matched = true;
				break;
			}
		}
	}

	const types = grammar.fusedTypes
		? remainder
				.split('-')
				.map((value) => value.trim())
				.filter(Boolean)
		: remainder.split(/\s+/).filter(Boolean);

	return { supertypes, types, subtypes: [] };
}

/**
 * Lit une ligne de type écrite dans une langue dont on connaît la grammaire.
 *
 * Renvoie `null` quand la langue n'est pas mesurée, pour que l'appelant
 * retombe sur la lecture anglaise plutôt que sur une ventilation inventée.
 */
export function parseLocalizedTypeLine(typeLine: string, lang: string): TypeLineParts | null {
	const grammar = LOCALIZED_GRAMMAR[lang];
	if (!grammar) return null;

	const sepIndex = typeLine.search(SEPARATOR);
	const hasSep = sepIndex !== -1;
	const leftRaw = hasSep ? typeLine.slice(0, sepIndex) : typeLine;
	const rightRaw = hasSep ? typeLine.slice(sepIndex + 1) : '';

	const left = splitLocalizedLeft(leftRaw, grammar);
	return { ...left, subtypes: splitSubtypes(rightRaw, grammar) };
}

/**
 * Ventile une ligne LOCALISÉE en s'appuyant sur son équivalent ANGLAIS.
 *
 * C'est la lecture la plus sûre dont on dispose, et elle n'est possible qu'à
 * l'import : Scryfall livre `type_line` (anglais) et `printed_type_line`
 * (langue du print) côte à côte, et les deux sont PARALLÈLES — même nombre
 * d'entrées, même ordre. L'anglais se parse avec le vocabulaire officiel, donc
 * il sert de GRILLE DE LECTURE : il dit combien d'entrées porte chaque bloc et
 * lesquelles sont des supertypes, pendant que le français dit comment elles
 * s'écrivent.
 *
 * Supérieur à `parseLocalizedTypeLine` parce qu'aucune correspondance n'est
 * supposée : le corpus contient du bruit éditorial réel (« Kindred » rendu
 * tantôt « tribal » tantôt « de clan », « Legendary Planeswalker » parfois
 * laissé en anglais) qu'un lexique figé traduirait de travers, et que
 * l'appariement positionnel encaisse sans broncher.
 *
 * Les libellés RENDUS sont ceux de la langue du print — c'est le texte qui sera
 * imprimé sur la carte. Seule la RÉPARTITION vient de l'anglais. Un bloc dont
 * les comptes ne tombent pas juste garde la ventilation localisée : mieux vaut
 * un supertype manqué qu'un appariement décalé, qui étiquetterait les
 * sous-types les uns pour les autres.
 */
export function parseTypeLineWithReference(
	localized: string,
	english: string,
	lang: string,
	vocabulary: TypeVocabularySource
): TypeLineParts {
	const reference = parseTypeLine(english, vocabulary);
	const localizedParts = parseLocalizedTypeLine(localized, lang);
	if (!localizedParts) return reference;

	const localizedLeft = [...localizedParts.supertypes, ...localizedParts.types];
	const referenceLeft = reference.supertypes.length + reference.types.length;
	const leftAligned = localizedLeft.length === referenceLeft;

	return {
		// L'anglais tranche QUI est supertype — « légendaire » n'est pas dans le
		// vocabulaire Scryfall, mais sa position l'est. Sans ça, le cadre
		// légendaire resterait éteint sur toute carte importée en français.
		supertypes: leftAligned
			? localizedLeft.slice(0, reference.supertypes.length)
			: localizedParts.supertypes,
		types: leftAligned ? localizedLeft.slice(reference.supertypes.length) : localizedParts.types,
		subtypes: localizedParts.subtypes,
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
	const pool = SEPARATOR.test(typeLine)
		? [...parts.supertypes, ...parts.types]
		: [...parts.supertypes, ...parts.types, ...parts.subtypes];
	// Le besoin est exprimé en anglais (« land »), la ligne peut être écrite dans
	// n'importe quelle langue : on compare sur toutes les formes connues.
	const needles = new Set(localizedFormsOf(type));
	return pool.some((entry) => needles.has(entry.toLowerCase()));
}

/**
 * Terrain ? Les traductions sont résolues par `hasCardType` (cf.
 * `equivalents`), la saisie n'étant pas contrainte à une langue.
 */
export function isLandTypeLine(typeLine: string): boolean {
	return hasCardType(typeLine, 'land');
}

/**
 * Jeton ? Se lit sur le SUPERTYPE (« Token Creature — Soldier »), pas sur le
 * layout : on peut dessiner un jeton avec n'importe quel gabarit.
 */
export function isTokenTypeLine(typeLine: string): boolean {
	return hasCardType(typeLine, 'token');
}

/**
 * Légendaire ? Se lit sur le SUPERTYPE, comme MSE
 * (`match(card.super_type, "Legendary")`), et pilote la couronne du cadre.
 *
 * Passe par `hasCardType` plutôt que de tester `supertypes.includes('Legendary')`
 * : le supertype STOCKÉ est celui de la langue de la carte (« légendaire » sur
 * un import français), et une comparaison à la chaîne anglaise éteignait la
 * couronne sur toute carte importée dans une autre langue.
 */
export function isLegendaryTypeLine(typeLine: string): boolean {
	return hasCardType(typeLine, 'legendary');
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
