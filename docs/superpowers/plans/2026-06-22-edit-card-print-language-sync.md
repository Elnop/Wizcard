# Edit Card Print/Language/Preview Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In `EditCardModal`, selecting a print updates the preview + language (edit mode), and changing the language reloads the localized print so the preview updates too.

**Architecture:** All logic stays in `EditCardModal`. The decision of _what to fetch_ on a language change is extracted into a pure helper (`resolveLanguageChange`) so it can be unit-tested with the repo's existing `tsx`-script test pattern. The React wiring (state updates, async fetch with `AbortController`, info message) is added to the component and verified via `npm run check` + manual checks, since this codebase has no component-level test framework.

**Tech Stack:** TypeScript, React (Next.js), Scryfall endpoints in `src/lib/scryfall`. Tests are standalone `.test.ts` files run with `tsx`, using a manual `check()`/`process.exit(1)` harness (no Vitest/Jest).

## Global Constraints

- Run `npm run check` (tsc + eslint + prettier) before every commit; it must pass.
- No changes to parent API: `onChangePrint`, `onSave`, `onAdd` signatures stay as-is.
- No DB migration.
- Reuse existing helpers: `getCardBySetNumberAndLang` (`src/lib/scryfall/endpoints/cards.ts`), `LANGUAGE_TO_SCRYFALL_CODE` / `SCRYFALL_CODE_TO_LANGUAGE` / `MtgLanguage` (`src/lib/mtg/languages.ts`).
- Follow existing test style: standalone `*.test.ts`, manual `check(label, cond)` harness, `console.log` summary, `process.exit(1)` on failure (see `src/lib/scryfall/utils/set-classification.test.ts`).

---

### Task 1: Pure helper `resolveLanguageChange` (+ unit test)

**Files:**

- Create: `src/lib/card/components/EditCardModal/resolveLanguageChange.ts`
- Test: `src/lib/card/components/EditCardModal/resolveLanguageChange.test.ts`

**Interfaces:**

- Consumes: `LANGUAGE_TO_SCRYFALL_CODE`, `MtgLanguage` from `@/lib/mtg/languages`.
- Produces:

  ```ts
  // The decision describing what the language <select> onChange should do.
  type LanguageChangeAction =
  	| { kind: 'skip' } // no fetch (empty lang, missing print id, or no scryfall code)
  	| { kind: 'fetch'; set: string; collectorNumber: string; langCode: string };

  function resolveLanguageChange(
  	language: MtgLanguage | undefined, // value selected in the <select> ('' => undefined)
  	print: { set?: string; collector_number?: string }
  ): LanguageChangeAction;
  ```

  Rules: returns `skip` when `language` is undefined, when `print.set`/`print.collector_number` is missing, or when `LANGUAGE_TO_SCRYFALL_CODE[language]` is undefined; otherwise returns `fetch` with the print's set, collector number, and the resolved Scryfall lang code.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/card/components/EditCardModal/resolveLanguageChange.test.ts
import { resolveLanguageChange } from './resolveLanguageChange';

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean): void {
	if (cond) {
		console.log(`PASS: ${label}`);
		passed++;
	} else {
		console.error(`FAIL: ${label}`);
		failed++;
	}
}

const print = { set: 'neo', collector_number: '123' };

const a = resolveLanguageChange('French', print);
check(
	'French + valid print => fetch neo/123/fr',
	a.kind === 'fetch' && a.set === 'neo' && a.collectorNumber === '123' && a.langCode === 'fr'
);

check('undefined language => skip', resolveLanguageChange(undefined, print).kind === 'skip');

check(
	'missing set => skip',
	resolveLanguageChange('French', { collector_number: '123' }).kind === 'skip'
);

check(
	'missing collector_number => skip',
	resolveLanguageChange('French', { set: 'neo' }).kind === 'skip'
);

const en = resolveLanguageChange('English', print);
check('English => fetch with en code', en.kind === 'fetch' && en.langCode === 'en');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx src/lib/card/components/EditCardModal/resolveLanguageChange.test.ts`
Expected: FAIL — module/function not found (cannot import `resolveLanguageChange`).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/card/components/EditCardModal/resolveLanguageChange.ts
import { LANGUAGE_TO_SCRYFALL_CODE, type MtgLanguage } from '@/lib/mtg/languages';

export type LanguageChangeAction =
	| { kind: 'skip' }
	| { kind: 'fetch'; set: string; collectorNumber: string; langCode: string };

export function resolveLanguageChange(
	language: MtgLanguage | undefined,
	print: { set?: string; collector_number?: string }
): LanguageChangeAction {
	if (!language) return { kind: 'skip' };
	const langCode = LANGUAGE_TO_SCRYFALL_CODE[language];
	if (!langCode) return { kind: 'skip' };
	if (!print.set || !print.collector_number) return { kind: 'skip' };
	return {
		kind: 'fetch',
		set: print.set,
		collectorNumber: print.collector_number,
		langCode,
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx src/lib/card/components/EditCardModal/resolveLanguageChange.test.ts`
Expected: PASS — `5 passed, 0 failed`.

- [ ] **Step 5: Run check and commit**

Run: `npm run check`
Expected: passes.

```bash
git add src/lib/card/components/EditCardModal/resolveLanguageChange.ts \
        src/lib/card/components/EditCardModal/resolveLanguageChange.test.ts
git commit -m "feat(edit-card): add resolveLanguageChange helper for localized print fetch"
```

---

### Task 2: Wire print selection + language→preview into EditCardModal

**Files:**

- Modify: `src/lib/card/components/EditCardModal/EditCardModal.tsx`
- Modify: `src/lib/card/components/EditCardModal/EditCardModal.module.css`

**Interfaces:**

- Consumes: `resolveLanguageChange` + `LanguageChangeAction` (Task 1); `getCardBySetNumberAndLang` from `@/lib/scryfall/endpoints/cards`; `SCRYFALL_CODE_TO_LANGUAGE` (already imported).
- Produces: behavior only; no exported API change.

- [ ] **Step 1: Add imports**

In `src/lib/card/components/EditCardModal/EditCardModal.tsx`, add to the existing imports:

```ts
import { useRef } from 'react';
import { getCardBySetNumberAndLang } from '@/lib/scryfall/endpoints/cards';
import { resolveLanguageChange } from './resolveLanguageChange';
```

Merge `useRef` into the existing `import { useState } from 'react';` line so it reads `import { useRef, useState } from 'react';`.

- [ ] **Step 2: Add state for the info message and an abort ref**

Just after the existing `const isFoil = entry.isFoil ?? false;` line, add:

```ts
const [langInfoMessage, setLangInfoMessage] = useState<string | null>(null);
const langFetchAbort = useRef<AbortController | null>(null);
```

- [ ] **Step 3: Add the language-change handler**

Add this function inside the component (e.g. after the existing `save` function):

```ts
async function handleLanguageChange(value: string) {
	const language = (value as CardEntry['language']) || undefined;
	save({ language });

	const action = resolveLanguageChange(language, selectedPrint);
	if (action.kind === 'skip') {
		setLangInfoMessage(null);
		langFetchAbort.current?.abort();
		return;
	}

	langFetchAbort.current?.abort();
	const controller = new AbortController();
	langFetchAbort.current = controller;

	try {
		const localized = await getCardBySetNumberAndLang(
			action.set,
			action.collectorNumber,
			action.langCode,
			controller.signal
		);
		if (controller.signal.aborted) return;
		setSelectedPrint(localized);
		setLangInfoMessage(null);
		if (!addMode) props.onChangePrint(localized);
	} catch (err: unknown) {
		if (err instanceof DOMException && err.name === 'AbortError') return;
		if (controller.signal.aborted) return;
		setLangInfoMessage('Image localisée indisponible pour cette édition.');
	}
}
```

- [ ] **Step 4: Clean up the abort controller on unmount**

Add an effect (import `useEffect` alongside the others — update the React import to `import { useEffect, useRef, useState } from 'react';`):

```ts
useEffect(() => {
	return () => langFetchAbort.current?.abort();
}, []);
```

- [ ] **Step 5: Use the new handler on the Language `<select>`**

Replace the existing `onChange` of the language select (currently `onChange={(e) => save({ language: (e.target.value as CardEntry['language']) || undefined })}`) with:

```tsx
onChange={(e) => handleLanguageChange(e.target.value)}
```

- [ ] **Step 6: Render the info message under the Language field**

Immediately after the language `<select>` (still inside its `<div className={styles.field}>`), add:

```tsx
{
	langInfoMessage && <p className={styles.langInfo}>{langInfoMessage}</p>;
}
```

- [ ] **Step 7: Add the `langInfo` CSS class**

In `src/lib/card/components/EditCardModal/EditCardModal.module.css`, after the `.select` rules, add:

```css
.langInfo {
	margin: 4px 0 0;
	font-size: 12px;
	color: var(--color-text-muted, #888);
}
```

(If `--color-text-muted` is not defined in the project, the `#888` fallback applies — no other change needed.)

- [ ] **Step 8: Update the print-picker `onSelect` to sync preview + language in edit mode**

Replace the existing `onSelect` handler of `CardPrintPickerModal` (the block that currently does `if (addMode) { ... } else { props.onChangePrint(print); }`) with the unified version:

```tsx
onSelect={(print) => {
	setSelectedPrint(print);
	const lang = print.lang ? SCRYFALL_CODE_TO_LANGUAGE[print.lang] : undefined;
	save({ language: lang });
	setLangInfoMessage(null);
	if (!addMode) props.onChangePrint(print);
	setShowPrintPicker(false);
}}
```

- [ ] **Step 9: Make `cardForPrint` derive from `selectedPrint`**

Replace the line:

```ts
const cardForPrint: ScryfallCard = addMode ? selectedPrint : (props.card as ScryfallCard);
```

with:

```ts
const cardForPrint: ScryfallCard = selectedPrint;
```

This ensures the print picker and `entryLangCode` reflect the currently displayed print after a change.

- [ ] **Step 10: Run check**

Run: `npm run check`
Expected: passes (no TS/eslint/prettier errors).

- [ ] **Step 11: Manual verification**

Start the app and open the card edit modal. Verify:

1. Edit mode → "Change print" → select a print: preview image AND language field both update.
2. Edit mode → change Language in the select: preview updates to the localized image.
3. Pick a language not printed for that edition: preview stays, info message "Image localisée indisponible pour cette édition." appears.
4. Change language rapidly several times: the final selection's image wins (no flicker to a stale one).

- [ ] **Step 12: Commit**

```bash
git add src/lib/card/components/EditCardModal/EditCardModal.tsx \
        src/lib/card/components/EditCardModal/EditCardModal.module.css
git commit -m "feat(edit-card): sync print, language and preview in edit modal"
```

---

## Self-Review

**Spec coverage:**

- Décision "langue ↔ print: print écrase toujours la langue" → Task 2 Step 8. ✓
- Décision "langue → preview localisée" → Task 1 (decision) + Task 2 Steps 3/5. ✓
- Décision "404 → garder preview + conserver langue + message" → Task 2 Step 3 (catch) + Steps 6/7. ✓
- "cardForPrint dérive de selectedPrint" → Task 2 Step 9. ✓
- "AbortController, annulation requêtes obsolètes, nettoyage démontage" → Task 2 Steps 2/3/4. ✓
- "Pas de changement API parent / DB" → Global Constraints. ✓
- Tests/vérif manuelle (4 scénarios) → Task 2 Step 11. ✓

**Placeholder scan:** No TBD/TODO; all code blocks complete. ✓

**Type consistency:** `resolveLanguageChange(language, print)` and `LanguageChangeAction` used identically in Task 1 and Task 2. `getCardBySetNumberAndLang(set, collectorNumber, langCode, signal)` matches the endpoint signature in `src/lib/scryfall/endpoints/cards.ts`. `save({ language })`, `setSelectedPrint`, `props.onChangePrint` match existing component members. ✓
