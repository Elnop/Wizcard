export type Value = number | string | boolean;
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
