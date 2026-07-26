import { verticalOffset } from './font-metrics';

// `null` représente le littéral MSE « nil » (tâche 6d) — nécessaire pour que
// des défauts de `@(…)` comme `left:nil` soient une VALEUR utilisable (ex.
// dans un test `left != nil`) plutôt qu'un type que `Value` ne peut pas
// porter. Distinct de `undefined`, qui reste réservé à « cette clé est
// absente » (`scope.variables.get(...)`, `named[...]`, etc.).
export type Value = number | string | boolean | null;
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
BUILTINS.set('length', (args) => String(args[0] ?? '').length);
BUILTINS.set('contains', (args, named) => {
	const haystack = String(named.match ?? args[0] ?? '');
	const needle = String(named.in ?? args[1] ?? '');
	return needle.includes(haystack);
});
BUILTINS.set('to_int', (args) => Math.trunc(num(args[0])));
BUILTINS.set('to_number', (args) => num(args[0]));
BUILTINS.set('ifside', (args, named) => num(named.left ?? args[0]));

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
