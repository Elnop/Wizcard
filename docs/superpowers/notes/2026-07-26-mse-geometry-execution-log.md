# SDD ledger — plan: docs/superpowers/plans/2026-07-26-mse-geometry-extraction.md

Task 1: complete (commits 23de3ed7..77369d31, review clean)
Task 1: minor (deferred): BOX_KEYS no-unused-vars warning — intrinsic to brief code, type-position only
Task 2: complete (commits 77369d31..d865e44e, review clean)

- plan bug found+fixed: '.' missing from lexer PUNCT (commit 456cfa34)
- corpus parse coverage 99.4% (6249/6286), gate was 99%
  Task 2: minor (deferred): report's explanation of the .0 residue case is inaccurate (docs only, code correct)
  Task 3: complete (commits 456cfa34..5481077c, review clean)
  Task 4: BASELINE tier-0 = 15/376 styles, 1432 rejected fields.
  Work queue (top): content_width x306 (casting_cost 189 + rarity 117), "appel non nommé" 23,
  then styling.* flags (shrink_name_text 19, border 18, ...), stylesheet.card_width 14.
  KEY: 473/644 content_width uses are inside max(N, ...) -> tier-1 max() resolves them
  under the canonical card without measuring glyphs. Confirms the tier ordering.
  NOTE: "appel non nommé" (23) is an evaluate.ts limitation (non-identifier callee),
  not a missing builtin — may need an evaluator change in tier 3/4.
  Task 4: complete (commits 5481077c..e85249b1, review clean)
  Task 5: complete (commits e85249b1..c86bedab). Tier-1 builtins correct, but count stayed 15/376.
  Rejections fell 1432 -> 1388 (builtins DO fire); styling.side cleared.
  Root cause of the flat count: evaluate.ts:97 evaluates args EAGERLY, so
  max(30, content_width) throws before max() runs. Plan defect, not implementer error —
  the implementer diagnosed it correctly and refused to change semantics silently.
  MEASURED: 178/194 required-field content_width uses are inside max(N, ...);
  only 16 styles use it unguarded => 169 styles hinge on this one issue.
  USER DECISION: implement content_width by real font measurement (not lazy max).
  Fonts + sizes are declared per field in the style (e.g. casting cost: MPlantin 15,
  symbol font magic-mana-large 15), so it is measurable.
  => Task 6 scope EXPANDED: font metrics AND content_width.
  Task 6: complete (commits a01b7351..628c38c3). 15/376 -> 30/376, rejections 1388 -> 1023.
  Built font-metrics.ts (TTF advance widths via opentype.parse(Buffer) — kept the repo's
  proven convention over the brief's .buffer cast) + mana-symbol widths from
  .mse-symbol-font PNG packages. content_width injected as a scope VARIABLE (member node),
  which sidesteps evaluate.ts's eager-arg problem without touching the evaluator.
  Canonical content: casting_cost = {1}{W}; rarity has no font in the corpus (image-rendered)
  so it reuses the field's own declared width (verified non-circular across all 376).
  UNDER TARGET (~185 expected) because the real ceiling is elsewhere — see below.
  Task 6: FINDING (structural, verified by me): 255/376 styles (67%) pull field definitions
  via `include file:` inside card style:, which readStyleFile never follows. 144 styles are
  therefore missing >=1 REQUIRED field entirely (55 missing 1, 74 missing 2, 14 missing 3,
  1 missing 4). Include targets DO exist on disk and DO contain geometry fields.
  USER DECISION: resolve includes before continuing tiers => new Task 6b.
  Task 6: review clean (spec OK, quality approved). 2 minors deferred:
- font-metrics.ts textWidth() is currently dead code (kept as a primitive for later tiers)
- malformed regex `code:` entries in symbol fonts are skipped silently (shrinks the search
  space only; an unmatched code still throws Unresolved downstream — not a fallback)
  Task 6b: complete (commit 6ead582f). Includes now resolved (recursive, cycle-guarded, own-wins).
  Styles missing a required field: 144 -> 90. Headline count unchanged at 30/376.
  Rejected fields rose 1023 -> 1433: newly-visible inherited fields now REACH the parser/evaluator
  and fail there, which is progress made visible, not a regression.
  Task 6b: ROOT-CAUSE FOUND (by me, after the task). The top blocker "entrée résiduelle à 6"
  (133 styles on required fields) is NOT a builtin gap and NOT a parse-grammar gap in the
  field expressions themselves. It is that MSE function bodies can be MULTI-STATEMENT:
  has_identity_general := {
  tag := if face == 1 then "" else "_" + face <- local assignment
  indicator_field := card["indicator"+tag]
  if culled_indicator == "" then false else ... <- final expression
  }
  parseExpression only handles ONE expression, so it parses `tag` then chokes on `:=` (pos 6).
  MEASURED: 227 of 1098 shared-script definitions (20%) have multi-statement bodies.
  Supporting them needs: statement sequences, local variable scope, and `for ... do` (109 uses).
  This is a language feature, not a builtin tier => decision needed before Tasks 7/8.
  Task 6c: complete (commit c9d6dc50). Multi-statement bodies implemented and VERIFIED correct
  (has_identity_general now parses; residual parse errors 86 -> 27). Count still 30/376.
  Also fixed 2 pre-existing lexer bugs surfaced by this work (';' had no token; `split.0`
  mis-lexed as a decimal literal).
  Predicted +58 did not materialise: curing the parse error exposes the NEXT failure in the
  same call chains — named call arguments are not bound. evaluate.ts:185 passes `named` to
  BUILTINS only; a corpus-defined function's body is evaluated without them, so
  has_identity_general(face:1) runs with `face` unbound. Blocks 135 styles.
  MEASURED next ceiling: fixing arg binding => 63/376 (33 blocked only by `face`, 101 mixed).
  Task 6d: complete (commit 3398a3db). Argument binding implemented: @(name: default) suffix
  parsing (250 in shared script), defaults -> named overrides -> lone positional bound to
  the implicit `input` (405 uses). Agent was cut off by a session limit at its commit step;
  I verified the staged work (tsc clean, eslint clean bar the known BOX_KEYS warning,
  extractor coherent) and committed it myself.
  Count unchanged 30/376, BUT `face` (was 135, the top blocker) is gone entirely.
  New top blocker: `card` (73) — the card-data object itself, i.e. content, not geometry.
  Task 6e: complete (commits 6fec8350, 571418d7). 30 -> 32/376.
  Computed indexing card["indicator"+tag] now resolves to a dotted path with a PRECISE
  Unresolved name; also fixed `+` to do string concatenation (MSE overloads it).
  18 CANONICAL_CARD fields added, all documented. `card` (73) fully cleared.
  Count barely moved because cull_directions() sits immediately behind it in the SAME chains.
  STATE after 8 interpreter tasks: 32/376 resolved, 267 rejected.
  Remaining shape: 125 styles have exactly ONE blocking reason left.
  55 champ absent (44 magic-\*, 7 planechase, 4 vanguard — the latter 11 are non-card
  game types that legitimately have no type line / no P/T)
  35 cull_directions() (one missing string builtin: replace/filter_text + ident@() currying)
  35 long tail, 1-4 styles each
  Theoretical ceiling if every single-reason blocker were fixed: 157/376.
  Task 6f: complete (commits 57b7002a, 3ab7ac4b). 32 -> 32/376, rejected 1428 -> 1277.
  cull_directions/cull_noncolors (73 styles, top blocker) fully eliminated.
  Bigger root cause found: `name := replace@(...)` is a BRACE-LESS definition, a shape
  collectDefinitions never captured — 1280 such definitions were invisible in the shared script.
  Implemented: brace-less defs, `curry` node for ident@(named:...), `replace` (global regex),
  fixed `contains` (haystack/needle were reversed). Also fixed a real recursion-guard gap
  (curry-to-curry hand-offs skipped the depth increment).
  MEASURED after 6f: Task 7 (art\__/image\__ self-refs) would unlock ZERO styles on its own —
  no style is blocked solely by them. They always co-occur with other blockers.
  Remaining single-blocker styles: 56 "champ absent", 13 rarity.content_width, 11 "appel non
  nommé", then a tail of 2-4. Ceiling if ALL single-reason blockers were fixed: ~130/376.
  Task 6g: complete (commits 50f70e94, 1be6aeb2). 32 -> 34/376; rejected STYLES 267 -> 226.
  Two real reader bugs fixed: (1) `rule text:` / `rule_text:` is an alias for `text:` (38 files);
  (2) a column-0 `#####` comment inside card style: terminated the block early (magic-m15-saga
  captured 0 fields). "champ absent" as sole blocker: 52 -> 29.
  Correctly did NOT touch magic-urban/magic-scroll (type line painted into the art) nor
  planechase-_/vanguard-_ (non-card game types) — those stay rejected, which is the rule working.
  Known third defect, out of scope: magic-baseball-1980-topps has 8 `card style:` headers in one
  file; only the first is read.
  Task 6h: complete (commits 8154eb1f, 655dd0f7). 34 -> 34/376; rejected FIELDS 1290 -> 809 (-37%).
  My brief's premise was stale (rarity was already captured since 6g). The agent followed the
  real failure chain instead and fixed 4 deeper bugs: rarityContentWidth never unwrapped the raw
  value; `or else` (MSE's own fallback operator, 139 uses) unimplemented; no record/array runtime
  values for faces_coordinates(); and/or not short-circuited. Added split_text() (was the #1
  blocker at 56 styles) and wired stylesheet.card_width/height.
  KEY VALIDATION: magic-m15 now COMPUTES every field with zero rejections, and its image box
  scales to left 57.5, top 119.2, width 626.9, height 458.9 — within 0.9px of the hand-built
  arcana reference (58/119/627/459). The pipeline is provably correct.
  It still does not SHIP because its `name` field uses `right:` instead of `width:`.
  NEXT (measured): BOX_KEYS captures only left/top/width/height. 341 styles use `right:` and
  162 use `bottom:` — silently dropped. This is the largest remaining structural gap.
  Task 6i: complete (commit f46b8fa3). 34 -> 140/376. IMPLEMENTED BY ME (the dispatched agent was
  cut off by a session limit after 4 tool calls; nothing was lost).
  right/bottom are absolute edge coords; boxes are completed per axis from whichever pair exists.
  THE REAL BUG was a divergence: the property regex hardcoded (left|top|width|height), so adding
  the keys to BOX_KEYS changed nothing. The regex is now DERIVED from BOX_KEYS.
  Added an isPlausibleBox gate: 4 styles produced boxes outside the card / with non-positive area;
  they are rejected rather than published. 0 implausible boxes across the 140 published.
  VALIDATION: magic-m15 ships, image box scales to 57.6/119.2/627.8/458.9 vs the 58/119/627/459
  hand-built reference (~1px).
  MILESTONE after 6i: 140/376 styles measured => 109 of the 206 CATALOGUE frames have real
  geometry (+ 8 house layouts = 117 correct appearances). Was 6 at the start.
  Task 9: complete (commit 6c80f31b). Migration 20260727120000 adds card_templates.geometry jsonb;
  uploader joins extractAll() output by id. Partial work survived the previous agent's network
  death (migration + uploader edit); I verified and finished it.
  Local: sb:verify 416 passed / 0 failed; 109/206 frames carry geometry; magic-m15's stored
  text box is 29/327/314/154, identical to its style file.
  SAFETY NOTE: the uploader resolves its target via .env.seed, loaded with override:true, which
  points at PRODUCTION (supabase.wizcard.xyz). An exported SUPABASE_URL cannot redirect it —
  verified by dry-run. The local populate used a separate throwaway script. Running
  `npm run card-assets` as-is WOULD WRITE TO PROD.
  Task 10: complete (commits 00544ab6, ff2dab4a). Canvas renders from measured geometry.
  All 3 getCardLayout call sites patched + all 3 CardCanvas instances pass mseTemplate
  (preview + the two hidden export/save refs) + DirectEditingLayer's Pick list extended.
  Landscape frames now scale at their native ratio.
  I fixed a real bug the agent flagged rather than shipping it: stats fell back to boxes.type,
  and showStats only checks width > 0, so the P/T panel would have been painted over the type
  line on the 48 measured templates with no `pt` zone. Unmeasured stats => zero-width box.
  `mana` keeps its name-box fallback (anchor, not a painted panel) — documented in code.
  Task 11: complete (commit 6b329c21). 117 entries listed (109 measured vendor + 8 house), 0 unmeasured leak through. npm run check: 60 problems, all pre-existing, none in this effort's files.
