import { Unresolved, evaluate } from './evaluate';
import { manaCostWidth } from './font-metrics';
import { parseExpression, parseParamList, type ParamList } from './parser';
import type { FieldFontInfo } from './style-file';

/**
 * Une définition du corpus : son corps (source, analysée à la demande, comme
 * avant), et ses paramètres DÉCLARÉS le cas échéant (tâche 6d) — le suffixe
 * « }@(nom: défaut, …) » vu juste après l'accolade fermante. `params` est une
 * Map vide pour l'écrasante majorité des définitions (aucun suffixe) : le
 * comportement pré-6d (aucun argument lié) en est le cas particulier.
 */
export interface FunctionDef {
	body: string;
	params: ParamList;
}

/**
 * Portée de noms pour l'évaluation.
 *
 * 375 des 376 styles définissent leur propre `init script:`, qui MASQUE les
 * définitions partagées de magic.mse-game. La résolution va donc du plus
 * spécifique au plus général : style, puis script de la partie. Sans cet ordre,
 * un style qui redéfinit `art_left` recevrait la géométrie d'un autre.
 */
export interface Scope {
	/** nom -> définition (corps + paramètres déclarés). */
	functions: Map<string, FunctionDef>;
	variables: Map<string, number | string | boolean>;
}

/**
 * Relève les définitions `nom := { corps }` d'une source de script, avec leur
 * suffixe optionnel `@(…)` de paramètres (tâche 6d).
 *
 * Vérifié sur les 376 styles + magic.mse-game/script : l'accolade fermante
 * est TOUJOURS immédiatement suivie de `@(` sans espace quand ce suffixe
 * existe (aucun contre-exemple) — on peut donc simplement regarder les deux
 * caractères qui suivent le point où le comptage d'accolades s'arrête, sans
 * élargir la regex d'en-tête (qui reste focalisée sur `nom := {`).
 */
function collectDefinitions(source: string, into: Map<string, FunctionDef>): void {
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
		const body = source.slice(match.index + match[0].length, index - 1);
		let params: ParamList = new Map();
		if (source[index] === '@' && source[index + 1] === '(') {
			// Équilibrage des parenthèses pour capturer la liste de paramètres,
			// même précaution que pour le corps ci-dessus (les défauts peuvent
			// contenir des « [...] »/« {...} » internes, cf. `color_list`).
			let parenDepth = 1;
			let paramsEnd = index + 2;
			while (paramsEnd < source.length && parenDepth > 0) {
				if (source[paramsEnd] === '(') parenDepth += 1;
				else if (source[paramsEnd] === ')') parenDepth -= 1;
				paramsEnd += 1;
			}
			params = parseParamList(source.slice(index + 2, paramsEnd - 1));
		}
		into.set(match[1], { body, params });
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
	// Indicateur de couleur (bande de couleur au-dessus du type, ex. cartes
	// "Dryad Arbor") : chaîne vide = absent. La carte canonique est une créature
	// ORDINAIRE sans indicateur (cf. spec) — magic.mse-game/script:449-450 teste
	// explicitement `culled_indicator == ""` comme condition « pas d'indicateur,
	// ne pas l'afficher », donc ce choix est celui qui désactive proprement la
	// branche indicateur plutôt que d'en simuler une couleur arbitraire.
	'card.indicator': '',
	// Forme de la carte. La carte canonique est une carte à UNE seule face
	// ordinaire (ni recto-verso, ni split, ni flip, ni aventure, ni aftermath)
	// — `"normal"` est la valeur que le script partagé lui-même assigne par
	// défaut (`card_shape := { "normal" }`, magic.mse-game/script:395), donc ce
	// n'est pas un choix arbitraire mais celui du corpus. `has_two_names()`
	// (:337) teste ce champ pour décider s'il faut lire `card.name_2` : avec
	// "normal", il vaut `false`, donc les champs "face 2" (name_2, rule_text_2,
	// …) restent légitimement absents pour cette carte à une seule face.
	'card.shape': 'normal',
	// Nom de la carte. Chaîne non vide générique — une carte doit avoir un nom
	// pour être une carte ; la valeur exacte n'a pas d'incidence sur une
	// géométrie (jamais utilisée pour dimensionner une boîte, seulement pour
	// des tests de vide/égalité ou de la concaténation de texte).
	'card.name': 'Nom de Carte',
	// Texte de règles. Non vide et SANS mot-clé spécial (pas de niveau, pas de
	// texte de saga, pas de cible) — cf. "carte ordinaire, texte de règles
	// ordinaire" dans la spec. Une phrase simple suffit : ce champ n'est jamais
	// mesuré pour une largeur/hauteur ici (`content_width` du bloc rule text
	// n'est pas dans GEOMETRY_FIELDS), seulement testé pour vide/contenu par
	// des fonctions de mise en page (is_targeted, hasrules, saga check, etc.).
	'card.rule_text': 'Texte de règles ordinaire.',
	// Force/endurance. La carte canonique est une créature normale (cf. spec :
	// "power et toughness présents") : deux petits entiers positifs distincts
	// pour ne ressembler à aucun cas particulier (pas de "*", pas de "1/1"
	// trivial qui masquerait un bug d'arrondi). `card.pt` est le texte COMBINÉ
	// "force/endurance" tel qu'affiché (`pt: {fill_len(power)+fill_len(
	// toughness)}`, script:5787) : on fixe les trois de façon cohérente entre
	// elles plutôt que de dupliquer une valeur devinée pour `card.pt` seul.
	'card.power': '2',
	'card.toughness': '3',
	'card.pt': '2/3',
	// Type de carte (supertype + type, avant le tiret). La carte canonique est
	// une créature ORDINAIRE sans supertype (ni Legendary, ni Basic, ni Snow,
	// …) — chaîne vide, cohérente avec `card.super_type`/`card.sub_type`
	// ci-dessous qui portent respectivement le type principal et les
	// sous-types.
	'card.supertype': '',
	'card.super_type': 'Creature',
	'card.sub_type': 'Human Wizard',
	// Ligne de type complète telle qu'affichée (utilisée par `is_creature`,
	// `main_type`, etc. via `card.type`, distinct de `card.super_type` qui
	// n'est que le premier mot). Cohérente avec super_type/sub_type ci-dessus.
	'card.type': 'Creature — Human Wizard',
	// Coût de mana de la face 1. Non vide (une carte ordinaire a un coût) —
	// s'aligne sur CANONICAL_MANA_COST (tâche 6, "{1}{W}") pour rester
	// cohérent avec le coût déjà mesuré ailleurs dans le même style.
	'card.casting_cost': '{1}{W}',
	// Loyauté. La carte canonique est une créature, PAS un planeswalker :
	// chaîne vide, seule valeur qui désactive proprement les branches
	// planeswalker (`card.loyalty != ""` est le test de présence usuel, cf.
	// même convention que `card.pt`/`card.indicator`).
	'card.loyalty': '',
	// Timbre (stamp) d'authenticité en bas de carte. "none" est la valeur
	// littérale que le script partagé lui-même assigne à sa branche "All
	// unstamped" (`stamp_behavior_checks`, script:4508) — une carte ordinaire
	// sans timbre spécial.
	'card.card_stamp': 'none',
	// Texte de niveau (mécanique "Level Up", cartes de type "leveler"), champ
	// `card.level_N` — accédé soit directement (`card.level_1` en dur dans
	// certains styles "leveler"), soit dynamiquement
	// (`card["level_" + n + "_text"]`). La carte canonique n'a pas cette
	// mécanique : chaîne vide pour chaque index effectivement rencontré dans
	// le rapport de blocage (0, 1, 2) — on ne pré-remplit pas une plage
	// arbitraire, un style qui en indexerait un autre lèvera `Unresolved`.
	'card.level_0': '',
	'card.level_1': '',
	'card.level_2': '',
	// Texte d'ambiance (flavor text). Non vide, comme `card.rule_text` — une
	// carte ordinaire "normale" en a généralement un ; le contenu exact
	// n'affecte aucune géométrie (mêmes tests de vide/contenu que rule_text).
	'card.flavor_text': "Texte d'ambiance ordinaire.",
	// Nom de la face 2 (dos de carte recto-verso). Certaines chaînes lisent ce
	// champ INCONDITIONNELLEMENT (ex. `dfc_splitter_name`, script:361-363,
	// avant même de tester `has_two_names()`) : chaîne vide, cohérente avec
	// `card.shape: "normal"` — la carte canonique n'a qu'une seule face.
	'card.name_2': '',
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
	const functions = new Map<string, FunctionDef>();
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
