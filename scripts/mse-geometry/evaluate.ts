import { BUILTINS, type Value } from './builtins';
import { parseExpression, type Node } from './parser';
import type { FunctionDef, Scope } from './scope';

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
 * Cadre de variables LOCALES d'un corps de fonction (tâche 6c, étendu 6d).
 *
 * Une affectation « nom := expr » lie un nom visible par les statements
 * SUIVANTS du même corps (et des blocs qu'il contient), mais jamais par
 * l'appelant ni par une définition sœur — cf. spec. On matérialise donc ce
 * cadre par un `Map` créé une fois PAR INVOCATION (un nouvel appel à
 * `evaluate` sans quatrième argument démarre un cadre vierge), puis transmis
 * tel quel aux noeuds enfants d'un même corps (block/for/guard) pour que les
 * affectations s'y accumulent. Un appel vers une AUTRE définition (ident ou
 * call résolus via `scope.functions`) reçoit un cadre neuf, jamais celui de
 * l'appelant : c'est ce qui empêche la fuite entre portées.
 *
 * Tâche 6d : ce cadre neuf n'est plus systématiquement VIDE. `bindArguments`
 * le préremplit avec les paramètres déclarés par `@(...)` (défauts) puis les
 * arguments de l'appel — une deuxième SOURCE de liaisons locales, orthogonale
 * aux affectations `:=`, mais qui vit dans le même `Map` : un corps qui fait
 * `field := field + 1` après avoir reçu `field` en paramètre doit voir sa
 * propre valeur AVANT de la réaffecter, exactement comme une affectation
 * locale ordinaire le ferait.
 */
type Locals = Map<string, Value>;

function toNumber(value: Value): number {
	if (typeof value === 'number') return value;
	// MSE stocke parfois un nombre sous forme de chaîne (« "52" »).
	if (typeof value === 'string' && /^-?[\d.]+$/.test(value.trim())) return Number(value);
	throw new Unresolved(`valeur non numérique ${JSON.stringify(value)}`);
}

/**
 * Construit le cadre de locales d'un APPEL vers une définition du corpus
 * (tâche 6d) — c'est le mécanisme qui manquait : jusqu'ici `args`/`named`
 * étaient évalués puis jetés dès qu'on tombait sur `scope.functions` (seuls
 * les BUILTINS les recevaient). Trois sources, dans cet ordre de priorité
 * croissante :
 *
 *  1. Les défauts déclarés par `}@(nom: défaut, …)` — évalués PARESSEUSEMENT
 *     (seulement si l'appel ne fournit pas ce nom) et dans le cadre construit
 *     JUSQU'ICI plutôt qu'un cadre vide : `alternative_cost`, dans le script
 *     partagé, déclare `@(trim: lower_first, s:false, trim:{input})` — la
 *     dernière déclaration de `trim` (comme un objet littéral, la dernière
 *     clé gagne) référence `input`, donc un défaut peut vouloir voir un autre
 *     paramètre déjà résolu. Ordre d'itération = ordre de déclaration dans le
 *     `Map` (cf. `parseParamList`), donc déterministe.
 *  2. Les arguments NOMMÉS de l'appel (`face:1`, `field:field`) — écrasent le
 *     défaut correspondant s'il existe, ou introduisent un nom que le
 *     paramètre n'avait pas prévu (rare mais pas interdit : cf. `named` déjà
 *     transmis tel quel aux BUILTINS).
 *  3. Un unique argument POSITIONNEL — lié à l'implicite `input` (405
 *     références dans le script partagé, ex. `rarity_field(field)` où
 *     `rarity_field` n'a AUCUN `@(...)`), sauf si la définition déclare
 *     exactement un paramètre : dans ce cas, un positionnel vise CE paramètre
 *     (cf. énoncé de tâche — aucun contre-exemple positif trouvé dans le
 *     corpus, mais aucun exemple ne contredit non plus la règle par défaut
 *     « input », donc les deux se combinent sans ambiguïté observée).
 *     Plusieurs positionnels au-delà du premier n'ont pas de convention
 *     connue dans le corpus : ignorés plutôt que devinés (cf. « aucun
 *     fallback » — un futur appelant qui en dépendrait échouera sur le nom
 *     manquant, pas sur une valeur erronée silencieuse).
 */
function bindArguments(
	def: FunctionDef,
	args: Value[],
	named: Record<string, Value>,
	scope: Scope,
	depth: number
): Locals {
	const locals: Locals = new Map();
	for (const [name, defaultNode] of def.params) {
		if (Object.hasOwn(named, name)) continue; // écrasé plus bas, pas la peine d'évaluer le défaut
		// Le défaut est évalué dans un cadre NEUF qui incrémente `depth` : une
		// définition dont le défaut se référence elle-même (ex. `hash_update`
		// dans le script partagé, `@(func:hash_update, …)`, jamais surchargé
		// aux points d'appel mesurés) reste donc protégée par la garde de
		// récursion plutôt que de boucler indéfiniment.
		locals.set(name, evaluate(defaultNode, scope, depth + 1, locals));
	}
	for (const [name, value] of Object.entries(named)) locals.set(name, value);
	if (args.length > 0) {
		const singleDeclaredParam = def.params.size === 1 ? [...def.params.keys()][0] : undefined;
		locals.set(singleDeclaredParam ?? 'input', args[0]);
	}
	return locals;
}

/**
 * Évalue un APPEL vers une définition du corpus (`scope.functions`), qu'il
 * s'écrive avec parenthèses (`call`) ou sans (`ident` référencé nu) — les deux
 * partagent EXACTEMENT la même sémantique de liaison depuis la tâche 6d (cf.
 * leurs cas respectifs), donc la même fonction plutôt que dupliquer la
 * logique deux fois.
 *
 * Tâche 6f : le corps analysé peut être un noeud `curry` plutôt qu'une
 * expression ordinaire — ex. `cull_directions := replace@(match:"…",
 * replace:"")`, où `parseExpression(definition.body)` renvoie directement le
 * noeud `curry` (rien à équilibrer autour, c'est toute l'expression). Dans ce
 * cas, on ne passe PAS par `bindArguments`/le cadre de locales habituel : une
 * application partielle n'a pas de corps à exécuter dans un cadre, c'est un
 * APPEL DIFFÉRÉ vers `callee` — cf. `evaluateCurry`.
 */
function evaluateDefinition(
	definition: FunctionDef,
	args: Value[],
	named: Record<string, Value>,
	scope: Scope,
	depth: number,
	locals: Locals
): Value {
	const body = parseExpression(definition.body);
	if (body.type === 'curry') return evaluateCurry(body, args, named, scope, depth, locals);
	const callLocals = bindArguments(definition, args, named, scope, depth);
	return evaluate(body, scope, depth + 1, callLocals);
}

/**
 * Complète une application partielle « nom@(nommé: valeur, …) » (tâche 6f)
 * avec les arguments manquants d'un appel PLUS TARD (ex. `cull_directions
 * (indicator_field)` complète l'« input » que `replace` attend en premier
 * positionnel). Vérifié sur les 251 occurrences `@(` du corpus : le point
 * d'appel d'un alias curried ne fournit JAMAIS d'argument nommé qui
 * chevaucherait ceux déjà fixés par la curry — donc les nommés de l'APPEL
 * s'ajoutent à ceux de la curry sans jamais avoir besoin de trancher un
 * conflit (si un futur appel le faisait malgré tout, l'appel gagnerait,
 * cohérent avec la façon dont `bindArguments` traite déjà les nommés comme
 * prioritaires sur les défauts).
 *
 * `callee` peut être un builtin (`replace`, `filter_text`, …) ou une AUTRE
 * définition du corpus (aucun exemple mesuré, mais rien dans la grammaire ne
 * l'exclut) — les deux chemins existent déjà pour un `call` ordinaire, donc
 * réutilisés ici plutôt que dupliqués.
 */
function evaluateCurry(
	node: Node & { type: 'curry' },
	args: Value[],
	named: Record<string, Value>,
	scope: Scope,
	depth: number,
	locals: Locals
): Value {
	// `replace` (tâche 6f) est un cas à part : son argument `replace:` peut être
	// une expression qui référence les groupes capturés du PATTERN (`_1`, `_2`,
	// …), donc ne doit PAS être évaluée maintenant comme n'importe quel autre
	// nommé — cf. `evaluateReplaceCall`, qui reçoit les noeuds bruts plutôt que
	// des valeurs déjà calculées. On l'intercepte avant la boucle d'évaluation
	// générique ci-dessous, exactement comme le fait le cas `call` plus bas.
	if (node.callee === 'replace') {
		return evaluateReplaceCall(node.named, args, named, scope, depth, locals);
	}
	const boundNamed: Record<string, Value> = {};
	for (const [key, valueNode] of Object.entries(node.named)) {
		boundNamed[key] = evaluate(valueNode, scope, depth + 1, locals);
	}
	const finalNamed = { ...boundNamed, ...named };
	const builtin = BUILTINS.get(node.callee);
	if (builtin) return builtin(args, finalNamed);
	const definition = scope.functions.get(node.callee);
	if (definition !== undefined) {
		return evaluateDefinition(definition, args, finalNamed, scope, depth, locals);
	}
	throw new Unresolved(`${node.callee}()`);
}

/**
 * Traduit un motif MSE en `RegExp` JS GLOBALE (tâche 6f) — MSE remplace TOUTES
 * les occurrences (`replace`), jamais une seule, donc le drapeau `g` n'est pas
 * optionnel. Les motifs du corpus mesurés pour `replace`/`match`/`filter_text`
 * (`cull_directions`, `cull_noncolors`, `</?soft-line>`, …) sont déjà de la
 * syntaxe PCRE ordinaire acceptée telle quelle par JS ; on ne traduit aucune
 * extension MSE ici (ex. `(?i)`/`(?ix)` en tête de motif, `in_context`) — un
 * motif qui en a besoin lève `Unresolved` plutôt que d'être mal interprété
 * silencieusement (cf. « aucun fallback »).
 */
function toGlobalRegex(pattern: string, what: string): RegExp {
	if (pattern.startsWith('(?')) {
		// Drapeaux inline façon PCRE (« (?i) », « (?ix) », …) : JS ne les
		// supporte pas en tête de motif de cette manière. Aucun des motifs
		// mesurés par `cull_directions`/`cull_noncolors`/`softline_ripper` n'en
		// a besoin ; un futur appelant qui en dépendrait doit le signaler
		// honnêtement plutôt que produire un motif silencieusement erroné.
		throw new Unresolved(`${what} (drapeaux PCRE non pris en charge)`);
	}
	try {
		return new RegExp(pattern, 'g');
	} catch {
		throw new Unresolved(`${what} (motif invalide)`);
	}
}

/**
 * `replace(input, match:motif, replace:remplacement)` — remplace TOUTES les
 * occurrences du motif (tâche 6f). Deux formes de `replace:` coexistent dans
 * le corpus :
 *  - une chaîne LITTÉRALE (150/179 appels mesurés, ex. `cull_directions`) :
 *    remplacement direct, sans rien évaluer par correspondance ;
 *  - une expression qui référence les groupes capturés (`to_title`,
 *    `replace:{_1+to_upper(_2)+to_lower(_3)}`, 23/179 appels) : chaque
 *    occurrence est remplacée en évaluant cette expression dans un cadre où
 *    `_1`, `_2`, … sont liés au texte capturé par CETTE correspondance —
 *    c'est le seul moyen honnête de la traiter (une valeur constante ne
 *    pourrait jamais représenter un remplacement qui dépend du texte trouvé).
 *
 * `in_context` (motif contextuel autour de `<match>`) n'est pas modélisé :
 * aucun des appels bloquant `cull_directions`/`cull_noncolors` ne l'utilise ;
 * un appel qui le fournit lève `Unresolved` plutôt que d'ignorer le contexte
 * en silence.
 */
function evaluateReplaceCall(
	namedNodes: Record<string, Node>,
	args: Value[],
	named: Record<string, Value>,
	scope: Scope,
	depth: number,
	locals: Locals
): Value {
	if (namedNodes.in_context || named.in_context !== undefined) {
		throw new Unresolved('replace(in_context:) non pris en charge');
	}
	const matchNode = namedNodes.match;
	if (!matchNode) throw new Unresolved('replace(match:) manquant');
	const matchValue = named.match ?? evaluate(matchNode, scope, depth + 1, locals);
	if (typeof matchValue !== 'string') throw new Unresolved('replace(match:) non textuel');
	const replaceNode = namedNodes.replace;
	if (!replaceNode) throw new Unresolved('replace(replace:) manquant');
	const input = String(named.input ?? args[0] ?? '');
	const regex = toGlobalRegex(matchValue, 'replace(match:)');
	if (replaceNode.type === 'string') {
		// Remplacement littéral : pas de groupe capturé à lier, cf. commentaire
		// de tête. `$`-séquences (`$1`, `$&`, …) de JS n'ont AUCUN sens ici — ce
		// sont des caractères MSE ordinaires — donc échappées avant substitution.
		const literal = replaceNode.value.replace(/\$/g, '$$$$');
		return input.replace(regex, literal);
	}
	// Remplacement par EXPRESSION : chaque correspondance est remplacée en
	// évaluant `replaceNode` avec `_1..._N` liés aux groupes capturés de CETTE
	// correspondance dans le MÊME cadre de locales que l'appelant (les autres
	// noms visibles, ex. `errata_map` dans `errata_map[_1] or else _1`,
	// doivent rester accessibles).
	return input.replace(regex, (...matchArgs) => {
		// `String.replace` avec une fonction reçoit (match, p1, p2, ..., offset, string) ;
		// les groupes sont toujours des `string` ou `undefined` (groupe non capturé).
		const groups = matchArgs.slice(0, -2) as Array<string | undefined>;
		const callLocals: Locals = new Map(locals);
		groups.forEach((group, index) => callLocals.set(`_${index + 1}`, group ?? ''));
		const value = evaluate(replaceNode, scope, depth + 1, callLocals);
		return String(value);
	});
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
		case 'bool':
			return node.value;
		case 'nil':
			return null;
		case 'ident': {
			// Une locale du corps courant masque toute variable/définition de
			// même nom — cf. commentaire de tête sur `Locals`.
			const local = locals.get(node.name);
			if (local !== undefined) return local;
			const variable = scope.variables.get(node.name);
			if (variable !== undefined) return variable;
			const definition = scope.functions.get(node.name);
			// Un nom défini sans parenthèses s'évalue comme son corps, dans un
			// cadre de locales NEUF (pas celui de l'appelant, cf. Locals) — mais
			// PAS vide : les défauts déclarés par `@(...)` (tâche 6d) s'appliquent
			// même sans appel explicite, exactement comme un appel à zéro
			// argument (`has_identity()` et `has_identity` référencé sans
			// parenthèses doivent voir le même `face` par défaut). Tâche 6f :
			// `evaluateDefinition` gère aussi le cas où le corps est une
			// application partielle (`curry`).
			if (definition !== undefined) {
				return evaluateDefinition(definition, [], {}, scope, depth, locals);
			}
			throw new Unresolved(node.name);
		}
		case 'member': {
			const path = flattenMember(node);
			const variable = scope.variables.get(path);
			if (variable !== undefined) return variable;
			throw new Unresolved(path);
		}
		case 'index': {
			// Indexation CALCULÉE de l'objet « carte » (tâche 6e), ex.
			// `card["indicator"+tag]` dans magic.mse-game/script:446. `card` n'est
			// jamais une vraie valeur (ident non défini dans `scope.variables` —
			// seuls ses champs `card.xxx` le sont, cf. CANONICAL_CARD) : on ne peut
			// donc PAS évaluer `node.object` en premier comme pour une chaîne, ça
			// lèverait toujours Unresolved('card') avant même de regarder la clé.
			// On tente d'abord la lecture « chemin pointé » : si `node.object` est
			// lui-même un `ident`/`member` (jamais un calcul), on évalue la clé
			// (une expression ordinaire, ex. `"indicator" + tag`) et on cherche
			// `<chemin de l'objet>.<clé évaluée>` dans `scope.variables` — même
			// mécanisme que le cas `member` juste au-dessus, avec un chemin construit
			// au lieu d'un chemin littéral figé par le parseur.
			if (node.object.type === 'ident' || node.object.type === 'member') {
				const base = flattenMember(node.object);
				const key = evaluate(node.index, scope, depth + 1, locals);
				if (typeof key === 'string') {
					const path = `${base}.${key}`;
					const variable = scope.variables.get(path);
					if (variable !== undefined) return variable;
					// Le nom manquant remonté est le CHEMIN COMPLET (ex. `card.indicator`),
					// jamais le nom nu de l'objet — sinon tous les champs manquants de
					// `card` se confondraient dans le rapport (cf. tâche 6d, motif exact
					// que cette tâche corrige).
					throw new Unresolved(path);
				}
			}
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
			// number|string|boolean|null) : on ne feint pas d'en construire un, on
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
					// MSE surcharge « + » : concaténation dès qu'un des deux côtés est
					// une chaîne (ex. `"_" + face`, `"indicator" + tag` où `tag` vaut
					// `""` ou `"_2"`) — omniprésent dans le script partagé pour bâtir
					// les CLÉS d'indexation dynamique de `card` (tâche 6e). Convertir
					// systématiquement en nombre AVANT cette tâche empêchait ces
					// concaténations de jamais réussir. `String(number)` restitue un
					// entier sans décimale parasite (ex. `2`, pas `2.0`), cohérent avec
					// les suffixes `_2`/`_3` observés dans le corpus.
					if (typeof left === 'string' || typeof right === 'string') {
						return String(left) + String(right);
					}
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
			// `replace(input, match:…, replace:…)` appelé DIRECTEMENT (sans currying,
			// ex. script:1148 `replace(input, match:"up to ", replace:"")`) a besoin
			// des noeuds BRUTS de `replace:`, pas de valeurs déjà évaluées — cf.
			// `evaluateReplaceCall`. Interceptée ici, avant l'évaluation générique des
			// arguments ci-dessous, pour la même raison que dans `evaluateCurry`.
			if (name === 'replace') {
				const args = node.args.map((arg) => evaluate(arg, scope, depth + 1, locals));
				const named = Object.fromEntries(
					Object.entries(node.named)
						.filter(([key]) => key !== 'replace')
						.map(([key, value]) => [key, evaluate(value, scope, depth + 1, locals)])
				);
				return evaluateReplaceCall(node.named, args, named, scope, depth, locals);
			}
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
			// Cadre de locales NEUF construit à partir des défauts déclarés ET des
			// arguments de CET appel (tâche 6d, cf. `bindArguments`) — jamais celui
			// de l'appelant, pour ne pas lui faire fuiter ses propres locales. Tâche
			// 6f : `evaluateDefinition` gère aussi le cas où le corps est une
			// application partielle (`curry`), ex. `cull_directions(indicator_field)`.
			if (definition !== undefined) {
				return evaluateDefinition(definition, args, named, scope, depth, locals);
			}
			throw new Unresolved(`${name}()`);
		}
		case 'curry':
			// Une application partielle référencée SANS jamais être appelée (ni
			// directement en `ident`/`call` via `scope.functions`, ni combinée par
			// « + » à une autre — cf. `combined_cost`, `separate_words`, qui
			// composent PLUSIEURS filtres de texte via des builtins moteur
			// `remove_tags`/`trim` non modélisés) n'est PAS une valeur MSE : cf.
			// « aucun fallback », on refuse plutôt que de deviner un résultat pour
			// une composition de fonctions qu'on ne sait pas exécuter.
			throw new Unresolved('application partielle non appelée');
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
