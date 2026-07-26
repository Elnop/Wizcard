export type Value = number | string | boolean;
export type Builtin = (args: Value[], named: Record<string, Value>) => Value;

/**
 * Bibliothèque standard MSE, remplie palier par palier (cf. plan, tâches 5-8).
 * Vide au palier 0 : on mesure d'abord ce que l'arithmétique seule résout, pour
 * que chaque fonction ajoutée ensuite se juge au nombre de cadres débloqués.
 */
export const BUILTINS = new Map<string, Builtin>();
