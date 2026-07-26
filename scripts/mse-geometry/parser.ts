import { tokenise, type Token } from './lexer';

export type Node =
	| { type: 'number'; value: number }
	| { type: 'string'; value: string }
	| { type: 'ident'; name: string }
	| { type: 'member'; object: Node; property: string }
	| { type: 'index'; object: Node; index: Node }
	| { type: 'call'; callee: Node; args: Node[]; named: Record<string, Node> }
	| { type: 'if'; condition: Node; then: Node; else: Node }
	| { type: 'unary'; op: string; operand: Node }
	| { type: 'binary'; op: string; left: Node; right: Node };

export class ParseError extends Error {}

/** Précédences, du plus faible au plus fort. */
const BINDING: Record<string, number> = {
	or: 1,
	and: 2,
	'==': 3,
	'!=': 3,
	'<': 3,
	'>': 3,
	'<=': 3,
	'>=': 3,
	'+': 4,
	'-': 4,
	'*': 5,
	'/': 5,
};

/**
 * Parseur de Pratt : l'analyse des expressions MSE est classique une fois la
 * grammaire relevée sur le corpus (appel, accès, if/then/else, arithmétique,
 * comparaison, booléens, arguments nommés, indexation). Tout ce qui sort de
 * cette liste lève ParseError plutôt que d'être deviné — c'est la règle
 * « aucun fallback » appliquée dès l'analyse syntaxique.
 */
export function parseExpression(source: string): Node {
	const tokens = tokenise(source);
	let pos = 0;

	const peek = (): Token | undefined => tokens[pos];
	const next = (): Token => {
		const token = tokens[pos];
		if (!token) throw new ParseError('fin d’expression inattendue');
		pos += 1;
		return token;
	};
	const eat = (value: string): boolean => {
		if (peek()?.value === value) {
			pos += 1;
			return true;
		}
		return false;
	};
	const expect = (value: string): void => {
		if (!eat(value)) throw new ParseError(`« ${value} » attendu à ${peek()?.pos ?? 'fin'}`);
	};

	function parsePrimary(): Node {
		const token = next();
		if (token.kind === 'number') return { type: 'number', value: Number(token.value) };
		if (token.kind === 'string') return { type: 'string', value: token.value };
		if (token.value === '(') {
			const inner = parseBinary(0);
			// eslint-disable-next-line sonarjs/no-incomplete-assertions -- safe: `expect` est le consommateur de jeton local, pas une assertion de test
			expect(')');
			return inner;
		}
		if (token.value === '-') return { type: 'unary', op: '-', operand: parsePrimary() };
		if (token.value === 'not') return { type: 'unary', op: 'not', operand: parseBinary(3) };
		if (token.value === 'if') {
			const condition = parseBinary(0);
			// eslint-disable-next-line sonarjs/no-incomplete-assertions -- safe: `expect` est le consommateur de jeton local, pas une assertion de test
			expect('then');
			const consequent = parseBinary(0);
			// Le `else` est obligatoire dans le corpus : une branche manquante
			// serait une valeur non résolue, donc une erreur, pas un défaut.
			// eslint-disable-next-line sonarjs/no-incomplete-assertions -- safe: `expect` est le consommateur de jeton local, pas une assertion de test
			expect('else');
			return { type: 'if', condition, then: consequent, else: parseBinary(0) };
		}
		if (token.kind === 'ident') return { type: 'ident', name: token.value };
		throw new ParseError(`jeton inattendu « ${token.value} » à ${token.pos}`);
	}

	function parsePostfix(): Node {
		let node = parsePrimary();
		for (;;) {
			if (eat('.')) {
				const property = next();
				node = { type: 'member', object: node, property: property.value };
			} else if (eat('[')) {
				const index = parseBinary(0);
				// eslint-disable-next-line sonarjs/no-incomplete-assertions -- safe: `expect` est le consommateur de jeton local, pas une assertion de test
				expect(']');
				node = { type: 'index', object: node, index };
			} else if (peek()?.value === '(') {
				pos += 1;
				const args: Node[] = [];
				const named: Record<string, Node> = {};
				while (peek() && peek()!.value !== ')') {
					const label = peek();
					// Argument nommé : « f(face: 1) ».
					if (label?.kind === 'ident' && tokens[pos + 1]?.value === ':') {
						pos += 2;
						named[label.value] = parseBinary(0);
					} else {
						args.push(parseBinary(0));
					}
					if (!eat(',')) break;
				}
				// eslint-disable-next-line sonarjs/no-incomplete-assertions -- safe: `expect` est le consommateur de jeton local, pas une assertion de test
				expect(')');
				node = { type: 'call', callee: node, args, named };
			} else {
				return node;
			}
		}
	}

	function parseBinary(minBinding: number): Node {
		let left = parsePostfix();
		for (;;) {
			const token = peek();
			if (!token) return left;
			const binding = BINDING[token.value];
			if (binding === undefined || binding < minBinding) return left;
			pos += 1;
			left = { type: 'binary', op: token.value, left, right: parseBinary(binding + 1) };
		}
	}

	const result = parseBinary(0);
	if (pos !== tokens.length) throw new ParseError(`entrée résiduelle à ${peek()?.pos}`);
	return result;
}

/**
 * Déballe une valeur de champ MSE avant analyse.
 *
 * Trois formes existent dans le corpus : le nombre nu (22184 cas), l'expression
 * entre accolades (6080), et le bloc `script:` multi-ligne (86). Les accolades
 * ne font pas partie de l'expression elle-même.
 */
export function unwrapFieldValue(raw: string): string | null {
	const value = raw.trim();
	if (value.startsWith('script:')) return null;
	if (value.startsWith('{')) return value.replace(/^\{/, '').replace(/\}$/, '');
	if (value.startsWith('=')) return value.slice(1);
	return value;
}
