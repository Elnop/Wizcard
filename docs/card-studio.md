# Card Studio

The custom-card editor at `/[locale]/studio`. Lets a signed-in user compose a card
(name, mana cost, type line, rules, artwork), pick an appearance, and export or save it.

State as of 2026-07-27, branch `feat/custom-card-studio`.

## Where things live

| Path                                         | Role                                                      |
| -------------------------------------------- | --------------------------------------------------------- |
| `src/app/[locale]/studio/`                   | Page shell, sidebar, toolbar, template picker             |
| `src/lib/card-editor/`                       | Draft model, frame list, SVG canvas, geometry adapter     |
| `src/lib/card-editor/components/CardCanvas/` | The SVG renderer and the direct-editing overlay           |
| `scripts/mse-geometry/`                      | Build-time geometry extractor (see below)                 |
| `scripts/card-assets/upload-templates.ts`    | Uploads frame assets + catalogue rows                     |
| `supabase/migrations/20260726120000_*`       | `custom_cards` editor columns, art bucket, 500-card quota |
| `supabase/migrations/20260726130000_*`       | `card_templates` catalogue + public bucket                |
| `supabase/migrations/20260727120000_*`       | `card_templates.geometry`                                 |

## The appearance model

The studio renders **vendor frames only**. Every appearance it offers is a frame whose
geometry was measured from the MSE corpus; nothing is drawn by hand.

A card's look is two fields on the draft, and they must always agree:

- `mseTemplateId` — the frame that is painted, **and the source of the geometry**.
- `layoutId` — the frame's _family_ (token, planeswalker, saga…). It is persisted and
  still discriminates behaviour, but it no longer positions anything.

**One selector writes both fields in a single action** (`EditorSidebar` →
`onDraftChange({ mseTemplateId, layoutId })`). This is load-bearing: the studio
previously had two selectors that overwrote each other, so picking a frame silently
destroyed a layout choice.

### The house templates were removed

The studio used to ship 8 hand-drawn SVG layouts alongside the vendor frames, behind a
`HOUSE_FRAME_TEMPLATE_ID` (`'wizcard:house'`) sentinel. They are gone, along with the
sentinel, `FrameSurface`, `CardOrnaments` and the `PALETTES` table.

They were removed because they did not read as Magic cards: floating rounded panels over
a diagonal gradient and a hatched texture, sitting in the same grid as measured frames
that look like the real thing. Since the geometry work put correct frames next to them,
the gap was the first thing a user saw.

Consequences worth knowing:

- `CARD_LAYOUTS` is now a **lookup table, not a catalogue**. Its rectangles paint
  nothing. `frame-choices.ts` never reads it for display.
- `frameStyle` (the 7 palette swatches) is **still live** — it picks which colour
  variant of the vendor PNG is loaded (`resolveMseFramePath`), so it was kept.
- The **licence question is now blocking**. With no house renderer, there is no path
  that renders a card without third-party frame assets.

### `DEFAULT_FRAME_TEMPLATE_ID` must be a measured frame

It is `magic-m15`, the corpus reference (all six boxes measured, and the style the
extractor is validated against).

It was `cardconjurer-m15-regular`, which is a **pre-existing bug** this work exposed:
that frame renders but has **no** measured geometry — no `cardconjurer`-prefixed id does,
since the extractor keys on MSE style ids. It was therefore already hidden from the
picker while still being handed to every new draft. With house rendering gone it would
also have made the self-healing effect loop forever, since the effect rejects exactly
what it was inserting.

### Traps in this area

- **The self-healing effect** (`CardEditorStudio.tsx`) rewrites any draft whose template
  is not a renderable, _measured_ frame. It used to return early on the house sentinel;
  it must now **recover** it, since that sentinel paints nothing. This is what migrates
  autosaved drafts written before the removal.
- **`CardCanvas` has three instances**: the on-screen preview plus two hidden ones used
  for PNG export and saving. A prop added to only the preview makes exported images
  diverge from what the user sees.
- **Geometry is resolved at three sites** (`CardSvg`, `DirectEditingLayer`,
  `CardCanvas`). All three must agree, and the first two **return `null` together** when
  a frame is unmeasured — patch only the renderer and the overlay's click targets drift
  away from the rendered text.
- **Text capacity follows the template, not the layout.** `getRulesCapacity` reads
  `templateGeometry(...)`; reading `getCardLayout(layoutId)` made the counter quote a
  removed house layout. The re-clamp on appearance change keys on `mseTemplateId` for the
  same reason — two frames can share a `layoutId` with very different text boxes.

## Typography: measured, never guessed

The same rule as geometry, applied to type. The canvas used to hardcode `Georgia` for
the title, type line, P/T and rules, and `Arial` for the footer — **none of which appear
anywhere in the corpus** for those fields. Sizes were literals too (`25` for the type
line, `32` for P/T).

The corpus declares a font per field, and the styles fall into two eras:

| Field       | Modern (M15)   | Older                     | Body                                        |
| ----------- | -------------- | ------------------------- | ------------------------------------------- |
| name / type | `Beleren Bold` | `Matrix`, `MagicMedieval` | —                                           |
| pt          | `Beleren Bold` | `ModMatrix`               | —                                           |
| text        | —              | —                         | `MPlantin` (+ `MPlantin-Italic` for flavor) |

Matrix-era frames **outnumber** Beleren-era ones, so a single hardcoded pair was wrong
for the majority of the library.

### Sizes are in style units, not pixels

This is what made the old literals look almost-right. The corpus declares sizes in the
style's own frame (e.g. 375×523), so they go through the **same `scale`** as the boxes:

```
magic-m15 type line: 13 × (1039/523) ≈ 25.8   <- the hardcoded 25
magic-new type line: 14 × (1039/523) ≈ 27.8
magic-old type line: 12 × (1039/523) ≈ 23.8
```

`25` was the M15 value frozen in place. Across the corpus, declared sizes span 6.93 to 32.

### Script-driven fonts

~180 declarations are expressions (`{ name_font() }`, `{ body_font() }`, `{ pt_font() }`)
rather than literals. They resolve through the game script to `swap_fonts_*_default`,
since the canonical card overrides no `styling.custom_*_font`:

```
name → Beleren Bold 16    type → Beleren Bold 13
text → MPlantin 13        pt   → Beleren Bold 16
```

### No-fallback, with one difference

A font that does not resolve is **omitted**, and the field keeps the canvas's generic
stack. Unlike a missing box, a missing font does **not** disqualify the frame: its
geometry is still correct, so removing it from the library would cost more than it buys.

Coverage on the 140 measured templates: type 136, text 134, name 127, pt 76 (the 48
templates with no measured `pt` box have no P/T font either — `showStats` already hides
them).

The footer keeps `Arial` deliberately: MSE splits that line across fields the extractor
does not measure (`illustrator`, `copyright line`, `card number`), the same reason
`FOOTER_BOTTOM_OFFSET` is derived. Lending it the title's font would be a borrow.

### Placement: anchored, not offset

Same story as the fonts, one layer down. The canvas positioned text with constants —
`box + 39` for the title, `box + 36` for the type line, `box.x + 18/16/24` horizontally —
calibrated by eye against M15.

**125 of 136 measured frames overflowed their type box**, by up to 17.6px, always
downward. That is the signature of a fixed baseline that ignores box height and font
size: it cannot stay aligned once the font size varies per frame.

MSE does not offset text, it **anchors** it, and declares how:

```
alignment: top shrink-overflow      padding top: 2
```

Corpus counts per field: `name` bottom 219, `pt` middle 243, `type` top 187 / middle 58.
Two frames of the same era can differ — `magic-m15` anchors its type line `top`, while
`magic-old` anchors it `middle`.

The baseline is derived from the box, the declared anchor, the declared padding, and the
font's **real ascender**, read from the TTF (`fontRatios`). Those ratios vary too much for
a constant to work: Beleren 0.936, MPlantin 0.774, MagicMedieval 0.746.

```
top    → box.top + padding.top + size × ascent
bottom → box.bottom − padding.bottom − size × descent
middle → box.top + (box.h − size×(ascent+descent))/2 + size × ascent
```

After the change, every measured frame fits its box: **title 111/111, type 122/122,
P/T 74/74**, zero overflow.

Two things worth knowing:

- The baseline is computed in `template-geometry.ts`, where the scale factor lives, and
  handed to the canvas ready to paint. The canvas keeps the old constants **only** as the
  no-data fallback — not correct, but exactly what shipped before, so no regression.
- The rules text wrap width is derived from the measured left inset. It used to subtract
  a hardcoded `44` (2 × 24); the corpus declares `padding left: 6`, so keeping 44 would
  have wrapped lines short on narrow-margin frames.

### Where it lives

| Path                                       | Role                                                             |
| ------------------------------------------ | ---------------------------------------------------------------- |
| `scripts/mse-geometry/style-file.ts`       | Parses `font:`, `alignment:`, `padding:` per renderable field    |
| `scripts/mse-geometry/extract.ts`          | Resolves them, emits `geometry.fonts` + `geometry.layout`        |
| `scripts/mse-geometry/font-metrics.ts`     | `fontRatios` — real ascender/descender read from the TTF         |
| `src/lib/card-editor/template-geometry.ts` | Computes the absolute baseline (the scale factor lives here)     |
| `src/lib/card-editor/fonts.ts`             | **MSE font name → CSS family.** The one place licensing switches |
| `src/fonts/mse.ts`                         | Serves the 8 TTFs via `next/font/local`                          |
| `scripts/card-assets/seed-local-fonts.mjs` | Backfills `geometry.fonts` + `layout` **locally**                |

`geometry` is a JSON column, so adding `fonts` needed **no migration**.

⚠ **Licences.** Beleren, Matrix, ModMatrix and MPlantin are proprietary (Wizards).
Serving them as webfonts exposes them to direct download — this widens the existing
"Frame licences" blocker below, and fonts are more identifiable than frames. Switching to
free substitutes means editing the table in `fonts.ts` alone; the pipeline, the database
and the canvas are unaffected.

## Frame labelling

`frame-facets.ts` holds the two judgements the corpus does **not** declare, so both live
in code and change in one commit — no migration, no `card-assets` run.

**Origin** (`OFFICIAL_FAMILIES`, 8 entries) decides the entire library since `ec4425e0`:
99 of the 140 measured templates classify as official, and the picker offers **40** of
them (it also requires `render_mode === 'frame'`). Only one template lacks
`installer_group` — `magic-testprint-8th`, a test print, excluded on its own merits — so
the "no data falls through to custom" caveat is real but affects a single row.

**Family** is the first path segment that is not a game namespace. It used to be
"segment [1]", which assumed the namespace was always present. The corpus writes
`magic/...` lowercase for the 129 Magic templates but capitalises other products
(`Magic Planes/`, `Magic Archenemy/`, `Space/`, `Magic Vanguard/`). The old rule already
returned the right answer for those, so **this fix changes nothing on screen today** — it
matters for a namespace-less path like `m15 style/normal cards`, which previously
resolved to the sub-variant `normal cards` instead of the family. Cheap insurance for the
day community frames reopen.

`GAME_NAMESPACES` is a closed, corpus-verified list. An unknown prefix is treated as a
family, which is the safe direction: inventing a namespace would erase a real family,
while keeping one too many only makes a heading slightly long.

### Headings are localized, frame names are not

Section titles used to render the raw corpus string — `m15 style`, `new style`, mixed
casing, English jargon inside a fully translated UI. The 8 official families now map to
i18n keys (`familyLabelKey` → `cardEditor.mseLibrary.family*`), naming the printing era
rather than the corpus slug:

| Corpus      | FR                            | EN                             |
| ----------- | ----------------------------- | ------------------------------ |
| `m15 style` | Cadres modernes (depuis 2014) | Modern frames (2014-present)   |
| `new style` | Cadres 8e édition (2003-2014) | 8th Edition frames (2003-2014) |
| `old style` | Cadres d'origine (avant 2003) | Original frames (pre-2003)     |

Community families keep the name their author gave them — translating those would be
renaming someone else's work. `familyLabelKey` returns a **literal union**, not `string`:
`next-intl` types its message keys, and casting around that would discard the check that
every key rendered here exists in both locales.

Individual frame labels (`Jinx After M15`, `Sci-Fi for Sync permanents`) are still raw
corpus names. Naming them usefully is editorial work, not extraction — the corpus does
not carry that information.

## Geometry: measured, never guessed

The studio had 8 hand-built layouts but ships ~200 vendor frames. There was no mapping
between them, so nearly every frame rendered with coordinates measured for a different
card. That produced the three faults that motivated this work: art mis-sized, text in
the wrong place, and token/split/planeswalker frames wearing normal-card geometry.

**The real geometry was already on disk.** Every `.mse-style` package in the Full Magic
Pack declares its own `card width`/`card height` and a `card style:` block with the true
boxes. `scripts/mse-geometry/` extracts them.

```bash
npm run mse:geometry     # prints resolved styles + a ranked list of what blocks the rest
```

Current: **140 of 376 styles measured**, covering **109 of the 206 catalogue frames** —
which is exactly what the studio offers, since the house layouts were removed.

### The no-fallback rule

A frame ships only if every required field (`image`, `name`, `type`, `text`) resolves to
a real number. A frame that cannot be fully measured is **not offered** rather than
rendered with borrowed coordinates. A wrong-but-plausible frame is worse than an absent
one: the card looks broken and the user cannot tell why.

Since the house removal this rule decides the **whole** library: nothing renders outside
a measured frame. `CardSvg` and `DirectEditingLayer` return `null` rather than borrow
coordinates, so an unmeasured template yields a blank canvas that the self-healing effect
repairs on the next render.

This rule is enforced in three places, and each was a bug caught during the work:

- the evaluator throws `Unresolved` rather than defaulting;
- `nil` is rejected instead of coerced to `0`;
- boxes landing outside the card are rejected (4 styles produced these).

Two derived values are _not_ fallbacks, and are documented in
`src/lib/card-editor/template-geometry.ts`:

- `mana` falls back to the name box — an anchor, not a painted panel, and the casting
  cost does print on the title line.
- `footer` is derived from the card's bottom edge, because MSE splits that line across
  fields we do not extract.

An unmeasured `pt` zone yields a **zero-width** box, not the type box — `showStats` only
gates on width, so borrowing would paint the P/T panel over the type line (48 templates).

### The extractor

A small interpreter for MSE's scripting language, built because the geometry values are
frequently expressions rather than literals.

| File                     | Role                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `style-file.ts`          | Reads a style: dimensions, field boxes, `include file:` resolution, field aliases          |
| `lexer.ts` / `parser.ts` | Tokenise and parse expressions into an AST                                                 |
| `scope.ts`               | Name resolution (style `init script:` shadows the shared game script) + the canonical card |
| `evaluate.ts`            | Walks the AST; throws `Unresolved` with the precise missing name                           |
| `builtins.ts`            | MSE standard library (`max`, `replace`, font metrics, geometry self-refs…)                 |
| `font-metrics.ts`        | TTF advance widths + mana-symbol widths from PNG symbol fonts                              |
| `extract.ts`             | Orchestrator + the ranked blocking report                                                  |

Values are evaluated against a **canonical card** (no colour indicator, P/T present,
ordinary rules text, border visible), documented in `scope.ts`. The parsed AST is stored
alongside the numbers so a later move to per-card dynamic evaluation needs no
re-extraction.

**Validation**: `magic-m15` extracts to `left 57.6, top 119.2, width 627.8, height 458.9`,
within ~1px of the hand-built `arcana` layout (`58/119/627/459`). The hand-built layout
was effectively a manual transcription of this same data — which is why M15-family frames
looked right before this work and nothing else did.

### Remaining blockers

Ranked by styles blocked, from `npm run mse:geometry`:

```
61  set.shorten_types_for_rarity
59  card.transformation
58  card_style.casting_cost
42  card_style.casting_cost.content_width
27  art_left() / art_top() / art_width()
21  appel non nommé
```

Diminishing returns: the last four interpreter tasks each fully eliminated their target
blocker and moved the headline count by 0–2, because styles carry chains of blockers.
Roughly 27 of the remainder genuinely lack a type line (the type is painted into the
frame art), and `planechase-*` / `vanguard-*` are not cards at all.

## Operational notes

### ⚠ `npm run card-assets` writes to PRODUCTION

`scripts/lib/load-env.ts` loads `.env.local`, then layers `.env.seed` with
`override: true`. `.env.seed` currently points at `https://supabase.wizcard.xyz`.

**An exported `SUPABASE_URL` cannot redirect it** — verified by dry-run. To populate a
local database, write a throwaway script that talks to `127.0.0.1:54321` directly, or
temporarily move `.env.seed` aside.

### Verification

There is no test framework in this repo. The gates are:

```bash
npm run check          # ~60 pre-existing problems in unrelated files; gate is "no NEW problems"
npm run mse:geometry   # the extraction report
npm run sb:verify      # schema audit (416 assertions, 0 failures expected)
```

Runtime checks matter more than usual here. Two real bugs shipped past database
verification and were only caught by rendering the page: the footer was painted over the
rules text, and the first fix for it landed on the card's black border.

## Open items

- **Frame licences** (CardConjurer / Full Magic Pack) — the real blocker before public
  distribution. Not addressed, and now **unavoidable**: removing the house templates
  left no rendering path that avoids third-party assets. **Now also covers fonts**:
  Beleren, Matrix, ModMatrix and MPlantin are served as webfonts from `src/fonts/mse/`,
  which exposes the files to direct download. Fonts are easier to identify than frames,
  so this widens the exposure. The escape hatch is one table
  (`src/lib/card-editor/fonts.ts`) — see § Typography.
- **Save redirect** — the studio creates cards private by default and redirects to
  `/card/[id]`, which is cookieless ISR, so it 404s. Product decision needed.
- **TRUNCATE grants** on 16 other public tables (see `project_default_acl_client_writes`
  memory) — flagged, out of scope, needs its own migration.
- **Prod rollout** — migrations `20260726120000`, `20260726130000`, `20260727120000`
  plus a `card-assets` run.
