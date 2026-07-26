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
	| { type: 'binary'; op: string; left: Node; right: Node }
	| { type: 'array'; items: Node[] }
	// Affectation locale « nom := expr », statement d'une séquence (tâche 6c).
	// Sa VALEUR est celle affectée : un bloc qui se termine sur une affectation
	// (boucle à effet de bord, cf. calc_lines) reste donc évaluable.
	| { type: 'assign'; name: string; value: Node }
	// « if cond then nom := expr » SANS else : un statement, pas une expression
	// — cf. join_list dans magic.mse-game/script. N'affecte que si cond est vrai.
	| { type: 'guard'; condition: Node; assignment: Node }
	// « for nom from a to b do corps ». Le corps peut être une expression pure
	// (concaténation, cf. reverse_elements) ou un statement (boucle à effet de
	// bord, cf. fill_len/calc_lines) — evaluate.ts choisit ce qu'il sait faire
	// sans deviner et lève Unresolved('for') sinon.
	| {
			type: 'for';
			variable: string;
			from: Node;
			to: Node;
			body: Node;
	  }
	// Séquence de statements (tâche 6c) : un corps de fonction MSE multi-ligne,
	// ou un bloc parenthésé qui en contient un (ex. la branche `else ( ... )`
	// de has_identity_general). La VALEUR du bloc est celle du DERNIER item —
	// que ce soit une expression ordinaire ou une affectation (cf. `assign`
	// ci-dessus) : cette dernière porte déjà sa propre valeur, donc un bloc qui
	// se termine sur « x := expr » reste utilisable là où MSE ne s'en sert que
	// pour son effet de bord ET là où il en attend malgré tout une valeur.
	| { type: 'block'; statements: Node[] };

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

	/** « for nom from a to b do corps » — factorisé, utilisé en statement ET en expression. */
	function parseFor(): Node {
		next(); // « for »
		const variable = next().value;
		// eslint-disable-next-line sonarjs/no-incomplete-assertions -- safe: `expect` est le consommateur de jeton local, pas une assertion de test
		expect('from');
		const from = parseBinary(0);
		// eslint-disable-next-line sonarjs/no-incomplete-assertions -- safe: `expect` est le consommateur de jeton local, pas une assertion de test
		expect('to');
		const to = parseBinary(0);
		// eslint-disable-next-line sonarjs/no-incomplete-assertions -- safe: `expect` est le consommateur de jeton local, pas une assertion de test
		expect('do');
		// Le corps est un statement, un bloc parenthésé de statements (boucle à
		// effet de bord, ex. fill_len/ar_position), ou une expression ordinaire
		// (boucle de concaténation pure, ex. reverse_elements) — cf. Node['for']
		// et evaluate.ts, qui traite les deux formes différemment plutôt que de
		// deviner.
		const body = parseStatementBranch();
		return { type: 'for', variable, from, to, body };
	}

	/**
	 * Un statement isolé (tâche 6c) : affectation locale « nom := expr », `if`
	 * utilisé comme statement (cf. `parseIfStatement`), ou boucle `for` — un
	 * `for` au milieu d'une séquence (ex. calc_lines, où il précède encore
	 * `lines` en résultat) DOIT être reconnu ici, sinon `parseBlockBody`
	 * s'arrête prématurément et perd tout ce qui suit. Renvoie `null` si les
	 * jetons courants ne correspondent à aucune de ces formes (l'appelant
	 * retombe alors sur une expression ordinaire).
	 */
	function tryParseStatement(): Node | null {
		// « nom := expr ». Le nom seul suivi de « := » est sans ambiguïté avec
		// une expression (une expression ne commence jamais par « nom := »).
		if (peek()?.kind === 'ident' && tokens[pos + 1]?.value === ':=') {
			const name = next().value;
			pos += 1; // « := »
			return { type: 'assign', name, value: parseBinary(0) };
		}
		if (peek()?.value === 'if') return parseIfStatement();
		if (peek()?.value === 'for') return parseFor();
		return null;
	}

	/**
	 * Branche d'un `if`-statement : soit un unique statement, soit un bloc
	 * parenthésé qui peut lui-même en contenir plusieurs — cf. calc_lines
	 * (« if sum > char then ( lines := lines + 1; sum := ... ) else … »).
	 */
	function parseStatementBranch(): Node {
		if (peek()?.value === '(') {
			pos += 1;
			const inner = parseBlockBody();
			// eslint-disable-next-line sonarjs/no-incomplete-assertions -- safe: `expect` est le consommateur de jeton local, pas une assertion de test
			expect(')');
			return inner;
		}
		const statement = tryParseStatement();
		if (statement) return statement;
		return parseBinary(0);
	}

	/**
	 * `if` utilisé comme STATEMENT plutôt que comme expression (tâche 6c) :
	 * deux formes coexistent dans le corpus, distinguées seulement après avoir
	 * lu la condition et « then » —
	 *  - SANS else (« if cond then nom := expr », cf. join_list) : la garde ne
	 *    produit une valeur que si la condition est vraie ;
	 *  - AVEC else où au moins une branche est un STATEMENT plutôt qu'une
	 *    expression pure (cf. calc_lines : chaque branche est une affectation
	 *    ou un bloc parenthésé de plusieurs affectations).
	 * Si ni l'une ni l'autre ne s'applique (l'ordinaire « if/then/else » à
	 * deux expressions), on revient au point de départ pour laisser
	 * `parsePrimary` la relire comme expression — c'est la forme la plus
	 * fréquente du corpus, donc celle qu'on ne veut surtout pas casser.
	 */
	function parseIfStatement(): Node | null {
		const savedPos = pos;
		pos += 1; // « if »
		const condition = parseBinary(0);
		if (peek()?.value !== 'then') {
			pos = savedPos;
			return null;
		}
		pos += 1; // « then »
		const looksLikeStatementBranch =
			(peek()?.kind === 'ident' && tokens[pos + 1]?.value === ':=') || peek()?.value === '(';
		if (!looksLikeStatementBranch) {
			// Ni garde ni branche-statement en vue : c'est l'expression ordinaire.
			// On revient au début, `parsePrimary` la relira normalement.
			pos = savedPos;
			return null;
		}
		const thenBranch = parseStatementBranch();
		if (!eat('else')) {
			// Garde sans else : cf. join_list. `thenBranch` peut être un
			// `assign` isolé ou un `block` qui s'y termine (cf. Node['block']).
			return { type: 'guard', condition, assignment: thenBranch };
		}
		const elseBranch = parseStatementBranch();
		return { type: 'if', condition, then: thenBranch, else: elseBranch };
	}

	/**
	 * Séquence de statements (tâche 6c).
	 *
	 * MSE sépare les statements par des retours à la ligne, pas par un jeton :
	 * comme le lexer jette les espaces, on ne peut pas s'appuyer dessus. La
	 * règle retenue, vérifiée sur le corpus, est donc structurelle : tant que
	 * l'item qu'on vient de lire est un STATEMENT (affectation ou `if`-statement),
	 * on continue — la DERNIÈRE valeur lue (statement ou expression) est celle
	 * du bloc, cf. commentaire sur Node['block'] : une affectation porte déjà
	 * sa propre valeur, donc un bloc qui se termine dessus reste utilisable.
	 */
	function parseBlockBody(): Node {
		const statements: Node[] = [];
		for (;;) {
			const statement = tryParseStatement();
			if (statement) {
				statements.push(statement);
				// Un « ; » optionnel peut terminer un statement (cf. fill_len,
				// ar_position) : on l'avale s'il est présent, il ne porte pas de sens.
				eat(';');
				continue;
			}
			break;
		}
		if (statements.length === 0) return parseBinary(0);
		// S'il reste une expression après le dernier statement reconnu (le cas
		// courant : un corps de fonction se termine sur sa valeur de retour),
		// elle devient le DERNIER item — sinon le bloc n'a que des affectations
		// (branche à effet de bord pur, cf. calc_lines) et sa valeur est celle
		// de la dernière, qui la porte déjà (cf. Node['assign']).
		if (peek() && peek()!.value !== ')') statements.push(parseBinary(0));
		return { type: 'block', statements };
	}

	function parsePrimary(): Node {
		// `for` en position d'expression (ex. « else for x from 0 to len do … »
		// dans `join`) : `parseFor` consomme lui-même le jeton « for ».
		if (peek()?.value === 'for') return parseFor();
		// `if` est regardé AVANT d'être consommé : `parseIfStatement` a besoin
		// de pouvoir reculer sans qu'on ait à rejouer un `next()` déjà fait —
		// cf. son commentaire, elle restaure `pos` elle-même si ce n'est ni une
		// garde ni une branche-statement.
		if (peek()?.value === 'if') {
			const asStatement = parseIfStatement();
			if (asStatement) return asStatement;
			pos += 1; // « if », relu ici comme expression ordinaire
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
		const token = next();
		if (token.kind === 'number') return { type: 'number', value: Number(token.value) };
		if (token.kind === 'string') return { type: 'string', value: token.value };
		if (token.value === '(') {
			// Un bloc parenthésé peut lui-même contenir des statements — cf. la
			// branche `else ( ... )` de has_identity_general dans
			// magic.mse-game/script.
			const inner = parseBlockBody();
			// eslint-disable-next-line sonarjs/no-incomplete-assertions -- safe: `expect` est le consommateur de jeton local, pas une assertion de test
			expect(')');
			return inner;
		}
		if (token.value === '[') {
			const items: Node[] = [];
			while (peek() && peek()!.value !== ']') {
				items.push(parseBinary(0));
				if (!eat(',')) break;
			}
			// eslint-disable-next-line sonarjs/no-incomplete-assertions -- safe: `expect` est le consommateur de jeton local, pas une assertion de test
			expect(']');
			return { type: 'array', items };
		}
		if (token.value === '-') return { type: 'unary', op: '-', operand: parsePrimary() };
		if (token.value === 'not') return { type: 'unary', op: 'not', operand: parseBinary(3) };
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

	// Un corps de fonction MSE est une séquence de statements (affectations
	// locales, gardes) terminée par l'expression résultat — cf. parseBlockBody.
	// Une expression de champ simple (le cas courant, ex. « left + width ») est
	// juste une séquence à zéro statement, donc ce chemin reste inchangé pour
	// elle.
	const result = parseBlockBody();
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
