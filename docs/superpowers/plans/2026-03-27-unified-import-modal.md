# Unified Import Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge `ImportPreviewModal` and `ImportSummaryModal` into a single `ImportModal` with explicit loading screens at every async step (parsing, Scryfall preview fetch, final fetch/merge) instead of an empty table.

**Architecture:** A new `'parsing'` status is added to the import state machine. `ImportPreviewModal` is renamed to `ImportModal` and its render logic switches on `status` to show: a file input form, loading screens (spinner + label), the existing preview table, or a summary screen. The page-level importing overlay is removed and replaced by loading screens inside the modal.

**Tech Stack:** React, TypeScript, CSS Modules, Next.js (App Router)

---

## File Map

| File                                                                             | Action           | Responsibility                                                                          |
| -------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------- |
| `src/lib/import/hooks/useImport.ts`                                              | Modify           | Add `'parsing'` to `ImportStatus` union                                                 |
| `src/lib/import/hooks/useImportFileHandling.ts`                                  | Modify           | Emit `'parsing'` + defer parse with `setTimeout`                                        |
| `src/lib/collection/components/ImportPreviewModal/ImportPreviewModal.tsx`        | Rename + rewrite | Becomes `ImportModal.tsx` — stage-switching render                                      |
| `src/lib/collection/components/ImportPreviewModal/ImportPreviewModal.module.css` | Rename + extend  | Becomes `ImportModal.module.css` — add loading + summary styles, move spinner from page |
| `src/lib/collection/components/ImportPreviewModal/` (folder)                     | Rename           | `ImportPreviewModal/` → `ImportModal/`                                                  |
| `src/app/collection/page.tsx`                                                    | Modify           | Use `ImportModal`, pass new props, remove overlay, simplify confirm                     |
| `src/app/collection/page.module.css`                                             | Modify           | Remove `.importingOverlay`, `.spinner`, `.importingText`, `@keyframes spin`             |
| `src/lib/collection/components/ImportSummaryModal/ImportSummaryModal.tsx`        | Delete           | Absorbed into `ImportModal`                                                             |
| `src/lib/collection/components/ImportSummaryModal/ImportSummaryModal.module.css` | Delete           | Absorbed into `ImportModal.module.css`                                                  |

Sub-components that are **unchanged**: `ImportFileInput`, `ImportPreviewStats`, `ImportPreviewFilters`, `ImportFallbackTable`, `ImportSupportModals`, `useImportPreviewState`, `tableColumns`.

---

## Task 1: Add `'parsing'` to `ImportStatus`

**Files:**

- Modify: `src/lib/import/hooks/useImport.ts`

- [ ] **Step 1: Add `'parsing'` to the status union**

In `useImport.ts`, change lines 13-20:

```ts
export type ImportStatus =
	| 'idle'
	| 'selecting'
	| 'parsing'
	| 'previewing'
	| 'fetching'
	| 'merging'
	| 'done'
	| 'error';
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run check 2>&1 | head -30
```

Expected: may show errors in `useImportFileHandling` or `page.tsx` about exhaustive switches — that's fine, we'll fix those in later tasks. No errors in `useImport.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add src/lib/import/hooks/useImport.ts
git commit -m "feat(import): add 'parsing' to ImportStatus union"
```

---

## Task 2: Emit `'parsing'` status and defer synchronous parse

**Files:**

- Modify: `src/lib/import/hooks/useImportFileHandling.ts`

The parse (format detection + parser run + row merge) is synchronous. Without deferring it, React batches the `setStatus('parsing')` and `setStatus('previewing')` calls in the same microtask flush and never paints the parsing screen. Wrapping the sync work in `setTimeout(fn, 0)` yields to the renderer.

- [ ] **Step 1: Update `selectFile` to emit `'parsing'` and defer parse**

Replace the body of `selectFile` (lines 36-58 in current file):

```ts
const selectFile = useCallback(
	async (file: File, forcedFormatId?: ImportFormatId) => {
		const text = await file.text();
		setFileText(text);
		setStatus('parsing');

		setTimeout(() => {
			const { formatId, scores } = forcedFormatId
				? { formatId: forcedFormatId, scores: {} as Record<ImportFormatId, number> }
				: detectFormat(text, file.name);
			const parser = getParser(formatId);
			const parsed = parser(text);
			const mergedRows = mergeRows(parsed.rows);
			const mergedParsed: ParsedImportResult = { ...parsed, rows: mergedRows };

			setPreview({
				fileName: file.name,
				fileSize: file.size,
				detectedFormat: formatId,
				scores,
				parsed: mergedParsed,
			});
			setStatus('previewing');
			void fetchPreviewCards(parsed);
		}, 0);
	},
	[setFileText, setPreview, setStatus, fetchPreviewCards]
);
```

- [ ] **Step 2: Update `submitText` to emit `'parsing'` and defer parse**

Replace the body of `submitText` (lines 61-83 in current file):

```ts
const submitText = useCallback(
	(text: string, forcedFormatId?: ImportFormatId) => {
		setFileText(text);
		setStatus('parsing');

		setTimeout(() => {
			const { formatId, scores } = forcedFormatId
				? { formatId: forcedFormatId, scores: {} as Record<ImportFormatId, number> }
				: detectFormat(text);
			const parser = getParser(formatId);
			const parsed = parser(text);
			const mergedRows = mergeRows(parsed.rows);
			const mergedParsed: ParsedImportResult = { ...parsed, rows: mergedRows };

			setPreview({
				fileName: 'Collage texte',
				fileSize: new Blob([text]).size,
				detectedFormat: formatId,
				scores,
				parsed: mergedParsed,
			});
			setStatus('previewing');
			void fetchPreviewCards(parsed);
		}, 0);
	},
	[setFileText, setPreview, setStatus, fetchPreviewCards]
);
```

Note: `changeFormat` is **not** changed — the user is already in the preview stage and re-parse is instant; no loading screen is needed there.

- [ ] **Step 3: Verify TypeScript**

```bash
npm run check 2>&1 | head -30
```

Expected: no new errors in `useImportFileHandling.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/import/hooks/useImportFileHandling.ts
git commit -m "feat(import): emit 'parsing' status and defer sync parse to yield renderer"
```

---

## Task 3: Rename folder and CSS file, extend CSS with loading + summary styles

**Files:**

- Rename: `src/lib/collection/components/ImportPreviewModal/` → `src/lib/collection/components/ImportModal/`
- Rename: `ImportPreviewModal.module.css` → `ImportModal.module.css`
- Modify: `ImportModal.module.css`

- [ ] **Step 1: Rename the folder and CSS file**

```bash
mv src/lib/collection/components/ImportPreviewModal src/lib/collection/components/ImportModal
mv src/lib/collection/components/ImportModal/ImportPreviewModal.module.css src/lib/collection/components/ImportModal/ImportModal.module.css
```

- [ ] **Step 2: Add loading screen and summary screen styles to `ImportModal.module.css`**

Append to the end of `src/lib/collection/components/ImportModal/ImportModal.module.css`:

```css
/* Loading screen */

.loadingScreen {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 80px 24px;
	gap: 16px;
}

.spinner {
	width: 36px;
	height: 36px;
	border: 3px solid var(--border);
	border-top-color: var(--foreground);
	border-radius: 50%;
	animation: spin 0.8s linear infinite;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

.loadingLabel {
	font-size: 14px;
	color: var(--text-muted);
}

/* Summary screen */

.summaryStats {
	display: flex;
	gap: 32px;
}

.summaryStat {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.summaryStatValue {
	font-size: 32px;
	font-weight: 700;
	color: var(--primary);
	line-height: 1;
}

.summaryStatWarn {
	color: #f59e0b;
}

.summaryStatLabel {
	font-size: 13px;
	color: var(--text-muted);
}

.summaryCloseBtn {
	align-self: flex-end;
	background: var(--primary);
	color: #fff;
	border: none;
	border-radius: 8px;
	padding: 10px 24px;
	font-size: 14px;
	font-weight: 600;
	cursor: pointer;
	transition: opacity 0.15s;
}

.summaryCloseBtn:hover {
	opacity: 0.85;
}
```

- [ ] **Step 3: Verify no import errors (CSS file rename only, no logic yet)**

```bash
npm run check 2>&1 | head -30
```

Expected: errors about `ImportPreviewModal` not found — those will be fixed in Task 4.

- [ ] **Step 4: Commit**

```bash
git add src/lib/collection/components/ImportModal/
git commit -m "refactor(import): rename ImportPreviewModal folder to ImportModal, add loading/summary CSS"
```

---

## Task 4: Rewrite `ImportModal.tsx` with stage-switching render

**Files:**

- Create: `src/lib/collection/components/ImportModal/ImportModal.tsx` (rename from `ImportPreviewModal.tsx`)

- [ ] **Step 1: Rename the component file**

```bash
mv src/lib/collection/components/ImportModal/ImportPreviewModal.tsx src/lib/collection/components/ImportModal/ImportModal.tsx
```

- [ ] **Step 2: Rewrite `ImportModal.tsx`**

Replace the entire contents of `src/lib/collection/components/ImportModal/ImportModal.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type {
	ImportFormatId,
	ImportFormatDescriptor,
	ParsedImportRow,
	ImportResult,
} from '@/lib/import/utils/types';
import type { ImportPreview, ImportStatus, ImportProgress } from '@/lib/import/hooks/useImport';
import type { ScryfallCard, ScryfallSet } from '@/lib/scryfall/types/scryfall';
import { PAGE_SIZE } from '@/lib/collection/constants';
import { useImportPreviewState } from './useImportPreviewState';
import { ImportFileInput } from './ImportFileInput';
import { ImportPreviewStats } from './ImportPreviewStats';
import { ImportPreviewFilters } from './ImportPreviewFilters';
import { ImportFallbackTable } from './ImportFallbackTable';
import { ImportSupportModals } from './ImportSupportModals';
import { CardList, type CardListColumn } from '@/components/ui/CardList/CardList';
import { Button } from '@/components/ui/Button/Button';
import { Modal } from '@/components/ui/Modal/Modal';
import styles from './ImportModal.module.css';
import { STATIC_IMPORT_COLUMNS } from './tableColumns';

interface Props {
	isOpen: boolean;
	status: ImportStatus;
	preview: ImportPreview | null;
	formatRegistry: ImportFormatDescriptor[];
	fetchedCards: ScryfallCard[];
	isLoadingPreview: boolean;
	previewProgress: ImportProgress;
	progress: ImportProgress;
	result: ImportResult | null;
	sets: ScryfallSet[];
	setsLoading: boolean;
	onFileSelect: (file: File, forcedFormat?: ImportFormatId) => void;
	onTextSubmit: (text: string, forcedFormat?: ImportFormatId) => void;
	onChangeFormat: (formatId: ImportFormatId) => void;
	onChangeFile: () => void;
	onConfirm: () => void;
	onCancel: () => void;
	onClose: () => void;
	onUpdateRow: (rowIndex: number, updates: Partial<ParsedImportRow>) => void;
	onRemoveRow: (rowIndex: number) => void;
}

function modalTitle(status: ImportStatus, isLoadingPreview: boolean): string {
	switch (status) {
		case 'selecting':
			return 'Importer un fichier';
		case 'parsing':
			return 'Analyse du fichier…';
		case 'previewing':
			return isLoadingPreview ? 'Récupération des cartes…' : "Aperçu de l'import";
		case 'fetching':
			return 'Récupération des cartes…';
		case 'merging':
			return 'Ajout à la collection…';
		case 'done':
			return 'Import terminé';
		case 'error':
			return "Erreur d'import";
		default:
			return 'Importer un fichier';
	}
}

function LoadingScreen({ label }: { label: string }) {
	return (
		<div className={styles.loadingScreen}>
			<div className={styles.spinner} />
			<p className={styles.loadingLabel}>{label}</p>
		</div>
	);
}

function SummaryScreen({
	result,
	status,
	onClose,
}: {
	result: ImportResult;
	status: ImportStatus;
	onClose: () => void;
}) {
	const [errorsExpanded, setErrorsExpanded] = useState(false);
	const hasErrors = result.errors.length > 0;
	const manyErrors = result.errors.length > 5;

	return (
		<>
			<div className={styles.summaryStats}>
				<div className={styles.summaryStat}>
					<span className={styles.summaryStatValue}>{result.imported}</span>
					<span className={styles.summaryStatLabel}>cartes importées</span>
				</div>
				{result.notFound > 0 && (
					<div className={styles.summaryStat}>
						<span className={`${styles.summaryStatValue} ${styles.summaryStatWarn}`}>
							{result.notFound}
						</span>
						<span className={styles.summaryStatLabel}>non trouvées</span>
					</div>
				)}
			</div>
			{hasErrors && (
				<div className={styles.errors}>
					<button
						type="button"
						className={styles.errorToggle}
						onClick={() => setErrorsExpanded((v) => !v)}
					>
						{result.errors.length} erreur{result.errors.length !== 1 ? 's' : ''}
						{manyErrors ? (errorsExpanded ? ' ▲' : ' ▼') : ''}
					</button>
					{(!manyErrors || errorsExpanded) && (
						<ul className={styles.errorList}>
							{result.errors.map((e, i) => (
								<li key={i}>{e}</li>
							))}
						</ul>
					)}
				</div>
			)}
			<div className={styles.actions}>
				<button type="button" className={styles.summaryCloseBtn} onClick={onClose}>
					Fermer
				</button>
			</div>
		</>
	);
}

export function ImportModal({
	isOpen,
	status,
	preview,
	formatRegistry,
	fetchedCards,
	isLoadingPreview,
	previewProgress,
	progress,
	result,
	sets,
	setsLoading,
	onFileSelect,
	onTextSubmit,
	onChangeFormat,
	onChangeFile,
	onConfirm,
	onCancel,
	onClose,
	onUpdateRow,
	onRemoveRow,
}: Props) {
	const state = useImportPreviewState({
		preview,
		fetchedCards,
		onFileSelect,
		onTextSubmit,
		onUpdateRow,
		onRemoveRow,
	});

	if (!isOpen) return null;

	const isPreviewWide = status === 'previewing';

	const skeletonCount =
		fetchedCards.length === 0
			? 6
			: Math.min(PAGE_SIZE, Math.max(0, state.uniqueIdentifierCount - fetchedCards.length));
	const tableColumns: CardListColumn[] = [
		{ key: 'qty', label: 'Qté', render: (card) => state.rowMap.get(card.id)?.quantity ?? 1 },
		...STATIC_IMPORT_COLUMNS,
	];
	const renderOverlay = (card: { id: string }) => {
		const qty = state.rowMap.get(card.id)?.quantity ?? 1;
		return qty > 1 ? <span className={styles.gridBadge}>x{qty}</span> : null;
	};

	const previewProgressLabel =
		previewProgress.total > 0
			? `Récupération des cartes… (${previewProgress.current}/${previewProgress.total})`
			: 'Récupération des cartes…';

	const fetchProgressLabel =
		progress.total > 0
			? `Récupération des cartes… (${progress.current}/${progress.total})`
			: 'Récupération des cartes…';

	function renderContent() {
		if (status === 'selecting') {
			return (
				<ImportFileInput
					formatRegistry={formatRegistry}
					forcedFormat={state.forcedFormat}
					onForcedFormatChange={state.setForcedFormat}
					inputMode={state.inputMode}
					onInputModeChange={state.setInputMode}
					pastedText={state.pastedText}
					onPastedTextChange={state.setPastedText}
					isDragging={state.isDragging}
					onDragOver={state.handleDragOver}
					onDragLeave={state.handleDragLeave}
					onDrop={state.handleDrop}
					onFileSelect={onFileSelect}
					onTextSubmit={state.handleTextSubmit}
					onCancel={onCancel}
				/>
			);
		}

		if (status === 'parsing') {
			return <LoadingScreen label="Analyse du fichier…" />;
		}

		if (status === 'previewing' && isLoadingPreview && fetchedCards.length === 0) {
			return <LoadingScreen label={previewProgressLabel} />;
		}

		if (status === 'previewing' && preview) {
			return (
				<>
					<ImportPreviewStats
						preview={preview}
						formatRegistry={formatRegistry}
						errorsExpanded={state.errorsExpanded}
						onErrorsToggle={() => state.setErrorsExpanded((v) => !v)}
						onChangeFile={onChangeFile}
						onChangeFormat={onChangeFormat}
					/>
					<ImportPreviewFilters
						nameFilter={state.filters.name}
						onNameFilterChange={(value) => state.setFilters((prev) => ({ ...prev, name: value }))}
						activeFilterCount={state.activeFilterCount}
						onOpenFilterModal={() => state.setIsFilterModalOpen(true)}
						isFiltered={state.isFiltered}
						filteredCount={state.filteredCount}
						totalCardCount={state.totalCardCount}
					/>
					{state.filteredCards.length === 0 &&
						state.filteredRows.length > 0 &&
						!isLoadingPreview && <ImportFallbackTable rows={state.filteredRows} />}
					{(state.filteredCards.length > 0 || isLoadingPreview) && (
						<div className={styles.gridContainer}>
							<CardList
								cards={state.filteredCards}
								isLoading={isLoadingPreview && state.filteredCards.length === 0}
								skeletonCount={skeletonCount}
								cardsPerLine={4}
								onCardClick={(card) => state.setSelectedCardId(card.id)}
								renderOverlay={renderOverlay}
								tableColumns={tableColumns}
							/>
						</div>
					)}
					<div className={styles.actions}>
						<Button variant="ghost" onClick={onCancel}>
							Annuler
						</Button>
						<Button
							variant="primary"
							onClick={onConfirm}
							disabled={preview.parsed.rows.length === 0}
						>
							Confirmer l&apos;import
						</Button>
					</div>
				</>
			);
		}

		if (status === 'fetching') {
			return <LoadingScreen label={fetchProgressLabel} />;
		}

		if (status === 'merging') {
			return <LoadingScreen label="Ajout à la collection…" />;
		}

		if ((status === 'done' || status === 'error') && result) {
			return <SummaryScreen result={result} status={status} onClose={onClose} />;
		}

		return null;
	}

	return (
		<Modal className={`${styles.modal} ${isPreviewWide ? styles.modalWide : ''}`}>
			<h2 className={styles.title}>{modalTitle(status, isLoadingPreview)}</h2>
			{renderContent()}
			<ImportSupportModals state={state} sets={sets} setsLoading={setsLoading} />
		</Modal>
	);
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npm run check 2>&1 | head -40
```

Expected: errors in `page.tsx` about missing props and wrong import path — those are fixed in Task 5. No errors within `ImportModal.tsx` itself.

- [ ] **Step 4: Commit**

```bash
git add src/lib/collection/components/ImportModal/ImportModal.tsx
git commit -m "feat(import): rewrite ImportModal with stage-switching render (loading + summary screens)"
```

---

## Task 5: Update `page.tsx` — use `ImportModal`, pass new props, remove overlay

**Files:**

- Modify: `src/app/collection/page.tsx`

- [ ] **Step 1: Update the import statement**

Change line 13:

```tsx
import { ImportPreviewModal } from '@/lib/collection/components/ImportPreviewModal/ImportPreviewModal';
```

to:

```tsx
import { ImportModal } from '@/lib/collection/components/ImportModal/ImportModal';
```

- [ ] **Step 2: Destructure new values from `importCtx`**

Replace lines 102-116 (the destructuring block):

```tsx
const {
	status,
	progress,
	preview,
	fetchedCards,
	isLoadingPreview,
	openModal,
	selectFile,
	submitText,
	changeFormat,
	cancel,
	updateRow,
	removeRow,
	formatRegistry,
} = importCtx;
const isImporting = status === 'fetching' || status === 'merging';
const isBusy = status === 'previewing' || isImporting;
```

with:

```tsx
const {
	status,
	progress,
	preview,
	fetchedCards,
	isLoadingPreview,
	previewProgress,
	result,
	openModal,
	selectFile,
	submitText,
	changeFormat,
	cancel,
	reset,
	updateRow,
	removeRow,
	formatRegistry,
} = importCtx;
const isBusy =
	status === 'parsing' || status === 'previewing' || status === 'fetching' || status === 'merging';
```

- [ ] **Step 3: Simplify `handleConfirmImport`**

Replace lines 72-75:

```tsx
const handleConfirmImport = useCallback(async () => {
	await importCtx.confirm();
	importCtx.reset();
}, [importCtx]);
```

with:

```tsx
const handleConfirmImport = useCallback(async () => {
	await importCtx.confirm();
}, [importCtx]);
```

- [ ] **Step 4: Remove the `isImporting` overlay block**

Remove lines 164-172 (the `isImporting ? (...)` conditional that renders the page-level spinner), so the `{isImporting ? ... : entries.length === 0 ? ... : <CardList ... />}` becomes just `{entries.length === 0 ? ... : <CardList ... />}`.

The full replacement — change:

```tsx
{isImporting ? (
    <div className={styles.importingOverlay}>
        <div className={styles.spinner} />
        <p className={styles.importingText}>
            {status === 'fetching'
                ? `Récupération des cartes…${progress.total > 0 ? ` (${progress.current}/${progress.total})` : ''}`
                : 'Ajout à la collection…'}
        </p>
    </div>
) : entries.length === 0 ? (
```

to:

```tsx
{entries.length === 0 ? (
```

- [ ] **Step 5: Replace `<ImportPreviewModal` with `<ImportModal` and add new props**

Replace the `<ImportPreviewModal ... />` block (around lines 285-301):

```tsx
<ImportPreviewModal
	isOpen={status === 'selecting' || status === 'previewing'}
	preview={preview}
	formatRegistry={formatRegistry}
	fetchedCards={fetchedCards}
	isLoadingPreview={isLoadingPreview}
	sets={sets}
	setsLoading={setsLoading}
	onFileSelect={selectFile}
	onTextSubmit={submitText}
	onChangeFormat={changeFormat}
	onChangeFile={openModal}
	onConfirm={handleConfirmImport}
	onCancel={cancel}
	onUpdateRow={updateRow}
	onRemoveRow={removeRow}
/>
```

with:

```tsx
<ImportModal
	isOpen={status !== 'idle'}
	status={status}
	preview={preview}
	formatRegistry={formatRegistry}
	fetchedCards={fetchedCards}
	isLoadingPreview={isLoadingPreview}
	previewProgress={previewProgress}
	progress={progress}
	result={result}
	sets={sets}
	setsLoading={setsLoading}
	onFileSelect={selectFile}
	onTextSubmit={submitText}
	onChangeFormat={changeFormat}
	onChangeFile={openModal}
	onConfirm={handleConfirmImport}
	onCancel={cancel}
	onClose={reset}
	onUpdateRow={updateRow}
	onRemoveRow={removeRow}
/>
```

- [ ] **Step 6: Verify TypeScript**

```bash
npm run check 2>&1 | head -40
```

Expected: no errors in `page.tsx`. May still show errors about `ImportSummaryModal` if it's imported elsewhere — check with `grep -r ImportSummaryModal src/`.

- [ ] **Step 7: Commit**

```bash
git add src/app/collection/page.tsx
git commit -m "feat(import): use unified ImportModal in collection page, remove page-level importing overlay"
```

---

## Task 6: Clean up `page.module.css` and delete `ImportSummaryModal`

**Files:**

- Modify: `src/app/collection/page.module.css`
- Delete: `src/lib/collection/components/ImportSummaryModal/ImportSummaryModal.tsx`
- Delete: `src/lib/collection/components/ImportSummaryModal/ImportSummaryModal.module.css`

- [ ] **Step 1: Remove dead CSS from `page.module.css`**

Remove the following blocks from `src/app/collection/page.module.css` (lines 73-100 in the current file):

```css
.importingOverlay {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 120px 24px;
	gap: 16px;
}

.spinner {
	width: 36px;
	height: 36px;
	border: 3px solid var(--border);
	border-top-color: var(--foreground);
	border-radius: 50%;
	animation: spin 0.8s linear infinite;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

.importingText {
	font-size: 14px;
	color: var(--text-muted);
}
```

- [ ] **Step 2: Delete `ImportSummaryModal` directory**

```bash
rm src/lib/collection/components/ImportSummaryModal/ImportSummaryModal.tsx
rm src/lib/collection/components/ImportSummaryModal/ImportSummaryModal.module.css
rmdir src/lib/collection/components/ImportSummaryModal
```

- [ ] **Step 3: Verify no remaining references**

```bash
grep -r "ImportSummaryModal\|importingOverlay\|importingText" src/ --include="*.ts" --include="*.tsx" --include="*.css"
```

Expected: no output.

- [ ] **Step 4: Full check**

```bash
npm run check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/collection/page.module.css
git add -u src/lib/collection/components/ImportSummaryModal/
git commit -m "refactor(import): remove ImportSummaryModal and dead page-level import CSS"
```

---

## Verification Checklist

After all tasks are complete, verify the full flow manually:

1. **Parsing screen:** Select a CSV file → modal stays open and shows "Analyse du fichier…" spinner briefly before transitioning to the preview
2. **Scryfall preview loading screen:** On a large file, after parsing, the modal shows "Récupération des cartes… (0/N)" then progress increments batch by batch, then the card grid appears
3. **Partial preview:** Once some cards are fetched, the grid renders with skeleton rows for remaining batches (existing behaviour preserved)
4. **Final import — loading inside modal:** Click "Confirmer l'import" → the modal stays open and shows "Récupération des cartes… (X/Y)" (if cards weren't pre-fetched) then "Ajout à la collection…" — no page-level overlay behind the modal
5. **Summary screen:** After import, the modal replaces its content with the summary: number of imported cards, not-found count (if any), errors (if any), and a "Fermer" button
6. **Close summary:** Click "Fermer" → modal closes, collection is visible and updated
7. **`isBusy` covers `'parsing'`:** The Import button is disabled while parsing (can't open a second import during an ongoing one)
8. **`npm run check` passes** with zero errors
