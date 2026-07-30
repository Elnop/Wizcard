# Frame Library Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the studio's 109-frame library navigable by exposing the taxonomy the MSE corpus already declares, and remove `kind`, the regex heuristic that currently groups 69 of them into one useless bucket.

**Architecture:** Three new columns on `card_templates` (`installer_group`, `position_hint`, `tags text[]`) filled at ingestion from the `.mse-style` files. `tags` receives every keyword from every source with nothing arbitrated away. Reading code projects family and origin from the stored path; the picker gains a filter modal, infinite scroll, larger thumbnails and badges.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (local CLI + self-hosted prod), next-intl, CSS modules.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-27-frame-picker-navigation-design.md` — read it before starting.
- **No test framework in this repo.** Verification is `npm run check` + `npm run build` + browser. Do not add vitest/jest.
- **`npm run check` is NOT green at base** — roughly 60 pre-existing problems in unrelated files (`src/lib/mpc/`, `src/lib/scryfall/`). The gate is **"no NEW problems"**, verified by running `npx eslint` on the changed files only.
- **⚠ `npm run card-assets` writes to PRODUCTION.** `scripts/lib/load-env.ts` loads `.env.seed` with `override: true`, so an exported `SUPABASE_URL` cannot redirect it. **Never run it during this plan.** Local data is seeded by a throwaway script that talks to `127.0.0.1:54321` directly (Task 3).
- **Word-boundary parsing:** split on `[^a-z0-9]+`, compare whole tokens. Never substring-match for classification.
- **Two `frame-facets.ts` files stay separate** — `scripts/` reads the filesystem (Node), `src/` projects loaded columns (client). Merging them breaks the Turbopack build (`server-only import boundary`).
- **Grants must be explicit in the migration** — prod's default ACL drifts (see `project_table_grants_drift`).
- **Commit after every task.** Branch is `feat/custom-card-studio`; do not merge to main.

---

## File Structure

| File                                                          | Responsibility                                                           | Task |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ | ---- |
| `scripts/card-assets/frame-keywords.mjs`                      | **Create.** Pure keyword extraction + normalisation. No I/O.             | 1    |
| `scripts/card-assets/generate-manifests.mjs`                  | **Modify.** Add `positionHint` + `tags`; delete `classify()` and `kind`. | 2    |
| `supabase/migrations/20260727130000_add_frame_facets.sql`     | **Create.** 3 columns, drop `kind`, grants, index.                       | 3    |
| `scripts/card-assets/upload-templates.ts`                     | **Modify.** Write the 3 new columns, stop writing `kind`.                | 3    |
| `src/lib/card-editor/frame-facets.ts`                         | **Create.** Read-side projections: family, origin, creature-capable.     | 4    |
| `src/lib/card-editor/mse-assets.ts`                           | **Modify.** Drop `kind` from the type/row mapper, add the 3 fields.      | 4    |
| `src/lib/card-editor/frame-choices.ts`                        | **Modify.** Sort by `position_hint`, group by family, filter.            | 5    |
| `.../MseTemplatePicker/FrameFilterModal.tsx` + `.module.css`  | **Create.** The 5-field filter modal.                                    | 6    |
| `.../MseTemplatePicker/MseTemplatePicker.tsx` + `.module.css` | **Modify.** Grid, badges, infinite scroll, wider search.                 | 7    |
| `messages/{en,fr}.json`                                       | **Modify.** New keys; drop `kinds.*` / `sections.*`.                     | 6, 7 |

---

### Task 1: Keyword extraction module

Pure functions, no I/O, so the ingestion script and the throwaway seeder can both use it.

**Files:**

- Create: `scripts/card-assets/frame-keywords.mjs`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `tokenize(text: string): string[]` — lowercase whole-word tokens.
  - `normalizeKeyword(raw: string): string | null` — canonical form, `null` if dropped.
  - `extractKeywords({ id, name, shortName, installerGroup }): string[]` — sorted unique union.

- [ ] **Step 1: Write the module**

```javascript
// scripts/card-assets/frame-keywords.mjs
//
// Extraction des mots-clés d'un gabarit MSE, à partir de TOUTES ses sources :
// l'id, le nom, le short name et le chemin `installer group` déclaré.
//
// Deux règles portent ce fichier (cf. le spec) :
//
// 1. MOTS ENTIERS, jamais de sous-chaîne. C'est ce qui distingue un indice d'une
//    collision : `/box/` matchait « Taller Textbox » et classait ce gabarit en
//    « packaging ». On découpe sur tout ce qui n'est pas alphanumérique.
// 2. RIEN N'EST ARBITRÉ. On garde les 188 mots-clés, y compris les mots de
//    phrase (`after`, `edition`). Les écarter demanderait de juger ce qui est un
//    mot-clé — précisément l'arbitrage que ce chantier supprime.

/** Jetons sans pouvoir discriminant. Mesuré, pas supposé. */
const STOPWORDS = new Set([
	// Présent sur 107 des 109 gabarits.
	'magic',
	// Mots de structure du chemin `installer group`.
	'card',
	'cards',
	'style',
	'normal',
]);

/**
 * Variantes d'écriture d'une MÊME notion, fusionnées.
 *
 * Table explicite et non heuristique : elle se lit et se corrige. La fusion est
 * CONSERVATRICE — elle ne rapproche jamais deux notions voisines. `flip` et
 * `double_faced` restent donc distincts : un flip a une seule face imprimée
 * qu'on pivote, une DFC en a deux.
 */
const SYNONYMS = new Map([
	['planeswalkers', 'planeswalker'],
	['walkers', 'planeswalker'],
	['tokens', 'token'],
	['gods', 'god'],
	['splits', 'split'],
	['promotional', 'promo'],
	['doublefaced', 'double_faced'],
	['fpm', 'firepenguinmaster'],
]);

/** Découpe en mots entiers minuscules. */
export function tokenize(text) {
	return String(text ?? '')
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean);
}

/**
 * Forme canonique d'un mot-clé, ou `null` s'il est écarté.
 *
 * Ordre : minuscules -> suppression du suffixe « cards » -> synonymes ->
 * espaces en `_`. Les jetons d'un seul caractère et purement numériques sont
 * écartés : ils ne désignent rien (`1`, `2`, `d`, `w`).
 */
export function normalizeKeyword(raw) {
	const cleaned = String(raw ?? '')
		.toLowerCase()
		.trim()
		.replace(/\s+cards?$/, '')
		.trim();
	if (!cleaned) return null;

	const collapsed = cleaned.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
	if (!collapsed) return null;

	const canonical = SYNONYMS.get(collapsed) ?? collapsed;
	if (STOPWORDS.has(canonical)) return null;
	if (canonical.length < 2) return null;
	if (/^\d+$/.test(canonical)) return null;
	return canonical;
}

/**
 * Union des mots-clés de toutes les sources.
 *
 * Les deux sources s'AJOUTENT, elles ne s'écrasent pas — vérifié : le chemin
 * seul perdrait `magic-m15-token-invention` (chemin « devoid cards », id
 * « token »), `magic-m15-scroll-demon-planeswalker` et
 * `magic-m15-outlaws-planeswalker` (chemin « normal cards »).
 *
 * Nuance de découpage : un segment de chemin est pris EN ENTIER (« double
 * faced » est un mot-clé, pas deux), parce que c'est une unité déclarée. L'id et
 * le nom sont du texte libre, donc découpés en mots.
 */
export function extractKeywords({ id, name, shortName, installerGroup }) {
	const keywords = new Set();

	for (const source of [id, name, shortName]) {
		for (const token of tokenize(source)) {
			const keyword = normalizeKeyword(token);
			if (keyword) keywords.add(keyword);
		}
	}

	// Segments 3+ du chemin : les deux premiers sont le namespace de jeu et la
	// famille, qui sont exposés séparément via `installer_group`.
	const segments = String(installerGroup ?? '')
		.split('/')
		.map((segment) => segment.trim())
		.filter(Boolean);
	for (const segment of segments.slice(2)) {
		const keyword = normalizeKeyword(segment);
		if (keyword) keywords.add(keyword);
	}

	return [...keywords].sort();
}
```

- [ ] **Step 2: Verify against the real corpus**

There is no test framework, so verification is a throwaway script run against the actual 109 frames.

```bash
node --input-type=module -e "
import { extractKeywords, normalizeKeyword, tokenize } from './scripts/card-assets/frame-keywords.mjs';

// The three frames the spec says the declared path alone would lose.
const rescued = [
  { id: 'magic-m15-token-invention', name: 'Kaladesh Invention', shortName: 'M15 Masterpiece',
    installerGroup: 'magic/m15 style/devoid cards', want: ['token','devoid'] },
  { id: 'magic-m15-outlaws-planeswalker', name: 'After M15', shortName: 'M15 style',
    installerGroup: 'magic/m15 style/normal cards', want: ['planeswalker'] },
];
for (const f of rescued) {
  const got = extractKeywords(f);
  for (const w of f.want) {
    console.log((got.includes(w) ? 'PASS' : 'FAIL') + '  ' + f.id + ' carries ' + w);
  }
}

// Whole-word: 'box' must NOT be produced by 'Taller Textbox'.
const bigtext = extractKeywords({ id: 'magic-m15-bigtext', name: 'After M15 with Taller Textbox',
  shortName: '', installerGroup: 'magic/m15 style/cards with big text' });
console.log((bigtext.includes('box') ? 'FAIL' : 'PASS') + '  no bogus \"box\" from \"Textbox\"');

// Synonyms merge; flip stays distinct from double_faced.
console.log((normalizeKeyword('planeswalkers') === 'planeswalker' ? 'PASS' : 'FAIL') + '  planeswalkers -> planeswalker');
console.log((normalizeKeyword('double faced') === 'double_faced' ? 'PASS' : 'FAIL') + '  double faced -> double_faced');
console.log((normalizeKeyword('flip') === 'flip' ? 'PASS' : 'FAIL') + '  flip stays flip');
console.log((normalizeKeyword('magic') === null ? 'PASS' : 'FAIL') + '  magic dropped');
console.log((normalizeKeyword('2') === null ? 'PASS' : 'FAIL') + '  numeric dropped');
"
```

Expected: every line prints `PASS`. If any prints `FAIL`, fix `frame-keywords.mjs` before continuing.

- [ ] **Step 3: Verify the corpus-wide keyword count**

```bash
node --input-type=module -e "
import fs from 'node:fs';
import path from 'node:path';
import { extractKeywords } from './scripts/card-assets/frame-keywords.mjs';
const ROOT='assets/card-templates/card-assets/v/bcdf4190b4bf/full-magic-pack/data';
const manifest=JSON.parse(fs.readFileSync('assets/card-templates/manifests/templates.json','utf8'));
const rows=Array.isArray(manifest)?manifest:manifest.templates;
const all=new Set();
for (const t of rows) {
  for (const k of extractKeywords({id:t.id,name:t.name,shortName:t.shortName,installerGroup:t.installerGroup})) all.add(k);
}
console.log('distinct keywords across the manifest:', all.size);
console.log('sample:', [...all].sort().slice(0,20).join(', '));
"
```

Expected: a keyword count in the ~200 range (the manifest holds 382 templates, more than the 109 offered), and the sample must contain real words, not fragments.

- [ ] **Step 4: Commit**

```bash
git add scripts/card-assets/frame-keywords.mjs
git commit -m "feat(card-assets): extract frame keywords from every declared source"
```

---

### Task 2: Emit `positionHint` and `tags`, delete `classify()`

`installerGroup` is **already** in the manifest (`generate-manifests.mjs:182,210`). Only `positionHint` and `tags` are missing, and `kind` must go.

**Files:**

- Modify: `scripts/card-assets/generate-manifests.mjs` (delete `classify()` at ~112-122; the template object at ~200-215)

**Interfaces:**

- Consumes: `extractKeywords` from Task 1.
- Produces: manifest entries gain `positionHint: string | null` and `tags: string[]`, and lose `kind`.

- [ ] **Step 1: Import the extractor**

Add near the other imports at the top of `scripts/card-assets/generate-manifests.mjs`:

```javascript
import { extractKeywords } from './frame-keywords.mjs';
```

- [ ] **Step 2: Delete `classify()`**

Remove this entire function (currently ~line 112):

```javascript
function classify(id, name) {
	const haystack = `${id} ${name}`.toLowerCase();
	if (/token|emblem/.test(haystack)) return 'token';
	if (/planeswalker/.test(haystack)) return 'planeswalker';
	if (/saga/.test(haystack)) return 'saga';
	if (/split|aftermath/.test(haystack)) return 'split';
	if (/double|transform|flip|meld/.test(haystack)) return 'double-faced';
	if (/planechase|planar|scheme|vanguard/.test(haystack)) return 'oversized';
	if (/booster|box|pack|wrapper/.test(haystack)) return 'packaging';
	return 'card';
}
```

- [ ] **Step 3: Replace `kind` with `positionHint` + `tags` in the template object**

In the object returned around line 200, delete the `kind: classify(id, name),` line and add the two new fields. The `installerGroup` line already exists — keep it:

```javascript
		installerGroup,
		// Ordre déclaré par les auteurs du corpus (001–907). C'est le tri du
		// sélecteur : l'ordre alphabétique précédent éclatait la chronologie des
		// cadres (« 10th edition » sous 1, « After M15 » sous A).
		positionHint: topLevelValue(source, 'position hint'),
		// Tous les mots-clés, toutes sources confondues. Remplace `kind`, dont la
		// cascade de regex produisait des faux positifs (« Textbox » -> packaging)
		// et écrasait la distinction flip / double-face.
		tags: extractKeywords({
			id,
			name,
			shortName: topLevelValue(source, 'short name'),
			installerGroup,
		}),
```

- [ ] **Step 4: Remove the now-dead `kind` grouping in the summary**

Around line 308 the script groups the summary by `template.kind`. Group by the declared family instead:

```javascript
Object.entries(
	Object.groupBy(
		templates,
		(template) => template.installerGroup?.split('/')[1]?.trim() ?? 'unknown'
	)
).map(([family, entries]) => [family, entries.length]);
```

- [ ] **Step 5: Handle the hand-written entry**

Around line 260 a template literal object sets `kind: 'card'` and `installerGroup: 'Accurate Frames'`. Delete the `kind` line and add:

```javascript
		positionHint: null,
		tags: [],
```

- [ ] **Step 6: Regenerate and verify**

```bash
node scripts/card-assets/generate-manifests.mjs
python3 -c "
import json
m=json.load(open('assets/card-templates/manifests/templates.json'))
ts=m if isinstance(m,list) else m['templates']
t=[x for x in ts if x['id']=='magic-m15'][0]
print('has kind (must be False):', 'kind' in t)
print('positionHint:', t.get('positionHint'))
print('tags:', t.get('tags'))
missing=[x['id'] for x in ts if not x.get('positionHint')]
print('templates without positionHint:', len(missing))
"
```

Expected: `has kind: False`, `positionHint: 010`, `tags` a non-empty list containing `m15`.

- [ ] **Step 7: Commit**

```bash
git add scripts/card-assets/generate-manifests.mjs assets/card-templates/manifests/templates.json
git commit -m "feat(card-assets): emit positionHint and tags, drop the kind heuristic"
```

---

### Task 3: Migration + ingestion columns + local seed

**Files:**

- Create: `supabase/migrations/20260727130000_add_frame_facets.sql`
- Create: `scripts/card-assets/seed-local-facets.mjs` (throwaway local seeder — **never** touches prod)
- Modify: `scripts/card-assets/upload-templates.ts` (the `CardTemplateRow` type and `toRow`)

**Interfaces:**

- Consumes: manifest fields from Task 2.
- Produces: `card_templates.installer_group`, `.position_hint`, `.tags`; `kind` dropped.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260727130000_add_frame_facets.sql
--
-- Navigation de la bibliothèque de cadres
-- (cf. docs/superpowers/specs/2026-07-27-frame-picker-navigation-design.md).
--
-- Le corpus MSE déclare sa propre taxonomie — `installer group` et
-- `position hint` sont présents sur les 109 gabarits proposés. On l'expose au
-- lieu de la réinterpréter.

alter table public.card_templates
  add column if not exists installer_group text,
  add column if not exists position_hint text,
  add column if not exists tags text[] not null default '{}';

comment on column public.card_templates.installer_group is
  'Chemin `installer group` BRUT du style MSE (magic/m15 style/split cards). Non découpé : la famille en est une projection, tout reste re-dérivable.';
comment on column public.card_templates.position_hint is
  'Champ `position hint` déclaré (001-907). Ordre de tri du sélecteur.';
comment on column public.card_templates.tags is
  'Tous les mots-clés du gabarit, union de l''id, du nom et du chemin déclaré. Remplace `kind`.';

-- `kind` était une cascade de regex sur id+name, pas de la donnée : elle
-- produisait des faux positifs (« Taller Textbox » -> packaging, « Planar
-- Chaos » -> oversized, un gabarit chacune) et rangeait les flip cards avec les
-- double-faces, deux mécaniques distinctes. Elle n'est lue que par le studio et
-- ne pilote aucun rendu (la géométrie vient de `geometry`).
alter table public.card_templates
  drop column if exists kind;

-- Le filtre par mot-clé interroge un tableau : index GIN.
create index if not exists card_templates_tags_idx
  on public.card_templates using gin (tags);

-- Tri par défaut du sélecteur.
create index if not exists card_templates_position_hint_idx
  on public.card_templates (position_hint);

-- Grants explicites : la default ACL de la prod auto-hébergée dérive, une table
-- sans grant déclaré casse en 42501 (cf. mémoire project_table_grants_drift).
grant select on public.card_templates to anon, authenticated;
grant select, insert, update, delete on public.card_templates to service_role;
```

- [ ] **Step 2: Apply it and confirm the shape**

```bash
npm run sb:migrate
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\d public.card_templates" | grep -E "installer_group|position_hint|tags|kind"
```

Expected: `installer_group`, `position_hint`, `tags` present; **no** `kind` row.

- [ ] **Step 3: Update the ingestion row type**

In `scripts/card-assets/upload-templates.ts`, find `interface CardTemplateRow`, delete the `kind` field, and add:

```typescript
	installer_group: string | null;
	position_hint: string | null;
	tags: string[];
```

In `toRow`, delete `kind: template.kind,` and add:

```typescript
		installer_group: template.installerGroup ?? null,
		position_hint: template.positionHint ?? null,
		tags: template.tags ?? [],
```

Also update the `ManifestTemplate` interface in the same file: remove `kind`, add `installerGroup?: string | null; positionHint?: string | null; tags?: string[];`.

- [ ] **Step 4: Write the local seeder**

**Do not run `npm run card-assets`** — it writes to production regardless of `SUPABASE_URL`.

```javascript
// scripts/card-assets/seed-local-facets.mjs
//
// Renseigne installer_group / position_hint / tags sur la base LOCALE, à partir
// du manifeste. Script jetable : `npm run card-assets` charge .env.seed avec
// override:true et écrit donc en PRODUCTION, ce qu'on ne veut pas ici.
//
// Usage : node scripts/card-assets/seed-local-facets.mjs
import fs from 'node:fs';

const URL_BASE = 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
	console.error('SUPABASE_SERVICE_ROLE_KEY manquant. Récupère-le via `npx supabase status`.');
	process.exit(1);
}

const manifest = JSON.parse(
	fs.readFileSync('assets/card-templates/manifests/templates.json', 'utf8')
);
const templates = Array.isArray(manifest) ? manifest : manifest.templates;

let updated = 0;
for (const template of templates) {
	const response = await fetch(
		`${URL_BASE}/rest/v1/card_templates?id=eq.${encodeURIComponent(template.id)}`,
		{
			method: 'PATCH',
			headers: {
				apikey: SERVICE_KEY,
				Authorization: `Bearer ${SERVICE_KEY}`,
				'Content-Type': 'application/json',
				Prefer: 'return=minimal',
			},
			body: JSON.stringify({
				installer_group: template.installerGroup ?? null,
				position_hint: template.positionHint ?? null,
				tags: template.tags ?? [],
			}),
		}
	);
	if (!response.ok) {
		console.error(template.id, response.status, await response.text());
		process.exit(1);
	}
	// Drain the body so the socket is released (cf. mémoire project_scryfall_body_drain).
	await response.body?.cancel();
	updated += 1;
}
console.log(`patched ${updated} rows`);
```

- [ ] **Step 5: Seed and verify**

```bash
export SUPABASE_SERVICE_ROLE_KEY=$(npx supabase status -o json | python3 -c "import json,sys;print(json.load(sys.stdin)['SERVICE_ROLE_KEY'])")
node scripts/card-assets/seed-local-facets.mjs
ANON=$(npx supabase status -o json | python3 -c "import json,sys;print(json.load(sys.stdin)['ANON_KEY'])")
curl -s "http://127.0.0.1:54321/rest/v1/card_templates?select=id,installer_group,position_hint,tags&id=eq.magic-m15" -H "apikey: $ANON" | python3 -m json.tool
```

Expected: `installer_group` = `magic/m15 style/normal cards`, `position_hint` = `010`, `tags` a non-empty array.

- [ ] **Step 6: Schema audit**

```bash
npm run sb:verify
```

Expected: no FAIL lines. `INFO` on an empty catalogue is normal and is never a failure.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260727130000_add_frame_facets.sql scripts/card-assets/upload-templates.ts scripts/card-assets/seed-local-facets.mjs
git commit -m "feat(card-templates): add installer_group, position_hint and tags; drop kind"
```

---

### Task 4: Read-side projections

**Files:**

- Create: `src/lib/card-editor/frame-facets.ts`
- Modify: `src/lib/supabase/queries/card-templates.ts` (`CardTemplateRow` ~line 30, `CARD_TEMPLATE_SELECT` ~line 53)
- Modify: `src/lib/card-editor/mse-assets.ts` (the `MseTemplate` interface ~line 19, `rowToTemplate` ~line 81, `layoutForMseTemplate` ~line 168)

**Interfaces:**

- Consumes: the three columns from Task 3.
- Produces:
  - `frameFamily(template: MseTemplate): string`
  - `frameOrigin(template: MseTemplate): 'official' | 'custom'`
  - `supportsCreature(template: MseTemplate): boolean`
  - `hasTag(template: MseTemplate, tag: string): boolean`
  - `countTags(templates: MseTemplate[]): Map<string, number>`
  - `rankTagsByRarity(tags: string[], counts: Map<string, number>): string[]`
  - `displayableTags(tags: string[]): string[]`
  - `MseTemplate` gains `installerGroup: string | null`, `positionHint: string | null`, `tags: string[]`, and loses `kind`.

- [ ] **Step 0: Update the query column list — do this FIRST**

`CARD_TEMPLATE_SELECT` is an **explicit column list**, not `select *`. It still names `kind`, which Task 3 dropped: leaving it there makes every catalogue query fail at runtime with a PostgREST error, and **tsc will not catch it** — it is a string.

In `src/lib/supabase/queries/card-templates.ts`, remove `kind: string;` from `CardTemplateRow` and add:

```typescript
	installer_group: string | null;
	position_hint: string | null;
	tags: string[];
```

Then replace the select list, dropping `kind` and adding the three new columns:

```typescript
export const CARD_TEMPLATE_SELECT =
	'id, name, short_name, source, quality, orientation, layout_id, sample_path, icon_path, frame_paths, frame_text_colors, sample_text_colors, render_mode, width, height, dpi, asset_version, version, geometry, installer_group, position_hint, tags';
```

- [ ] **Step 1: Write the projections module**

```typescript
// src/lib/card-editor/frame-facets.ts
import type { MseTemplate } from './mse-assets';

/**
 * Projections de lecture sur les facettes d'un gabarit.
 *
 * Rien n'est stocké ici : tout se dérive de colonnes déjà chargées. C'est
 * délibéré — une facette calculée ne peut pas diverger de sa source, et se
 * corrige en un commit sans repasser par `card-assets` (qui écrit en PROD).
 *
 * Le pendant `scripts/card-assets/frame-keywords.mjs` reste un fichier SÉPARÉ :
 * il lit le système de fichiers à l'ingestion. Les fusionner ferait entrer du
 * code Node dans un module client et casserait le build Turbopack.
 */

/** Familles reproduisant un cadre officiel Wizards. Le reste est communautaire. */
const OFFICIAL_FAMILIES = new Set([
	'old style',
	'new style',
	'm15 style',
	'future',
	'planeshifted',
	'classicshifted',
	'tenth edition packaging style',
	'4th edition style',
]);

/** Repli quand le chemin est absent ou trop court pour porter une famille. */
export const UNKNOWN_FAMILY = 'unknown';

/**
 * Famille déclarée : 2e segment du chemin (`magic/m15 style/...` -> `m15 style`).
 *
 * Le 1er segment est le namespace de jeu (`magic`, `Space`), constant ou
 * presque, donc sans pouvoir discriminant.
 */
export function frameFamily(template: MseTemplate): string {
	const segments = (template.installerGroup ?? '')
		.split('/')
		.map((segment) => segment.trim())
		.filter(Boolean);
	return segments[1] ?? segments[0] ?? UNKNOWN_FAMILY;
}

/**
 * Officiel = reproduit un cadre Wizards ; custom = style d'auteur ou thématique.
 *
 * C'est le SEUL jugement de valeur du design : rien dans le corpus ne le
 * déclare. Il vit donc en code, dans la table ci-dessus, pour rester corrigeable
 * sans migration ni passage `card-assets`.
 */
export function frameOrigin(template: MseTemplate): 'official' | 'custom' {
	return OFFICIAL_FAMILIES.has(frameFamily(template).toLowerCase()) ? 'official' : 'custom';
}

/**
 * Le gabarit peut-il porter une créature ?
 *
 * Dérivé de la zone P/T MESURÉE, jamais stocké : `geometry` est déjà la vérité,
 * une colonne de plus pourrait en diverger.
 */
export function supportsCreature(template: MseTemplate): boolean {
	return Boolean(template.geometry?.boxes?.pt);
}

export function hasTag(template: MseTemplate, tag: string): boolean {
	return template.tags.includes(tag);
}

/** Mots-clés triés du plus RARE au plus commun, pour l'affichage en badges. */
export function rankTagsByRarity(tags: string[], counts: Map<string, number>): string[] {
	return [...tags].sort(
		(a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0) || a.localeCompare(b)
	);
}

/**
 * Mots de phrase : présents dans les libellés MSE sans caractériser un cadre.
 *
 * Ils restent dans `tags` (donc cherchables — les écarter du stockage
 * demanderait de juger ce qui est un mot-clé), mais ne s'affichent pas en badge.
 */
const PHRASE_WORDS = new Set(['after', 'edition', 'frame', 'template', 'before', 'with']);

export function displayableTags(tags: string[]): string[] {
	return tags.filter((tag) => !PHRASE_WORDS.has(tag));
}

/** Compte d'occurrences de chaque mot-clé, pour le tri et les libellés. */
export function countTags(templates: MseTemplate[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const template of templates) {
		for (const tag of template.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
	}
	return counts;
}
```

- [ ] **Step 2: Update `MseTemplate` and its row mapper**

In `src/lib/card-editor/mse-assets.ts`, in the `MseTemplate` interface remove `kind: MseTemplateKind;` and add:

```typescript
	installerGroup: string | null;
	positionHint: string | null;
	tags: string[];
```

In `rowToTemplate`, remove `kind: row.kind as MseTemplateKind,` and add:

```typescript
		installerGroup: row.installer_group as string | null,
		positionHint: row.position_hint as string | null,
		tags: (row.tags ?? []) as string[],
```

Delete the now-unused `MseTemplateKind` type if nothing else references it.

- [ ] **Step 3: Rewire `layoutForMseTemplate`**

This is the one behaviour that breaks when `kind` goes: `layoutId` still tells `DirectEditingLayer` that a planeswalker takes loyalty rather than P/T. Replace the `kind` tests:

```typescript
export function layoutForMseTemplate(template: MseTemplate): CardLayoutId {
	if (template.layoutId) return template.layoutId;
	// `kind` est retiré (heuristique regex à faux positifs, cf. le spec). Le type
	// de carte vient désormais des mots-clés, qui sont CUMULABLES : un gabarit à
	// la fois planeswalker et double-face porte les deux, ce que `kind`,
	// mono-valué, ne pouvait pas exprimer. L'ordre des tests fixe donc la
	// priorité — planeswalker d'abord, parce que c'est lui qui change la saisie
	// (loyauté au lieu de force/endurance).
	if (template.tags.includes('planeswalker')) return 'planeswalker';
	if (template.tags.includes('token')) return 'token';
	if (template.tags.includes('saga')) return 'saga';
	return template.orientation === 'landscape' ? 'landscape' : 'arcana';
}
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: errors only in files Task 5 will fix (`frame-choices.ts`, `MseTemplatePicker.tsx`). Note them; do not fix them here.

- [ ] **Step 5: Commit**

```bash
git add src/lib/card-editor/frame-facets.ts src/lib/card-editor/mse-assets.ts
git commit -m "feat(studio): project frame facets from the declared path"
```

---

### Task 5: Sort by declared order, group by family, filter

**Files:**

- Modify: `src/lib/card-editor/frame-choices.ts` (full rewrite of the section/sort logic)

**Interfaces:**

- Consumes: `frameFamily`, `frameOrigin`, `supportsCreature` (Task 4).
- Produces:
  - `interface FrameFilters { family: string | null; tags: string[]; origin: 'official' | 'custom' | null; orientation: 'portrait' | 'landscape' | null; creature: boolean | null }`
  - `DEFAULT_FRAME_FILTERS: FrameFilters`
  - `buildFrameChoices(templates: MseTemplate[]): FrameChoice[]` — now sorted by `positionHint`
  - `applyFrameFilters(choices: FrameChoice[], filters: FrameFilters): FrameChoice[]`
  - `hasActiveFilters(filters: FrameFilters): boolean`
  - `groupFrameChoices(choices: FrameChoice[]): FrameChoiceSection[]` — now grouped by family
  - `matchesQuery(choice: FrameChoice, query: string): boolean`
  - `FrameChoice` keeps `key`, `label`, `layoutId`, `mseTemplateId`, `template`; `kind` is replaced by `family: string`.

- [ ] **Step 1: Replace the section/sort block**

In `src/lib/card-editor/frame-choices.ts`:

**Delete** — all of these exist only to serve `kind`: `FrameChoiceKind`, `SECTION_ORDER`,
`VENDOR_KINDS`, `sectionKindFor`, `sortWithinSection`.

**Keep unchanged** — `disambiguateLabels` (still needed: 15 names cover 39 rows, "After 8th
edition" appears 4 times) and `findActiveChoice` (it matches on `mseTemplateId` only and
never reads `kind`).

Then apply:

```typescript
import { frameFamily, frameOrigin, supportsCreature } from './frame-facets';
import type { MseTemplate } from './mse-assets';
import type { CardLayoutId } from './types';

export interface FrameChoice {
	key: string;
	/** Famille déclarée, 2e segment du chemin MSE. Remplace `kind`. */
	family: string;
	label: string;
	layoutId: CardLayoutId;
	mseTemplateId: string;
	template: MseTemplate;
}

export interface FrameChoiceSection {
	family: string;
	choices: FrameChoice[];
}

export interface FrameFilters {
	family: string | null;
	/** Mots-clés cumulés en ET. */
	tags: string[];
	origin: 'official' | 'custom' | null;
	orientation: 'portrait' | 'landscape' | null;
	creature: boolean | null;
}

export const DEFAULT_FRAME_FILTERS: FrameFilters = {
	family: null,
	tags: [],
	origin: null,
	orientation: null,
	creature: null,
};

export function hasActiveFilters(filters: FrameFilters): boolean {
	return (
		filters.family !== null ||
		filters.tags.length > 0 ||
		filters.origin !== null ||
		filters.orientation !== null ||
		filters.creature !== null
	);
}

/**
 * Tri : `position_hint` croissant, puis libellé en départage.
 *
 * C'est l'ordre DÉCLARÉ par les auteurs du corpus, présent sur les 109 gabarits
 * (001-907). Le tri alphabétique précédent l'écrasait et éclatait la chronologie
 * des cadres sur tout l'alphabet. La règle « CardConjurer d'abord » qui le
 * précédait ne triait rien : les 109 gabarits proposés sont tous `mse`.
 *
 * Un `position_hint` absent passe en fin de liste plutôt qu'en tête : `''` se
 * trierait avant `'001'`, ce qui remonterait les gabarits non déclarés.
 */
function sortByDeclaredOrder(choices: FrameChoice[]): void {
	choices.sort((a, b) => {
		const aHint = a.template.positionHint ?? '￿';
		const bHint = b.template.positionHint ?? '￿';
		if (aHint !== bHint) return aHint.localeCompare(bHint);
		return a.label.localeCompare(b.label);
	});
}
```

- [ ] **Step 2: Rewrite `buildFrameChoices`**

```typescript
export function buildFrameChoices(templates: MseTemplate[]): FrameChoice[] {
	// « Aucun fallback » : un cadre sans géométrie MESURÉE n'est pas proposé.
	// Depuis le retrait des gabarits maison, cette règle décide de la totalité de
	// la liste — plus rien n'est rendu en dehors d'un cadre mesuré.
	const measured = templates.filter((template) => template.geometry !== null);
	const labels = disambiguateLabels(measured);

	const choices: FrameChoice[] = measured.map((template) => ({
		key: `mse:${template.id}`,
		family: frameFamily(template),
		label: labels.get(template.id) ?? template.name,
		layoutId: layoutForTemplate(template),
		mseTemplateId: template.id,
		template,
	}));

	sortByDeclaredOrder(choices);
	return choices;
}
```

- [ ] **Step 3: Update `layoutForTemplate`**

Keep it aligned with `layoutForMseTemplate` from Task 4:

```typescript
function layoutForTemplate(template: MseTemplate): CardLayoutId {
	if (template.layoutId && template.layoutId in CARD_LAYOUTS) return template.layoutId;
	if (template.tags.includes('planeswalker')) return 'planeswalker';
	if (template.tags.includes('token')) return 'token';
	if (template.tags.includes('saga')) return 'saga';
	return template.orientation === 'landscape' ? 'landscape' : 'arcana';
}
```

- [ ] **Step 4: Add filtering, grouping and search**

```typescript
export function applyFrameFilters(choices: FrameChoice[], filters: FrameFilters): FrameChoice[] {
	return choices.filter((choice) => {
		if (filters.family !== null && choice.family !== filters.family) return false;
		// Mots-clés cumulés en ET : chaque mot-clé ajouté restreint.
		if (!filters.tags.every((tag) => choice.template.tags.includes(tag))) return false;
		if (filters.origin !== null && frameOrigin(choice.template) !== filters.origin) return false;
		if (filters.orientation !== null && choice.template.orientation !== filters.orientation) {
			return false;
		}
		if (filters.creature !== null && supportsCreature(choice.template) !== filters.creature) {
			return false;
		}
		return true;
	});
}

/**
 * Sections par famille, dans l'ordre d'apparition — donc celui de
 * `position_hint`, puisque la liste est déjà triée. Pas d'ordre codé en dur : le
 * corpus déclare 30 familles et en ajouter une ne doit demander aucun code.
 */
export function groupFrameChoices(choices: FrameChoice[]): FrameChoiceSection[] {
	const sections: FrameChoiceSection[] = [];
	const byFamily = new Map<string, FrameChoice[]>();
	for (const choice of choices) {
		const bucket = byFamily.get(choice.family);
		if (bucket) {
			bucket.push(choice);
		} else {
			const created = [choice];
			byFamily.set(choice.family, created);
			sections.push({ family: choice.family, choices: created });
		}
	}
	return sections;
}

/**
 * Recherche en PRÉFIXE DE MOT, sur toutes les sources.
 *
 * Volontairement plus permissive que la classification : on cherche pendant la
 * frappe, donc « plan » doit remonter « planeswalker ». Ancrer sur le début du
 * mot suffit à écarter la collision qui a motivé ce chantier (« box » ne doit
 * pas remonter « Textbox »).
 */
export function matchesQuery(choice: FrameChoice, query: string): boolean {
	const needle = query.trim().toLocaleLowerCase();
	if (!needle) return true;
	const haystack = [
		choice.label,
		choice.template.name,
		choice.template.shortName ?? '',
		choice.template.id,
		choice.template.installerGroup ?? '',
		choice.template.tags.join(' '),
	]
		.join(' ')
		.toLocaleLowerCase();
	return haystack.split(/[^a-z0-9]+/).some((word) => word.startsWith(needle));
}
```

- [ ] **Step 5: Verify the sort and search against real data**

```bash
npx tsc --noEmit
```

Expected: no errors in `frame-choices.ts` (`MseTemplatePicker.tsx` still errors until Task 7).

- [ ] **Step 6: Commit**

```bash
git add src/lib/card-editor/frame-choices.ts
git commit -m "feat(studio): sort frames by declared order, group by family, add filters"
```

---

### Task 6: The filter modal

**Files:**

- Create: `src/app/[locale]/studio/components/MseTemplatePicker/FrameFilterModal.tsx`
- Create: `src/app/[locale]/studio/components/MseTemplatePicker/FrameFilterModal.module.css`
- Modify: `messages/en.json`, `messages/fr.json`

**Interfaces:**

- Consumes: `FrameFilters`, `DEFAULT_FRAME_FILTERS` (Task 5); `frameFamily`, `frameOrigin`, `supportsCreature`, `countTags` (Task 4).
- Produces: `<FrameFilterModal initialFilters onApply onClose templates />`.

- [ ] **Step 1: Add i18n keys**

Under `cardEditor.mseLibrary` in **both** `messages/en.json` and `messages/fr.json` (keep the two files key-for-key identical — they are both at 955 leaf keys today):

English:

```json
"filters": "Filters",
"filtersApply": "Apply",
"filtersReset": "Reset",
"filterFamily": "Family",
"filterKeyword": "Keyword",
"filterOrigin": "Origin",
"filterOrientation": "Orientation",
"filterCreature": "Creature-capable",
"filterAny": "Any",
"originOfficial": "Official frames",
"originCustom": "Community frames",
"orientationPortrait": "Portrait",
"orientationLandscape": "Landscape",
"creatureYes": "Has a P/T box",
"creatureNo": "No P/T box",
"keywordSearch": "Filter keywords",
"activeFilters": "{count, plural, =0 {No filters} one {# filter} other {# filters}}"
```

French:

```json
"filters": "Filtres",
"filtersApply": "Appliquer",
"filtersReset": "Réinitialiser",
"filterFamily": "Famille",
"filterKeyword": "Mot-clé",
"filterOrigin": "Origine",
"filterOrientation": "Orientation",
"filterCreature": "Compatible créature",
"filterAny": "Indifférent",
"originOfficial": "Cadres officiels",
"originCustom": "Cadres communautaires",
"orientationPortrait": "Portrait",
"orientationLandscape": "Paysage",
"creatureYes": "Avec zone F/E",
"creatureNo": "Sans zone F/E",
"keywordSearch": "Filtrer les mots-clés",
"activeFilters": "{count, plural, =0 {Aucun filtre} one {# filtre} other {# filtres}}"
```

Also **delete** three now-dead entries from both files:

- `cardEditor.mseLibrary.kinds` — `kind` no longer exists;
- `cardEditor.mseLibrary.sections` — sections are named by the declared family, which is
  corpus data and is not translated;
- `cardEditor.mseLibrary.loadMore` — infinite scroll replaces the button.

- [ ] **Step 2: Write the modal**

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/Modal/Modal';
import {
	countTags,
	frameFamily,
	frameOrigin,
	supportsCreature,
} from '@/lib/card-editor/frame-facets';
import { DEFAULT_FRAME_FILTERS, type FrameFilters } from '@/lib/card-editor/frame-choices';
import type { MseTemplate } from '@/lib/card-editor/mse-assets';
import styles from './FrameFilterModal.module.css';

interface FrameFilterModalProps {
	templates: MseTemplate[];
	initialFilters: FrameFilters;
	onApply: (filters: FrameFilters) => void;
	onClose: () => void;
}

/**
 * Modale de filtres de la bibliothèque de cadres.
 *
 * Cinq champs : quatre `<select>` et une liste filtrable pour les mots-clés —
 * un `<select>` de 188 options serait aussi impraticable que la liste qu'on
 * corrige.
 *
 * Chaque option porte son COMPTE, et les options à zéro résultat sont masquées :
 * c'est ce qui rend 30 familles et 188 mots-clés parcourables sans en cacher
 * aucun.
 */
export function FrameFilterModal({
	templates,
	initialFilters,
	onApply,
	onClose,
}: FrameFilterModalProps) {
	const t = useTranslations('cardEditor.mseLibrary');
	const [draft, setDraft] = useState<FrameFilters>(initialFilters);
	const [keywordQuery, setKeywordQuery] = useState('');

	const families = useMemo(() => {
		const counts = new Map<string, number>();
		for (const template of templates) {
			const family = frameFamily(template);
			counts.set(family, (counts.get(family) ?? 0) + 1);
		}
		return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
	}, [templates]);

	const tagCounts = useMemo(() => countTags(templates), [templates]);

	// Tri par nombre de cadres décroissant : `planeswalker` (21) avant `nyx` (1).
	// Aucun mot-clé n'est retiré — les plus rares sont souvent les plus
	// discriminants quand on sait ce qu'on cherche.
	const keywords = useMemo(() => {
		const needle = keywordQuery.trim().toLocaleLowerCase();
		return [...tagCounts.entries()]
			.filter(([tag]) => !needle || tag.startsWith(needle))
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
	}, [keywordQuery, tagCounts]);

	const originCounts = useMemo(() => {
		let official = 0;
		for (const template of templates) if (frameOrigin(template) === 'official') official += 1;
		return { official, custom: templates.length - official };
	}, [templates]);

	const creatureCounts = useMemo(() => {
		let yes = 0;
		for (const template of templates) if (supportsCreature(template)) yes += 1;
		return { yes, no: templates.length - yes };
	}, [templates]);

	const orientationCounts = useMemo(() => {
		let portrait = 0;
		for (const template of templates) if (template.orientation !== 'landscape') portrait += 1;
		return { portrait, landscape: templates.length - portrait };
	}, [templates]);

	const toggleTag = (tag: string) =>
		setDraft((current) => ({
			...current,
			tags: current.tags.includes(tag)
				? current.tags.filter((value) => value !== tag)
				: [...current.tags, tag],
		}));

	return (
		<Modal onClose={onClose} className={styles.panel}>
			<div className={styles.header}>
				<span className={styles.title}>{t('filters')}</span>
				<button type="button" className={styles.close} onClick={onClose} aria-label={t('filters')}>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path
							d="M12 4L4 12M4 4l8 8"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
						/>
					</svg>
				</button>
			</div>

			<div className={styles.body}>
				<label className={styles.field}>
					<span>{t('filterFamily')}</span>
					<select
						value={draft.family ?? ''}
						onChange={(event) =>
							setDraft((current) => ({ ...current, family: event.target.value || null }))
						}
					>
						<option value="">{t('filterAny')}</option>
						{families.map(([family, count]) => (
							<option key={family} value={family}>
								{family} ({count})
							</option>
						))}
					</select>
				</label>

				<label className={styles.field}>
					<span>{t('filterOrigin')}</span>
					<select
						value={draft.origin ?? ''}
						onChange={(event) =>
							setDraft((current) => ({
								...current,
								origin: (event.target.value || null) as FrameFilters['origin'],
							}))
						}
					>
						<option value="">{t('filterAny')}</option>
						<option value="official">
							{t('originOfficial')} ({originCounts.official})
						</option>
						<option value="custom">
							{t('originCustom')} ({originCounts.custom})
						</option>
					</select>
				</label>

				<label className={styles.field}>
					<span>{t('filterOrientation')}</span>
					<select
						value={draft.orientation ?? ''}
						onChange={(event) =>
							setDraft((current) => ({
								...current,
								orientation: (event.target.value || null) as FrameFilters['orientation'],
							}))
						}
					>
						<option value="">{t('filterAny')}</option>
						<option value="portrait">
							{t('orientationPortrait')} ({orientationCounts.portrait})
						</option>
						<option value="landscape">
							{t('orientationLandscape')} ({orientationCounts.landscape})
						</option>
					</select>
				</label>

				<label className={styles.field}>
					<span>{t('filterCreature')}</span>
					<select
						value={draft.creature === null ? '' : String(draft.creature)}
						onChange={(event) =>
							setDraft((current) => ({
								...current,
								creature: event.target.value === '' ? null : event.target.value === 'true',
							}))
						}
					>
						<option value="">{t('filterAny')}</option>
						<option value="true">
							{t('creatureYes')} ({creatureCounts.yes})
						</option>
						<option value="false">
							{t('creatureNo')} ({creatureCounts.no})
						</option>
					</select>
				</label>

				<fieldset className={styles.field}>
					<legend>{t('filterKeyword')}</legend>
					<input
						type="search"
						value={keywordQuery}
						placeholder={t('keywordSearch')}
						onChange={(event) => setKeywordQuery(event.target.value)}
					/>
					<div className={styles.keywordList}>
						{keywords.map(([tag, count]) => (
							<button
								key={tag}
								type="button"
								aria-pressed={draft.tags.includes(tag)}
								className={draft.tags.includes(tag) ? styles.keywordActive : styles.keyword}
								onClick={() => toggleTag(tag)}
							>
								{tag} <span className={styles.count}>{count}</span>
							</button>
						))}
					</div>
				</fieldset>
			</div>

			<div className={styles.footer}>
				<button type="button" onClick={() => setDraft(DEFAULT_FRAME_FILTERS)}>
					{t('filtersReset')}
				</button>
				<button
					type="button"
					className={styles.apply}
					onClick={() => {
						onApply(draft);
						onClose();
					}}
				>
					{t('filtersApply')}
				</button>
			</div>
		</Modal>
	);
}
```

- [ ] **Step 3: Write the stylesheet**

```css
/* FrameFilterModal.module.css */
.panel {
	display: flex;
	flex-direction: column;
	max-width: 34rem;
	width: 100%;
	max-height: 85vh;
}

.header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 1rem 1.25rem;
	border-bottom: 1px solid var(--border, #2a2a2a);
}

.title {
	font-weight: 700;
}

.close {
	background: none;
	border: none;
	color: inherit;
	cursor: pointer;
	padding: 0.25rem;
}

.body {
	display: flex;
	flex-direction: column;
	gap: 1rem;
	padding: 1.25rem;
	overflow-y: auto;
}

.field {
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
	border: none;
	padding: 0;
	margin: 0;
}

.field > span,
.field > legend {
	font-size: 0.85rem;
	opacity: 0.75;
}

/* La liste de mots-clés défile : elle en contient jusqu'à 188. */
.keywordList {
	display: flex;
	flex-wrap: wrap;
	gap: 0.35rem;
	max-height: 14rem;
	overflow-y: auto;
	margin-top: 0.5rem;
}

.keyword,
.keywordActive {
	display: inline-flex;
	align-items: center;
	gap: 0.3rem;
	padding: 0.25rem 0.55rem;
	border-radius: 999px;
	border: 1px solid var(--border, #2a2a2a);
	background: transparent;
	color: inherit;
	cursor: pointer;
	font-size: 0.8rem;
}

.keywordActive {
	border-color: var(--accent, #c9a84c);
	background: color-mix(in srgb, var(--accent, #c9a84c) 18%, transparent);
}

.count {
	opacity: 0.6;
	font-variant-numeric: tabular-nums;
}

.footer {
	display: flex;
	justify-content: flex-end;
	gap: 0.5rem;
	padding: 1rem 1.25rem;
	border-top: 1px solid var(--border, #2a2a2a);
}

.footer button {
	padding: 0.45rem 0.9rem;
	border-radius: 0.4rem;
	border: 1px solid var(--border, #2a2a2a);
	background: transparent;
	color: inherit;
	cursor: pointer;
}

.apply {
	border-color: var(--accent, #c9a84c);
	font-weight: 600;
}
```

- [ ] **Step 4: Verify the i18n files stay in sync**

```bash
python3 -c "
import json
def count(d): return sum(count(v) if isinstance(v,dict) else 1 for v in d.values())
en=json.load(open('messages/en.json')); fr=json.load(open('messages/fr.json'))
print('en:', count(en), 'fr:', count(fr), '| equal:', count(en)==count(fr))
def keys(d,p=''):
    out=set()
    for k,v in d.items():
        out |= keys(v, p+k+'.') if isinstance(v,dict) else {p+k}
    return out
print('only in en:', sorted(keys(en)-keys(fr)))
print('only in fr:', sorted(keys(fr)-keys(en)))
"
```

Expected: equal counts, both "only in" lists empty.

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/studio/components/MseTemplatePicker/FrameFilterModal.tsx" "src/app/[locale]/studio/components/MseTemplatePicker/FrameFilterModal.module.css" messages/en.json messages/fr.json
git commit -m "feat(studio): add the frame filter modal"
```

---

### Task 7: Picker — grid, badges, infinite scroll

**Files:**

- Modify: `src/app/[locale]/studio/components/MseTemplatePicker/MseTemplatePicker.tsx`
- Modify: `src/app/[locale]/studio/components/MseTemplatePicker/MseTemplatePicker.module.css`

**Interfaces:**

- Consumes: everything from Tasks 4-6.
- Produces: the finished picker. `MseTemplatePickerProps` is unchanged (`templates`, `mseTemplateId`, `isLoading`, `hasError`, `onSelect`), so `EditorSidebar` needs no edit.

- [ ] **Step 1: Rewrite the component body**

This replaces the file's contents. Note that the existing `subtitleFor` helper is
**deleted**: it built its subtitle from `t('kinds.' + choice.template.kind)`, and both
`kind` and the `kinds.*` messages are gone. Its role — telling the frames apart — is now
filled by `short_name` plus the keyword badges.

```tsx
'use client';

import { Check, Funnel, MagnifyingGlass, Stack } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
	applyFrameFilters,
	buildFrameChoices,
	DEFAULT_FRAME_FILTERS,
	findActiveChoice,
	groupFrameChoices,
	hasActiveFilters,
	matchesQuery,
	type FrameChoice,
	type FrameFilters,
} from '@/lib/card-editor/frame-choices';
import { countTags, displayableTags, rankTagsByRarity } from '@/lib/card-editor/frame-facets';
import { cardAssetUrl, type MseTemplate } from '@/lib/card-editor/mse-assets';
import { FrameFilterModal } from './FrameFilterModal';
import styles from './MseTemplatePicker.module.css';

/** Taille d'une tranche de scroll infini. */
const PAGE_SIZE = 30;
/** Badges affichés sous une vignette ; le reste passe en title. */
const MAX_BADGES = 3;

interface MseTemplatePickerProps {
	templates: MseTemplate[];
	mseTemplateId: string;
	isLoading: boolean;
	hasError: boolean;
	onSelect: (choice: FrameChoice) => void;
}

export function MseTemplatePicker({
	templates,
	mseTemplateId,
	isLoading,
	hasError,
	onSelect,
}: MseTemplatePickerProps) {
	const t = useTranslations('cardEditor.mseLibrary');
	const [query, setQuery] = useState('');
	const [filters, setFilters] = useState<FrameFilters>(DEFAULT_FRAME_FILTERS);
	const [isFilterOpen, setFilterOpen] = useState(false);
	const [limit, setLimit] = useState(PAGE_SIZE);
	const sentinel = useRef<HTMLDivElement>(null);

	const renderableTemplates = useMemo(
		() => templates.filter((template) => template.renderMode === 'frame'),
		[templates]
	);
	const choices = useMemo(() => buildFrameChoices(renderableTemplates), [renderableTemplates]);
	const tagCounts = useMemo(() => countTags(renderableTemplates), [renderableTemplates]);

	const filtered = useMemo(() => {
		const byFilters = applyFrameFilters(choices, filters);
		return byFilters.filter((choice) => matchesQuery(choice, query));
	}, [choices, filters, query]);

	// Toute nouvelle restriction repart de la première tranche : garder un limit
	// élevé afficherait d'un coup un jeu de résultats entièrement différent.
	useEffect(() => {
		setLimit(PAGE_SIZE);
	}, [query, filters]);

	// Scroll infini : une sentinelle observée en fin de liste remplace le bouton
	// « Afficher 30 de plus », qui demandait 3 clics pour atteindre la fin.
	useEffect(() => {
		const node = sentinel.current;
		if (!node) return;
		const observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) {
				setLimit((current) => current + PAGE_SIZE);
			}
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, [filtered.length]);

	const visible = filtered.slice(0, limit);
	const active = findActiveChoice(choices, mseTemplateId);
	// Sections par famille tant qu'aucun filtre n'est actif ; grille plate dès
	// qu'il y en a un — un en-tête unique au-dessus de résultats déjà filtrés
	// n'apporte rien et coûte une hauteur d'écran.
	const isFiltering = hasActiveFilters(filters) || query.trim() !== '';
	const sections = useMemo(
		() => (isFiltering ? null : groupFrameChoices(visible)),
		[isFiltering, visible]
	);

	if (isLoading) {
		return (
			<div className={styles.loading} role="status">
				<Stack size={22} />
				<span>{t('loading')}</span>
			</div>
		);
	}
	if (hasError) return <p className={styles.error}>{t('error')}</p>;

	const renderCard = (choice: FrameChoice) => {
		const isSelected = active?.key === choice.key;
		// Mots-clés les plus RARES d'abord : un mot-clé porté par un seul cadre le
		// caractérise, `planeswalker` porté par 21 beaucoup moins.
		const badges = rankTagsByRarity(displayableTags(choice.template.tags), tagCounts);
		return (
			<button
				key={choice.key}
				type="button"
				className={isSelected ? styles.templateSelected : styles.template}
				data-template-id={choice.mseTemplateId}
				aria-pressed={isSelected}
				onClick={() => onSelect(choice)}
			>
				<span className={styles.preview}>
					{choice.template.samplePath ? (
						// eslint-disable-next-line @next/next/no-img-element -- dynamic local vendor catalogue
						<img
							src={cardAssetUrl(choice.template.samplePath) ?? undefined}
							alt=""
							loading="lazy"
							decoding="async"
						/>
					) : (
						<Stack size={24} />
					)}
					{isSelected && (
						<span className={styles.check}>
							<Check size={14} weight="bold" />
						</span>
					)}
				</span>
				<span className={styles.templateCopy}>
					<strong title={choice.label}>{choice.label}</strong>
					{choice.template.shortName && <small>{choice.template.shortName}</small>}
					{badges.length > 0 && (
						<span className={styles.badges} title={badges.join(', ')}>
							{badges.slice(0, MAX_BADGES).map((tag) => (
								<span key={tag} className={styles.badge}>
									{tag}
								</span>
							))}
						</span>
					)}
				</span>
			</button>
		);
	};

	return (
		<div className={styles.library}>
			<div className={styles.libraryHeader}>
				<div>
					<strong>{t('title')}</strong>
					<span>{t('count', { count: choices.length })}</span>
				</div>
				<button type="button" className={styles.filterButton} onClick={() => setFilterOpen(true)}>
					<Funnel size={16} />
					{t('filters')}
				</button>
			</div>

			<label className={styles.search}>
				<MagnifyingGlass size={17} aria-hidden />
				<span className={styles.srOnly}>{t('searchLabel')}</span>
				<input
					type="search"
					value={query}
					placeholder={t('searchPlaceholder')}
					onChange={(event) => setQuery(event.target.value)}
				/>
			</label>

			<div className={styles.resultLine} aria-live="polite">
				{t('results', { count: filtered.length })}
			</div>

			{filtered.length === 0 && <p className={styles.empty}>{t('empty')}</p>}

			{sections
				? sections.map((section) => (
						<section key={section.family} className={styles.section}>
							<h4 className={styles.sectionTitle}>
								{section.family}
								<span className={styles.sectionCount}>{section.choices.length}</span>
							</h4>
							<div className={styles.grid}>{section.choices.map(renderCard)}</div>
						</section>
					))
				: visible.length > 0 && <div className={styles.grid}>{visible.map(renderCard)}</div>}

			{limit < filtered.length && <div ref={sentinel} className={styles.sentinel} aria-hidden />}

			{isFilterOpen && (
				<FrameFilterModal
					templates={renderableTemplates}
					initialFilters={filters}
					onApply={setFilters}
					onClose={() => setFilterOpen(false)}
				/>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Enlarge the thumbnails**

In `MseTemplatePicker.module.css`, replace the `.grid` and `.preview` rules. On a frame library the image _is_ the information, so the card gets real size:

```css
.grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
	gap: 0.75rem;
}

.preview {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	/* Ratio d'une carte 63 x 88 mm : la vignette annonce la forme réelle. */
	aspect-ratio: 63 / 88;
	overflow: hidden;
	border-radius: 0.4rem;
	background: var(--surface-2, #16161a);
}

.preview img {
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.badges {
	display: flex;
	flex-wrap: wrap;
	gap: 0.2rem;
	margin-top: 0.2rem;
}

.badge {
	font-size: 0.65rem;
	padding: 0.05rem 0.35rem;
	border-radius: 999px;
	background: var(--surface-3, #23232a);
	opacity: 0.85;
}

.filterButton {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	padding: 0.35rem 0.7rem;
	border-radius: 0.4rem;
	border: 1px solid var(--border, #2a2a2a);
	background: transparent;
	color: inherit;
	cursor: pointer;
}

/* Cible du IntersectionObserver : invisible, mais doit avoir une hauteur pour
   être observable. */
.sentinel {
	height: 1px;
}
```

- [ ] **Step 3: Verify the whole pipeline**

```bash
npx tsc --noEmit
npx eslint "src/lib/card-editor/frame-facets.ts" "src/lib/card-editor/frame-choices.ts" "src/lib/card-editor/mse-assets.ts" "src/app/[locale]/studio/components/MseTemplatePicker/MseTemplatePicker.tsx" "src/app/[locale]/studio/components/MseTemplatePicker/FrameFilterModal.tsx"
npm run build
```

Expected: tsc clean; eslint reports **no NEW** problems; build succeeds.

- [ ] **Step 4: Browser verification**

This is the gate that matters — two bugs previously shipped past static checks on this feature.

```bash
npm run dev
```

Open `http://localhost:3000/fr/studio`, go to the **Layout** tab, and confirm:

1. Frames are grouped by family (`m15 style`, `new style`, `old style`…), not by `kind`.
2. Order follows `position_hint` — `magic-m15` (hint `010`) sorts near the top of its family.
3. Scrolling to the bottom loads 30 more with no button.
4. Typing `m15` yields **24** results.
5. Typing `box` yields **0** results (not "Taller Textbox").
6. The Filters button opens the modal; family/origin/orientation/creature selects each carry counts; keyword chips toggle and cumulate.
7. With any filter active the family headers disappear (flat grid).
8. Badges appear under thumbnails, at most 3.
9. **Select a planeswalker frame and confirm the card shows a single loyalty field, not P/T** — the one behaviour that breaks if `kind` removal was mishandled.

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/studio/components/MseTemplatePicker/"
git commit -m "feat(studio): frame grid with filters, badges and infinite scroll"
```

---

## Deployment note

This plan adds a **4th migration** to the prod rollout list, after `20260726120000`, `20260726130000`, `20260727120000`:

- `20260727130000_add_frame_facets.sql`

It also requires a **`npm run card-assets` run against production** to populate `installer_group`, `position_hint` and `tags` — that script writes to prod by design (`.env.seed` with `override: true`). Rows keep working before that run: `tags` defaults to `'{}'`, so the picker shows every frame under `unknown` with no keyword filters until the catalogue is refreshed.

## Out of scope

- Boolean columns per keyword — deliberately deferred until the UI demonstrates the need (`tags` stays the source, so extraction is a recomputation).
- Rewriting MSE labels; frame licensing; the studio's other open items.
