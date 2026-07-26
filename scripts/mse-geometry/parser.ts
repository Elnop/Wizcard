import { tokenise, type Token } from './lexer';

export type Node =
	| { type: 'number'; value: number }
	| { type: 'string'; value: string }
	// Littéraux booléens/`nil` (tâche 6d) : jusqu'ici « true »/« false »/« nil »
	// se lisaient comme de simples `ident`, donc levaient Unresolved(nom) dès
	// qu'on les évaluait — ce qui n'avait jamais d'importance tant qu'aucune
	// valeur PAR DÉFAUT de `@(...)` n'en dépendait (ex. `reverse:false`,
	// `left:nil`). Distingués ici plutôt que dans l'évaluateur, pour que
	// `scope.functions`/les locales ne puissent jamais masquer ces trois mots
	// réservés avec une définition de même nom (cf. `parsePrimary`).
	| { type: 'bool'; value: boolean }
	| { type: 'nil' }
	| { type: 'ident'; name: string }
	| { type: 'member'; object: Node; property: string }
	| { type: 'index'; object: Node; index: Node }
	| { type: 'call'; callee: Node; args: Node[]; named: Record<string, Node> }
	// Application partielle « nom@(nommé: valeur, …) » (tâche 6f), ex.
	// `replace@(match:", (horizontal|…)", replace:"")` (magic.mse-game/script:432).
	// DISTINCT du suffixe de paramètres déclarés « }@(…) » d'une définition
	// (tâche 6d, capturé en amont par `collectDefinitions`/`parseParamList` —
	// jamais vu ici, cf. commentaire de `parsePostfix`) : ici, `@(…)` apparaît
	// après un identifiant NU en position d'EXPRESSION, et veut dire « ce nom,
	// avec ces arguments déjà fournis » — un appel ultérieur (`cull_directions
	// (indicator_field)`) complète juste l'argument manquant (typiquement
	// `input`). `callee` reste le nom brut (jamais un objet arbitraire : aucun
	// contre-exemple `expr@(...)` dans le corpus, toujours un `ident`).
	| { type: 'curry'; callee: string; named: Record<string, Node> }
	| { type: 'if'; condition: Node; then: Node; else: Node }
	| { type: 'unary'; op: string; operand: Node }
	| { type: 'binary'; op: string; left: Node; right: Node }
	| { type: 'array'; items: Node[] }
	// « [nom: expr, …] » (tâche 6h), ex. `[left: 0, top: 0, width: stylesheet.
	// card_width, height: stylesheet.card_height]` dans `faces_coordinates`
	// (magic.mse-game/script:2891-2899) — un « struct » à champs nommés, DISTINCT
	// d'un tableau d'expressions positionnelles (cf. Node['array']) bien que MSE
	// utilise les mêmes crochets pour les deux formes. Ne porte que des champs
	// NUMÉRIQUES dans le corpus mesuré (left/top/width/height) : cf. `MseRecord`.
	| { type: 'record'; fields: Record<string, Node> }
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

/**
 * Liste de PARAMÈTRES déclarés en suffixe d'une définition (tâche 6d) :
 * « nom := { corps }@(p1: défaut1, p2: défaut2) ». Chaque défaut est une
 * expression MSE à part entière (pas seulement un littéral — cf.
 * `trim:{input}`, `func:hash_update`, `color_list:["white", …]` dans le
 * script partagé), donc analysée avec le même `parseExpression` que le
 * reste, sans grammaire séparée à maintenir.
 */
export type ParamList = Map<string, Node>;

/**
 * Reconnaît les trois mots réservés « true »/« false »/« nil » (tâche 6d) —
 * extrait de `parsePrimary` en fonction autonome pour ne pas alourdir sa
 * complexité cognitive déjà élevée (un cas par forme de primaire). Renvoie
 * `null` pour tout autre jeton, y compris un `ident` ordinaire, qui reste géré
 * par l'appelant.
 */
function tryParseReservedLiteral(token: Token): Node | null {
	if (token.kind !== 'ident') return null;
	if (token.value === 'true' || token.value === 'false') {
		return { type: 'bool', value: token.value === 'true' };
	}
	if (token.value === 'nil') return { type: 'nil' };
	return null;
}

/** Précédences, du plus faible au plus fort. */
const BINDING: Record<string, number> = {
	or: 1,
	// « or else » (tâche 6h) : PAS un simple « or » booléen — c'est l'opérateur
	// de repli de MSE (« évalue la gauche ; si elle échoue ou vaut nil, prends
	// la droite »), utilisé 139 fois dans magic.mse-game/script pour des
	// valeurs optionnelles (ex. `styling.rarity_offsets or else ""`,
	// `to_number(input) or else to_number(trim(input)) or else 0`). Même
	// précédence que « or » : les deux sont mutuellement exclusifs dans le
	// corpus (aucune expression mesurée ne mélange « or » nu et « or else »),
	// donc le choix ne peut jamais créer d'ambiguïté d'associativité.
	'or else': 1,
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
		// « true »/« false »/« nil » (tâche 6d) : reconnus AVANT le cas générique
		// `ident` plus bas (via un helper séparé, pour ne pas alourdir la
		// complexité déjà élevée de `parsePrimary`), pour qu'aucune définition du
		// corpus ne puisse jamais masquer ces trois mots réservés (aucune ne le
		// fait, vérifié, mais ce n'est pas laissé au hasard).
		const literal = tryParseReservedLiteral(token);
		if (literal) return literal;
		if (token.value === '(') {
			// Un bloc parenthésé peut lui-même contenir des statements — cf. la
			// branche `else ( ... )` de has_identity_general dans
			// magic.mse-game/script.
			const inner = parseBlockBody();
			// eslint-disable-next-line sonarjs/no-incomplete-assertions -- safe: `expect` est le consommateur de jeton local, pas une assertion de test
			expect(')');
			return inner;
		}
		if (token.value === '[') return parseBracketLiteral();
		if (token.value === '-') return { type: 'unary', op: '-', operand: parsePrimary() };
		if (token.value === 'not') return { type: 'unary', op: 'not', operand: parseBinary(3) };
		if (token.kind === 'ident') return { type: 'ident', name: token.value };
		throw new ParseError(`jeton inattendu « ${token.value} » à ${token.pos}`);
	}

	/**
	 * Littéral entre crochets, APRÈS le « [ » ouvrant déjà consommé par
	 * `parsePrimary` — tâche 6h. Extraite de `parsePrimary` pour rester sous la
	 * limite de complexité cognitive (comme `tryParseReservedLiteral`,
	 * `parseCurrySuffix`), pas seulement pour le lint : c'est aussi tout le
	 * travail de désambiguïsation entre les deux grammaires que MSE fait
	 * partager le même délimiteur.
	 *
	 * « [nom: expr, …] » (record) est distingué d'un tableau positionnel PAR LE
	 * PREMIER ÉLÉMENT SEUL — un `ident` immédiatement suivi de « : ». Vérifié
	 * sur le corpus : jamais de mélange des deux formes dans un même littéral
	 * (soit toutes les entrées sont « nom: expr », soit aucune), donc regarder
	 * la première suffit à choisir la bonne grammaire pour tout le reste.
	 */
	function parseBracketLiteral(): Node {
		const looksLikeRecord = peek()?.kind === 'ident' && tokens[pos + 1]?.value === ':';
		if (looksLikeRecord) {
			const fields: Record<string, Node> = {};
			while (peek() && peek()!.value !== ']') {
				const label = next();
				if (label.kind !== 'ident') throw new ParseError(`nom de champ attendu à ${label.pos}`);
				// eslint-disable-next-line sonarjs/no-incomplete-assertions -- safe: `expect` est le consommateur de jeton local, pas une assertion de test
				expect(':');
				fields[label.value] = parseBinary(0);
				if (!eat(',')) break;
			}
			// eslint-disable-next-line sonarjs/no-incomplete-assertions -- safe: `expect` est le consommateur de jeton local, pas une assertion de test
			expect(']');
			return { type: 'record', fields };
		}
		const items: Node[] = [];
		while (peek() && peek()!.value !== ']') {
			items.push(parseBinary(0));
			if (!eat(',')) break;
		}
		// eslint-disable-next-line sonarjs/no-incomplete-assertions -- safe: `expect` est le consommateur de jeton local, pas une assertion de test
		expect(']');
		return { type: 'array', items };
	}

	/**
	 * Suffixe d'application partielle « @(nommé: valeur, …) » (tâche 6f), ex.
	 * `replace@(match:", (horizontal|…)", replace:"")` — toujours un
	 * identifiant NU suivi de « @( » sans espace dans le corpus (251
	 * occurrences vérifiées, aucun contre-exemple ni sur un
	 * `member`/`call`/`index`) — cf. Node['curry']. Extraite de `parsePostfix`
	 * (comme `tryParseReservedLiteral` en tâche 6d) pour ne pas alourdir sa
	 * complexité cognitive déjà élevée, pas seulement pour éviter le lint.
	 * DISTINCT du suffixe de paramètres déclarés « }@(…) » d'une définition
	 * (tâche 6d) : celui-ci ne traverse jamais cette fonction, il est
	 * intercepté par `collectDefinitions`/`parseParamList` avant même que le
	 * CORPS ne soit tokenisé séparément.
	 */
	function parseCurrySuffix(callee: string): Node {
		pos += 1; // « @ »
		// eslint-disable-next-line sonarjs/no-incomplete-assertions -- safe: `expect` est le consommateur de jeton local, pas une assertion de test
		expect('(');
		const named: Record<string, Node> = {};
		while (peek() && peek()!.value !== ')') {
			const label = next();
			if (label.kind !== 'ident') throw new ParseError(`nom d'argument attendu à ${label.pos}`);
			// eslint-disable-next-line sonarjs/no-incomplete-assertions -- safe: `expect` est le consommateur de jeton local, pas une assertion de test
			expect(':');
			named[label.value] = parseBinary(0);
			if (!eat(',')) break;
		}
		// eslint-disable-next-line sonarjs/no-incomplete-assertions -- safe: `expect` est le consommateur de jeton local, pas une assertion de test
		expect(')');
		return { type: 'curry', callee, named };
	}

	/** Suffixe d'appel « (arg1, nommé: arg2, …) » — extraite pour la même raison que `parseCurrySuffix`. */
	function parseCallSuffix(callee: Node): Node {
		pos += 1; // « ( »
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
		return { type: 'call', callee, args, named };
	}

	function parsePostfix(): Node {
		let node = parsePrimary();
		for (;;) {
			if (peek()?.value === '@') {
				// On n'accepte que ce cas précis (identifiant nu) plutôt que
				// d'autoriser « @ » après n'importe quel noeud — cf. commentaire de
				// `parseCurrySuffix`.
				if (node.type !== 'ident') throw new ParseError(`« @ » inattendu après un noeud non nommé`);
				node = parseCurrySuffix(node.name);
			} else if (eat('.')) {
				const property = next();
				node = { type: 'member', object: node, property: property.value };
			} else if (eat('[')) {
				const index = parseBinary(0);
				// eslint-disable-next-line sonarjs/no-incomplete-assertions -- safe: `expect` est le consommateur de jeton local, pas une assertion de test
				expect(']');
				node = { type: 'index', object: node, index };
			} else if (peek()?.value === '(') {
				node = parseCallSuffix(node);
			} else {
				return node;
			}
		}
	}

	/**
	 * Lit l'opérateur binaire à la position courante, en repérant D'ABORD la
	 * forme à DEUX mots « or else » (tâche 6h) — le lexer ne la distingue pas
	 * de deux `ident` consécutifs (`or` puis `else`), cf. commentaire de
	 * `BINDING`. Renvoie le texte d'opérateur à utiliser pour la précédence ET
	 * le nombre de jetons qu'il consomme (1 ou 2), pour que l'appelant avance
	 * `pos` du bon nombre de crans.
	 */
	function readBinaryOperator(): { op: string; tokenCount: 1 | 2 } | null {
		const token = peek();
		if (!token) return null;
		if (token.value === 'or' && tokens[pos + 1]?.value === 'else') {
			return { op: 'or else', tokenCount: 2 };
		}
		return { op: token.value, tokenCount: 1 };
	}

	function parseBinary(minBinding: number): Node {
		let left = parsePostfix();
		for (;;) {
			const operator = readBinaryOperator();
			if (!operator) return left;
			const binding = BINDING[operator.op];
			if (binding === undefined || binding < minBinding) return left;
			pos += operator.tokenCount;
			left = { type: 'binary', op: operator.op, left, right: parseBinary(binding + 1) };
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
 * Analyse le CONTENU d'un suffixe « @(p1: défaut1, p2: défaut2, …) » (tâche
 * 6d) — `source` est déjà la sous-chaîne ENTRE les parenthèses, extraite par
 * `scope.ts` via un simple équilibrage de parenthèses (jamais de « ( »
 * imbriqué dans les défauts observés sur les 376 styles, seuls « {…} » et
 * « […] » le sont, tous deux déjà équilibrés par ce même comptage). Réutilise
 * `parseExpression` pour chaque défaut plutôt qu'une grammaire de littéraux
 * séparée : les défauts du corpus ne sont PAS que des littéraux (cf.
 * `trim:{input}`, `func:hash_update`, `color_list:["white", …]`).
 */
export function parseParamList(source: string): ParamList {
	const params: ParamList = new Map();
	const trimmed = source.trim();
	if (trimmed === '') return params;
	// Découpe au niveau des virgules de TOP NIVEAU seulement (une virgule à
	// l'intérieur de « […] »/« {…} » ne sépare pas deux paramètres — cf.
	// `color_list:["white", "blue", …]` — NI À L'INTÉRIEUR D'UNE CHAÎNE — cf.
	// `sep:","`, `closing:"and "` : sans ce suivi, la virgule DANS le
	// littéral « "," » serait lue comme un séparateur de paramètres et
	// couperait la chaîne en deux moitiés non terminées.
	let depth = 0;
	let inString = false;
	let start = 0;
	const parts: string[] = [];
	for (let i = 0; i < trimmed.length; i += 1) {
		const ch = trimmed[i];
		if (ch === '"') inString = !inString;
		else if (inString) continue;
		else if (ch === '[' || ch === '{' || ch === '(') depth += 1;
		else if (ch === ']' || ch === '}' || ch === ')') depth -= 1;
		else if (ch === ',' && depth === 0) {
			parts.push(trimmed.slice(start, i));
			start = i + 1;
		}
	}
	parts.push(trimmed.slice(start));
	for (const part of parts) {
		// Le nom du paramètre est tout ce qui précède le PREMIER « : » du
		// segment (jamais dans une chaîne à ce stade : un nom de paramètre ne
		// commence jamais par un guillemet) ; le reste est le défaut.
		const colon = part.indexOf(':');
		if (colon === -1) throw new ParseError(`paramètre sans défaut « ${part.trim()} »`);
		const name = part.slice(0, colon).trim();
		let defaultSource = part.slice(colon + 1).trim();
		// Un défaut peut être entouré de « {…} » comme n'importe quelle valeur
		// de champ MSE (cf. `trim:{input}`) — ce ne sont pas des accolades de
		// bloc de code, juste la même enveloppe que `unwrapFieldValue` retire
		// pour les champs de style ; on fait de même ici plutôt que de laisser
		// `parseExpression` buter dessus (les accolades ne font pas partie de
		// sa grammaire).
		if (defaultSource.startsWith('{') && defaultSource.endsWith('}')) {
			defaultSource = defaultSource.slice(1, -1);
		}
		params.set(name, parseExpression(defaultSource));
	}
	return params;
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
