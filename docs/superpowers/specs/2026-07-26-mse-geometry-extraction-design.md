# Studio — real card geometry extracted from the MSE style corpus

**Date**: 2026-07-26
**Status**: Design approved, ready for planning

## Context and goal

The studio ships 206 renderable vendor frames but only **8 hand-built geometries**. There is
no mapping between them, so 200 frames render with coordinates that were never measured for
them. Three user-visible faults follow, all reported from the browser and all reproduced
against the live catalogue:

1. **Text lands in the wrong place.** Only 6 of 206 templates carry a `layout_id`; the other
   200 fall back to a guess derived from `kind`, so every MSE frame gets generic `arcana`
   coordinates regardless of where its actual boxes are.
2. **Art is mis-sized.** 27 frames are landscape images (`523×375`, `1046×750`) rendered
   into a 744×1039 portrait geometry, stretching the art window and every text box. 5 of
   those are typed `planeswalker`, so they are forced into portrait planeswalker geometry
   while the image itself is horizontal.
3. **Special layouts wear normal-card geometry.** 11 frames — 7 `double-faced`, 2
   `packaging`, 1 `split`, 1 `oversized` — fall through `layoutForTemplate` (which only maps
   `token`, `planeswalker`, `saga`) to `arcana`.

Measured, the discrepancy is not subtle:

| Style                    | Art window height | vs `arcana` (459) |
| ------------------------ | ----------------- | ----------------- |
| `magic-m15`              | 231 → 459 scaled  | baseline          |
| `magic-m15-token`        | 363               | **+57%**          |
| `magic-m15-planeswalker` | 427.5             | **+85%**          |
| `magic-m15-aftermath`    | 117               | **−49%**          |

All four render today with the same 630×459 art window.

**Goal**: give every shipped frame its own measured geometry, extracted from the MSE style
corpus already in the repository — no guessing, no fallback.

## The key finding

The exact geometry already exists on disk. Each of the 376 `.mse-style` packages under
`assets/card-templates/card-assets/v/bcdf4190b4bf/full-magic-pack/data/` contains a `style`
file declaring `card width`/`card height` and a `card style:` block with the real boxes:

```
card width: 375
card height: 523
card style:
	image:
		left: 29
		top: 60
		width: 316
		height: 231
	text:
		left: 29
		top: 327
		width: 314
		height: 154
```

**All 200 catalogue frames match a style package** (verified, 200/200).

**The extraction reproduces known-good geometry.** Normalising M15's boxes to the 744×1039
canvas yields `left 58, top 119, width 627, height 459` against the hand-built `arcana`
values of `x 57, y 119, width 630, height 459` — a 1–3px agreement. The existing layout was
effectively a manual transcription of this same data, which is both a validation of the
pipeline and the explanation for why M15-family frames look right today while the rest do not.

## Scope decisions (settled during brainstorming)

| Question                       | Decision                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------- |
| Fallback for unresolved fields | **None.** A frame ships only if every field it needs resolves.                   |
| Verification                   | **Per field, per style** — mechanical gate in the extractor.                     |
| Expression handling            | **Full MSE interpreter**, targeting all 376 styles.                              |
| Static vs dynamic geometry     | **Static now, AST retained** so dynamic is possible later without re-extraction. |

### Why no fallback

A frame with a wrong-but-plausible geometry is worse than an absent frame: it renders a card
that looks broken and the user cannot tell why. Excluding unresolvable frames inverts the
current situation — instead of 206 frames of which 200 are wrong, the picker offers N frames
that are all correct, and N grows as the interpreter covers more of the corpus.

### Why static geometry, with the AST kept

Some MSE functions depend on card **content**, not the template: `has_identity()` asks
whether this card has a colour indicator, `pt_font_vertical()` depends on rendered font
metrics, `text_shape()` on the rules text. Evaluating them per keystroke would require the
interpreter and font-metric emulation to run in the browser.

All three reported faults are per-**template**, not per-card, so static geometry fixes them
completely. Dynamic evaluation would only refine edge cases (a colour indicator shifting the
type line ~20px). Storing the parsed AST alongside the resolved numbers means a later move to
dynamic evaluation needs no re-extraction, and keeps the interpreter server-side where it
cannot affect typing latency.

## The interpreter

This is the bulk of the work. Scope, measured across the corpus:

| Input                                            | Size          |
| ------------------------------------------------ | ------------- |
| Shared script (`magic.mse-game/script`)          | 6,075 lines   |
| `.mse-include` packages                          | 32 (13.5 MB)  |
| Styles with their own `init script:`             | **375 / 376** |
| Distinct functions referenced in geometry fields | **131**       |
| `if/then/else` occurrences                       | 958           |
| Multi-line `script:` blocks                      | 18            |

Function definitions are on disk (`has_identity := { has_identity_general(face:1) }` in
`magic.mse-game/script`), so the corpus is self-contained — nothing needs reverse-engineering
from behaviour.

**Scope resolution is the structural requirement**: 375 of 376 styles define their own
`init script:`, which shadows the shared definitions. The interpreter must resolve a name
against per-style scope first, then the includes, then the game script.

Frequency is heavily skewed — a useful implementation order:

| Tier | Functions                                                                                                         | Nature                       |
| ---- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 1    | `max`, `min`, `has_identity`, `chop_top`, `ifside`, `contains`                                                    | mechanical                   |
| 2    | `pt_font_vertical`, `body_font_vertical`, `name_font_vertical`, `type_font_vertical`                              | font metrics                 |
| 3    | `art_left/top/width/height`, `image_*`, `text_shape`                                                              | resolved geometry references |
| 4    | ~120 style-specific predicates (`is_thbland`, `is_mutate`, `use_tall_walker_frame_1`, `leveler_pt_top_offset`, …) | 1–4 uses each                |

Baseline for comparison — a targeted evaluator without a real interpreter reaches **92.8% of
fields and 211/376 fully-resolved styles**. The interpreter's job is to close the remaining
gap; that 211 is the floor the work must beat, and a useful progress metric.

**Content-dependent functions are evaluated against a canonical card** (no colour indicator,
power/toughness present, ordinary rules text, border visible). This choice is recorded per
extraction so the assumption is auditable.

## Output

The extractor writes, per template:

- `card_width`, `card_height` — the style's own declared dimensions;
- resolved boxes for `image`, `name`, `type`, `text`, `pt`, `casting cost`, normalised to the
  canvas;
- the parsed **AST** for each field, retained for later dynamic evaluation;
- a per-field resolution status.

It emits a report listing every rejected style with the exact field and expression that
failed, so the excluded set is auditable and shrinkable rather than a silent gap.

## Rendering

`CardCanvas` reads geometry from the template. The 8 hand-built layouts remain, unchanged, as
the house entries — they are a legitimate product offering, not a fallback, and no vendor
frame borrows their coordinates.

For fault 2, the canvas adopts each template's **native aspect ratio** from its declared
`card width`/`card height`, instead of assuming 744×1039. This fixes the 27 landscape frames
directly rather than excluding them.

## Risks

**The interpreter is the largest component of this effort** — plausibly larger than the studio
feature built so far. The 131 functions have a long tail: roughly 120 appear 1–4 times, and
the font-metric tier requires emulating MSE's text layout to get right. The staged tiers above
exist so progress is measurable (frames unlocked per function added) rather than
all-or-nothing.

**Font metrics may not reach exact parity.** `pt_font_vertical()` derives from the rendered
metrics of specific TTFs (shipped in `full-magic-pack/fonts/`). Where parity proves
impractical, the affected styles are **rejected, not approximated** — consistent with the
no-fallback rule.

## Success criteria

1. No frame renders with geometry that was not measured for it.
2. Every field of every shipped style resolves to a real number; unresolvable styles are
   excluded and listed in the extraction report.
3. The three reported faults are gone: token/planeswalker/aftermath frames get their own art
   window, and landscape frames render at their native ratio.
4. Extracted M15 geometry continues to match the hand-built `arcana` layout within a few px —
   a regression check on the pipeline.
5. Resolved-style count exceeds the 211 baseline, and the report explains every exclusion.
6. `npm run check` reports no new problems, per the repo's RED-baseline convention.
