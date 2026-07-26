import { BUILTINS, type Value } from './builtins';
import { parseExpression, type Node } from './parser';
import type { Scope } from './scope';

/**
 * Levée dès qu'une valeur ne peut pas être calculée AVEC CERTITUDE.
 *
 * C'est le cœur de la règle « aucun fallback » : on ne devine jamais, on
 * remonte le nom exact qui manque pour que le rapport d'extraction puisse le
 * classer par nombre de cadres bloqués.
 */
export class Unresolved extends Error {
	constructor(public readonly what: string) {
		super(`non résolu : ${what}`);
	}
}

/**
 * Cadre de variables LOCALES d'un corps de fonction (tâche 6c).
 *
 * Une affectation « nom := expr » lie un nom visible par les statements
 * SUIVANTS du même corps (et des blocs qu'il contient), mais jamais par
 * l'appelant ni par une définition sœur — cf. spec. On matérialise donc ce
 * cadre par un `Map` créé une fois PAR INVOCATION (un nouvel appel à
 * `evaluate` sans troisième argument démarre un cadre vierge), puis transmis
 * tel quel aux noeuds enfants d'un même corps (block/for/guard) pour que les
 * affectations s'y accumulent. Un appel vers une AUTRE définition (ident ou
 * call résolus via `scope.functions`) reçoit un cadre neuf, jamais celui de
 * l'appelant : c'est ce qui empêche la fuite entre portées.
 */
type Locals = Map<string, Value>;

function toNumber(value: Value): number {
	if (typeof value === 'number') return value;
	// MSE stocke parfois un nombre sous forme de chaîne (« "52" »).
	if (typeof value === 'string' && /^-?[\d.]+$/.test(value.trim())) return Number(value);
	throw new Unresolved(`valeur non numérique ${JSON.stringify(value)}`);
}

/**
 * Évalue un noeud d'AST.
 *
 * `locals` est le cadre de variables du corps EN COURS (tâche 6c) : omis, un
 * cadre neuf est créé — c'est le cas pour tout appel de premier niveau
 * (`extract.ts`, `scope.ts`) ainsi que pour l'entrée dans une AUTRE
 * définition (cf. cas `ident` et `call`), qui ne doit jamais voir les locales
 * de son appelant. À l'inverse, les noeuds qui restent DANS le même corps
 * (`block`, `for`, `guard`, les deux branches d'un `if`, les opérandes d'un
 * `binary`) reçoivent explicitement le `locals` reçu, pour que les
 * affectations plus tôt dans le corps restent visibles plus loin.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- safe: un noeud d'AST par branche, dérouler le switch fragmenterait l'évaluateur sans réduire son comportement
export function evaluate(node: Node, scope: Scope, depth = 0, locals: Locals = new Map()): Value {
	// Garde-fou : une définition récursive ne doit pas boucler indéfiniment.
	// Les corps multi-statements (tâche 6c) allongent les chaînes d'appel
	// réelles, mais chaque entrée dans une AUTRE définition (ident/call plus
	// bas) incrémente toujours `depth` : la garde reste donc valable.
	if (depth > 32) throw new Unresolved('profondeur d’évaluation dépassée');

	// eslint-disable-next-line sonarjs/max-switch-cases -- safe: un cas par type de noeud d'AST (tâche 6c en ajoute 5 : array/assign/guard/for/block), la liste est fixée par la grammaire du parseur
	switch (node.type) {
		case 'number':
			return node.value;
		case 'string':
			return node.value;
		case 'ident': {
			// Une locale du corps courant masque toute variable/définition de
			// même nom — cf. commentaire de tête sur `Locals`.
			const local = locals.get(node.name);
			if (local !== undefined) return local;
			const variable = scope.variables.get(node.name);
			if (variable !== undefined) return variable;
			const definition = scope.functions.get(node.name);
			// Un nom défini sans parenthèses s'évalue comme son corps, dans un
			// cadre de locales NEUF (pas celui de l'appelant, cf. Locals).
			if (definition !== undefined) return evaluate(parseExpression(definition), scope, depth + 1);
			throw new Unresolved(node.name);
		}
		case 'member': {
			const path = flattenMember(node);
			const variable = scope.variables.get(path);
			if (variable !== undefined) return variable;
			throw new Unresolved(path);
		}
		case 'index': {
			const collection = evaluate(node.object, scope, depth + 1, locals);
			if (typeof collection === 'string') {
				// Indexation d'une chaîne par position — utilisée par les fonctions
				// de manipulation de texte du corpus (ex. ar_position, join).
				const index = toNumber(evaluate(node.index, scope, depth + 1, locals));
				const char = collection[index];
				if (char === undefined) throw new Unresolved('indexation hors limites');
				return char;
			}
			throw new Unresolved('indexation');
		}
		case 'array':
			// Aucune valeur MSE ne représente un tableau (Value est
			// number|string|boolean) : on ne feint pas d'en construire un, on
			// refuse — cf. « aucun fallback ». Un tableau n'est utile que
			// consommé par length()/for/index, jamais renvoyé tel quel comme
			// géométrie.
			throw new Unresolved('tableau');
		case 'unary': {
			if (node.op === '-') return -toNumber(evaluate(node.operand, scope, depth + 1, locals));
			return !evaluate(node.operand, scope, depth + 1, locals);
		}
		case 'binary': {
			const left = evaluate(node.left, scope, depth + 1, locals);
			const right = evaluate(node.right, scope, depth + 1, locals);
			// eslint-disable-next-line sonarjs/max-switch-cases -- safe: un cas par opérateur binaire MSE, la liste est fixée par la grammaire du parseur
			switch (node.op) {
				case '+':
					return toNumber(left) + toNumber(right);
				case '-':
					return toNumber(left) - toNumber(right);
				case '*':
					return toNumber(left) * toNumber(right);
				case '/':
					return toNumber(left) / toNumber(right);
				case '==':
					return left === right;
				case '!=':
					return left !== right;
				case '<':
					return toNumber(left) < toNumber(right);
				case '>':
					return toNumber(left) > toNumber(right);
				case '<=':
					return toNumber(left) <= toNumber(right);
				case '>=':
					return toNumber(left) >= toNumber(right);
				case 'and':
					return Boolean(left) && Boolean(right);
				case 'or':
					return Boolean(left) || Boolean(right);
				default:
					throw new Unresolved(`opérateur ${node.op}`);
			}
		}
		case 'if':
			return evaluate(
				evaluate(node.condition, scope, depth + 1, locals) ? node.then : node.else,
				scope,
				depth + 1,
				locals
			);
		case 'assign': {
			const value = evaluate(node.value, scope, depth + 1, locals);
			locals.set(node.name, value);
			return value;
		}
		case 'guard': {
			// Un `if` sans else n'est qu'un déclencheur d'affectation : s'il ne
			// se déclenche pas, il n'y a simplement rien à lier — le nom garde
			// sa liaison précédente (ou reste absent, comme avant).
			if (evaluate(node.condition, scope, depth + 1, locals)) {
				return evaluate(node.assignment, scope, depth + 1, locals);
			}
			return false;
		}
		case 'for':
			return evaluateFor(node, scope, depth, locals);
		case 'block': {
			// La valeur du bloc est celle du DERNIER item (cf. Node['block']) :
			// une affectation porte déjà sa valeur, donc un bloc qui se termine
			// dessus (boucle à effet de bord pur, ex. calc_lines) reste utilisable
			// là où l'appelant attend malgré tout une valeur.
			let value: Value = false;
			for (const statement of node.statements)
				value = evaluate(statement, scope, depth + 1, locals);
			return value;
		}
		case 'call': {
			if (node.callee.type !== 'ident') throw new Unresolved('appel non nommé');
			const name = node.callee.name;
			const args = node.args.map((arg) => evaluate(arg, scope, depth + 1, locals));
			const named = Object.fromEntries(
				Object.entries(node.named).map(([key, value]) => [
					key,
					evaluate(value, scope, depth + 1, locals),
				])
			);
			const builtin = BUILTINS.get(name);
			if (builtin) return builtin(args, named);
			const definition = scope.functions.get(name);
			// Cadre de locales NEUF : les arguments ne sont pas encore liés dans
			// le corps appelé (limite connue, hors périmètre 6c — cf. rapport),
			// mais on ne doit surtout pas lui exposer les locales de l'appelant.
			if (definition !== undefined) return evaluate(parseExpression(definition), scope, depth + 1);
			throw new Unresolved(`${name}()`);
		}
	}
}

/**
 * Évalue un « for nom from a to b do corps ».
 *
 * Deux formes coexistent dans le corpus (cf. rapport) :
 *  - corps EXPRESSION pure (ex. reverse_elements, join) : chaque itération
 *    produit une valeur, concaténée en chaîne — c'est la forme qu'on sait
 *    évaluer honnêtement, la boucle n'ayant pas d'autre effet observable ;
 *  - corps AFFECTATION (ex. fill_len, join_list, ar_position) : la boucle ne
 *    sert qu'à muter une variable extérieure N fois. L'exécuter correctement
 *    demanderait de rejouer l'affectation dans le cadre du bloc APPELANT à
 *    chaque itération, ce qui est un pas au-delà du minimum demandé (« doit
 *    au moins s'analyser ») ; plutôt que d'approximer une seule itération ou
 *    une valeur arbitraire, on refuse explicitement — cf. « aucun fallback ».
 */
function evaluateFor(
	node: Node & { type: 'for' },
	scope: Scope,
	depth: number,
	locals: Locals
): Value {
	if (node.body.type === 'assign' || node.body.type === 'guard') throw new Unresolved('for');
	const from = toNumber(evaluate(node.from, scope, depth + 1, locals));
	const to = toNumber(evaluate(node.to, scope, depth + 1, locals));
	let result = '';
	for (let i = from; i <= to; i += 1) {
		locals.set(node.variable, i);
		result += String(evaluate(node.body, scope, depth + 1, locals));
	}
	locals.delete(node.variable);
	return result;
}

/** `card_style.casting_cost.content_width` -> la chaîne pointée complète. */
function flattenMember(node: Node): string {
	if (node.type === 'ident') return node.name;
	if (node.type === 'member') return `${flattenMember(node.object)}.${node.property}`;
	throw new Unresolved('accès non nommé');
}
