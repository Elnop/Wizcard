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

function toNumber(value: Value): number {
	if (typeof value === 'number') return value;
	// MSE stocke parfois un nombre sous forme de chaîne (« "52" »).
	if (typeof value === 'string' && /^-?[\d.]+$/.test(value.trim())) return Number(value);
	throw new Unresolved(`valeur non numérique ${JSON.stringify(value)}`);
}

// eslint-disable-next-line sonarjs/cognitive-complexity -- safe: un noeud d'AST par branche, dérouler le switch fragmenterait l'évaluateur sans réduire son comportement
export function evaluate(node: Node, scope: Scope, depth = 0): Value {
	// Garde-fou : une définition récursive ne doit pas boucler indéfiniment.
	if (depth > 32) throw new Unresolved('profondeur d’évaluation dépassée');

	switch (node.type) {
		case 'number':
			return node.value;
		case 'string':
			return node.value;
		case 'ident': {
			const variable = scope.variables.get(node.name);
			if (variable !== undefined) return variable;
			const definition = scope.functions.get(node.name);
			// Un nom défini sans parenthèses s'évalue comme son corps.
			if (definition !== undefined) return evaluate(parseExpression(definition), scope, depth + 1);
			throw new Unresolved(node.name);
		}
		case 'member': {
			const path = flattenMember(node);
			const variable = scope.variables.get(path);
			if (variable !== undefined) return variable;
			throw new Unresolved(path);
		}
		case 'index':
			throw new Unresolved('indexation');
		case 'unary': {
			if (node.op === '-') return -toNumber(evaluate(node.operand, scope, depth + 1));
			return !evaluate(node.operand, scope, depth + 1);
		}
		case 'binary': {
			const left = evaluate(node.left, scope, depth + 1);
			const right = evaluate(node.right, scope, depth + 1);
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
				evaluate(node.condition, scope, depth + 1) ? node.then : node.else,
				scope,
				depth + 1
			);
		case 'call': {
			if (node.callee.type !== 'ident') throw new Unresolved('appel non nommé');
			const name = node.callee.name;
			const args = node.args.map((arg) => evaluate(arg, scope, depth + 1));
			const named = Object.fromEntries(
				Object.entries(node.named).map(([key, value]) => [key, evaluate(value, scope, depth + 1)])
			);
			const builtin = BUILTINS.get(name);
			if (builtin) return builtin(args, named);
			const definition = scope.functions.get(name);
			if (definition !== undefined) return evaluate(parseExpression(definition), scope, depth + 1);
			throw new Unresolved(`${name}()`);
		}
	}
}

/** `card_style.casting_cost.content_width` -> la chaîne pointée complète. */
function flattenMember(node: Node): string {
	if (node.type === 'ident') return node.name;
	if (node.type === 'member') return `${flattenMember(node.object)}.${node.property}`;
	throw new Unresolved('accès non nommé');
}
