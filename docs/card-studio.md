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
  left no rendering path that avoids third-party assets.
- **Save redirect** — the studio creates cards private by default and redirects to
  `/card/[id]`, which is cookieless ISR, so it 404s. Product decision needed.
- **TRUNCATE grants** on 16 other public tables (see `project_default_acl_client_writes`
  memory) — flagged, out of scope, needs its own migration.
- **Prod rollout** — migrations `20260726120000`, `20260726130000`, `20260727120000`
  plus a `card-assets` run.
