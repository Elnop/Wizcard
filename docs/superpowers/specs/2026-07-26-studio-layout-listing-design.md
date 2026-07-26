# Studio — merging the layout and frame listings into one selector

**Date**: 2026-07-26
**Status**: Design approved, ready for planning

## Context and goal

The studio's Layout panel stacks **two competing selectors** that answer the same
question — "what does my card look like?" — and whose answers overwrite each other:

1. `MseTemplatePicker`, a searchable, filtered, paginated grid of **206 vendor frames**.
2. `CARD_LAYOUT_LIST`, a grid of **8 hand-built Wizcard layouts** (the `layout`
   fieldset), rendered _below_ the 206-item library.

They are not peers. The **layout is the geometry** (where the title, art window, type
line, rules box and stats sit); the **frame is the skin** painted behind it. The UI
presents them as siblings, and the coupling between them is implicit and lossy.

**Goal**: one list, one click, no desync — while keeping every layout the studio can
currently produce.

## The three defects, measured

Figures below come from the live `card_templates` table (`render_mode = 'frame'`),
queried during brainstorming.

### 1. Selecting a frame silently discards the layout choice

`EditorSidebar.tsx:610-611` rewrites `layoutId` on every template selection:

```ts
onSelect={(template) =>
  onDraftChange({
    mseTemplateId: template.id,
    layoutId: layoutForMseTemplate(template),   // <- overwrites the user's choice
  })
}
```

But `layoutForMseTemplate` can only ever return **4 of the 8** layout ids:

| Derived `layoutId` | Frames mapping to it |
| ------------------ | -------------------- |
| `arcana`           | 169                  |
| `planeswalker`     | 28                   |
| `token`            | 8                    |
| `saga`             | 1                    |

`modern`, `full-art`, `showcase` and `adventure` are **unreachable from any frame**.
Pick one of them in the grid below, then touch anything in the library above, and the
choice is gone with no feedback. This is the actual source of the "fouilli" feeling:
the panel does not hold a stable state.

### 2. The default view hides 97% of the catalogue

The source tabs default to `accurate`, and the split is:

| Tab                      | Frames  |
| ------------------------ | ------- |
| `accurate` — **default** | **6**   |
| `legacy` (Archives MSE)  | **200** |

Meanwhile the panel header announces `206 layouts prêts à rendre`. The count and the
grid disagree by a factor of 34.

### 3. Vendor names collide

Of 200 MSE frames, **176 names are unique**: 15 names cover 39 rows. `After 8th
edition` appears **7 times, identically**. Today this is tucked behind a secondary tab;
once the lists merge it becomes the primary vocabulary, so it must be fixed as part of
this work — otherwise merging makes the listing _worse_.

## Scope decisions (settled during brainstorming)

| Question                  | Decision                                                     |
| ------------------------- | ------------------------------------------------------------ |
| Overall approach          | **One merged list** — delete the separate 8-layout grid.     |
| The 4 unreachable layouts | **Kept**, as "house" entries at the head of the merged list. |
| `kind` filter row         | **Removed**, replaced by section headers.                    |
| `accurate`/`legacy` tabs  | **Removed**; source becomes a per-row badge.                 |
| Saved-draft shape         | **Unchanged** — `layoutId` and `mseTemplateId` both persist. |

## Design

### One list, one write

The panel holds a single selector, ordered:

1. **8 house entries** from `CARD_LAYOUT_LIST` — Classique, Moderne, Full art,
   Showcase, Jeton, Planeswalker, Saga, Aventure — drawn with Wizcard's built-in
   frames.
2. **206 vendor frames**, grouped by kind (see below).

Every selection writes **both fields in one action**, so they cannot diverge:

- a **house entry** sets `layoutId` to its own id and `mseTemplateId` to a sentinel
  meaning "no vendor frame";
- a **vendor frame** sets `mseTemplateId` to the template id and derives `layoutId`
  through the existing `layoutForMseTemplate`.

This removes the `layout` fieldset, its `onDraftChange({ layoutId })` handler
(`EditorSidebar.tsx:623`), and the overwrite at line 611.

#### The "no vendor frame" sentinel

`mseTemplateId` is a non-nullable `string` (`types.ts:59` and `:140`) and today defaults
to `DEFAULT_FRAME_TEMPLATE_ID` (`'cardconjurer-m15-regular'`). House entries need a value
that is **not** a catalogue id and that `useSelectedMseTemplate` resolves to `undefined`,
so `resolveMseFramePath` returns `null` and the canvas falls back to its built-in frame —
the path that already runs today when the catalogue fails to load.

Introduce `HOUSE_FRAME_TEMPLATE_ID = 'wizcard:house'`. It must not collide with any real
id; verified against the catalogue, no id contains `:` or begins with `wizcard`, so the
prefix is safe.

**The self-healing effect must learn about the sentinel.** `CardEditorStudio.tsx:64-75`
resets the draft whenever the selected template is not a renderable frame:

```ts
if (selectedMseTemplate?.renderMode === 'frame') return;
// ...falls through and rewrites mseTemplateId + layoutId to the default
```

With the sentinel set, `useSelectedMseTemplate` returns `undefined`, so this guard does
**not** return and the effect immediately overwrites the house entry with
`DEFAULT_FRAME_TEMPLATE_ID`. Every house selection would be undone on the next render.

The guard must therefore also return early when `mseTemplateId === HOUSE_FRAME_TEMPLATE_ID`.
The effect's real job — rescuing a draft that points at a template which is missing or is
`renderMode: 'sample'` — is unaffected.

### Naming: a three-tier disambiguation

Computed once when the catalogue loads, applied in order:

| Tier | Rule                    | Rows resolved |
| ---- | ----------------------- | ------------- |
| 1    | `name` alone, if unique | 167           |
| 2    | `name · short_name`     | 33            |
| 3    | `name · short (id)`     | 6             |

Verified against the live catalogue: **206 unique labels for 206 rows, zero
collisions.** Tier 3 covers the three pairs where `short_name` repeats too
(`magic-textless` / `magic-new-textless`, `magic-nouveau` / `magic-nouveau_duels`,
`magic-space-xerent` / `space-xerent`).

Worked example — the 7 `After 8th edition` rows become:

```
After 8th edition · Modern Japanese
After 8th edition · Modern Pokemon style
After 8th edition · Modern Russian
After 8th edition · Modern style
After 8th edition · Omega Doublefaced
After 8th edition · Omega Levelers
After 8th edition · Omega style
```

Names that already carry a parenthesised qualifier (`M15 Style Meld cards (3-in-1)`)
are unique at tier 1 and pass through untouched.

### Grouping replaces filtering

The `kind` filter row is removed. Its distribution made it near-useless — 143 `card`
against 1 `saga` and 1 `oversized`, i.e. filters that existed for single-member
categories — and every filter click _hid_ frames, compounding defect 2.

Instead the list carries **section headers** in a fixed order:

```
Gabarits Wizcard   (8)
Cartes             (143)
Planeswalkers      (28)
Split              (13)
Double face        (10)
Jetons             (8)
Autres             (4)   ← packaging 2, saga 1, oversized 1
```

Same grouping, no click required, nothing hidden. `Autres` absorbs the long tail so no
header exists for a single row.

The **search box stays** — it is the one control that scales to 206 entries — and now
searches the disambiguated label, so typing `omega` finds the three Omega variants that
were previously indistinguishable. Pagination stays at 30 per page.

### Source becomes a badge

`accurate`/`legacy` stop gating the list. The distinction is still worth surfacing —
the 6 CardConjurer frames are the high-fidelity ones — so it moves onto the row as the
existing `sourceBadge`, alongside the kind. Sort order within each section puts
CardConjurer frames first, then alphabetical by label.

## What is explicitly not changing

- The 8 layouts' **geometry** (`layout-registry.ts`) — untouched.
- `layoutForMseTemplate` — still the frame → layout derivation.
- The persisted draft shape: `layoutId` and `mseTemplateId` both remain, so **existing
  drafts keep working**. A draft whose `layoutId` is `landscape` still renders; the
  studio simply does not offer it, as today.
- `renderMode !== 'frame'` templates stay filtered out (176 of 382 rows).

## Risks

**A draft saved before this change may hold a (layout, frame) pair the new list cannot
represent** — e.g. `layoutId: 'full-art'` with a vendor `mseTemplateId`, reachable today
by picking the layout after the frame. The selector shows one active entry, so such a
pair would highlight either both or neither.

Resolution — the active entry is decided in this order:

1. if `mseTemplateId === HOUSE_FRAME_TEMPLATE_ID`, highlight the house entry whose id
   equals `layoutId`;
2. otherwise highlight the vendor row whose id equals `mseTemplateId` — it is what the
   canvas actually paints, so it is what the user sees;
3. if neither matches (a template pulled from the catalogue), highlight nothing.

The stored `layoutId` is left alone until the user picks something: no silent migration
on load, so opening an old draft never mutates it.

## Success criteria

1. The Layout panel contains exactly one selector.
2. Selecting any entry leaves `layoutId` and `mseTemplateId` mutually consistent; no
   sequence of clicks can desync them.
3. All 8 house layouts remain selectable.
4. Every visible row has a label unique within the list.
5. The default view lists all 214 entries (8 house + 206 vendor), subject only to
   pagination.
6. `npm run check` reports no new problems, per the repo's RED-baseline convention.
