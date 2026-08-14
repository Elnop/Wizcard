# Legendary Crown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paint the legendary crown over the frame when the type line carries the `Legendary` supertype, on the 27 frames where the corpus's crown actually aligns.

**Architecture:** A measured compatibility rule (native size 375×523 AND name box identical to `magic-m15`) decides at ingestion which frames get a `crown_paths` column; `NULL` means incompatible. The canvas paints one extra `<image>` after the frame when the supertype is present and a crown path resolves.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (local CLI + self-hosted prod), Node scripts with `sharp`, CSS modules.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-27-legendary-crown-design.md` — read it before starting.
- **No test framework in this repo.** Do NOT add vitest/jest. Verification is node one-liners against the real corpus, `npm run check`, `npm run build`, and the browser.
- **`npm run check` is NOT green at base** — ~60 pre-existing problems in unrelated files (`src/lib/mpc/`, `src/lib/scryfall/`). The gate is **"no NEW problems"**: verify with `npx eslint` on the changed files only.
- **⚠ `npm run card-assets` writes to PRODUCTION.** `scripts/lib/load-env.ts` loads `.env.seed` with `override: true`, so an exported `SUPABASE_URL` cannot redirect it. **Never run it during this plan.** Local data is seeded by the throwaway script in Task 2.
- **`npm run sb:reset` is destructive** — never run it. `npm run sb:migrate` is safe.
- **No fallback rule.** A frame with no crown paints nothing. Never substitute a different colour's crown or a different frame's crown — a plausible-but-wrong crown is the exact defect this project's geometry work removed.
- **`land` has no crown.** `MseFrameKey` is `Exclude<FrameStyleId,'auto'> | 'land'`, but the corpus ships no land crown. That key must resolve to `null`, not to a nonexistent `lcrown.png`.
- Repo style: tabs, Prettier. Commit on `feat/custom-card-studio`; do not merge.

---

## File Structure

| File                                                                       | Responsibility                                                                     | Task |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---- |
| `scripts/card-assets/crown-compat.mjs`                                     | **Create.** Pure compatibility rule + crown path building. No I/O.                 | 1    |
| `supabase/migrations/20260727140000_add_crown_paths.sql`                   | **Create.** The column + grants.                                                   | 2    |
| `scripts/card-assets/upload-templates.ts`                                  | **Modify.** Compute + write the column (geometry lives here, not in the manifest). | 2    |
| `scripts/card-assets/seed-local-crowns.mjs`                                | **Create.** Throwaway local seeder — never touches prod.                           | 2    |
| `src/lib/supabase/queries/card-templates.ts`                               | **Modify.** Row type + `CARD_TEMPLATE_SELECT`.                                     | 3    |
| `src/lib/card-editor/mse-assets.ts`                                        | **Modify.** `crownPaths` on `MseTemplate`, `resolveMseCrownPath`.                  | 3    |
| `src/lib/card-editor/components/CardCanvas/CardCanvas.tsx`                 | **Modify.** Paint the crown.                                                       | 4    |
| `src/app/[locale]/studio/components/CardEditorStudio/CardEditorStudio.tsx` | **Modify.** Pass the crown to all three canvases.                                  | 4    |

---

### Task 1: The compatibility rule

Pure module, no I/O, so the ingestion script and any verification script can both use it.

**Files:**

- Create: `scripts/card-assets/crown-compat.mjs`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `CROWN_REFERENCE_NAME_BOX` — `{ left: 32, top: 30, width: 279.2752808988764, height: 23 }`
  - `CROWN_FOLDER` — `'card-assets/v/bcdf4190b4bf/full-magic-pack/data/magic-modules.mse-include/crowns/375'`
  - `acceptsCrown(geometry): boolean`
  - `buildCrownPaths(geometry): Record<string,string> | null`

- [ ] **Step 1: Write the module**

```javascript
// scripts/card-assets/crown-compat.mjs
//
// Décide quels gabarits acceptent la couronne légendaire, et construit leurs
// chemins d'assets.
//
// La couronne du corpus est dessinée pour la barre de titre M15. Elle occupe la
// bande y=10..102 (mesuré sur l'alpha de wcrown.png), c'est-à-dire exactement la
// zone du titre — donc c'est la BOÎTE DU NOM qui décide de l'alignement, pas la
// famille du cadre.
//
// Vérifié dans les deux sens en composant la couronne sur de vrais cadres :
// m15/new/tenth/classicshifted s'alignent (même boîte de nom) ; old, veryold,
// future, megaman, nokiou et horror voient la couronne écraser leur titre
// (boîtes différentes).
//
// Contre-exemple utile : les cadres PRÉ-M15 ne sont pas tous incompatibles.
// `new style` et `tenth` réutilisent la géométrie de titre M15 et acceptent la
// couronne. Filtrer par nom de famille donnerait un mauvais périmètre.

/** Dimensions natives des couronnes du corpus. */
const CROWN_CARD_WIDTH = 375;
const CROWN_CARD_HEIGHT = 523;

/** Boîte du nom de `magic-m15`, la référence d'alignement. */
export const CROWN_REFERENCE_NAME_BOX = {
	left: 32,
	top: 30,
	width: 279.2752808988764,
	height: 23,
};

/** Tolérance de comparaison : les valeurs viennent du même extracteur. */
const BOX_TOLERANCE = 0.5;

/** Dossier des couronnes 375, relatif à la racine des assets. */
export const CROWN_FOLDER =
	'card-assets/v/bcdf4190b4bf/full-magic-pack/data/magic-modules.mse-include/crowns/375';

/**
 * Fichier de couronne par clé de couleur du studio.
 *
 * Mêmes clés que FRAME_FILE_STEMS, à une exception : `land` n'y figure PAS. Le
 * corpus ne fournit aucune couronne terrain, alors que les terrains légendaires
 * existent (Dark Depths, Urborg). Mieux vaut ne rien peindre que de pointer un
 * `lcrown.png` inexistant.
 */
const CROWN_FILE_BY_FRAME = {
	light: 'wcrown.png',
	tide: 'ucrown.png',
	void: 'bcrown.png',
	ember: 'rcrown.png',
	grove: 'gcrown.png',
	prismatic: 'mcrown.png',
	artifact: 'acrown.png',
};

/** Le gabarit accepte-t-il la couronne ? */
export function acceptsCrown(geometry) {
	if (!geometry) return false;
	if (geometry.cardWidth !== CROWN_CARD_WIDTH) return false;
	if (geometry.cardHeight !== CROWN_CARD_HEIGHT) return false;
	const name = geometry.boxes?.name;
	if (!name) return false;
	return ['left', 'top', 'width', 'height'].every(
		(key) => Math.abs(name[key] - CROWN_REFERENCE_NAME_BOX[key]) < BOX_TOLERANCE
	);
}

/**
 * Chemins des couronnes du gabarit, ou `null` s'il n'en accepte pas.
 *
 * `null` et non `{}` : la colonne distingue « incompatible » de « compatible
 * mais sans asset », et le rendu n'a qu'un test à faire.
 */
export function buildCrownPaths(geometry) {
	if (!acceptsCrown(geometry)) return null;
	return Object.fromEntries(
		Object.entries(CROWN_FILE_BY_FRAME).map(([frame, file]) => [frame, `${CROWN_FOLDER}/${file}`])
	);
}
```

- [ ] **Step 2: Verify the rule against the real corpus**

There is no test framework, so verification runs against the live local database.

```bash
SCRATCH=/tmp/claude-1000/-home-elthinkbuntu-Documents-Wizcard/fcade87f-2b5d-4554-baa3-129f3ee2368f/scratchpad
export SCRATCH
ANON=$(npx supabase status -o json | python3 -c "import json,sys;print(json.load(sys.stdin)['ANON_KEY'])")
curl -s "http://127.0.0.1:54321/rest/v1/card_templates?select=id,geometry,render_mode,installer_group&limit=1000" \
  -H "apikey: $ANON" > "$SCRATCH/crown-check.json"

node --input-type=module -e "
import fs from 'node:fs';
import { acceptsCrown } from './scripts/card-assets/crown-compat.mjs';
const rows = JSON.parse(fs.readFileSync(process.env.SCRATCH + '/crown-check.json','utf8'));
const offered = rows.filter(r => r.geometry && r.render_mode === 'frame');
const ok = offered.filter(r => acceptsCrown(r.geometry));
console.log((offered.length === 109 ? 'PASS' : 'FAIL') + '  109 offered frames, got ' + offered.length);
console.log((ok.length === 27 ? 'PASS' : 'FAIL') + '  27 crown-compatible, got ' + ok.length);
const ids = new Set(ok.map(r => r.id));
for (const id of ['magic-m15','magic-new','magic-tenth','magic-classicshifted'])
  console.log((ids.has(id) ? 'PASS' : 'FAIL') + '  ' + id + ' accepts (verified aligned)');
for (const id of ['magic-old','magic-veryold','magic-future','magic-megaman','magic-nokiou','magic-horror'])
  console.log((!ids.has(id) ? 'PASS' : 'FAIL') + '  ' + id + ' rejected (verified misaligned)');
"
```

Expected: every line prints `PASS`. If any prints `FAIL`, fix `crown-compat.mjs` before continuing — the counts and the ten named frames were verified visually during design.

- [ ] **Step 3: Verify `land` has no crown entry**

```bash
node --input-type=module -e "
import { buildCrownPaths } from './scripts/card-assets/crown-compat.mjs';
const geo = { cardWidth: 375, cardHeight: 523,
  boxes: { name: { left: 32, top: 30, width: 279.2752808988764, height: 23 } } };
const paths = buildCrownPaths(geo);
console.log((paths && !('land' in paths) ? 'PASS' : 'FAIL') + '  no land key');
console.log((paths && Object.keys(paths).length === 7 ? 'PASS' : 'FAIL') + '  7 colour keys, got ' + Object.keys(paths || {}).length);
console.log((buildCrownPaths({ cardWidth: 375, cardHeight: 523, boxes: {} }) === null ? 'PASS' : 'FAIL') + '  no name box -> null');
"
```

Expected: three `PASS` lines.

- [ ] **Step 4: Commit**

```bash
npx prettier --write scripts/card-assets/crown-compat.mjs
npx eslint scripts/card-assets/crown-compat.mjs
git add scripts/card-assets/crown-compat.mjs
git commit -m "feat(card-assets): measure which frames accept the legendary crown"
```

---

### Task 2: Migration, ingestion column, local seed

**Files:**

- Create: `supabase/migrations/20260727140000_add_crown_paths.sql`
- Create: `scripts/card-assets/seed-local-crowns.mjs`
- Modify: `scripts/card-assets/upload-templates.ts`

**Interfaces:**

- Consumes: `buildCrownPaths(geometry)` from Task 1.
- Produces: `card_templates.crown_paths jsonb`, `NULL` on incompatible frames.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260727140000_add_crown_paths.sql
--
-- Couronne légendaire
-- (cf. docs/superpowers/specs/2026-07-27-legendary-crown-design.md).
--
-- Le légendaire n'est pas un cadre : c'est une couronne posée SUR le cadre
-- normal, comme sur une vraie carte. Les couronnes du corpus sont dessinées pour
-- la barre de titre M15, donc tous les gabarits ne peuvent pas les porter.

alter table public.card_templates
  add column if not exists crown_paths jsonb;

comment on column public.card_templates.crown_paths is
  'Chemins des couronnes légendaires par clé de couleur, ou NULL si le gabarit n''accepte pas la couronne (boîte de nom incompatible avec la référence M15). Pas de clé `land` : le corpus ne fournit pas de couronne terrain.';

-- Grants explicites : la default ACL de la prod auto-hébergée dérive, une table
-- sans grant déclaré casse en 42501 (cf. mémoire project_table_grants_drift).
grant select on public.card_templates to anon, authenticated;
grant select, insert, update, delete on public.card_templates to service_role;
```

- [ ] **Step 2: Apply and confirm**

```bash
npm run sb:migrate
docker exec supabase_db_scute_swarm psql -U postgres -c "\d card_templates" | grep crown_paths
```

Expected: a `crown_paths | jsonb` line.

If `npm run sb:migrate` reports nothing to apply, the local DB tracks migrations by version
and this file is new, so it should apply. If it does not, apply the SQL directly with
`docker exec supabase_db_scute_swarm psql -U postgres -c "<sql>"` and say so in the report.

- [ ] **Step 3: Write the column at ingestion**

In `scripts/card-assets/upload-templates.ts`:

Add the import near the other `scripts/card-assets` imports:

```typescript
import { buildCrownPaths } from './crown-compat.mjs';
```

Add to the `CardTemplateRow` interface:

```typescript
crown_paths: Record<string, string> | null;
```

In `toRow`, right after the existing `geometry:` line, add:

```typescript
		// Couronne légendaire : dérivée de la MÊME géométrie que la ligne
		// ci-dessus, donc les deux ne peuvent pas diverger. NULL = ce gabarit
		// n'accepte pas la couronne (cf. crown-compat.mjs).
		crown_paths: buildCrownPaths(geometries.get(template.id) ?? null),
```

- [ ] **Step 4: Write the local seeder**

**Do not run `npm run card-assets`** — it writes to production regardless of `SUPABASE_URL`.

```javascript
// scripts/card-assets/seed-local-crowns.mjs
//
// Renseigne crown_paths sur la base LOCALE, à partir de la géométrie déjà
// stockée. Script jetable : `npm run card-assets` charge .env.seed avec
// override:true et écrit donc en PRODUCTION, ce qu'on ne veut pas ici.
//
// Usage : node scripts/card-assets/seed-local-crowns.mjs
import { buildCrownPaths } from './crown-compat.mjs';

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

const listed = await fetch(`${URL_BASE}/rest/v1/card_templates?select=id,geometry&limit=1000`, {
	headers,
});
if (!listed.ok) {
	console.error('lecture impossible', listed.status, await listed.text());
	process.exit(1);
}
const rows = await listed.json();

let withCrown = 0;
for (const row of rows) {
	const crownPaths = buildCrownPaths(row.geometry);
	if (crownPaths) withCrown += 1;
	const response = await fetch(
		`${URL_BASE}/rest/v1/card_templates?id=eq.${encodeURIComponent(row.id)}`,
		{
			method: 'PATCH',
			headers: { ...headers, Prefer: 'return=minimal' },
			body: JSON.stringify({ crown_paths: crownPaths }),
		}
	);
	if (!response.ok) {
		console.error(row.id, response.status, await response.text());
		process.exit(1);
	}
	// Drain the body so the socket is released (cf. mémoire project_scryfall_body_drain).
	await response.body?.cancel();
}
console.log(`patched ${rows.length} rows, ${withCrown} with a crown`);
```

- [ ] **Step 5: Seed and verify the count**

```bash
export SUPABASE_SERVICE_ROLE_KEY=$(npx supabase status -o json | python3 -c "import json,sys;print(json.load(sys.stdin)['SERVICE_ROLE_KEY'])")
node scripts/card-assets/seed-local-crowns.mjs

ANON=$(npx supabase status -o json | python3 -c "import json,sys;print(json.load(sys.stdin)['ANON_KEY'])")
curl -s "http://127.0.0.1:54321/rest/v1/card_templates?select=id,crown_paths,geometry,render_mode&limit=1000" -H "apikey: $ANON" \
| python3 -c "
import json,sys
rows=json.load(sys.stdin)
offered=[r for r in rows if r['geometry'] and r['render_mode']=='frame']
crowned=[r for r in offered if r['crown_paths']]
print('offered:', len(offered), '| with crown:', len(crowned))
print('PASS' if len(crowned)==27 else 'FAIL', '27 expected')
m15=[r for r in rows if r['id']=='magic-m15'][0]
print('magic-m15 keys:', sorted((m15['crown_paths'] or {}).keys()))
print('PASS' if 'land' not in (m15['crown_paths'] or {}) else 'FAIL', 'no land key')
"
```

Expected: `27` crowned frames, `magic-m15` carrying the 7 colour keys, no `land`.

- [ ] **Step 6: Confirm the asset actually serves**

The crown must be reachable through Storage, not merely referenced.

```bash
ANON=$(npx supabase status -o json | python3 -c "import json,sys;print(json.load(sys.stdin)['ANON_KEY'])")
P=$(curl -s "http://127.0.0.1:54321/rest/v1/card_templates?select=crown_paths&id=eq.magic-m15" -H "apikey: $ANON" \
    | python3 -c "import json,sys;print(json.load(sys.stdin)[0]['crown_paths']['light'])")
echo "path: $P"
curl -s -o /dev/null -w "  HTTP %{http_code}  %{size_download} bytes\n" \
  "http://127.0.0.1:54321/storage/v1/object/public/card-templates/$(python3 -c "
import urllib.parse,sys; print(urllib.parse.quote('$P'))")"
```

Expected: `HTTP 200` with a non-zero size. **If this returns 404**, the crown files were
never uploaded to local Storage — record that in the report and continue; Task 4's browser
check will show no crown, and the fix is a Storage upload, not a code change.

- [ ] **Step 7: Schema audit and commit**

```bash
npm run sb:verify
npx prettier --write scripts/card-assets/upload-templates.ts scripts/card-assets/seed-local-crowns.mjs
npx eslint scripts/card-assets/upload-templates.ts
git add supabase/migrations/20260727140000_add_crown_paths.sql scripts/card-assets/upload-templates.ts scripts/card-assets/seed-local-crowns.mjs
git commit -m "feat(card-templates): add crown_paths, measured at ingestion"
```

Expected from `sb:verify`: no FAIL lines.

---

### Task 3: Read-side resolution

**Files:**

- Modify: `src/lib/supabase/queries/card-templates.ts`
- Modify: `src/lib/card-editor/mse-assets.ts`

**Interfaces:**

- Consumes: the `crown_paths` column from Task 2.
- Produces:
  - `MseTemplate` gains `crownPaths: Partial<Record<MseFrameKey, string>> | null`
  - `resolveMseCrownPath(template: MseTemplate | undefined, face: CardFaceDraft, isLegendary: boolean): string | null`

- [ ] **Step 1: Update the query row and select list**

`CARD_TEMPLATE_SELECT` is an explicit column list, not `select *`. A column missing from it
is simply absent at runtime, and **tsc cannot catch it** — it is a string.

In `src/lib/supabase/queries/card-templates.ts`, add to `CardTemplateRow`:

```typescript
crown_paths: Record<string, string> | null;
```

And append `crown_paths` to the select list:

```typescript
export const CARD_TEMPLATE_SELECT =
	'id, name, short_name, source, quality, orientation, layout_id, sample_path, icon_path, frame_paths, frame_text_colors, sample_text_colors, render_mode, width, height, dpi, asset_version, version, geometry, installer_group, position_hint, tags, crown_paths';
```

- [ ] **Step 2: Add the field to `MseTemplate` and its mapper**

In `src/lib/card-editor/mse-assets.ts`, add to the `MseTemplate` interface, next to
`framePaths`:

```typescript
/** Couronnes légendaires par clé de couleur ; null = gabarit incompatible. */
crownPaths: Partial<Record<MseFrameKey, string>> | null;
```

And in `rowToTemplate`, next to the `framePaths` line:

```typescript
		crownPaths: (row.crown_paths ?? null) as Partial<Record<MseFrameKey, string>> | null,
```

- [ ] **Step 3: Add the resolver**

Add after `resolveMseFramePath` in the same file:

```typescript
/**
 * Chemin de la couronne légendaire, ou `null`.
 *
 * Trois raisons de ne rien peindre, toutes légitimes :
 *
 * 1. la carte n'est pas légendaire ;
 * 2. le gabarit n'accepte pas la couronne (`crownPaths` à null) — sa barre de
 *    titre n'a pas la géométrie pour laquelle les couronnes sont dessinées ;
 * 3. la clé de couleur n'a pas de couronne : c'est le cas de `land`, que le
 *    corpus ne fournit pas alors que les terrains légendaires existent.
 *
 * Contrairement à `resolveMseFramePath`, AUCUN repli sur une autre clé : une
 * couronne de la mauvaise couleur se verrait immédiatement, alors qu'un cadre de
 * repli reste plausible. C'est la règle « aucun fallback » du studio.
 */
export function resolveMseCrownPath(
	template: MseTemplate | undefined,
	face: CardFaceDraft,
	isLegendary: boolean
): string | null {
	if (!isLegendary) return null;
	if (!template?.crownPaths) return null;
	const frame = resolveFrameStyle(face);
	const path = template.crownPaths[frame];
	return path ? cardAssetUrl(path) : null;
}
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean. Nothing consumes the resolver yet, which is fine.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/supabase/queries/card-templates.ts src/lib/card-editor/mse-assets.ts
npx eslint src/lib/supabase/queries/card-templates.ts src/lib/card-editor/mse-assets.ts
git add src/lib/supabase/queries/card-templates.ts src/lib/card-editor/mse-assets.ts
git commit -m "feat(studio): resolve the legendary crown path for a face"
```

---

### Task 4: Paint the crown

**Files:**

- Modify: `src/lib/card-editor/components/CardCanvas/CardCanvas.tsx`
- Modify: `src/app/[locale]/studio/components/CardEditorStudio/CardEditorStudio.tsx`

**Interfaces:**

- Consumes: `resolveMseCrownPath` (Task 3), `parseTypeLine(typeLine, vocabulary)` from
  `@/lib/card-editor/type-line`, `useCardTypeVocabulary()` from
  `@/lib/scryfall/hooks/useCardTypeVocabulary`.
- Produces: the finished feature. `CardCanvasProps` gains `mseCrownPath?: string | null`.

- [ ] **Step 1: Add the prop and paint it**

In `CardCanvas.tsx`, add to `CardCanvasProps`, right after `mseFramePath`:

```typescript
	mseCrownPath?: string | null;
```

Add `mseCrownPath` to the destructured parameters of **both** `CardSvg` and the
`CardCanvas` component, and pass it from `CardCanvas` down to `<CardSvg>`.

In `CardSvg`, immediately after the existing `{mseFramePath && (...)}` block, add:

```tsx
{
	/*
	 * Couronne légendaire, peinte APRÈS le cadre : elle mord sur le haut de
	 * la barre de titre, c'est ce recouvrement qui fait la couronne.
	 *
	 * Même `preserveAspectRatio="none"` que le cadre — le PNG est déjà cadré
	 * aux dimensions du gabarit.
	 */
}
{
	mseCrownPath && (
		<image
			href={mseCrownPath}
			x="0"
			y="0"
			width={geometry.width}
			height={geometry.height}
			preserveAspectRatio="none"
		/>
	);
}
```

- [ ] **Step 2: Wire it in the studio**

In `CardEditorStudio.tsx`, add the imports:

```typescript
import { resolveMseCrownPath } from '@/lib/card-editor/mse-assets';
import { parseTypeLine } from '@/lib/card-editor/type-line';
import { useCardTypeVocabulary } from '@/lib/scryfall/hooks/useCardTypeVocabulary';
```

(`resolveMseCrownPath` joins the existing `mse-assets` import block rather than a new line.)

Inside the component, next to the other hooks:

```typescript
// La couronne se déclenche sur le SUPERTYPE, comme MSE
// (`match(card.super_type, "Legendary")`) — pas sur une case à cocher. La
// ligne de type reste la source unique, donc rien ne peut diverger entre ce
// qui est écrit et ce qui est peint.
const typeVocabulary = useCardTypeVocabulary();
const isLegendary = (face: CardFaceDraft) =>
	parseTypeLine(face.typeLine, typeVocabulary).supertypes.includes('Legendary');
```

Add `CardFaceDraft` to the type imports from `@/lib/card-editor/types` if it is not already
there.

Then pass the crown to **all three** `CardCanvas` instances — the on-screen preview and the
two hidden ones used for PNG export and saving. A prop added to only the preview makes
exported images diverge from what the user sees.

Next to each existing `mseFramePath={resolveMseFramePath(selectedMseTemplate, X)}`, add:

```tsx
						mseCrownPath={resolveMseCrownPath(selectedMseTemplate, X, isLegendary(X))}
```

where `X` is that instance's face — `editor.activeFace`, `editor.draft.faces[0]`, and
`editor.draft.faces[1]` respectively. Note the third is optional: guard it the same way the
surrounding code already guards `faces[1]`.

- [ ] **Step 3: Static checks**

```bash
npx tsc --noEmit
npx eslint "src/lib/card-editor/components/CardCanvas/CardCanvas.tsx" "src/app/[locale]/studio/components/CardEditorStudio/CardEditorStudio.tsx"
npm run build
```

Expected: tsc clean, no NEW eslint problems, build succeeds.

- [ ] **Step 4: Browser verification**

This is the gate that matters — two bugs previously shipped past static checks on this
feature.

```bash
npm run dev
```

Open `http://localhost:3000/fr/studio` and confirm, in order:

1. Pick a frame from the **m15 style** family (the library opens on it).
2. In the **Carte** tab, type `Legendary` in the **Supertypes** field → the crown appears
   over the title bar, aligned.
3. Remove it → the crown disappears.
4. In the **Layout** tab, change the frame **palette** (Braise, Marée…) → the crown changes
   colour with the frame.
5. Switch to a frame from the **old style** family with `Legendary` still set → **no crown**
   appears, and nothing looks broken.
6. Click **Exporter en PNG** with a legendary M15 card → the exported image carries the
   crown (this proves the hidden canvases got the prop).

- [ ] **Step 5: Commit**

```bash
npx prettier --write "src/lib/card-editor/components/CardCanvas/CardCanvas.tsx" "src/app/[locale]/studio/components/CardEditorStudio/CardEditorStudio.tsx"
git add "src/lib/card-editor/components/CardCanvas/CardCanvas.tsx" "src/app/[locale]/studio/components/CardEditorStudio/CardEditorStudio.tsx"
git commit -m "feat(studio): paint the legendary crown on compatible frames"
```

---

## Deployment note

This plan adds a **5th migration** to the prod rollout list, after `20260726120000`,
`20260726130000`, `20260727120000`, `20260727130000`:

- `20260727140000_add_crown_paths.sql`

It also requires a **`npm run card-assets` run against production** to populate
`crown_paths` and upload the crown images — that script writes to prod by design
(`.env.seed` with `override: true`). Before that run, `crown_paths` is `NULL` on every row,
so no crown renders and nothing breaks.

## Out of scope

- The other MSE styling options: `nyx`, `companion`, `brawl`, `borderless`.
- Crowns in the `750` and `744x1039` folders — those are masks, composed differently.
- Making the 82 incompatible frames compatible (would mean redrawing crowns).
- Frame licensing — a separate blocker.
