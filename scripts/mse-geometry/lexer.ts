export interface Token {
	kind: 'number' | 'string' | 'ident' | 'op' | 'punct';
	value: string;
	pos: number;
}

export class LexError extends Error {}

/**
 * Opérateurs à deux caractères d'abord : « == » ne doit pas se lire « = » « = ».
 * « := » (affectation locale, tâche 6c) doit précéder « : » et « = » pour la
 * même raison — sans quoi `tag := ...` se lirait `:` puis `=`.
 */
const TWO_CHAR_OPS = ['==', '!=', '<=', '>=', ':='];
const ONE_CHAR_OPS = ['+', '-', '*', '/', '<', '>', '='];
// « ; » termine parfois un statement dans un corps multi-ligne (tâche 6c,
// ex. « for x from 1 to fill do output := lead + output + follow; ») : sans
// lui, le caractère est simplement inconnu du lexer et l'analyse échoue avant
// même d'atteindre la logique de séquence du parseur.
// « @ » (tâche 6f) précède toujours une liste d'arguments PRÉ-LIÉE, soit en
// suffixe d'une définition (« }@(face:1) », tâche 6d), soit directement après
// un identifiant nu comme APPLICATION PARTIELLE (« replace@(match:"x",
// replace:"") », cf. parser.ts/parsePostfix) — les deux formes partagent ce
// même jeton, seule leur POSITION dans le flux distingue leur sens.
const PUNCT = ['(', ')', '[', ']', ',', ':', '.', ';', '@'];

/**
 * Découpe une expression MSE en jetons.
 *
 * Les identifiants MSE acceptent le souligné et le chiffre (`casting_cost_1`),
 * et les mots-clés (`if`, `then`, `else`, `and`, `or`, `not`) ne sont PAS
 * distingués ici : le parseur les reconnaît, ce qui évite d'avoir deux listes
 * de mots réservés à tenir synchronisées.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- safe: une seule boucle de balayage caractère par caractère, la découper romprait la lecture linéaire du lexer
export function tokenise(source: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	while (i < source.length) {
		const ch = source[i];
		if (/\s/.test(ch)) {
			i += 1;
			continue;
		}
		// Commentaire MSE : « # » jusqu'à la fin de la ligne.
		if (ch === '#') {
			while (i < source.length && source[i] !== '\n') i += 1;
			continue;
		}
		// Un « . » démarre un NOMBRE (« .5 ») seulement s'il n'est pas en
		// position d'ACCÈS DE MEMBRE — cf. « split.0 », « main.1 », omniprésent
		// dans les corps multi-statements (tâche 6c) pour indexer un tuple par
		// position. Le signal retenu : le jeton précédent. Un « . » qui suit un
		// ident/nombre/« ) »/« ] » est TOUJOURS un accès (`split` . `0`, jamais
		// un nombre `split` suivi de `.0` — cf. `unique_elements`, `main.0`),
		// donc jamais absorbé ici ; le parseur lit alors `0` comme un `number`
		// isolé et `member.property` fonctionne normalement.
		const previous = tokens.at(-1);
		const isMemberDot =
			ch === '.' &&
			previous !== undefined &&
			(previous.kind === 'ident' ||
				previous.kind === 'number' ||
				(previous.kind === 'punct' && (previous.value === ')' || previous.value === ']')));
		// eslint-disable-next-line sonarjs/concise-regex -- safe: classe explicite, un seul caractère testé à la fois
		if (!isMemberDot && (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(source[i + 1] ?? '')))) {
			const start = i;
			while (i < source.length && /[0-9.]/.test(source[i])) i += 1;
			tokens.push({ kind: 'number', value: source.slice(start, i), pos: start });
			continue;
		}
		if (ch === '"') {
			const start = i;
			i += 1;
			let value = '';
			while (i < source.length && source[i] !== '"') {
				value += source[i];
				i += 1;
			}
			if (i >= source.length) throw new LexError(`chaîne non terminée à ${start}`);
			i += 1;
			tokens.push({ kind: 'string', value, pos: start });
			continue;
		}
		if (/[A-Za-z_]/.test(ch)) {
			const start = i;
			// eslint-disable-next-line sonarjs/concise-regex -- safe: classe explicite, un seul caractère testé à la fois
			while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) i += 1;
			tokens.push({ kind: 'ident', value: source.slice(start, i), pos: start });
			continue;
		}
		const two = source.slice(i, i + 2);
		if (TWO_CHAR_OPS.includes(two)) {
			tokens.push({ kind: 'op', value: two, pos: i });
			i += 2;
			continue;
		}
		if (ONE_CHAR_OPS.includes(ch)) {
			tokens.push({ kind: 'op', value: ch, pos: i });
			i += 1;
			continue;
		}
		if (PUNCT.includes(ch)) {
			tokens.push({ kind: 'punct', value: ch, pos: i });
			i += 1;
			continue;
		}
		throw new LexError(`caractère inattendu ${JSON.stringify(ch)} à ${i}`);
	}
	return tokens;
}
