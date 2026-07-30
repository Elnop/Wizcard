# Frame Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the land, colourless and two-colour blend frames the MSE corpus ships but `frame_paths` ignores, and pick them automatically from the type line and mana cost.

**Architecture:** Ingestion learns eight new frame stems (7 lands + colourless) and collects the three blend masks into a new `blend_masks` column. `resolveAutomaticFrame` — which already detects lands and colours — gains the keys it was missing. Blends compose in the browser with an SVG `<mask>` over two coloured frames; nothing is pre-baked.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (local CLI + self-hosted prod), Node ingestion scripts, SVG.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-27-frame-variants-design.md` — read it before starting.
- **No test framework in this repo.** Do NOT add vitest/jest. Verification is node one-liners against the real corpus, `npm run check`, `npm run build`, and the browser.
- **`npm run check` is NOT green at base** — ~60 pre-existing problems in unrelated files (`src/lib/mpc/`, `src/lib/scryfall/`). The gate is **"no NEW problems"**: verify with `npx eslint` on the changed files only.
- **⚠ `npm run card-assets` writes to PRODUCTION.** `scripts/lib/load-env.ts` loads `.env.seed` with `override: true`, so an exported `SUPABASE_URL` cannot redirect it. **Never run it during this plan.**
- **`npm run sb:reset` is destructive** — never run it. `npm run sb:migrate` is safe.
- **Regenerating the manifest is safe** — `node scripts/card-assets/generate-manifests.mjs` writes a local, gitignored JSON file. It takes ~30s.
- **Degrade, never invent.** A missing land key falls back to the plain colour (`land-tide` absent → `tide`). That is _less specific_, not _wrong_. Never fall back to a different colour, and never paint a blend mask as if it were a frame — it is near-binary and would render a white card.
- **`collectReferencedPaths` only uploads what it knows about.** Anything new must be added there explicitly or it never reaches production Storage. This exact trap broke the legendary crown.
- Repo style: tabs, Prettier. Commit on `feat/custom-card-studio`; do not merge.

---

## File Structure

| File                                                                       | Responsibility                                                                       | Task |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---- |
| `scripts/card-assets/generate-manifests.mjs`                               | **Modify.** 8 new frame stems + collect blend masks into the manifest.               | 1    |
| `supabase/migrations/20260727150000_add_blend_masks.sql`                   | **Create.** The `blend_masks` column + grants.                                       | 2    |
| `scripts/card-assets/upload-templates.ts`                                  | **Modify.** Write the column, add masks to the upload set.                           | 2    |
| `scripts/card-assets/seed-local-variants.mjs`                              | **Create.** Throwaway local seeder — never touches prod.                             | 2    |
| `src/lib/supabase/queries/card-templates.ts`                               | **Modify.** Row type + `CARD_TEMPLATE_SELECT`.                                       | 3    |
| `src/lib/card-editor/mse-assets.ts`                                        | **Modify.** `MseFrameKey`, `blendMasks`, `resolveAutomaticFrame`, `resolveMseBlend`. | 3    |
| `src/lib/card-editor/components/CardCanvas/CardCanvas.tsx`                 | **Modify.** The `<mask>` composition.                                                | 4    |
| `src/app/[locale]/studio/components/CardEditorStudio/CardEditorStudio.tsx` | **Modify.** Pass the blend to all three canvases.                                    | 4    |

---

### Task 1: Ingest the new variants

**Files:**

- Modify: `scripts/card-assets/generate-manifests.mjs` (`FRAME_FILE_STEMS` ~line 19, `resolveFramePaths` ~line 113, the template object ~line 215)

**Interfaces:**

- Consumes: nothing.
- Produces: manifest entries gain 8 possible `framePaths` keys (`land-light`, `land-tide`, `land-void`, `land-ember`, `land-grove`, `land-prismatic`, `land-colorless`, `colorless`) and a new `blendMasks: { multicolor?, hybrid?, artifact? } | null`.

- [ ] **Step 1: Extend `FRAME_FILE_STEMS`**

Replace the existing object with this. **Do not remove `ccard` from `artifact`** — one frame in the
corpus ships `ccard` with no `acard`, and dropping it would leave that frame with no artifact
variant at all. `acard` stays first so it still wins wherever both exist (96 frames).

```javascript
const FRAME_FILE_STEMS = {
	light: ['wcard', 'whitecard', 'wframe', 'whiteframe'],
	tide: ['ucard', 'bluecard', 'uframe', 'blueframe'],
	void: ['bcard', 'blackcard', 'bframe', 'blackframe'],
	ember: ['rcard', 'redcard', 'rframe', 'redframe'],
	grove: ['gcard', 'greencard', 'gframe', 'greenframe'],
	prismatic: ['mcard', 'goldcard', 'multicard', 'mframe', 'goldframe'],
	// `ccard` reste en repli : 1 gabarit du corpus fournit ccard SANS acard, et
	// le retirer le laisserait sans cadre artefact. `acard` d'abord, donc il
	// gagne partout où les deux existent (96 gabarits).
	artifact: ['acard', 'ccard', 'artifactcard', 'colorlesscard', 'aframe', 'cframe'],
	// Incolore, distinct de l'artefact : `ccard` est un gris-brun, `acard` un
	// bleu-métal. `resolveAutomaticFrame` renvoyait `artifact` pour du mana {C},
	// qui est pourtant INCOLORE — cette clé lui donne la bonne cible.
	colorless: ['ccard', 'colorlesscard', 'cframe'],
	// Terrains : même code couleur que ci-dessus, suffixé `l`. Présents sur 73 à
	// 82 des 109 gabarits proposés, en .jpg comme en .png.
	'land-light': ['wlcard'],
	'land-tide': ['ulcard'],
	'land-void': ['blcard'],
	'land-ember': ['rlcard'],
	'land-grove': ['glcard'],
	'land-prismatic': ['mlcard'],
	'land-colorless': ['clcard'],
};
```

- [ ] **Step 2: Collect the blend masks**

`resolveFramePaths` already scans every candidate directory for image files and matches them
by stem. Add a sibling function right after it that reuses the same scan for the masks.

The corpus holds many `*_blend_*` files (`_pt`, `_typeline`, `_textbox`, `_stamp`, `_bar`,
`_card2`, `- Copy`). **Only `_card` is in scope** — the others mask sub-elements this plan
does not touch.

```javascript
/**
 * Masques de fondu bicolore, s'ils existent.
 *
 * Ce ne sont PAS des cadres : ce sont des masques quasi-binaires (mesuré : 0,2 à
 * 0,4 % de pixels intermédiaires) que MSE combine avec DEUX cadres colorés, via
 * masked_blend(mask, dark, light). Peint seul, un masque donne une carte
 * blanche — d'où leur stockage à part de framePaths.
 *
 * Seuls les masques `_card` sont retenus : le corpus en fournit aussi pour la
 * P/T, la ligne de type, la zone de texte et le sceau, qui masquent des
 * sous-éléments hors de ce chantier.
 */
const BLEND_MASK_FILES = {
	multicolor: 'multicolor_blend_card.png',
	hybrid: 'hybrid_blend_card.png',
	artifact: 'artifact_blend_card.png',
};

async function resolveBlendMasks(source, styleDirectory) {
	const available = await listCandidateImages(source, styleDirectory);
	const found = Object.fromEntries(
		Object.entries(BLEND_MASK_FILES).flatMap(([key, file]) => {
			const match = available.find((path) => path.toLowerCase().endsWith(`/${file}`));
			return match ? [[key, normalize(path.relative(PUBLIC_ROOT, match))]] : [];
		})
	);
	return Object.keys(found).length > 0 ? found : null;
}
```

- [ ] **Step 3: Extract the directory scan so both functions share it**

`resolveFramePaths` currently builds its candidate list inline. Extract that list-building
into `listCandidateImages(source, styleDirectory)` returning the array of absolute image
paths, and have `resolveFramePaths` call it. This is what makes Step 2 possible without
duplicating the scan.

Read the current body of `resolveFramePaths` (around line 113) and move everything from
`const referencedDirectories = …` through the loop that fills `available` into the new
function, leaving `resolveFramePaths` to call it and do only the stem matching.

- [ ] **Step 4: Emit `blendMasks` on the template**

In the template object returned by `buildTemplate` (around line 215, next to `framePaths`):

```javascript
		blendMasks: await resolveBlendMasks(source, styleDirectory),
```

Also add `blendMasks: null` to the hand-written CardConjurer entry (around line 260, the one
that already sets `positionHint: null` and `tags: []`).

- [ ] **Step 5: Regenerate and verify the counts**

```bash
node scripts/card-assets/generate-manifests.mjs
python3 -c "
import json
m=json.load(open('assets/card-templates/manifests/templates.json'))
ts=m if isinstance(m,list) else m['templates']
t=[x for x in ts if x['id']=='magic-m15'][0]
keys=sorted(t['framePaths'].keys())
print('magic-m15 frame keys:', keys)
print('PASS' if 'colorless' in keys else 'FAIL', 'colorless present')
print('PASS' if 'land-tide' in keys else 'FAIL', 'land-tide present')
print('PASS' if t['framePaths']['artifact'].endswith('acard.jpg') else 'FAIL', 'artifact still acard')
print('PASS' if t['framePaths']['colorless'].endswith('ccard.jpg') else 'FAIL', 'colorless is ccard')
print('blendMasks:', sorted((t.get('blendMasks') or {}).keys()))
n_c=sum(1 for x in ts if 'colorless' in (x.get('framePaths') or {}))
n_l=sum(1 for x in ts if 'land-tide' in (x.get('framePaths') or {}))
n_b=sum(1 for x in ts if x.get('blendMasks'))
print('templates with colorless:', n_c, '| with land-tide:', n_l, '| with blendMasks:', n_b)
"
```

Expected: four `PASS` lines, `blendMasks` listing all three keys for `magic-m15`, and counts
in the same order of magnitude as the spec's figures (the manifest holds 382 templates, more
than the 109 offered, so its counts are higher than the spec's per-offered-frame numbers).

- [ ] **Step 6: Confirm no frame lost its artifact variant**

The risk of touching `FRAME_FILE_STEMS` is silently dropping a key.

```bash
python3 -c "
import json
m=json.load(open('assets/card-templates/manifests/templates.json'))
ts=m if isinstance(m,list) else m['templates']
missing=[x['id'] for x in ts if (x.get('framePaths') or {}) and 'artifact' not in x['framePaths']
         and any(k in x['framePaths'] for k in ('light','tide','void'))]
print('coloured frames now missing artifact:', len(missing))
print(missing[:10])
"
```

Expected: a small number, and none of them should be frames that had `artifact` before. If
the count looks large, `ccard` was dropped from the `artifact` stem list — put it back.

- [ ] **Step 7: Commit**

```bash
npx prettier --write scripts/card-assets/generate-manifests.mjs
npx eslint scripts/card-assets/generate-manifests.mjs
git add scripts/card-assets/generate-manifests.mjs
git commit -m "feat(card-assets): ingest land, colourless and blend-mask variants"
```

Note: `assets/card-templates/manifests/templates.json` is gitignored and has never been
tracked — do not try to add it.

---

### Task 2: Migration, column, upload set, local seed

**Files:**

- Create: `supabase/migrations/20260727150000_add_blend_masks.sql`
- Create: `scripts/card-assets/seed-local-variants.mjs`
- Modify: `scripts/card-assets/upload-templates.ts`

**Interfaces:**

- Consumes: `blendMasks` from the manifest (Task 1).
- Produces: `card_templates.blend_masks jsonb`, and `frame_paths` carrying the new keys.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260727150000_add_blend_masks.sql
--
-- Fondus bicolores
-- (cf. docs/superpowers/specs/2026-07-27-frame-variants-design.md).
--
-- Séparés de `frame_paths` parce que ce ne sont PAS des cadres : ce sont des
-- masques quasi-binaires que MSE combine avec DEUX cadres colorés
-- (masked_blend(mask, dark, light)). Peint seul, un masque donne une carte
-- blanche — les ranger avec les cadres inviterait justement cette erreur.
--
-- Les nouvelles variantes de CADRE (terrains, incolore) n'ont besoin d'aucune
-- migration : `frame_paths` est un jsonb dont on change le contenu, pas la
-- forme.

alter table public.card_templates
  add column if not exists blend_masks jsonb;

comment on column public.card_templates.blend_masks is
  'Masques de fondu bicolore { multicolor, hybrid, artifact } ; NULL si le gabarit n''en fournit pas. Ce ne sont PAS des cadres : à composer avec deux cadres colorés, jamais à peindre seuls.';

-- Grants explicites : la default ACL de la prod auto-hébergée dérive, une table
-- sans grant déclaré casse en 42501 (cf. mémoire project_table_grants_drift).
grant select on public.card_templates to anon, authenticated;
grant select, insert, update, delete on public.card_templates to service_role;
```

- [ ] **Step 2: Apply and confirm**

```bash
npm run sb:migrate
docker exec supabase_db_scute_swarm psql -U postgres -c "\d card_templates" | grep blend_masks
```

Expected: a `blend_masks | jsonb` line. There is no local `psql` binary — use the
`docker exec` form above.

- [ ] **Step 3: Write the column and fix the upload set**

In `scripts/card-assets/upload-templates.ts`:

Add to the `ManifestTemplate` interface:

```typescript
	blendMasks?: Record<string, string> | null;
```

Add to the `CardTemplateRow` interface:

```typescript
blend_masks: Record<string, string> | null;
```

In `toRow`, next to `frame_paths`:

```typescript
		blend_masks: template.blendMasks ?? null,
```

**And — this is the step that decides whether the feature works in production** — teach
`collectReferencedPaths` about the masks. It currently gathers only `framePaths`,
`samplePath` and `iconPath`; the blend masks live outside all three, so without this they
are never uploaded and every blend 404s:

```typescript
for (const maskPath of Object.values(template.blendMasks ?? {})) referenced.add(maskPath);
```

Put it inside the existing `for (const template of templates)` loop, next to the
`framePaths` line.

- [ ] **Step 4: Write the local seeder**

**Do not run `npm run card-assets`** — it writes to production regardless of `SUPABASE_URL`.

```javascript
// scripts/card-assets/seed-local-variants.mjs
//
// Renseigne frame_paths (nouvelles clés) et blend_masks sur la base LOCALE, à
// partir du manifeste. Script jetable : `npm run card-assets` charge .env.seed
// avec override:true et écrit donc en PRODUCTION, ce qu'on ne veut pas ici.
//
// Usage : node scripts/card-assets/seed-local-variants.mjs
import fs from 'node:fs';

const URL_BASE = 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
	console.error('SUPABASE_SERVICE_ROLE_KEY manquant. Récupère-le via `npx supabase status`.');
	process.exit(1);
}

const headers = {
	apikey: SERVICE_KEY,
	Authorization: `Bearer ${SERVICE_KEY}`,
	'Content-Type': 'application/json',
};

const manifest = JSON.parse(
	fs.readFileSync('assets/card-templates/manifests/templates.json', 'utf8')
);
const templates = Array.isArray(manifest) ? manifest : manifest.templates;

let withBlend = 0;
for (const template of templates) {
	if (template.blendMasks) withBlend += 1;
	const response = await fetch(
		`${URL_BASE}/rest/v1/card_templates?id=eq.${encodeURIComponent(template.id)}`,
		{
			method: 'PATCH',
			headers: { ...headers, Prefer: 'return=minimal' },
			body: JSON.stringify({
				frame_paths: template.framePaths ?? {},
				blend_masks: template.blendMasks ?? null,
			}),
		}
	);
	if (!response.ok) {
		console.error(template.id, response.status, await response.text());
		process.exit(1);
	}
	// Drain the body so the socket is released (cf. mémoire project_scryfall_body_drain).
	await response.body?.cancel();
}
console.log(`patched ${templates.length} rows, ${withBlend} with blend masks`);
```

- [ ] **Step 5: Seed and verify against the offered frames**

```bash
export SUPABASE_SERVICE_ROLE_KEY=$(npx supabase status -o json | python3 -c "import json,sys;print(json.load(sys.stdin)['SERVICE_ROLE_KEY'])")
node scripts/card-assets/seed-local-variants.mjs

ANON=$(npx supabase status -o json | python3 -c "import json,sys;print(json.load(sys.stdin)['ANON_KEY'])")
curl -s "http://127.0.0.1:54321/rest/v1/card_templates?select=id,frame_paths,blend_masks,geometry,render_mode&limit=1000" -H "apikey: $ANON" \
| python3 -c "
import json,sys
rows=json.load(sys.stdin)
off=[r for r in rows if r['geometry'] and r['render_mode']=='frame']
n_c=sum(1 for r in off if 'colorless' in (r['frame_paths'] or {}))
n_l=sum(1 for r in off if 'land-tide' in (r['frame_paths'] or {}))
n_b=sum(1 for r in off if r['blend_masks'])
print('offered:', len(off))
print('  colorless :', n_c, '(spec dit 89)')
print('  land-tide :', n_l, '(spec dit 73)')
print('  blend     :', n_b, '(spec dit 85-107)')
"
```

Expected: 109 offered, and the three counts close to the spec's figures.

- [ ] **Step 6: Upload the new assets to local Storage**

Production gets these from the `card-assets` run, but the local database needs them by hand
or the browser check in Task 4 shows nothing. The crown feature hit exactly this.

```bash
SRK=$(npx supabase status -o json | python3 -c "import json,sys;print(json.load(sys.stdin)['SERVICE_ROLE_KEY'])")
ANON=$(npx supabase status -o json | python3 -c "import json,sys;print(json.load(sys.stdin)['ANON_KEY'])")
curl -s "http://127.0.0.1:54321/rest/v1/card_templates?select=frame_paths,blend_masks&id=eq.magic-m15" -H "apikey: $ANON" \
| python3 -c "
import json,sys
r=json.load(sys.stdin)[0]
paths=[v for k,v in (r['frame_paths'] or {}).items() if k=='colorless' or k.startswith('land-')]
paths += list((r['blend_masks'] or {}).values())
print('\n'.join(paths))
" > /tmp/claude-1000/-home-elthinkbuntu-Documents-Wizcard/fcade87f-2b5d-4554-baa3-129f3ee2368f/scratchpad/new-assets.txt

while read -r P; do
  [ -z "$P" ] && continue
  ENC=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$P")
  CT=$(case "$P" in *.png) echo image/png;; *) echo image/jpeg;; esac)
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    "http://127.0.0.1:54321/storage/v1/object/card-templates/$ENC" \
    -H "Authorization: Bearer $SRK" -H "Content-Type: $CT" \
    --data-binary "@assets/card-templates/$P")
  echo "  $(basename "$P") -> $code"
done < /tmp/claude-1000/-home-elthinkbuntu-Documents-Wizcard/fcade87f-2b5d-4554-baa3-129f3ee2368f/scratchpad/new-assets.txt
```

Expected: `200` on each. A `400` means the object already exists, which is also fine.

- [ ] **Step 7: Schema audit and commit**

```bash
npm run sb:verify
npx prettier --write scripts/card-assets/upload-templates.ts scripts/card-assets/seed-local-variants.mjs
npx eslint scripts/card-assets/upload-templates.ts
git add supabase/migrations/20260727150000_add_blend_masks.sql scripts/card-assets/upload-templates.ts scripts/card-assets/seed-local-variants.mjs
git commit -m "feat(card-templates): add blend_masks and upload the new variants"
```

Expected from `sb:verify`: no FAIL lines.

---

### Task 3: Read-side keys and resolution

**Files:**

- Modify: `src/lib/supabase/queries/card-templates.ts`
- Modify: `src/lib/card-editor/mse-assets.ts`

**Interfaces:**

- Consumes: `blend_masks` and the extended `frame_paths` from Task 2.
- Produces:
  - `MseFrameKey` gains `'colorless'` and the seven `land-*` keys; `'land'` is removed.
  - `MseTemplate.blendMasks: Record<string, string> | null`
  - `resolveMseBlend(template, face): { base: string; overlay: string; mask: string } | null`

- [ ] **Step 1: Update the query row and select list**

`CARD_TEMPLATE_SELECT` is an explicit column list in a **string literal** — a column missing
from it is simply absent at runtime, and tsc cannot see it.

In `src/lib/supabase/queries/card-templates.ts`, add to `CardTemplateRow`:

```typescript
blend_masks: Record<string, string> | null;
```

And append `blend_masks` to the select list:

```typescript
export const CARD_TEMPLATE_SELECT =
	'id, name, short_name, source, quality, orientation, layout_id, sample_path, icon_path, frame_paths, frame_text_colors, sample_text_colors, render_mode, width, height, dpi, asset_version, version, geometry, installer_group, position_hint, tags, crown_paths, blend_masks';
```

- [ ] **Step 2: Extend `MseFrameKey` and add `blendMasks`**

In `src/lib/card-editor/mse-assets.ts`, replace the type:

```typescript
/** Couleur de base d'un cadre : les 7 pastilles de la palette. */
export type MseColorKey = Exclude<FrameStyleId, 'auto'>;

/**
 * Clé de cadre. Les terrains préfixent la couleur de base : `land-tide` est le
 * cadre terrain bleu.
 *
 * `land` seul a DISPARU : c'était une clé qu'aucun gabarit ne fournissait, donc
 * `isLandTypeLine` la renvoyait dans le vide.
 */
export type MseFrameKey = MseColorKey | 'colorless' | `land-${MseColorKey | 'colorless'}`;
```

Add to the `MseTemplate` interface, next to `framePaths`:

```typescript
/** Masques de fondu bicolore ; null = ce gabarit n'en fournit pas. */
blendMasks: Record<string, string> | null;
```

And in `rowToTemplate`, next to the `framePaths` line:

```typescript
		blendMasks: (row.blend_masks ?? null) as Record<string, string> | null,
```

- [ ] **Step 3: Teach `resolveAutomaticFrame` the new keys**

Replace the function. Two behaviour changes: `{C}` now resolves to `colorless` rather than
`artifact`, and lands resolve to their typed key.

```typescript
/** Ordre canonique des couleurs de Magic. Une carte {U}{W} s'imprime blanc-bleu. */
const WUBRG = ['W', 'U', 'B', 'R', 'G'] as const;

const COLOR_TO_FRAME: Record<string, MseColorKey> = {
	W: 'light',
	U: 'tide',
	B: 'void',
	R: 'ember',
	G: 'grove',
};

/** Couleurs du coût, dans l'ordre WUBRG et non dans l'ordre de saisie. */
function faceColors(face: CardFaceDraft): string[] {
	const symbols = getManaSymbols(face.manaCost).join('');
	return WUBRG.filter((color) => symbols.includes(color));
}

function resolveAutomaticFrame(face: CardFaceDraft): MseFrameKey {
	const colors = faceColors(face);
	const symbols = getManaSymbols(face.manaCost).join('');

	// Un terrain se décide AVANT la couleur, et pas sur le coût de mana : une
	// vraie carte terrain n'en a pas. Sa couleur vient du mana qu'elle PRODUIT,
	// que le studio ne modélise pas — donc un terrain sans coût prend le cadre
	// terre incolore, qui est aussi celui des terrains non-base.
	//
	// Un coût reste possible et significatif : la ligne de type d'un artefact-
	// terrain ou d'un terrain coloré porte alors sa couleur.
	if (isLandTypeLine(face.typeLine)) {
		if (colors.length > 1) return 'land-prismatic';
		if (colors[0]) return `land-${COLOR_TO_FRAME[colors[0]]}` as MseFrameKey;
		return 'land-colorless';
	}

	// Hors terrain : la couleur si elle est unique, l'or si la carte est
	// multicolore, l'incolore sinon. `{C}` est du mana INCOLORE, pas de
	// l'artefact — le studio renvoyait `artifact` ici, ce qui confondait deux
	// cadres visuellement distincts (gris-brun contre bleu-métal).
	//
	// Une carte BICOLORE renvoie quand même `prismatic` : cette fonction choisit
	// un cadre unique, et `resolveMseBlend` décide séparément s'il y a de quoi
	// composer un fondu. Le canvas peint le fondu quand il existe, `prismatic`
	// sinon — c'est le repli, pas une contradiction.
	if (colors.length > 1) return 'prismatic';
	if (colors[0]) return COLOR_TO_FRAME[colors[0]];
	if (symbols.includes('C')) return 'colorless';
	return 'light';
}
```

- [ ] **Step 4: Add the frame fallback and the blend resolver**

`resolveMseFramePath` currently falls back to `Object.values(framePaths)[0]` — an arbitrary
colour. For the new keys that is wrong: a land frame that is missing should degrade to its
own colour, not to whatever key happens to be first. Replace it:

```typescript
/**
 * Cadre à peindre.
 *
 * Repli en DEUX temps pour les nouvelles clés : `land-tide` absent retombe sur
 * `tide`, pas sur un cadre d'une autre couleur. C'est une dégradation vers moins
 * SPÉCIFIQUE, pas vers faux — un cadre bleu là où on attendait un terrain bleu
 * reste juste. Le dernier repli sur la première clé disponible est conservé pour
 * les gabarits exotiques qui ne fournissent qu'une variante.
 */
export function resolveMseFramePath(
	template: MseTemplate | undefined,
	face: CardFaceDraft
): string | null {
	if (!template) return null;
	const frame = resolveFrameStyle(face);
	const direct = template.framePaths[frame];
	if (direct) return cardAssetUrl(direct);
	// `land-tide` -> `tide`
	const base = frame.startsWith('land-') ? (frame.slice(5) as MseFrameKey) : null;
	const degraded = base ? template.framePaths[base] : undefined;
	return cardAssetUrl(degraded ?? Object.values(template.framePaths)[0]);
}

/**
 * Fondu bicolore, ou `null`.
 *
 * MSE compose `masked_blend(mask, dark, light)` : le masque décide par pixel
 * lequel des DEUX cadres colorés apparaît. On renvoie donc les trois URL, jamais
 * une seule — peindre le masque seul donnerait une carte blanche.
 *
 * `null` dès qu'une pièce manque : carte pas exactement bicolore, gabarit sans
 * masque, ou cadre manquant pour l'une des deux couleurs. Le rendu retombe alors
 * sur le cadre simple, qui reste juste.
 */
export function resolveMseBlend(
	template: MseTemplate | undefined,
	face: CardFaceDraft
): { base: string; overlay: string; mask: string } | null {
	if (!template?.blendMasks) return null;
	if (face.frameStyle !== 'auto') return null;
	const colors = faceColors(face);
	if (colors.length !== 2) return null;
	const maskPath = template.blendMasks.multicolor;
	if (!maskPath) return null;
	const first = template.framePaths[COLOR_TO_FRAME[colors[0]]];
	const second = template.framePaths[COLOR_TO_FRAME[colors[1]]];
	if (!first || !second) return null;
	const base = cardAssetUrl(first);
	const overlay = cardAssetUrl(second);
	const mask = cardAssetUrl(maskPath);
	if (!base || !overlay || !mask) return null;
	return { base, overlay, mask };
}
```

- [ ] **Step 5: Typecheck and verify the resolution against real data**

```bash
npx tsc --noEmit
```

Expected: clean apart from `CardCanvas.tsx` / `CardEditorStudio.tsx` if they reference the
removed `land` key — Task 4 fixes those. Note any such errors; do not fix them here.

```bash
ANON=$(npx supabase status -o json | python3 -c "import json,sys;print(json.load(sys.stdin)['ANON_KEY'])")
curl -s "http://127.0.0.1:54321/rest/v1/card_templates?select=id,frame_paths,blend_masks&id=eq.magic-m15" -H "apikey: $ANON" \
| python3 -c "
import json,sys
r=json.load(sys.stdin)[0]
fp=r['frame_paths'] or {}
print('PASS' if 'colorless' in fp else 'FAIL', 'colorless key reaches the client')
print('PASS' if 'land-tide' in fp else 'FAIL', 'land-tide key reaches the client')
print('PASS' if (r['blend_masks'] or {}).get('multicolor') else 'FAIL', 'multicolor mask reaches the client')
"
```

Expected: three `PASS` lines. This proves Step 1's select-list edit works — tsc cannot.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/lib/supabase/queries/card-templates.ts src/lib/card-editor/mse-assets.ts
npx eslint src/lib/supabase/queries/card-templates.ts src/lib/card-editor/mse-assets.ts
git add src/lib/supabase/queries/card-templates.ts src/lib/card-editor/mse-assets.ts
git commit -m "feat(studio): resolve land, colourless and blend frames"
```

---

### Task 4: Paint the blend

**Files:**

- Modify: `src/lib/card-editor/components/CardCanvas/CardCanvas.tsx`
- Modify: `src/app/[locale]/studio/components/CardEditorStudio/CardEditorStudio.tsx`

**Interfaces:**

- Consumes: `resolveMseBlend(template, face)` returning `{ base, overlay, mask } | null` (Task 3).
- Produces: the finished feature. `CardCanvasProps` gains `mseBlend?: { base: string; overlay: string; mask: string } | null`.

- [ ] **Step 1: Add the prop**

In `CardCanvas.tsx`, add to `CardCanvasProps`, right after `mseCrownPath`:

```typescript
	mseBlend?: { base: string; overlay: string; mask: string } | null;
```

Add `mseBlend` to the destructured parameters of **both** `CardSvg` and `CardCanvas`, and
pass it from `CardCanvas` down to `<CardSvg>`.

- [ ] **Step 2: Paint it**

The existing frame block is `{mseFramePath && (<image href={mseFramePath} … />)}`. Replace
that block so the blend takes precedence when present:

```tsx
{
	/*
	 * Cadre. Un fondu bicolore remplace l'image unique par une composition :
	 * MSE fait `masked_blend(mask, dark, light)`, où le masque choisit par
	 * pixel lequel des DEUX cadres colorés apparaît. Le masque est
	 * quasi-binaire, donc la découpe est franche.
	 *
	 * L'export PNG suit sans modification : `inlineSvgImages` parcourt
	 * `querySelectorAll('image')`, ce qui inclut l'image DANS le <mask>.
	 */
}
{
	mseBlend ? (
		<>
			<mask id={`${clipId}-blend`}>
				<image
					href={mseBlend.mask}
					x="0"
					y="0"
					width={geometry.width}
					height={geometry.height}
					preserveAspectRatio="none"
				/>
			</mask>
			<image
				href={mseBlend.base}
				x="0"
				y="0"
				width={geometry.width}
				height={geometry.height}
				preserveAspectRatio="none"
			/>
			<image
				href={mseBlend.overlay}
				x="0"
				y="0"
				width={geometry.width}
				height={geometry.height}
				preserveAspectRatio="none"
				mask={`url(#${clipId}-blend)`}
			/>
		</>
	) : (
		mseFramePath && (
			<image
				href={mseFramePath}
				x="0"
				y="0"
				width={geometry.width}
				height={geometry.height}
				preserveAspectRatio="none"
			/>
		)
	);
}
```

`clipId` is already generated per-instance in `CardCanvas` (`card-art-${useId()…}`) and
passed to `CardSvg`, so `${clipId}-blend` is unique across the three canvases. Reusing a bare
`"blend"` id would make all three share one mask.

- [ ] **Step 3: Wire it in the studio**

In `CardEditorStudio.tsx`, add `resolveMseBlend` to the existing import block from
`@/lib/card-editor/mse-assets`.

Then pass it to **all three** `CardCanvas` instances — the preview and the two hidden ones
used for PNG export and saving. A prop reaching only the preview makes exported images
diverge from what the user sees.

Next to each existing `mseCrownPath={resolveMseCrownPath(…)}`, add:

```tsx
						mseBlend={resolveMseBlend(selectedMseTemplate, X)}
```

where `X` is that instance's own face — `editor.activeFace`, `editor.draft.faces[0]`, and
`editor.draft.faces[1]` respectively. The third sits inside the existing
`{editor.draft.faces[1] && (…)}` guard.

- [ ] **Step 4: Static checks**

```bash
npx tsc --noEmit
npx eslint "src/lib/card-editor/components/CardCanvas/CardCanvas.tsx" "src/app/[locale]/studio/components/CardEditorStudio/CardEditorStudio.tsx"
npm run build
```

Expected: tsc fully clean now, no NEW eslint problems, build succeeds. This repo has a
history of build-only failures that tsc misses.

- [ ] **Step 5: Browser verification**

This is the gate that matters — bugs have shipped past static checks on this feature before.
A dev server may already be running on port 3000; check before starting another.

Open `http://localhost:3000/fr/studio` and confirm:

1. Pick a frame from the **m15 style** family (the library opens on it).
2. In **Carte**, set the mana cost to `{2}{W}` → the frame is white. Set it to `{2}{W}{U}` →
   **the frame becomes a white-to-blue blend**, not the plain gold `prismatic` frame.
3. Set the cost to `{2}{U}{W}` (reverse order) → the blend is **identical** to step 2. The
   order is canonical WUBRG, not typing order.
4. Set the cost to `{2}{W}{U}{B}` (three colours) → the plain gold `prismatic` frame returns.
5. Clear the cost and type `{2}{C}` → the frame is the **colourless** one (grey-brown), not
   the blue-metal artifact frame.
6. In **Ligne de type**, set Types to `Land` → the frame becomes a **land** frame (earthy
   border, tinted text box).
7. With a two-colour card, click **Exporter en PNG** → the exported image carries the blend
   (this proves the hidden canvases got the prop).

- [ ] **Step 6: Commit**

```bash
npx prettier --write "src/lib/card-editor/components/CardCanvas/CardCanvas.tsx" "src/app/[locale]/studio/components/CardEditorStudio/CardEditorStudio.tsx"
git add "src/lib/card-editor/components/CardCanvas/CardCanvas.tsx" "src/app/[locale]/studio/components/CardEditorStudio/CardEditorStudio.tsx"
git commit -m "feat(studio): paint two-colour blend frames with an SVG mask"
```

---

## Deployment note

This plan adds a **6th migration** to the prod rollout list, after `20260726120000`,
`20260726130000`, `20260727120000`, `20260727130000`, `20260727140000`:

- `20260727150000_add_blend_masks.sql`

It also requires a **`npm run card-assets` run against production** to repopulate
`frame_paths` with the new keys, fill `blend_masks`, and upload the new images — that script
writes to prod by design. Before that run, `frame_paths` keeps its seven keys and
`blend_masks` is `NULL`: rendering is unchanged and nothing breaks.

## Out of scope

- The `snow/`, `shifted/` and `beyond/` frame folders.
- The `stamps` and `indicators` dynamic modules; the Nyx enchantment treatment.
- The `hybrid` and `artifact` blend masks are stored but only `multicolor` is painted —
  hybrid and artifact blends need their own trigger rules, which this plan does not define.
- Legendary crown sharpness — deferred.
- Frame licensing — a separate blocker.
