# Studio Layout Listing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the studio's two competing appearance selectors (8 Wizcard layouts + 206 vendor frames) with a single list that cannot desynchronise.

**Architecture:** A new pure module builds one `FrameChoice[]` from `CARD_LAYOUT_LIST` + the template catalogue, disambiguating vendor names and grouping by kind. `MseTemplatePicker` renders that list and reports one `FrameChoice` on select; `EditorSidebar` writes `layoutId` and `mseTemplateId` together in a single `onDraftChange`. The old `layout` fieldset, the `kind` filter row and the `accurate`/`legacy` tabs are deleted.

**Tech Stack:** Next.js 16 (Turbopack), React, TypeScript, CSS Modules, next-intl, Supabase (PostgREST read of `card_templates`).

## Global Constraints

- **No test framework exists** in this repo (no vitest/jest). Verification is `npm run check` plus runtime checks in the browser. Do **not** add a test framework.
- **`npm run check` is not green at base** (~60 pre-existing problems in unrelated files). The gate is **no NEW problems**: run `npx eslint <changed files>` and `npx tsc --noEmit`, comparing against the pre-existing set.
- **Both locales must stay in sync.** Every message key added or removed in `messages/fr.json` must be mirrored in `messages/en.json`, or `next-intl` raises `MISSING_MESSAGE` at runtime (typecheck will not catch it).
- **Sentinel value:** `HOUSE_FRAME_TEMPLATE_ID = 'wizcard:house'` — verified not to collide with any catalogue id (no id contains `:` or starts with `wizcard`).
- **Persisted draft shape is unchanged:** `layoutId` and `mseTemplateId` both remain on `CustomCardDraft`. No migration of existing drafts.
- Comments in this codebase are written in **French**, explaining _why_ rather than _what_. Match the surrounding style.

---

## File Structure

| File                                                                                             | Responsibility                                                                                                  |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `src/lib/card-editor/frame-choices.ts` **(create)**                                              | Pure logic: label disambiguation, house+vendor merge, kind grouping, active-entry resolution. No React, no I/O. |
| `src/lib/card-editor/types.ts` **(modify)**                                                      | Add `HOUSE_FRAME_TEMPLATE_ID`.                                                                                  |
| `src/app/[locale]/studio/components/MseTemplatePicker/MseTemplatePicker.tsx` **(modify)**        | Render the merged list with section headers; drop `kind` filters and source tabs.                               |
| `src/app/[locale]/studio/components/MseTemplatePicker/MseTemplatePicker.module.css` **(modify)** | Styles for section headers; remove `.filters` / `.sourceFilters`.                                               |
| `src/app/[locale]/studio/components/EditorSidebar/EditorSidebar.tsx` **(modify)**                | Single `onSelect` writing both fields; delete the `layout` fieldset.                                            |
| `src/app/[locale]/studio/components/EditorSidebar/EditorSidebar.module.css` **(modify)**         | Remove `.layoutGrid` / `.layoutCard` / `.layoutActive` / `.layoutPreview`.                                      |
| `src/app/[locale]/studio/components/CardEditorStudio/CardEditorStudio.tsx` **(modify)**          | Teach the self-healing effect about the sentinel.                                                               |
| `messages/fr.json`, `messages/en.json` **(modify)**                                              | Section-header labels; remove dead keys.                                                                        |

Task order is dependency-driven: pure logic first (Task 1), then the consumer that would otherwise crash without it (Tasks 2–4), then cleanup (Task 5).

---

### Task 1: The `frame-choices` module

Pure, dependency-free logic. Everything else consumes it.

**Files:**

- Create: `src/lib/card-editor/frame-choices.ts`
- Modify: `src/lib/card-editor/types.ts:1`

**Interfaces:**

- Consumes: `MseTemplate` from `@/lib/card-editor/mse-assets`; `CARD_LAYOUTS` from `@/lib/card-editor/layout-registry`; `CardLayoutId` from `./types`.
- Produces:
  - `HOUSE_FRAME_TEMPLATE_ID: 'wizcard:house'` (from `./types`)
  - `interface FrameChoice { key: string; kind: FrameChoiceKind; label: string; layoutId: CardLayoutId; mseTemplateId: string; template: MseTemplate | null; }`
  - `type FrameChoiceKind = 'house' | 'card' | 'planeswalker' | 'split' | 'double-faced' | 'token' | 'other'`
  - `type FrameChoiceSection = { kind: FrameChoiceKind; choices: FrameChoice[] }`
  - `buildFrameChoices(templates: MseTemplate[], layoutIds: readonly CardLayoutId[]): FrameChoice[]`
  - `groupFrameChoices(choices: FrameChoice[]): FrameChoiceSection[]`
  - `findActiveChoice(choices: FrameChoice[], layoutId: CardLayoutId, mseTemplateId: string): FrameChoice | null`

- [ ] **Step 1: Add the sentinel constant**

In `src/lib/card-editor/types.ts`, directly under line 1:

```ts
export const DEFAULT_FRAME_TEMPLATE_ID = 'cardconjurer-m15-regular';

/**
 * Gabarit « maison » : la carte est rendue avec les cadres intégrés de Wizcard,
 * sans cadre vendor. Ce n'est PAS un id du catalogue — le préfixe `wizcard:` est
 * réservé (aucun id du catalogue ne contient « : »), ce qui garantit que
 * `useSelectedMseTemplate` ne le résoudra jamais et que `resolveMseFramePath`
 * retombera sur le rendu intégré.
 */
export const HOUSE_FRAME_TEMPLATE_ID = 'wizcard:house';
```

- [ ] **Step 2: Create the module**

Create `src/lib/card-editor/frame-choices.ts`:

```ts
import { CARD_LAYOUTS } from './layout-registry';
import type { MseTemplate } from './mse-assets';
import { HOUSE_FRAME_TEMPLATE_ID, type CardLayoutId } from './types';

/**
 * Une entrée de la liste unique d'apparences.
 *
 * Le studio proposait deux sélecteurs concurrents — les 8 gabarits maison et les
 * 206 cadres vendor — qui écrivaient tous deux `layoutId`, le second écrasant
 * silencieusement le premier. Ils fusionnent ici en une seule liste : choisir une
 * entrée écrit les DEUX champs d'un coup, ils ne peuvent donc plus diverger.
 */
export interface FrameChoice {
	/** Identité stable dans la liste (clé React et cible de comparaison). */
	key: string;
	kind: FrameChoiceKind;
	/** Libellé affiché, déjà désambiguïsé (cf. buildFrameChoices). */
	label: string;
	layoutId: CardLayoutId;
	mseTemplateId: string;
	/** null pour un gabarit maison : il n'a pas de cadre vendor. */
	template: MseTemplate | null;
}

export type FrameChoiceKind =
	'house' | 'card' | 'planeswalker' | 'split' | 'double-faced' | 'token' | 'other';

export interface FrameChoiceSection {
	kind: FrameChoiceKind;
	choices: FrameChoice[];
}

/**
 * Ordre des sections. `other` ferme la marche : il absorbe la traîne (packaging,
 * saga, oversized — 1 à 2 entrées chacun), pour ne pas afficher un en-tête de
 * section au-dessus d'une seule ligne.
 */
const SECTION_ORDER: FrameChoiceKind[] = [
	'house',
	'card',
	'planeswalker',
	'split',
	'double-faced',
	'token',
	'other',
];

const VENDOR_KINDS = new Set<FrameChoiceKind>([
	'card',
	'planeswalker',
	'split',
	'double-faced',
	'token',
]);

function sectionKindFor(template: MseTemplate): FrameChoiceKind {
	return VENDOR_KINDS.has(template.kind as FrameChoiceKind)
		? (template.kind as FrameChoiceKind)
		: 'other';
}

/**
 * Désambiguïsation des noms vendor, en trois paliers successifs.
 *
 * Le catalogue est un dump : 15 noms couvrent 39 lignes, « After 8th edition »
 * apparaît 7 fois à l'identique. Tant que ces cadres vivaient derrière un onglet
 * secondaire on pouvait s'en accommoder ; ils deviennent ici le vocabulaire
 * principal, donc chaque ligne doit porter un libellé unique.
 *
 * 1. `name` seul quand il est déjà unique ;
 * 2. `name · short_name` sinon ;
 * 3. `name · short_name (id)` pour les trois paires où short_name se répète
 *    aussi (magic-textless / magic-new-textless, etc.).
 */
function disambiguateLabels(templates: MseTemplate[]): Map<string, string> {
	const nameCounts = new Map<string, number>();
	for (const template of templates) {
		nameCounts.set(template.name, (nameCounts.get(template.name) ?? 0) + 1);
	}

	const baseLabel = (template: MseTemplate): string => {
		if ((nameCounts.get(template.name) ?? 0) <= 1) return template.name;
		const short = template.shortName?.trim();
		return short ? `${template.name} · ${short}` : template.name;
	};

	const baseCounts = new Map<string, number>();
	for (const template of templates) {
		const base = baseLabel(template);
		baseCounts.set(base, (baseCounts.get(base) ?? 0) + 1);
	}

	const labels = new Map<string, string>();
	for (const template of templates) {
		const base = baseLabel(template);
		labels.set(template.id, (baseCounts.get(base) ?? 0) <= 1 ? base : `${base} (${template.id})`);
	}
	return labels;
}

/**
 * Construit la liste unique : gabarits maison d'abord, puis cadres vendor.
 *
 * `layoutIds` est injecté plutôt que lu de CARD_LAYOUT_LIST pour que l'appelant
 * garde la main sur ce qui est proposé (le studio masque `landscape`).
 */
export function buildFrameChoices(
	templates: MseTemplate[],
	layoutIds: readonly CardLayoutId[]
): FrameChoice[] {
	const house: FrameChoice[] = layoutIds.map((layoutId) => ({
		key: `house:${layoutId}`,
		kind: 'house',
		// Le libellé maison vient des messages i18n, côté composant : on stocke
		// l'id, que l'appelant traduit via `cardEditor.layouts.<id>.name`.
		label: layoutId,
		layoutId,
		mseTemplateId: HOUSE_FRAME_TEMPLATE_ID,
		template: null,
	}));

	const labels = disambiguateLabels(templates);
	const vendor: FrameChoice[] = templates.map((template) => ({
		key: `mse:${template.id}`,
		kind: sectionKindFor(template),
		label: labels.get(template.id) ?? template.name,
		layoutId: layoutForTemplate(template),
		mseTemplateId: template.id,
		template,
	}));

	return [...house, ...vendor];
}

/**
 * Géométrie déduite du cadre. Reprend la règle de `layoutForMseTemplate`, mais
 * sans dépendre de mse-assets (qui est un module client) : ce fichier reste pur
 * pour rester lisible et réutilisable.
 */
function layoutForTemplate(template: MseTemplate): CardLayoutId {
	if (template.layoutId && template.layoutId in CARD_LAYOUTS) return template.layoutId;
	if (template.kind === 'token') return 'token';
	if (template.kind === 'planeswalker') return 'planeswalker';
	if (template.kind === 'saga') return 'saga';
	return template.orientation === 'landscape' ? 'landscape' : 'arcana';
}

/** Regroupe en sections, dans l'ordre fixe ci-dessus ; les vides sont omises. */
export function groupFrameChoices(choices: FrameChoice[]): FrameChoiceSection[] {
	return SECTION_ORDER.map((kind) => ({
		kind,
		choices: choices.filter((choice) => choice.kind === kind),
	})).filter((section) => section.choices.length > 0);
}

/**
 * Entrée active, résolue dans cet ordre :
 *
 * 1. sentinel maison -> le gabarit dont l'id vaut `layoutId` ;
 * 2. sinon le cadre vendor dont l'id vaut `mseTemplateId` — c'est lui que le
 *    canvas peint réellement, donc lui que l'utilisateur voit ;
 * 3. rien, si le brouillon pointe un cadre retiré du catalogue.
 *
 * Aucune migration au chargement : un vieux brouillon n'est jamais réécrit tant
 * que l'utilisateur n'a pas choisi lui-même.
 */
export function findActiveChoice(
	choices: FrameChoice[],
	layoutId: CardLayoutId,
	mseTemplateId: string
): FrameChoice | null {
	if (mseTemplateId === HOUSE_FRAME_TEMPLATE_ID) {
		return (
			choices.find((choice) => choice.kind === 'house' && choice.layoutId === layoutId) ?? null
		);
	}
	return choices.find((choice) => choice.mseTemplateId === mseTemplateId) ?? null;
}
```

- [ ] **Step 3: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no error mentioning `frame-choices.ts` or `types.ts`.

- [ ] **Step 4: Verify the disambiguation against the live catalogue**

This is the load-bearing claim of the whole design (206 unique labels for 206 rows). Verify it against real data rather than assuming:

```bash
set -a; . ./.env.local; set +a
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/card_templates?select=id,name,short_name,kind&render_mode=eq.frame&limit=5000" \
  -H "apikey: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${NEXT_PUBLIC_SUPABASE_ANON_KEY}" > /tmp/tpl.json

python3 - <<'PY'
import json, collections
rows = json.load(open('/tmp/tpl.json'))
counts = collections.Counter(r['name'] for r in rows)
def base(r):
    if counts[r['name']] <= 1: return r['name']
    s = (r['short_name'] or '').strip()
    return f"{r['name']} · {s}" if s else r['name']
bases = collections.Counter(base(r) for r in rows)
labels = [base(r) if bases[base(r)] <= 1 else f"{base(r)} ({r['id']})" for r in rows]
dupes = {k: v for k, v in collections.Counter(labels).items() if v > 1}
print(f"rows={len(rows)} unique={len(set(labels))} collisions={dupes or 'NONE'}")
assert not dupes and len(set(labels)) == len(rows), "disambiguation is not total"
print("OK")
PY
```

Expected: `rows=206 unique=206 collisions=NONE` then `OK`.
If the assert fires, the rule needs a fourth tier — stop and report rather than proceeding.

- [ ] **Step 5: Commit**

```bash
git add src/lib/card-editor/frame-choices.ts src/lib/card-editor/types.ts
git commit -m "feat(studio): add the merged frame-choice model"
```

---

### Task 2: Teach the self-healing effect about the sentinel

Do this **before** the UI can emit the sentinel, otherwise every house selection is silently reverted on the next render and Task 3 appears broken for reasons that are not in Task 3.

**Files:**

- Modify: `src/app/[locale]/studio/components/CardEditorStudio/CardEditorStudio.tsx:64-75`

**Interfaces:**

- Consumes: `HOUSE_FRAME_TEMPLATE_ID` from `@/lib/card-editor/types` (Task 1).
- Produces: nothing new.

- [ ] **Step 1: Add the guard**

Replace the effect at lines 64–75 with:

```tsx
useEffect(() => {
	if (mseCatalog.isLoading || mseCatalog.error) return;
	// Le gabarit maison n'a délibérément pas de cadre vendor :
	// `selectedMseTemplate` est donc `undefined`, ce qui SANS ce garde ferait
	// tomber l'effet dans la branche de secours et réécrirait le brouillon avec
	// le cadre par défaut — annulant le choix de l'utilisateur à chaque rendu.
	if (editor.draft.mseTemplateId === HOUSE_FRAME_TEMPLATE_ID) return;
	if (selectedMseTemplate?.renderMode === 'frame') return;
	const fallback = mseCatalog.templates.find(
		(template) => template.id === DEFAULT_FRAME_TEMPLATE_ID
	);
	if (!fallback) return;
	editor.updateDraft({
		mseTemplateId: fallback.id,
		layoutId: fallback.layoutId ?? 'arcana',
	});
}, [editor, mseCatalog.error, mseCatalog.isLoading, mseCatalog.templates, selectedMseTemplate]);
```

- [ ] **Step 2: Update the import**

The file already imports from `@/lib/card-editor/types`. Add `HOUSE_FRAME_TEMPLATE_ID` to that existing import list, keeping alphabetical order:

```tsx
import {
	CARD_FIELD_MAX_LENGTH,
	DEFAULT_FRAME_TEMPLATE_ID,
	DRAFT_FIELD_MAX_LENGTH,
	HOUSE_FRAME_TEMPLATE_ID,
	type CardCanvasLabels,
	type EditableCardField,
} from '@/lib/card-editor/types';
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx eslint "src/app/[locale]/studio/components/CardEditorStudio/CardEditorStudio.tsx"`
Expected: no output from eslint; no tsc error in this file.

Note the new `editor.draft.mseTemplateId` read does not need adding to the dependency array — `editor` is already a dependency and is the object the value is read from.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/studio/components/CardEditorStudio/CardEditorStudio.tsx"
git commit -m "fix(studio): stop the self-healing effect from undoing house layouts"
```

---

### Task 3: Render the merged list in `MseTemplatePicker`

**Files:**

- Modify: `src/app/[locale]/studio/components/MseTemplatePicker/MseTemplatePicker.tsx` (full rewrite of the component body)
- Modify: `src/app/[locale]/studio/components/MseTemplatePicker/MseTemplatePicker.module.css`
- Modify: `messages/fr.json`, `messages/en.json`

**Interfaces:**

- Consumes: `buildFrameChoices`, `groupFrameChoices`, `findActiveChoice`, `FrameChoice`, `FrameChoiceSection` (Task 1).
- Produces: `MseTemplatePickerProps` now takes `layoutId: CardLayoutId`, `mseTemplateId: string`, and `onSelect: (choice: FrameChoice) => void` — replacing `selectedId: string` and `onSelect: (template: MseTemplate) => void`.

- [ ] **Step 1: Add the section-header messages**

Both locales, under `cardEditor.mseLibrary`. Add a `sections` object and remove the now-dead `filters` object and `sources` object.

`messages/fr.json` — replace the `filters` and `sources` blocks inside `mseLibrary` with:

```json
		"sections": {
			"house": "Gabarits Wizcard",
			"card": "Cartes",
			"planeswalker": "Planeswalkers",
			"split": "Split",
			"double-faced": "Double face",
			"token": "Jetons",
			"other": "Autres"
		}
```

`messages/en.json` — same keys:

```json
		"sections": {
			"house": "Wizcard templates",
			"card": "Cards",
			"planeswalker": "Planeswalkers",
			"split": "Split",
			"double-faced": "Double-faced",
			"token": "Tokens",
			"other": "Other"
		}
```

Also delete these now-unused keys from **both** files: `mseLibrary.filtersLabel`, `mseLibrary.sourceFilterLabel`, `mseLibrary.filters` (whole object), `mseLibrary.sources` (whole object).

Keep `mseLibrary.kinds` — it still labels each row.

- [ ] **Step 2: Rewrite the component**

Replace the whole of `MseTemplatePicker.tsx` with:

```tsx
'use client';

import { Check, MagnifyingGlass, Stack } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
	buildFrameChoices,
	findActiveChoice,
	groupFrameChoices,
	type FrameChoice,
} from '@/lib/card-editor/frame-choices';
import { cardAssetUrl, type MseTemplate } from '@/lib/card-editor/mse-assets';
import type { CardLayoutId } from '@/lib/card-editor/types';
import styles from './MseTemplatePicker.module.css';

const PAGE_SIZE = 30;

interface MseTemplatePickerProps {
	templates: MseTemplate[];
	/** Gabarits maison proposés, dans l'ordre d'affichage. */
	houseLayoutIds: readonly CardLayoutId[];
	layoutId: CardLayoutId;
	mseTemplateId: string;
	isLoading: boolean;
	hasError: boolean;
	onSelect: (choice: FrameChoice) => void;
}

export function MseTemplatePicker({
	templates,
	houseLayoutIds,
	layoutId,
	mseTemplateId,
	isLoading,
	hasError,
	onSelect,
}: MseTemplatePickerProps) {
	const t = useTranslations('cardEditor.mseLibrary');
	const layouts = useTranslations('cardEditor.layouts');
	const [query, setQuery] = useState('');
	const [limit, setLimit] = useState(PAGE_SIZE);

	const renderableTemplates = useMemo(
		() => templates.filter((template) => template.renderMode === 'frame'),
		[templates]
	);
	const choices = useMemo(
		() => buildFrameChoices(renderableTemplates, houseLayoutIds),
		[houseLayoutIds, renderableTemplates]
	);

	// Le libellé maison est traduit ici (le modèle ne connaît pas l'i18n) : on le
	// résout AVANT de filtrer, pour que la recherche porte sur ce qui est affiché.
	const labelled = useMemo(
		() =>
			choices.map((choice) =>
				choice.kind === 'house' ? { ...choice, label: layouts(`${choice.label}.name`) } : choice
			),
		[choices, layouts]
	);

	const filtered = useMemo(() => {
		const needle = query.trim().toLocaleLowerCase();
		if (!needle) return labelled;
		return labelled.filter((choice) => choice.label.toLocaleLowerCase().includes(needle));
	}, [labelled, query]);

	const active = findActiveChoice(labelled, layoutId, mseTemplateId);
	const sections = useMemo(() => groupFrameChoices(filtered.slice(0, limit)), [filtered, limit]);

	if (isLoading) {
		return (
			<div className={styles.loading} role="status">
				<Stack size={22} />
				<span>{t('loading')}</span>
			</div>
		);
	}

	if (hasError) {
		return <p className={styles.error}>{t('error')}</p>;
	}

	return (
		<div className={styles.library}>
			<div className={styles.libraryHeader}>
				<div>
					<strong>{t('title')}</strong>
					<span>{t('count', { count: labelled.length })}</span>
				</div>
			</div>
			<label className={styles.search}>
				<MagnifyingGlass size={17} aria-hidden />
				<span className={styles.srOnly}>{t('searchLabel')}</span>
				<input
					type="search"
					value={query}
					placeholder={t('searchPlaceholder')}
					onChange={(event) => {
						setQuery(event.target.value);
						setLimit(PAGE_SIZE);
					}}
				/>
			</label>
			<div className={styles.resultLine} aria-live="polite">
				{t('results', { count: filtered.length })}
			</div>
			{sections.length > 0 ? (
				sections.map((section) => (
					<section key={section.kind} className={styles.section}>
						<h4 className={styles.sectionTitle}>
							{t(`sections.${section.kind}`)}
							<span className={styles.sectionCount}>{section.choices.length}</span>
						</h4>
						<div className={styles.grid}>
							{section.choices.map((choice) => {
								const isSelected = active?.key === choice.key;
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
											{choice.template?.samplePath ? (
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
											<small>
												{choice.template
													? `${choice.template.source === 'cardconjurer' ? 'CardConjurer' : 'MSE'} · ${t(`kinds.${choice.template.kind}`)}`
													: t('houseFrame')}
											</small>
										</span>
									</button>
								);
							})}
						</div>
					</section>
				))
			) : (
				<p className={styles.empty}>{t('empty')}</p>
			)}
			{limit < filtered.length && (
				<button
					type="button"
					className={styles.loadMore}
					onClick={() => setLimit(limit + PAGE_SIZE)}
				>
					{t('loadMore', { count: Math.min(PAGE_SIZE, filtered.length - limit) })}
				</button>
			)}
		</div>
	);
}
```

- [ ] **Step 3: Add the one new row-subtitle message**

The component above references `mseLibrary.houseFrame`. Add to both locales inside `mseLibrary`:

`fr.json`: `"houseFrame": "Cadre Wizcard intégré",`
`en.json`: `"houseFrame": "Built-in Wizcard frame",`

- [ ] **Step 4: Add the section styles, remove the filter styles**

In `MseTemplatePicker.module.css`, delete the `.filters, .sourceFilters` rule block, the `.filters button, .sourceFilters button` block, the `:hover` and `[aria-pressed='true']` blocks for them, the `.sourceFilters button` block, and the `.sourceBadge` block. Then append:

```css
/* Les sections remplacent la ligne de filtres : le regroupement est le même, mais
   rien n'est masqué et aucun clic n'est nécessaire. */
.section {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.sectionTitle {
	display: flex;
	align-items: center;
	gap: 7px;
	padding-top: 2px;
	color: var(--text-muted);
	font-size: var(--text-xs);
	font-weight: 500;
}

.sectionCount {
	padding: 1px 7px;
	border-radius: 999px;
	background: rgba(255, 255, 255, 0.06);
	font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `EditorSidebar.tsx` (it still passes the old props — Task 4 fixes it). No errors inside `MseTemplatePicker.tsx`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/studio/components/MseTemplatePicker" messages/fr.json messages/en.json
git commit -m "feat(studio): render one merged frame list with section headers"
```

---

### Task 4: Wire the sidebar to the single selector

**Files:**

- Modify: `src/app/[locale]/studio/components/EditorSidebar/EditorSidebar.tsx:603-635`
- Modify: `src/app/[locale]/studio/components/EditorSidebar/EditorSidebar.module.css`
- Modify: `messages/fr.json`, `messages/en.json`

**Interfaces:**

- Consumes: `MseTemplatePicker`'s new props (Task 3); `CARD_LAYOUT_LIST` from `@/lib/card-editor/layout-registry`.
- Produces: nothing new.

- [ ] **Step 1: Replace the picker call and delete the layout fieldset**

In `StylePanel`, replace lines 603–635 (the `<MseTemplatePicker …/>` element **and** the whole `<fieldset>` holding `.layoutGrid`) with:

```tsx
<MseTemplatePicker
	templates={mseTemplates}
	houseLayoutIds={HOUSE_LAYOUT_IDS}
	layoutId={draft.layoutId}
	mseTemplateId={draft.mseTemplateId}
	isLoading={isMseCatalogLoading}
	hasError={hasMseCatalogError}
	// Une seule écriture pour les deux champs : c'est ce qui rend la
	// désynchronisation impossible, là où les deux sélecteurs d'avant
	// s'écrasaient l'un l'autre.
	onSelect={(choice) =>
		onDraftChange({
			mseTemplateId: choice.mseTemplateId,
			layoutId: choice.layoutId,
		})
	}
/>
```

- [ ] **Step 2: Define the house layout list**

Near the top of `EditorSidebar.tsx`, beside the other module constants (after `LANGUAGE_CODES`):

```ts
/** Gabarits maison proposés, dans l'ordre. `landscape` reste exclu (cf. CARD_LAYOUT_LIST). */
const HOUSE_LAYOUT_IDS = CARD_LAYOUT_LIST.map((layout) => layout.id);
```

- [ ] **Step 3: Fix the imports**

`CARD_LAYOUT_LIST` is already imported. Remove the now-unused `layoutForMseTemplate` from the `mse-assets` import, keeping `type MseTemplate`:

```tsx
import { type MseTemplate } from '@/lib/card-editor/mse-assets';
```

- [ ] **Step 4: Remove the dead styles**

In `EditorSidebar.module.css`, delete these rule blocks, now that the layout grid is gone: `.layoutGrid`, `.layoutCard, .layoutActive`, `.layoutCard:hover, .layoutActive`, `.layoutCard strong, .layoutActive strong`, `.layoutCard small, .layoutActive small`, `.layoutPreview`, `.layoutPreview i`, `.layoutPreview i:nth-child(1)`, `.layoutPreview i:nth-child(2)`, `.layoutPreview i:nth-child(3)`, and the three `.layoutPreview[data-layout=…]` blocks.

Leave the `@media (max-width: 520px)` block's `.panelContent` rule intact.

- [ ] **Step 5: Remove the dead message key**

The `layout` fieldset legend is gone. Delete `cardEditor.style.layout` from **both** `messages/fr.json` and `messages/en.json`.

Keep `cardEditor.layouts` — the house entries' names now come from it.

- [ ] **Step 6: Verify the whole thing typechecks and lints**

Run:

```bash
npx tsc --noEmit
npx eslint "src/app/[locale]/studio" src/lib/card-editor
npx prettier --check "src/app/[locale]/studio/**/*.{ts,tsx,css}" src/lib/card-editor messages/*.json
```

Expected: tsc silent; eslint silent; prettier reports all files formatted. If prettier complains, run the same command with `--write`.

- [ ] **Step 7: Verify no dangling references**

```bash
grep -rn "layoutForMseTemplate\|selectedId\|sourceFilters\|filtersLabel\|style\.layout\|layoutGrid\|layoutPreview\|layoutCard\|layoutActive" src/ messages/
```

Expected: `layoutForMseTemplate` may still appear in `mse-assets.ts` (its definition — leave it, `mse-assets` is a public module) but **must not** appear in `EditorSidebar.tsx`. Nothing else should match.

- [ ] **Step 8: Commit**

```bash
git add "src/app/[locale]/studio/components/EditorSidebar" messages/fr.json messages/en.json
git commit -m "feat(studio): drive layout and frame from a single selector"
```

---

### Task 5: Runtime verification

No test framework exists, so this is the real gate. Do it in a browser, not by reasoning.

**Files:** none modified (unless a defect is found).

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

If it reports another instance already running, use that one. Open `/fr/studio` and go to the **Layout** tab.

- [ ] **Step 2: Check the list shape**

Confirm, against the spec's success criteria:

- exactly one selector in the panel (no separate layout grid below);
- the first section is **Gabarits Wizcard** with **8** entries;
- following sections are Cartes (143), Planeswalkers (28), Split (13), Double face (10), Jetons (8), Autres (4) — subject to the 30-per-page limit, so click "Afficher 30 layouts de plus" until all load;
- no two visible rows share a label. Spot-check by searching `After 8th edition`: 7 rows, each with a distinct `·` suffix.

- [ ] **Step 3: Verify the desync is gone — the core regression**

This is the bug the whole change exists to fix:

1. select the house entry **Full art** — the preview switches to the full-bleed layout;
2. **wait two seconds** (this is where the self-healing effect from Task 2 would fire);
3. confirm the card is still full-art and **Full art** is still highlighted.

Before this change, step 3 reverted to the default M15 frame. If it reverts, Task 2's guard is not working — stop and report.

Then: select any vendor frame, confirm the highlight moves and the house entry deselects. Reselect **Full art**; confirm it comes back.

- [ ] **Step 4: Check the console**

The page must log no `MISSING_MESSAGE`. Missing i18n keys do not fail typecheck, so this is the only place a locale-sync mistake surfaces:

```bash
grep -c "MISSING_MESSAGE" .next/dev/logs/next-development.log
```

Compare timestamps — only entries newer than the start of this session count. Repeat the page load on `/en/studio` to check the English locale too.

- [ ] **Step 5: Confirm a saved draft round-trips**

Reload the page with a house layout selected. The autosaved draft must restore with **Full art** still active — proving `HOUSE_FRAME_TEMPLATE_ID` survives serialisation and `findActiveChoice` resolves it on load.

- [ ] **Step 6: Final check**

Run: `npm run check`
Expected: no NEW problems versus the pre-existing baseline (~60 in unrelated files). Compare the reported file paths against files this plan did not touch.

- [ ] **Step 7: Commit any fixes**

If steps 2–5 surfaced defects, fix them and commit:

```bash
git add -A
git commit -m "fix(studio): <what the runtime check surfaced>"
```

If nothing needed fixing, there is nothing to commit — say so rather than creating an empty commit.

---

## Notes for the implementer

**Why Task 2 comes before Task 3.** The self-healing effect resets any draft whose template is not a renderable frame. The house sentinel is deliberately not a real template, so without Task 2's guard the effect overwrites every house selection on the next render — and the symptom appears in Task 3's UI, far from its cause.

**The house label indirection.** `buildFrameChoices` stores the layout id in `label` for house entries; the component swaps it for the translated name. The model stays free of i18n (it is a pure module), and search still matches what the user reads because the swap happens before filtering.

**What is deliberately untouched.** `layout-registry.ts` geometry, `layoutForMseTemplate` in `mse-assets.ts` (still exported and used by `layoutForMseTemplate` consumers elsewhere), the persisted draft shape, and the `renderMode !== 'frame'` exclusion.
