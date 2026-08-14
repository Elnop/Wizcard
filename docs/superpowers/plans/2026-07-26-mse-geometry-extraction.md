# MSE Geometry Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every shipped studio frame its own measured geometry, extracted from the MSE style corpus already in the repo, so no frame renders with coordinates that were not measured for it.

**Architecture:** A build-time Node pipeline reads the 376 `.mse-style/style` files, tokenises and parses their geometry expressions into an AST, evaluates that AST against a scope built from the style's own `init script:` layered over the shared `magic.mse-game/script`, and writes resolved boxes plus the AST into a new `card_templates.geometry` column. `CardCanvas` then reads geometry from the template instead of from the 8 hand-built layouts. A style whose every required field does not resolve is **excluded**, never approximated.

**Tech Stack:** TypeScript run via `tsx` (Node, no browser), Supabase/PostgREST, Next.js 16 + React for the canvas, `opentype.js` (already a dependency, used by `scripts/generate-logo.ts`) for font metrics.

## Global Constraints

- **No test framework exists** in this repo (no vitest/jest). Do NOT add one. Verification is `npm run check` plus the extractor's own measured report, which is the primary gate for this work.
- **`npm run check` is not green at base** (~60 pre-existing problems in unrelated files, plus 5 prettier warnings). The gate is **no NEW problems**: run `npx eslint <changed files>` and `npx tsc --noEmit`.
- **No fallback.** A frame ships only if every required field resolves to a real number. Never substitute a default, an inherited value, or a neighbouring style's value. Excluded frames are listed in the report.
- **The 211/376 fully-resolved baseline must be beaten and never regressed.** Every tier task re-runs the same measurement and records the number.
- **The 8 hand-built layouts in `layout-registry.ts` stay untouched.** They are the house entries — a product offering, not a fallback.
- **Comments in this codebase are written in French**, explaining _why_ rather than _what_. Match the surrounding style.
- **Formatting:** prettier with TABS. Run `npx prettier --write` on touched files before committing.
- **File paths contain literal square brackets** (`src/app/[locale]/...`). Quote every path in shell commands or the shell globs it and the command silently does nothing.
- **Corpus root** (used throughout): `assets/card-templates/card-assets/v/bcdf4190b4bf/full-magic-pack/data`. It is gitignored — present locally, never committed.

---

## File Structure

| File                                                                    | Responsibility                                                                           |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `scripts/mse-geometry/lexer.ts` **(create)**                            | Tokenises MSE expression source. No evaluation.                                          |
| `scripts/mse-geometry/parser.ts` **(create)**                           | Tokens → AST. Pratt parser for the 9 measured constructs.                                |
| `scripts/mse-geometry/scope.ts` **(create)**                            | Builds the name→definition scope: style `init script:` over includes over game script.   |
| `scripts/mse-geometry/evaluate.ts` **(create)**                         | Walks an AST against a scope + canonical card. Throws `Unresolved` rather than guessing. |
| `scripts/mse-geometry/builtins.ts` **(create)**                         | The MSE standard library, added tier by tier (Tasks 5–8).                                |
| `scripts/mse-geometry/font-metrics.ts` **(create)**                     | `*_font_vertical()` via opentype.js over the shipped TTFs.                               |
| `scripts/mse-geometry/style-file.ts` **(create)**                       | Reads one `.mse-style/style`: dimensions + the `card style:` field blocks.               |
| `scripts/mse-geometry/extract.ts` **(create)**                          | Orchestrator + report. The measurement gate every tier task re-runs.                     |
| `supabase/migrations/<ts>_add_card_template_geometry.sql` **(create)**  | `geometry jsonb` column.                                                                 |
| `scripts/card-assets/upload-templates.ts` **(modify)**                  | Write `geometry` when upserting the catalogue.                                           |
| `src/lib/card-editor/template-geometry.ts` **(create)**                 | DB geometry → the canvas's `CardGeometry` shape.                                         |
| `src/lib/card-editor/components/CardCanvas/CardCanvas.tsx` **(modify)** | Prefer template geometry; adopt the template's native aspect ratio.                      |

Tasks 1–4 build a working end-to-end pipeline at tier 0. Tasks 5–8 raise coverage one function-tier at a time, each independently shippable. Tasks 9–11 put the geometry on screen.

---

### Task 1: Read a style file

The smallest end-to-end slice: parse one file's dimensions and raw field values, with no expression handling at all.

**Files:**

- Create: `scripts/mse-geometry/style-file.ts`

**Interfaces:**

- Consumes: nothing (pure Node `fs`).
- Produces:
  - `interface RawBox { left?: string; top?: string; width?: string; height?: string }`
  - `interface StyleFile { id: string; cardWidth: number; cardHeight: number; fields: Record<string, RawBox> }`
  - `const GEOMETRY_FIELDS = ['image', 'name', 'type', 'text', 'pt', 'casting cost'] as const`
  - `function readStyleFile(path: string): StyleFile | null`

- [ ] **Step 1: Write the module**

Create `scripts/mse-geometry/style-file.ts`:

```ts
import { readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

/** Les zones dont le studio a besoin. Tout autre bloc du style est ignoré. */
export const GEOMETRY_FIELDS = ['image', 'name', 'type', 'text', 'pt', 'casting cost'] as const;
export type GeometryField = (typeof GEOMETRY_FIELDS)[number];

/** Valeurs BRUTES : un nombre (« 29 ») ou une expression (« { max(30, …) } »). */
export interface RawBox {
	left?: string;
	top?: string;
	width?: string;
	height?: string;
}

export interface StyleFile {
	/** Nom du paquet sans le suffixe, ex. « magic-m15 ». */
	id: string;
	cardWidth: number;
	cardHeight: number;
	fields: Partial<Record<GeometryField, RawBox>>;
}

const BOX_KEYS = ['left', 'top', 'width', 'height'] as const;

/**
 * Découpe le bloc `card style:` : ses enfants sont indentés d'UNE tabulation,
 * leurs propriétés de deux. On s'arrête à la première ligne non indentée, qui
 * ouvre la section suivante du fichier.
 */
function cardStyleBlock(lines: string[]): string[] {
	const start = lines.findIndex((line) => line.trimEnd().startsWith('card style:'));
	if (start === -1) return [];
	const block: string[] = [];
	for (const line of lines.slice(start + 1)) {
		if (line.trim() && !line.startsWith('\t')) break;
		block.push(line);
	}
	return block;
}

/**
 * Lit un fichier `style` de paquet MSE.
 *
 * Les valeurs sont rendues TELLES QUELLES : ce module ne sait pas évaluer, il
 * sépare seulement la structure du contenu. C'est volontaire — l'évaluation
 * demande une portée (scripts de la partie + du style) que ce niveau n'a pas.
 *
 * Attention au format : MSE écrit parfois « top : 0 » avec une espace AVANT le
 * deux-points. Une regex qui exige « top: » perd silencieusement le champ.
 */
export function readStyleFile(path: string): StyleFile | null {
	let source: string;
	try {
		source = readFileSync(path, 'utf8');
	} catch {
		return null;
	}
	const lines = source.split('\n');
	const width = /^card width:\s*([\d.]+)/m.exec(source);
	const height = /^card height:\s*([\d.]+)/m.exec(source);
	if (!width || !height) return null;

	const fields: Partial<Record<GeometryField, RawBox>> = {};
	let current: GeometryField | null = null;
	for (const line of cardStyleBlock(lines)) {
		const opener = /^\t([^\t:]+?)\s*:\s*$/.exec(line);
		if (opener) {
			const name = opener[1].trim() as GeometryField;
			current = GEOMETRY_FIELDS.includes(name) ? name : null;
			if (current) fields[current] ??= {};
			continue;
		}
		if (!current) continue;
		const prop = /^\t\t(left|top|width|height)\s*:\s*(.+?)\s*$/.exec(line);
		if (prop) fields[current]![prop[1] as (typeof BOX_KEYS)[number]] = prop[2];
	}

	return {
		id: basename(dirname(path)).replace(/\.mse-style$/, ''),
		cardWidth: Number(width[1]),
		cardHeight: Number(height[1]),
		fields,
	};
}
```

- [ ] **Step 2: Verify against known-good values**

`magic-m15` is the reference: its image box is `left 29, top 60, width 316, height 231` on a `375×523` card. Create `./verify-tmp.mts` in the REPO ROOT (relative imports resolve from the script's own location, so a script in `/tmp` cannot import from `scripts/`):

```ts
import { readStyleFile } from './scripts/mse-geometry/style-file.ts';

const base = 'assets/card-templates/card-assets/v/bcdf4190b4bf/full-magic-pack/data';
const m15 = readStyleFile(`${base}/magic-m15.mse-style/style`);
console.log('dims  :', m15?.cardWidth, 'x', m15?.cardHeight, '(attendu 375 x 523)');
console.log('image :', JSON.stringify(m15?.fields.image));
console.log('text  :', JSON.stringify(m15?.fields.text));
```

Run: `npx tsx ./verify-tmp.mts && rm -f ./verify-tmp.mts`

Expected: `375 x 523`, image `{"left":"29","top":"60","width":"316","height":"231"}`, text present.

- [ ] **Step 3: Verify corpus-wide coverage**

Replace `./verify-tmp.mts` with a sweep:

```ts
import { globSync } from 'node:fs';
import { readStyleFile, GEOMETRY_FIELDS } from './scripts/mse-geometry/style-file.ts';

const base = 'assets/card-templates/card-assets/v/bcdf4190b4bf/full-magic-pack/data';
const files = globSync(`${base}/*.mse-style/style`);
let read = 0;
const present: Record<string, number> = {};
for (const f of files) {
	const s = readStyleFile(f);
	if (!s) continue;
	read += 1;
	for (const field of GEOMETRY_FIELDS)
		if (s.fields[field]) present[field] = (present[field] ?? 0) + 1;
}
console.log(`lus ${read}/${files.length}`);
console.log(present);
```

Run: `npx tsx ./verify-tmp.mts && rm -f ./verify-tmp.mts`

Expected, matching the figures measured during design — `image` ~368, `name` ~312, `text` ~300, `type` ~275, `casting cost` ~251, `pt` ~240, out of 376 files read. If `image` comes back near 0, the `top :` space-before-colon case is being missed.

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit
npx eslint scripts/mse-geometry
npx prettier --write scripts/mse-geometry
git add scripts/mse-geometry/style-file.ts
git commit -m "feat(mse): read geometry blocks from MSE style packages"
```

---

### Task 2: Lex and parse expressions into an AST

**Files:**

- Create: `scripts/mse-geometry/lexer.ts`
- Create: `scripts/mse-geometry/parser.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `type Token = { kind: 'number'|'string'|'ident'|'op'|'punct'; value: string; pos: number }`
  - `function tokenise(source: string): Token[]`
  - `type Node = NumberNode | StringNode | IdentNode | CallNode | IfNode | BinaryNode | UnaryNode | MemberNode | IndexNode`
  - `function parseExpression(source: string): Node` — throws `ParseError` on unsupported syntax.

The grammar surface was measured across the corpus; these are the only constructs that appear in geometry fields:

| Construct                | Occurrences |
| ------------------------ | ----------- |
| function call            | 4029        |
| property access `a.b`    | 3385        |
| `if/then/else`           | 2955        |
| arithmetic `+ - * /`     | 1726        |
| string literal           | 1520        |
| comparison `== != < >`   | 1433        |
| named argument `f(x: 1)` | 465         |
| boolean `and or not`     | 309         |
| indexing `a[b]`          | 52          |

- [ ] **Step 1: Write the lexer**

Create `scripts/mse-geometry/lexer.ts`:

```ts
export interface Token {
	kind: 'number' | 'string' | 'ident' | 'op' | 'punct';
	value: string;
	pos: number;
}

export class LexError extends Error {}

/** Opérateurs à deux caractères d'abord : « == » ne doit pas se lire « = » « = ». */
const TWO_CHAR_OPS = ['==', '!=', '<=', '>='];
const ONE_CHAR_OPS = ['+', '-', '*', '/', '<', '>', '='];
// Le point EN FAIT PARTIE : il porte l'accès membre (`card_style.rarity`), de
// loin la construction la plus fréquente du corpus après l'appel de fonction.
const PUNCT = ['(', ')', '[', ']', ',', ':', '.'];

/**
 * Découpe une expression MSE en jetons.
 *
 * Les identifiants MSE acceptent le souligné et le chiffre (`casting_cost_1`),
 * et les mots-clés (`if`, `then`, `else`, `and`, `or`, `not`) ne sont PAS
 * distingués ici : le parseur les reconnaît, ce qui évite d'avoir deux listes
 * de mots réservés à tenir synchronisées.
 */
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
		if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(source[i + 1] ?? ''))) {
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
```

- [ ] **Step 2: Write the parser**

Create `scripts/mse-geometry/parser.ts`:

```ts
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
			expect(')');
			return inner;
		}
		if (token.value === '-') return { type: 'unary', op: '-', operand: parsePrimary() };
		if (token.value === 'not') return { type: 'unary', op: 'not', operand: parseBinary(3) };
		if (token.value === 'if') {
			const condition = parseBinary(0);
			expect('then');
			const consequent = parseBinary(0);
			// Le `else` est obligatoire dans le corpus : une branche manquante
			// serait une valeur non résolue, donc une erreur, pas un défaut.
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
```

- [ ] **Step 3: Verify the parser on real corpus expressions**

Create `./verify-tmp.mts` in the repo root:

```ts
import { parseExpression, unwrapFieldValue } from './scripts/mse-geometry/parser.ts';

const cases = [
	'29',
	'{ max(30, card_style.casting_cost.content_width) + 5 }',
	'{ if card.card_symbol=="none" then 32 else 50 }',
	'{ (if has_identity() then "52" else "32") - max(22,card_style.rarity.content_width) }',
	'{ 469 + pt_font_vertical() }',
	'{ifside(left:29,right:-29)}',
	'{ if styling.stretch_image_to_whole_card then stylesheet.card_width else 316 }',
];
for (const raw of cases) {
	const src = unwrapFieldValue(raw);
	try {
		console.log(
			'OK  ',
			raw.slice(0, 52),
			'->',
			src === null ? 'script:' : parseExpression(src).type
		);
	} catch (error) {
		console.log('FAIL', raw.slice(0, 52), '->', (error as Error).message);
	}
}
```

Run: `npx tsx ./verify-tmp.mts`
Expected: every line `OK`. Node types should be `number`, `binary`, `if`, `binary`, `binary`, `call`, `if`.

- [ ] **Step 4: Verify parse coverage corpus-wide**

Replace `./verify-tmp.mts`:

```ts
import { globSync } from 'node:fs';
import { readStyleFile, GEOMETRY_FIELDS } from './scripts/mse-geometry/style-file.ts';
import { parseExpression, unwrapFieldValue } from './scripts/mse-geometry/parser.ts';

const base = 'assets/card-templates/card-assets/v/bcdf4190b4bf/full-magic-pack/data';
let parsed = 0;
let failed = 0;
const reasons = new Map<string, number>();
for (const file of globSync(`${base}/*.mse-style/style`)) {
	const style = readStyleFile(file);
	if (!style) continue;
	for (const field of GEOMETRY_FIELDS) {
		for (const raw of Object.values(style.fields[field] ?? {})) {
			const src = unwrapFieldValue(raw as string);
			if (src === null) continue;
			try {
				parseExpression(src);
				parsed += 1;
			} catch (error) {
				failed += 1;
				const message = (error as Error).message.replace(/\d+/g, 'N');
				reasons.set(message, (reasons.get(message) ?? 0) + 1);
			}
		}
	}
}
console.log(
	`parsés ${parsed}, échecs ${failed} (${((100 * parsed) / (parsed + failed)).toFixed(1)}%)`
);
console.log([...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8));
```

Run: `npx tsx ./verify-tmp.mts && rm -f ./verify-tmp.mts`

Expected: **at least 99% parsed.** The parser only needs to build an AST — unknown _functions_ are an evaluation concern, not a parse error. If parse failures exceed 1%, read the top reasons and extend the grammar before continuing; do not proceed with a parser that cannot read the corpus.

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit
npx eslint scripts/mse-geometry
npx prettier --write scripts/mse-geometry
git add scripts/mse-geometry/lexer.ts scripts/mse-geometry/parser.ts
git commit -m "feat(mse): tokenise and parse style geometry expressions"
```

---

### Task 3: Scope and evaluator (tier 0)

Evaluates an AST with **no builtins yet** — arithmetic, comparison, if/else and literals only. Anything else throws `Unresolved`. This establishes the honest baseline the tiers improve on.

**Files:**

- Create: `scripts/mse-geometry/scope.ts`
- Create: `scripts/mse-geometry/evaluate.ts`
- Create: `scripts/mse-geometry/builtins.ts`

**Interfaces:**

- Consumes: `Node` from `./parser`.
- Produces:
  - `class Unresolved extends Error { constructor(public readonly what: string) }`
  - `interface Scope { functions: Map<string, string>; variables: Map<string, number | string | boolean> }`
  - `function buildScope(styleSource: string, gameScript: string): Scope`
  - `type Builtin = (args: Value[], named: Record<string, Value>) => Value`
  - `const BUILTINS: Map<string, Builtin>`
  - `type Value = number | string | boolean`
  - `function evaluate(node: Node, scope: Scope): Value`

- [ ] **Step 1: Write the scope builder**

Create `scripts/mse-geometry/scope.ts`:

```ts
/**
 * Portée de noms pour l'évaluation.
 *
 * 375 des 376 styles définissent leur propre `init script:`, qui MASQUE les
 * définitions partagées de magic.mse-game. La résolution va donc du plus
 * spécifique au plus général : style, puis script de la partie. Sans cet ordre,
 * un style qui redéfinit `art_left` recevrait la géométrie d'un autre.
 */
export interface Scope {
	/** nom -> corps de la définition (source, analysée à la demande). */
	functions: Map<string, string>;
	variables: Map<string, number | string | boolean>;
}

/** Relève les définitions `nom := { corps }` d'une source de script. */
function collectDefinitions(source: string, into: Map<string, string>): void {
	const pattern = /^[\t ]*([a-z_][a-z_0-9]*)\s*:=\s*\{/gim;
	for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
		// Équilibrage des accolades pour capturer un corps multi-ligne.
		let depth = 1;
		let index = match.index + match[0].length;
		while (index < source.length && depth > 0) {
			if (source[index] === '{') depth += 1;
			else if (source[index] === '}') depth -= 1;
			index += 1;
		}
		into.set(match[1], source.slice(match.index + match[0].length, index - 1));
	}
}

/**
 * Variables de contexte : la carte CANONIQUE contre laquelle on fige la
 * géométrie (cf. spec). Le choix est explicite pour rester auditable — une
 * carte sans indicateur de couleur, avec force/endurance et bordure visible.
 */
export const CANONICAL_CARD: Record<string, number | string | boolean> = {
	'card.card_symbol': 'none',
	'card.card_color': 'white',
	'styling.border_visible': true,
	'styling.stretch_image_to_whole_card': false,
	'styling.stretch_art_to_whole_card': false,
	'styling.three_cards': false,
	'styling.image_size': 'normal',
};

export function buildScope(styleSource: string, gameScript: string): Scope {
	const functions = new Map<string, string>();
	// Le script de la partie EN PREMIER : le style écrase ensuite ce qu'il
	// redéfinit, puisque Map.set remplace la valeur existante.
	collectDefinitions(gameScript, functions);
	collectDefinitions(styleSource, functions);
	return { functions, variables: new Map(Object.entries(CANONICAL_CARD)) };
}
```

- [ ] **Step 2: Write the builtins registry (empty at tier 0)**

Create `scripts/mse-geometry/builtins.ts`:

```ts
export type Value = number | string | boolean;
export type Builtin = (args: Value[], named: Record<string, Value>) => Value;

/**
 * Bibliothèque standard MSE, remplie palier par palier (cf. plan, tâches 5-8).
 * Vide au palier 0 : on mesure d'abord ce que l'arithmétique seule résout, pour
 * que chaque fonction ajoutée ensuite se juge au nombre de cadres débloqués.
 */
export const BUILTINS = new Map<string, Builtin>();
```

- [ ] **Step 3: Write the evaluator**

Create `scripts/mse-geometry/evaluate.ts`:

```ts
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
```

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit
npx eslint scripts/mse-geometry
npx prettier --write scripts/mse-geometry
git add scripts/mse-geometry
git commit -m "feat(mse): scope resolution and tier-0 expression evaluator"
```

---

### Task 4: The extractor and its report — the measurement gate

This produces the number every later task is judged by. Build it before adding any builtin.

**Files:**

- Create: `scripts/mse-geometry/extract.ts`
- Modify: `package.json` (add the `mse:geometry` script)

**Interfaces:**

- Consumes: everything from Tasks 1–3.
- Produces:
  - `interface ResolvedBox { left: number; top: number; width: number; height: number }`
  - `interface TemplateGeometry { cardWidth: number; cardHeight: number; boxes: Record<string, ResolvedBox>; ast: Record<string, unknown> }`
  - `interface ExtractionReport { total: number; resolved: number; rejected: Array<{ id: string; field: string; reason: string }>; missingByName: Array<[string, number]> }`
  - `function extractAll(corpusRoot: string): { geometries: Map<string, TemplateGeometry>; report: ExtractionReport }`

- [ ] **Step 1: Write the extractor**

Create `scripts/mse-geometry/extract.ts`:

```ts
import { globSync, readFileSync } from 'node:fs';
import { evaluate, Unresolved } from './evaluate';
import { parseExpression, unwrapFieldValue } from './parser';
import { buildScope } from './scope';
import { GEOMETRY_FIELDS, readStyleFile, type GeometryField } from './style-file';

/** Zones exigées pour qu'un gabarit soit publiable. Voir « aucun fallback ». */
const REQUIRED_FIELDS: GeometryField[] = ['image', 'name', 'type', 'text'];
const BOX_KEYS = ['left', 'top', 'width', 'height'] as const;

export interface ResolvedBox {
	left: number;
	top: number;
	width: number;
	height: number;
}

export interface TemplateGeometry {
	cardWidth: number;
	cardHeight: number;
	boxes: Partial<Record<GeometryField, ResolvedBox>>;
	/** AST conservé pour permettre une évaluation dynamique plus tard. */
	ast: Partial<Record<GeometryField, Record<string, unknown>>>;
}

export interface ExtractionReport {
	total: number;
	resolved: number;
	rejected: Array<{ id: string; field: string; key: string; reason: string }>;
	/** Noms manquants, triés par nombre de gabarits bloqués — la file de travail. */
	missingByName: Array<[string, number]>;
}

export function extractAll(corpusRoot: string): {
	geometries: Map<string, TemplateGeometry>;
	report: ExtractionReport;
} {
	const gameScript = readFileSync(`${corpusRoot}/magic.mse-game/script`, 'utf8');
	const files = globSync(`${corpusRoot}/*.mse-style/style`);
	const geometries = new Map<string, TemplateGeometry>();
	const rejected: ExtractionReport['rejected'] = [];
	const missing = new Map<string, Set<string>>();

	for (const file of files) {
		const style = readStyleFile(file);
		if (!style) continue;
		const scope = buildScope(readFileSync(file, 'utf8'), gameScript);
		const boxes: TemplateGeometry['boxes'] = {};
		const ast: TemplateGeometry['ast'] = {};
		let ok = true;

		for (const field of GEOMETRY_FIELDS) {
			const raw = style.fields[field];
			if (!raw) {
				// Un champ REQUIS absent disqualifie : on ne comble pas.
				if (REQUIRED_FIELDS.includes(field)) {
					rejected.push({ id: style.id, field, key: '*', reason: 'champ absent' });
					ok = false;
				}
				continue;
			}
			const box: Partial<ResolvedBox> = {};
			const fieldAst: Record<string, unknown> = {};
			for (const key of BOX_KEYS) {
				const value = raw[key];
				if (value === undefined) continue;
				const source = unwrapFieldValue(value);
				if (source === null) {
					rejected.push({ id: style.id, field, key, reason: 'bloc script:' });
					if (REQUIRED_FIELDS.includes(field)) ok = false;
					continue;
				}
				try {
					const node = parseExpression(source);
					fieldAst[key] = node;
					box[key] = Number(evaluate(node, scope));
				} catch (error) {
					const reason = error instanceof Unresolved ? error.what : (error as Error).message;
					rejected.push({ id: style.id, field, key, reason });
					if (REQUIRED_FIELDS.includes(field)) ok = false;
					if (error instanceof Unresolved) {
						const set = missing.get(error.what) ?? new Set<string>();
						set.add(style.id);
						missing.set(error.what, set);
					}
				}
			}
			if (BOX_KEYS.every((key) => typeof box[key] === 'number')) {
				boxes[field] = box as ResolvedBox;
				ast[field] = fieldAst;
			} else if (REQUIRED_FIELDS.includes(field)) {
				ok = false;
			}
		}

		if (ok) {
			geometries.set(style.id, {
				cardWidth: style.cardWidth,
				cardHeight: style.cardHeight,
				boxes,
				ast,
			});
		}
	}

	return {
		geometries,
		report: {
			total: files.length,
			resolved: geometries.size,
			rejected,
			missingByName: [...missing.entries()]
				.map(([name, ids]): [string, number] => [name, ids.size])
				.sort((a, b) => b[1] - a[1]),
		},
	};
}

const CORPUS = 'assets/card-templates/card-assets/v/bcdf4190b4bf/full-magic-pack/data';

if (process.argv[1]?.endsWith('extract.ts')) {
	const { report } = extractAll(CORPUS);
	console.log(`gabarits entièrement résolus : ${report.resolved}/${report.total}`);
	console.log(`champs rejetés : ${report.rejected.length}`);
	console.log('\nnoms manquants, par nombre de gabarits bloqués :');
	for (const [name, count] of report.missingByName.slice(0, 25)) {
		console.log(`  ${String(count).padStart(4)}  ${name}`);
	}
}
```

- [ ] **Step 2: Add the npm script**

In `package.json`, beside the other `tsx` scripts:

```json
"mse:geometry": "NODE_ENV=production npx tsx scripts/mse-geometry/extract.ts",
```

- [ ] **Step 3: Record the tier-0 baseline**

Run: `npm run mse:geometry`

Write the reported `résolus` number into the ledger/commit message. **This is the tier-0 baseline.** During design, a targeted evaluator (not this one) reached 211/376 — this tier-0 number will be LOWER, because tier 0 has no builtins at all. That is expected and correct: it is the honest floor.

The `noms manquants` list is the work queue for Tasks 5–8, ordered by how many templates each name unblocks.

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit
npx eslint scripts/mse-geometry
npx prettier --write scripts/mse-geometry package.json
git add scripts/mse-geometry/extract.ts package.json
git commit -m "feat(mse): geometry extractor with per-field rejection report"
```

---

### Task 5: Builtin tier 1 — mechanical functions

**Files:**

- Modify: `scripts/mse-geometry/builtins.ts`

**Interfaces:**

- Consumes: `Builtin`, `Value` from `./builtins`.
- Produces: entries in `BUILTINS` for `max`, `min`, `length`, `contains`, `to_int`, `to_number`, `ifside`.

- [ ] **Step 1: Add the tier-1 builtins**

Append to `scripts/mse-geometry/builtins.ts`:

```ts
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
```

- [ ] **Step 2: Measure the gain**

Run: `npm run mse:geometry`

Record the new `résolus` number. It **must be strictly greater** than the tier-0 baseline. If it is not, a builtin is throwing where it should resolve — read the `noms manquants` list before continuing.

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit && npx eslint scripts/mse-geometry && npx prettier --write scripts/mse-geometry
git add scripts/mse-geometry/builtins.ts
git commit -m "feat(mse): tier-1 builtins (<baseline> -> <new> styles resolved)"
```

Put the real before/after numbers in the commit message — the progression is the record of whether this work is paying off.

---

### Task 6: Builtin tier 2 — font metrics AND `content_width`

`*_font_vertical()` derives from the rendered metrics of the TTFs shipped in `full-magic-pack/fonts/` (15 files). `opentype.js` is already a dependency (see `scripts/generate-logo.ts`).

**Scope expanded after Task 5 measured the corpus.** `content_width` is the single
biggest blocker in the whole effort:

| Fact                                           | Measured  |
| ---------------------------------------------- | --------- |
| Styles blocked by `card_style.*.content_width` | **185**   |
| …of which use it inside `max(N, …)`            | 169       |
| …of which use it unguarded                     | 16        |
| `casting_cost` / `rarity` occurrences          | 412 / 219 |

Task 5's tier-1 builtins were implemented correctly but the resolved count stayed at
15/376, because `evaluate.ts:97` evaluates a call's arguments **eagerly**: in
`max(30, card_style.casting_cost.content_width)` the unresolvable operand throws before
`max` ever runs.

`content_width` is the **rendered width of a field's content**. It is measurable rather
than assumable: each field block declares its own `font` (name + size) and, for mana
costs, a `symbol font`. Measuring it — instead of making `max` lazy — keeps the
no-fallback rule intact, because a measured width is a fact rather than an assumption
about the canonical card.

Implement `content_width` for the two fields that matter (`casting_cost` at 412 uses and
`rarity` at 219; `illustrator` at 101 is optional-field-only and may be deferred), reading
the font name and size from the field's own block. Where a field's font cannot be resolved
to a shipped TTF, throw `Unresolved` — do not approximate.

**Files:**

- Create: `scripts/mse-geometry/font-metrics.ts`
- Modify: `scripts/mse-geometry/builtins.ts`

**Interfaces:**

- Consumes: `opentype` (already installed).
- Produces: `function verticalOffset(fontFile: string, size: number): number`; BUILTINS entries for `pt_font_vertical`, `body_font_vertical`, `name_font_vertical`, `type_font_vertical`, `pt2_font_vertical`.

- [ ] **Step 1: Write the metrics module**

Create `scripts/mse-geometry/font-metrics.ts`:

```ts
import { parse } from 'opentype.js';
import { readFileSync } from 'node:fs';

const FONT_ROOT = 'assets/card-templates/card-assets/v/bcdf4190b4bf/full-magic-pack/fonts';
const cache = new Map<string, number>();

/**
 * Décalage vertical d'une police, en unités de carte.
 *
 * MSE positionne le texte sur la ligne de base : l'écart entre le haut de la
 * boîte et cette ligne dépend de l'ascendante de la police RÉELLE, d'où la
 * lecture des TTF plutôt qu'une constante. `opentype.parse` (et non `loadSync`)
 * est déjà la convention du dépôt, cf. scripts/generate-logo.ts.
 */
export function verticalOffset(fontFile: string, size: number): number {
	const key = `${fontFile}:${size}`;
	const cached = cache.get(key);
	if (cached !== undefined) return cached;
	const font = parse(readFileSync(`${FONT_ROOT}/${fontFile}`).buffer as ArrayBuffer);
	const ratio = font.ascender / font.unitsPerEm;
	const offset = size * ratio - size;
	cache.set(key, offset);
	return offset;
}
```

- [ ] **Step 2: Register the tier-2 builtins**

Append to `builtins.ts`:

```ts
import { verticalOffset } from './font-metrics';

/**
 * Palier 2 : métriques de police. MSE dérive ces décalages de la police
 * effectivement rendue ; on lit donc les TTF livrés plutôt que d'approximer.
 * Les tailles proviennent du corpus (mplantin pour le corps, beleren pour le
 * titre et la force/endurance).
 */
BUILTINS.set('pt_font_vertical', () => verticalOffset('beleren-bold_P1.01.ttf', 1));
BUILTINS.set('pt2_font_vertical', () => verticalOffset('beleren-bold_P1.01.ttf', 1));
BUILTINS.set('name_font_vertical', () => verticalOffset('beleren-bold_P1.01.ttf', 1));
BUILTINS.set('type_font_vertical', () => verticalOffset('beleren-bold_P1.01.ttf', 1));
BUILTINS.set('body_font_vertical', () => verticalOffset('mplantin.ttf', 1));
```

- [ ] **Step 3: Measure, verify, commit**

```bash
npm run mse:geometry     # record the new resolved count
npx tsc --noEmit && npx eslint scripts/mse-geometry && npx prettier --write scripts/mse-geometry
git add scripts/mse-geometry
git commit -m "feat(mse): tier-2 font-metric builtins (<before> -> <after> styles)"
```

If the count does not increase, check that `opentype.parse` receives an `ArrayBuffer` — passing a Node `Buffer` directly fails at runtime, which is a known trap recorded in this repo's history.

---

### Task 7: Builtin tier 3 — geometry self-references

`art_left()`, `art_top()`, `art_width()`, `art_height()`, `image_*()`, `text_shape()`, `top_of_textbox()` refer to boxes resolved earlier in the same style.

**Files:**

- Modify: `scripts/mse-geometry/builtins.ts`
- Modify: `scripts/mse-geometry/scope.ts` (carry resolved boxes into scope)
- Modify: `scripts/mse-geometry/extract.ts` (resolve `image` first, publish it into scope)

**Interfaces:**

- Consumes: `ResolvedBox` from `./extract`.
- Produces: `Scope.resolved: Map<string, ResolvedBox>`; BUILTINS entries reading it.

- [ ] **Step 1: Carry resolved boxes in the scope**

In `scope.ts`, extend the interface and `buildScope`:

```ts
export interface Scope {
	functions: Map<string, string>;
	variables: Map<string, number | string | boolean>;
	/**
	 * Zones DÉJÀ résolues du même style. `art_left()` et consorts s'y réfèrent :
	 * l'ordre de résolution compte donc, l'image d'abord (cf. extract.ts).
	 */
	resolved: Map<string, { left: number; top: number; width: number; height: number }>;
}
```

Add `resolved: new Map()` to the returned object.

- [ ] **Step 2: Register the tier-3 builtins**

```ts
/**
 * Palier 3 : renvois d'une zone à l'autre à l'intérieur d'un même style.
 * L'extracteur résout `image` en premier et la publie dans la portée, ce qui
 * rend ces fonctions calculables sans deuxième passe.
 */
function boxAccessor(field: string, key: 'left' | 'top' | 'width' | 'height'): Builtin {
	return (_args, _named) => {
		const box = CURRENT_SCOPE?.resolved.get(field);
		if (!box) throw new TypeError(`zone ${field} non encore résolue`);
		return box[key];
	};
}

export let CURRENT_SCOPE: import('./scope').Scope | null = null;
export function withScope<T>(scope: import('./scope').Scope, run: () => T): T {
	const previous = CURRENT_SCOPE;
	CURRENT_SCOPE = scope;
	try {
		return run();
	} finally {
		CURRENT_SCOPE = previous;
	}
}

BUILTINS.set('art_left', boxAccessor('image', 'left'));
BUILTINS.set('art_top', boxAccessor('image', 'top'));
BUILTINS.set('art_width', boxAccessor('image', 'width'));
BUILTINS.set('art_height', boxAccessor('image', 'height'));
BUILTINS.set('image_left', boxAccessor('image', 'left'));
BUILTINS.set('image_top', boxAccessor('image', 'top'));
BUILTINS.set('image_width', boxAccessor('image', 'width'));
BUILTINS.set('image_height', boxAccessor('image', 'height'));
BUILTINS.set('top_of_textbox', boxAccessor('text', 'top'));
```

- [ ] **Step 3: Resolve `image` first in the extractor**

Two changes in `extract.ts`. First, add the resolution order beside the other constants:

```ts
/**
 * Ordre de résolution, et NON l'ordre de déclaration.
 *
 * `art_left()` et consorts (palier 3) lisent la zone d'image du même style :
 * elle doit donc être résolue avant les champs qui s'y réfèrent, sinon ces
 * fonctions échouent sur un style pourtant complet.
 */
const RESOLUTION_ORDER: GeometryField[] = ['image', 'text', 'name', 'type', 'pt', 'casting cost'];
```

Then, in `extractAll`, iterate that order and publish each resolved box into the scope so later fields can read it. Replace the `for (const field of GEOMETRY_FIELDS)` loop header with:

```ts
		for (const field of RESOLUTION_ORDER) {
```

and, immediately after the existing `boxes[field] = box as ResolvedBox;` line, add:

```ts
// Publiée dans la portée : les champs suivants peuvent s'y référer.
scope.resolved.set(field, box as ResolvedBox);
```

Finally, wrap the per-style field loop so the builtins see this style's scope. Where the loop currently begins, bind it through `withScope`:

```ts
withScope(scope, () => {
	for (const field of RESOLUTION_ORDER) {
		// … corps inchangé …
	}
});
```

Import `withScope` from `./builtins`. The wrapper is what makes `CURRENT_SCOPE` non-null inside `boxAccessor`; without it every tier-3 function throws and the resolved count DROPS instead of rising — which Step 4's measurement will catch.

- [ ] **Step 4: Measure, verify, commit**

```bash
npm run mse:geometry     # record the new resolved count
npx tsc --noEmit && npx eslint scripts/mse-geometry && npx prettier --write scripts/mse-geometry
git add scripts/mse-geometry
git commit -m "feat(mse): tier-3 geometry self-reference builtins (<before> -> <after>)"
```

---

### Task 8: Builtin tier 4 — the long tail

Roughly 120 style-specific predicates (`is_thbland`, `is_mutate`, `use_tall_walker_frame_1`, `leveler_pt_top_offset`, …), each used 1–4 times. Most are **defined in the style's own `init script:`**, so the scope resolution from Task 3 already evaluates them once their own dependencies resolve.

**Files:**

- Modify: `scripts/mse-geometry/builtins.ts`

- [ ] **Step 1: Work the report, highest-impact first**

Run `npm run mse:geometry` and read `noms manquants`. For each name, in descending order of blocked templates:

1. `grep -rn "<name> *:=" <corpus>` — if it is defined in the corpus, the scope resolver should already handle it; a failure means one of ITS dependencies is missing, so work that dependency instead.
2. If it is a genuine MSE primitive with no corpus definition, add it to `BUILTINS` with a French comment stating what it returns for the canonical card and why.
3. Re-run `npm run mse:geometry` and confirm the count rose.

Stop when the remaining names each unblock 0 templates, or when the cost of the next name plainly exceeds its value — record that decision rather than leaving it implicit.

- [ ] **Step 2: Commit each meaningful batch**

```bash
npx tsc --noEmit && npx eslint scripts/mse-geometry && npx prettier --write scripts/mse-geometry
git add scripts/mse-geometry/builtins.ts
git commit -m "feat(mse): tier-4 builtins for <names> (<before> -> <after> styles)"
```

- [ ] **Step 3: Confirm the spec's floor is beaten**

The design measured 211/376 for a targeted evaluator. The final count here **must exceed 211**, or the interpreter has not earned its complexity — report that plainly rather than proceeding.

---

### Task 9: Persist geometry to the catalogue

**Files:**

- Create: `supabase/migrations/<timestamp>_add_card_template_geometry.sql`
- Modify: `scripts/card-assets/upload-templates.ts`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260727120000_add_card_template_geometry.sql`:

```sql
-- Géométrie mesurée du gabarit, extraite du corpus MSE (cf.
-- docs/superpowers/specs/2026-07-26-mse-geometry-extraction-design.md).
--
-- Forme : { cardWidth, cardHeight, boxes: { image|name|type|text|pt|"casting cost":
-- { left, top, width, height } }, ast: { … } }
--
-- NULL signifie « non mesuré » : le studio n'affiche PAS ces gabarits, plutôt
-- que de leur prêter la géométrie d'un autre. L'AST est conservé pour permettre
-- une évaluation dynamique ultérieure sans réextraction.
alter table public.card_templates
  add column if not exists geometry jsonb;

comment on column public.card_templates.geometry is
  'Géométrie mesurée depuis le style MSE ; NULL = non mesuré, gabarit non proposé.';
```

- [ ] **Step 2: Apply and verify the migration**

```bash
npm run sb:migrate
npm run sb:verify
```

Expected: migration applies; the verify script reports no FAIL.

- [ ] **Step 3: Write geometry during upload**

In `scripts/card-assets/upload-templates.ts`, import `extractAll`, run it once before the upsert loop, and set `geometry: geometries.get(<style id>) ?? null` on each row. Match the existing id-derivation the script already uses.

- [ ] **Step 4: Run against local, then verify**

```bash
npm run card-assets
```

Then confirm how many rows carry geometry:

```bash
set -a; . ./.env.local; set +a
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/card_templates?select=id&geometry=not.is.null&render_mode=eq.frame" \
  -H "apikey: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}" -H "Authorization: Bearer ${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
  | python3 -c "import json,sys; print(len(json.load(sys.stdin)), 'gabarits avec géométrie')"
```

Expected: a count matching Task 8's resolved total, intersected with the 200 catalogue frames.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations scripts/card-assets/upload-templates.ts
git commit -m "feat(mse): persist measured geometry on card_templates"
```

---

### Task 10: Render from template geometry

**Files:**

- Create: `src/lib/card-editor/template-geometry.ts`
- Modify: `src/lib/supabase/queries/card-templates.ts` (select the column, extend `CardTemplateRow`)
- Modify: `src/lib/card-editor/mse-assets.ts` (carry geometry onto `MseTemplate`)
- Modify: `src/lib/card-editor/components/CardCanvas/CardCanvas.tsx`

**Interfaces:**

- Produces: `function templateGeometry(template: MseTemplate | undefined): CardGeometry | null`

- [ ] **Step 1: Write the adapter**

Create `src/lib/card-editor/template-geometry.ts`:

```ts
import { getCardLayout } from './layout-registry';
import type { MseTemplate } from './mse-assets';
import type { CardLayoutId } from './types';

/**
 * Convertit la géométrie mesurée (repère du style MSE, ex. 375x523) vers le
 * repère du canvas.
 *
 * Le canvas adopte le ratio NATIF du gabarit plutôt qu'un 744x1039 imposé :
 * 27 cadres du catalogue sont en paysage, et les forcer en portrait étirait
 * l'illustration comme les zones de texte.
 */
const CANVAS_LONG_EDGE = 1039;

export interface CardGeometry {
	width: number;
	height: number;
	art: Box;
	title: Box;
	mana: Box;
	typeLine: Box;
	rules: Box;
	stats: Box;
	footer: Box;
}

interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

export function templateGeometry(template: MseTemplate | undefined): CardGeometry | null {
	const source = template?.geometry;
	if (!source) return null;
	const { cardWidth, cardHeight, boxes } = source;
	if (!boxes.image || !boxes.name || !boxes.type || !boxes.text) return null;

	// Échelle uniforme sur le grand côté : les proportions du gabarit sont
	// préservées, ce qui est tout l'intérêt de lire ses dimensions déclarées.
	const scale = CANVAS_LONG_EDGE / Math.max(cardWidth, cardHeight);
	const to = (box: { left: number; top: number; width: number; height: number }): Box => ({
		x: box.left * scale,
		y: box.top * scale,
		width: box.width * scale,
		height: box.height * scale,
	});

	return {
		width: cardWidth * scale,
		height: cardHeight * scale,
		art: to(boxes.image),
		title: to(boxes.name),
		mana: to(boxes['casting cost'] ?? boxes.name),
		typeLine: to(boxes.type),
		rules: to(boxes.text),
		stats: to(boxes.pt ?? boxes.type),
		footer: to(boxes.text),
	};
}

/** Repli explicite : les gabarits MAISON, qui ont leur géométrie dessinée à la main. */
export function houseGeometry(layoutId: CardLayoutId): CardGeometry {
	return getCardLayout(layoutId).geometry as CardGeometry;
}
```

- [ ] **Step 2: Carry the column through the query and the model**

In `src/lib/supabase/queries/card-templates.ts`, add `geometry` to `CardTemplateRow` (typed `TemplateGeometryRow | null`) and to the explicit column list in `fetchCardTemplates` — the select is an explicit list, so a new column is invisible until named there.

In `src/lib/card-editor/mse-assets.ts`, add `geometry` to `MseTemplate` and map it in `rowToTemplate`.

- [ ] **Step 3: Use it in the canvas — at ALL THREE call sites**

`CardCanvas.tsx` calls `getCardLayout(layoutId)` in **three** places, across **two** components:

| Line (approx.) | Component            | Consequence if missed                         |
| -------------- | -------------------- | --------------------------------------------- |
| 538            | `CardSvg`            | the card renders with house geometry          |
| 795            | `DirectEditingLayer` | click zones drift away from the rendered text |
| 924            | `DirectEditingLayer` | same                                          |

Changing only the first leaves the click targets of the direct-editing overlay sitting where the OLD geometry put them — the text renders correctly but becomes unclickable. Patch all three.

In each, replace the lookup with the shared resolution:

```tsx
// Géométrie MESURÉE du gabarit quand elle existe ; sinon celle du layout
// maison. Ce n'est pas un repli de secours : un gabarit vendor sans
// géométrie n'est pas proposé (cf. spec « aucun fallback »), donc ce cas
// ne concerne que les 8 gabarits maison.
const geometry = templateGeometry(mseTemplate) ?? houseGeometry(layoutId);
```

Note that line 538 currently binds `const layout = getCardLayout(layoutId)` and uses `layout` elsewhere (e.g. `layout.orientation`); keep that binding and add `geometry` beside it rather than deleting it. Line 795 destructures `const { geometry } = getCardLayout(layoutId)` — replace the whole destructuring.

This requires the resolved `MseTemplate` in both components:

1. Add `mseTemplate?: MseTemplate` to `CardCanvasProps`.
2. `DirectEditingLayer` types its props as `Pick<CardCanvasProps, 'face' | 'layoutId' | …>` — add `'mseTemplate'` to that `Pick` list, or the prop is invisible to it however it is passed.
3. Pass it from `CardEditorStudio.tsx`, where `selectedMseTemplate` already exists, on **all three** `<CardCanvas>` instances: the preview (`ref={activeSvg}`, ~line 306) and the two hidden render instances (`ref={frontSvg}` ~319, `ref={backSvg}` ~330). Miss the hidden two and the on-screen card is correct while **exported and saved PNGs keep the old geometry** — a divergence that only shows up after export.

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit
npx eslint src/lib/card-editor "src/app/[locale]/studio" src/lib/supabase/queries
npx prettier --write src/lib/card-editor src/lib/supabase/queries
git add src/lib
git commit -m "feat(studio): render cards from measured template geometry"
```

---

### Task 11: Hide unmeasured frames, and verify

**Files:**

- Modify: `src/lib/card-editor/frame-choices.ts`

- [ ] **Step 1: Filter unmeasured templates out of the picker**

In `buildFrameChoices`, drop vendor templates without geometry:

```ts
// « Aucun fallback » : un gabarit sans géométrie mesurée n'est PAS proposé.
// Mieux vaut une liste plus courte que des cartes dont le texte tombe à
// côté — c'est précisément le défaut que ce chantier corrige.
const measured = templates.filter((template) => template.geometry !== null);
```

Use `measured` in place of `templates` for the vendor half. House entries are unaffected.

- [ ] **Step 2: Verify the counts add up**

Create `./verify-tmp.mts` in the repo root, building `MseTemplate` objects from a live catalogue fetch (as in the earlier verification scripts), and print: total choices, how many have geometry, and the section breakdown. Then delete it.

Expected: the vendor count equals the number of catalogue rows with non-null geometry from Task 9 Step 4. No section should contain a template whose geometry is null.

- [ ] **Step 3: Runtime verification in the browser**

Start the dev server (`npm run dev`; reuse an existing instance if one is running) and open `/fr/studio` → Layout tab.

Check the three faults from the spec are gone:

1. **Art sizing** — select a `token` frame, then a `planeswalker` frame. Their art windows must differ visibly (measured: 363 vs 427.5 in style units, against `arcana`'s 231). Before this work all three were identical.
2. **Text placement** — on any vendor frame, the rules text must sit inside the frame's printed text box, not float over the art.
3. **Landscape** — select one of the 27 landscape frames. The card must render wider than tall, not stretched into portrait.

Also confirm the console logs no `MISSING_MESSAGE`, and that a house layout (Full art) still renders with its hand-built geometry.

**If the browser extension is unavailable**, render both a house and a vendor frame to PNG through the existing export path and inspect the images directly — do not claim visual verification that was not performed.

- [ ] **Step 4: Final gate**

```bash
npm run check
```

Expected: no NEW problems versus the ~60 pre-existing baseline. Compare reported paths against files this plan did not touch.

- [ ] **Step 5: Commit**

```bash
git add src/lib/card-editor/frame-choices.ts
git commit -m "feat(studio): offer only frames with measured geometry"
```

---

## Notes for the implementer

**The report is the product.** `npm run mse:geometry` prints resolved styles and the names blocking the rest, ordered by impact. Every tier task re-runs it and records the delta. If a tier does not move the number, that tier is wrong — investigate rather than continuing.

**Never substitute a value.** When a field will not resolve, the style is rejected and listed. Borrowing a neighbouring style's number, or a layout default, reintroduces exactly the fault this work removes.

**Order matters in Task 7.** `art_left()` and friends read boxes resolved earlier in the same style, so `image` must resolve before fields that reference it.

**The 8 house layouts are not a fallback.** They are the geometry for the 8 house entries, and no vendor frame borrows them.
