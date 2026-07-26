import { verticalOffset } from './font-metrics';

// `null` représente le littéral MSE « nil » (tâche 6d) — nécessaire pour que
// des défauts de `@(…)` comme `left:nil` soient une VALEUR utilisable (ex.
// dans un test `left != nil`) plutôt qu'un type que `Value` ne peut pas
// porter. Distinct de `undefined`, qui reste réservé à « cette clé est
// absente » (`scope.variables.get(...)`, `named[...]`, etc.).
//
// `MseRecord`/`MseArray` (tâche 6h) : deux formes de tableau du corpus, ni
// l'une ni l'autre un système d'objets général —
//  - `MseArray` de STRINGS : le résultat de `split_text`/ses alias
//    (`split_comma`, `split_line`, …), toujours consommé par position
//    (`split.0`, `split.1`, cf. `rarity_user_offset_left`) ou `length()` ;
//  - `MseArray` de `MseRecord` : la forme `faces_coordinates() := [[left:0,
//    top:0, width:.., height:..], …]` (magic.mse-game/script:2891-2899),
//    indexée puis désstructurée via `.left`/`.top`/… (cf.
//    `face_coordinates_map`, chaîne qui mène à
//    `card_style.rarity.content_width`).
// `typeof` les distingue de tous les autres cas (« object », jamais confondu
// avec number/string/boolean/null), donc les opérateurs existants (`+`, `==`,
// `toNumber`, …) continuent de lever une erreur s'ils y sont appliqués par
// erreur plutôt que de les coercer en silence — cf. « aucun fallback ».
export interface MseRecord {
	readonly kind: 'record';
	readonly fields: Readonly<Record<string, number>>;
}
export interface MseArray {
	readonly kind: 'array';
	readonly items: readonly Value[];
}
export type Value = number | string | boolean | null | MseRecord | MseArray;
export type Builtin = (args: Value[], named: Record<string, Value>) => Value;

/**
 * Bibliothèque standard MSE, remplie palier par palier (cf. plan, tâches 5-8).
 * Vide au palier 0 : on mesure d'abord ce que l'arithmétique seule résout, pour
 * que chaque fonction ajoutée ensuite se juge au nombre de cadres débloqués.
 */
export const BUILTINS = new Map<string, Builtin>();

function num(value: Value): number {
	if (typeof value === 'number') return value;
	if (typeof value === 'string' && /^-?[\d.]+$/.test(value.trim())) return Number(value);
	throw new TypeError(`attendu un nombre, reçu ${JSON.stringify(value)}`);
}

/**
 * Palier 1 : fonctions purement mécaniques, sans dépendance au contenu de la
 * carte ni aux métriques de police.
 *
 * `ifside` choisit selon la face rendue : le studio n'extrait que le RECTO,
 * donc la branche `left` — figée ici, et non devinée au cas par cas.
 */
BUILTINS.set('max', (args) => Math.max(...args.map(num)));
BUILTINS.set('min', (args) => Math.min(...args.map(num)));
BUILTINS.set('length', (args) => {
	const value = args[0];
	// `length(fc)` où `fc` est un MseArray (tâche 6h, cf. face_coordinates_string
	// dans magic.mse-game/script) : le nombre d'éléments, pas la longueur d'une
	// chaîne obtenue en stringifiant l'objet — sans ce cas, `String({...})`
	// vaudrait toujours `"[object Object]"`.length, une réponse fausse et
	// silencieuse plutôt qu'une erreur.
	if (typeof value === 'object' && value !== null && value.kind === 'array') {
		return value.items.length;
	}
	return String(value ?? '').length;
});
// Tâche 6f : signature CORRIGÉE. L'ancienne version inversait haystack/needle
// (elle lisait `named.match` comme le TEXTE examiné et `named.in`/`args[1]`
// comme le motif) — vérifié faux contre les 125 appels réels du script
// partagé, tous de la forme `contains(input, match:"motif")` (ex.
// script:339 : `contains(sh, match:"adventure")`, `sh` est le premier
// POSITIONNEL, `match:` le texte cherché DANS `sh`). Aucun appel mesuré
// n'utilise `named.in` ; ce nom n'existe pas dans le corpus, seulement dans
// l'implémentation précédente. `match:` s'avère être une sous-chaîne LITTÉRALE
// (pas une regex) : les 125 valeurs observées (`"+"`, `","`, `"-"`, `"[/|]"`
// n'apparaît JAMAIS ici contrairement à `replace`/`match`/`filter_text`) ne
// contiennent aucune syntaxe regex authentique (pas de `|`, `[...]`, `^`/`$`),
// et certaines (`"+"` seul) seraient même des regex INVALIDES si interprétées
// comme telles (`+` sans rien à répéter) — la seule lecture cohérente avec
// TOUS les appels mesurés est `String.includes`.
BUILTINS.set('contains', (args, named) => {
	const haystack = String(args[0] ?? '');
	const needle = String(named.match ?? '');
	return haystack.includes(needle);
});
BUILTINS.set('to_int', (args) => Math.trunc(num(args[0])));
BUILTINS.set('to_number', (args) => num(args[0]));
BUILTINS.set('ifside', (args, named) => num(named.left ?? args[0]));

/**
 * `split_text(input, match:motif)` (tâche 6h) — coupe `input` sur chaque
 * occurrence de `motif` (une regex, pas une sous-chaîne littérale, contrairement
 * à `contains` : cf. usages mesurés `" *, *"`, `"\n+"`, `" ?// ?"`, `",|:"`,
 * aucun n'est cohérent comme sous-chaîne). Renvoie un `MseArray` de chaînes,
 * consommé par position (`split.0`, `split.1`, cf. `rarity_user_offset_left`
 * dans magic.mse-game/script) ou par `length()`. `include_empty:false`
 * (seulement vu sur des alias curried non mesurés dans la chaîne bloquante ici,
 * `px_split`/`line_count`) filtre les segments vides — sans le nommé, MSE les
 * garde, cohérent avec `String.split` de JS par défaut.
 */
BUILTINS.set('split_text', (args, named) => {
	const input = String(args[0] ?? named.input ?? '');
	const pattern = String(named.match ?? '');
	if (pattern.startsWith('(?')) {
		// Drapeaux inline façon PCRE : aucun motif mesuré n'en a besoin ici (cf.
		// `toGlobalRegex` dans evaluate.ts, même règle) — signalé plutôt que
		// mal interprété en silence.
		throw new TypeError('split_text(match:) : drapeaux PCRE non pris en charge');
	}
	let regex: RegExp;
	try {
		regex = new RegExp(pattern, 'g');
	} catch {
		throw new TypeError('split_text(match:) : motif invalide');
	}
	let parts = input.split(regex);
	if (named.include_empty === false) parts = parts.filter((part) => part !== '');
	return { kind: 'array', items: parts };
});

/**
 * Palier 2 : métriques de police. MSE dérive ces décalages de la police
 * effectivement rendue ; on lit donc les TTF livrés plutôt que d'approximer.
 * Les tailles proviennent du corpus (mplantin pour le corps, beleren pour le
 * titre et la force/endurance) — `size: 1` sert de base unitaire, le décalage
 * réel est ensuite mis à l'échelle par l'appelant selon sa propre taille de
 * police (cf. usages dans magic.mse-game/script : `X_font_vertical() * size`).
 */
const BELEREN_BOLD = 'beleren-bold_P1.01.ttf';
BUILTINS.set('pt_font_vertical', () => verticalOffset(BELEREN_BOLD, 1));
BUILTINS.set('pt2_font_vertical', () => verticalOffset(BELEREN_BOLD, 1));
BUILTINS.set('name_font_vertical', () => verticalOffset(BELEREN_BOLD, 1));
BUILTINS.set('type_font_vertical', () => verticalOffset(BELEREN_BOLD, 1));
BUILTINS.set('body_font_vertical', () => verticalOffset('mplantin.ttf', 1));
