# mse-geometry

Extracts real card-frame geometry from the Magic Set Editor style corpus so the studio
renders each vendor frame with coordinates measured for **that** frame.

```bash
npm run mse:geometry
```

Prints how many styles fully resolve, plus a list of the names blocking the rest, ranked
by how many styles each would unblock. **That report is the work queue** — it is how you
decide what to implement next, and how you tell whether a change actually helped.

Read `docs/card-studio.md` § "Geometry" for the why. This file is the how.

## The corpus

`assets/card-templates/card-assets/v/bcdf4190b4bf/full-magic-pack/data` (gitignored,
present locally). 376 `.mse-style` packages, each with a `style` file:

```
card width: 375
card height: 523
card style:
	image:
		left: 29
		top: 60
		width: 316
		height: 231
	name:
		left: { if card.card_symbol == "none" then 32 else 50 }
		top: 30
		right: { 341 - card_style.casting_cost.content_width }
		height: 23
```

Values are frequently **expressions**, not literals — which is why this is an
interpreter rather than a parser.

## Pipeline

```
style-file.ts   read dimensions + field boxes, resolve `include file:`, apply aliases
      ↓
lexer.ts        tokenise
parser.ts       → AST (Pratt parser)
      ↓
scope.ts        name resolution + the canonical card
evaluate.ts     walk the AST; throw Unresolved(name) rather than guess
builtins.ts     MSE standard library
font-metrics.ts TTF advance widths, mana-symbol widths from PNG symbol fonts
      ↓
extract.ts      orchestrate, gate, report
```

## The rule

**No fallback.** When a value cannot be computed with certainty, throw `Unresolved`
carrying the precise missing name. Never substitute a default, a zero, or a neighbouring
style's value. A style that cannot be fully measured is rejected and listed in the
report.

Declared parameter defaults (`@(face:1)`) are _not_ fallbacks — they are the corpus's own
stated values.

## Things that bit us

Each of these was a real bug, and each is easy to reintroduce.

- **`BOX_KEYS` and the property regex must not diverge.** The regex is derived from the
  constant for exactly this reason. Adding `right`/`bottom` to the constant alone did
  nothing for an entire session, because the regex still refused to match them — that
  divergence was hiding 106 styles.
- **A comment at column 0 terminates the `card style:` block** unless explicitly skipped.
  MSE writes `##### Background stuff` unindented, which silently truncated one style to
  zero fields.
- **`rule text:` is an alias for `text:`** (38 files). `rule_text` too. But `text 2`,
  `urban type` and friends are _different boxes_, not synonyms.
- **Function bodies are multi-statement**: local `:=` assignments then a result. 20% of
  the shared script's definitions.
- **Call arguments must be bound into the callee's frame.** Passing them only to builtins
  leaves corpus-defined functions evaluating with unbound names.
- **`+` is overloaded** — string concatenation as well as arithmetic.
- **`or else` is MSE's own fallback operator** (139 uses), not ours.
- **Definitions can be brace-less**: `cull_directions := replace@(match:…)`. 1280 of them
  were invisible until this was handled.
- **`opentype.parse(buffer)`**, not `.buffer as ArrayBuffer` and not `loadSync` — matches
  `scripts/generate-logo.ts`, which is the working precedent in this repo.

## Raising the coverage

1. `npm run mse:geometry`, read the top of the ranked list.
2. `grep -rn "<name> *:=" <corpus>` — if the corpus defines it, the scope resolver should
   already handle it, so the failure is one of _its_ dependencies. Work that instead.
3. If it is a genuine MSE primitive, add it to `builtins.ts` with a French comment saying
   what it returns for the canonical card and why.
4. Re-run and confirm the count rose. **If it did not, the change was wrong** — do not
   keep it because it "seems right".

Expect diminishing returns. The last four passes each fully eliminated their target
blocker and moved the headline count by 0–2, because styles carry chains of blockers:
removing one exposes the next.
