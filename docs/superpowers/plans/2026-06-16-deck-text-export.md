# Export de decklist texte (MTGA/MTGO) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un export de la decklist d'un deck au format texte standard MTGA/MTGO (Commander/Deck/Sideboard/Maybeboard, tokens exclus), accessible depuis le menu kebab de la page d'un deck, avec aperçu, copie presse-papiers et téléchargement `.txt`.

**Architecture:** Trois unités indépendantes, symétriques de l'import existant : (1) un sérialiseur pur sans dépendance React `serializeDecklist`, (2) une modale `DeckTextExportModal` (aperçu + copier + télécharger), (3) câblage via une entrée de menu kebab dans `DeckHeader` et l'état/rendu dans `page.tsx`.

**Tech Stack:** TypeScript, Next.js (App Router, client components), React. Tests = scripts `tsx` autonomes (convention du repo : pas de framework, assertions manuelles, `process.exit(1)` en cas d'échec, lancés via `npx tsx <fichier>`).

---

## Contexte codebase (à connaître avant de commencer)

- **Types** :
  - `DeckZone = 'mainboard' | 'sideboard' | 'maybeboard' | 'commander' | 'tokens'` (`src/types/decks.ts:16`).
  - `ResolvedDeckCard = Card` (`src/app/decks/[id]/useDeckDetail.ts:12`), où `Card = (ScryfallCard | CustomCard) & { entry: CardEntry }`. Les champs utiles : `name: string`, `set?: string`, `collector_number?: string`, `oracle_id?: string`, `id: string`.
- **Parseur inverse** (référence du format) : `parseMtgaCardLine` dans `src/lib/import/formats/mtgaCardLine.ts`. `RE_FULL = /^(\d+)\s+(.+?)\s+\(([A-Za-z0-9]+)\)\s+(\d+[a-z]?)$/` et fait `.toLowerCase()` sur le set. Donc à l'export, le set doit être ré-émis en MAJUSCULES.
- **Convention de test** : voir `src/lib/mpc/parse-filename.test.ts`. Pas de `describe`/`it`. Un tableau de cas, une boucle, `console.log('PASS/FAIL')`, compteurs `passed`/`failed`, et `if (failed > 0) process.exit(1)` à la fin. Lancé par `npx tsx <fichier>`.
- **Composants UI** : `Modal` (`src/components/Modal/Modal.tsx`, props `{ children, onClose?, className?, zIndex? }`) et `Button` (`src/components/Button/Button.tsx`, props `variant`/`size`/`onClick`/`disabled`). Pattern modale de référence : `src/app/decks/[id]/components/DeckPdfExportModal/DeckPdfExportModal.tsx`.
- **Vérif finale** : `npm run check` (tsc + eslint + prettier) doit passer.

## File Structure

- **Create** `src/lib/deck/utils/serialize-decklist.ts` — sérialiseur pur `serializeDecklist`.
- **Create** `src/lib/deck/utils/serialize-decklist.test.ts` — test `tsx` autonome.
- **Create** `src/app/decks/[id]/components/DeckTextExportModal/DeckTextExportModal.tsx` — modale.
- **Create** `src/app/decks/[id]/components/DeckTextExportModal/DeckTextExportModal.module.css` — styles modale.
- **Modify** `src/app/decks/[id]/components/DeckHeader/DeckHeader.tsx` — prop `onExportText` + entrée kebab.
- **Modify** `src/app/decks/[id]/page.tsx` — état, `useMemo` du texte, rendu de la modale.

---

### Task 1: Sérialiseur pur `serializeDecklist`

**Files:**

- Create: `src/lib/deck/utils/serialize-decklist.ts`
- Test: `src/lib/deck/utils/serialize-decklist.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/deck/utils/serialize-decklist.test.ts` (convention `tsx`, calquée sur `src/lib/mpc/parse-filename.test.ts`) :

```ts
import { serializeDecklist } from './serialize-decklist';
import { parseMtgaCardLine } from '@/lib/import/formats/mtgaCardLine';
import type { DeckZone } from '@/types/decks';
import type { ResolvedDeckCard } from '@/app/decks/[id]/useDeckDetail';

let passed = 0;
let failed = 0;

function check(label: string, got: string, want: string) {
	if (got === want) {
		console.log(`PASS: ${label}`);
		passed++;
	} else {
		console.error(`FAIL: ${label}`);
		console.error(`  got:\n${JSON.stringify(got)}`);
		console.error(`  want:\n${JSON.stringify(want)}`);
		failed++;
	}
}

// Minimal card factory — only the fields serializeDecklist reads.
function card(
	name: string,
	zone: DeckZone,
	opts: { set?: string; collector?: string; oracleId?: string; id?: string } = {}
): ResolvedDeckCard {
	return {
		id: opts.id ?? `${name}-id`,
		name,
		set: opts.set,
		collector_number: opts.collector,
		oracle_id: opts.oracleId ?? `${name}-oracle`,
		entry: { tags: [`zone:${zone}`] },
	} as unknown as ResolvedDeckCard;
}

function emptyZones(): Record<DeckZone, ResolvedDeckCard[]> {
	return { commander: [], mainboard: [], sideboard: [], maybeboard: [], tokens: [] };
}

// 1. Round-trip: une ligne carte re-parsée avec parseMtgaCardLine redonne les bons champs.
{
	const z = emptyZones();
	z.mainboard = [card('Lightning Bolt', 'mainboard', { set: '2x2', collector: '117' })];
	const out = serializeDecklist(z);
	const cardLines = out.split('\n').filter((l) => l && l !== 'Deck');
	const parsed = parseMtgaCardLine(cardLines[0]);
	check('round-trip line present', cardLines.length === 1 ? 'ok' : 'bad', 'ok');
	check('round-trip name', parsed?.name ?? '∅', 'Lightning Bolt');
	check('round-trip set', parsed?.set ?? '∅', '2x2');
	check('round-trip collector', parsed?.collectorNumber ?? '∅', '117');
	check('round-trip qty', String(parsed?.quantity ?? '∅'), '1');
}

// 2. Regroupement des quantités: 3 copies (même oracle_id) → "3 ...".
{
	const z = emptyZones();
	z.mainboard = [
		card('Forest', 'mainboard', { set: 'unf', collector: '276', oracleId: 'forest' }),
		card('Forest', 'mainboard', { set: 'unf', collector: '276', oracleId: 'forest' }),
		card('Forest', 'mainboard', { set: 'unf', collector: '276', oracleId: 'forest' }),
	];
	const out = serializeDecklist(z);
	check('quantity grouping', out, 'Deck\n3 Forest (UNF) 276');
}

// 3. Ordre des sections + zones vides omises + séparation par ligne vide.
{
	const z = emptyZones();
	z.commander = [card('Atraxa', 'commander', { set: 'cmm', collector: '1' })];
	z.mainboard = [card('Sol Ring', 'mainboard', { set: 'cmm', collector: '2' })];
	z.sideboard = [card('Swords', 'sideboard', { set: 'cmm', collector: '3' })];
	z.maybeboard = [card('Counterspell', 'maybeboard', { set: 'cmm', collector: '4' })];
	const out = serializeDecklist(z);
	check(
		'section order + blank lines',
		out,
		'Commander\n1 Atraxa (CMM) 1\n\nDeck\n1 Sol Ring (CMM) 2\n\nSideboard\n1 Swords (CMM) 3\n\nMaybeboard\n1 Counterspell (CMM) 4'
	);
}

// 4. Exclusion des tokens.
{
	const z = emptyZones();
	z.mainboard = [card('Sol Ring', 'mainboard', { set: 'cmm', collector: '2' })];
	z.tokens = [card('Treasure', 'tokens', { set: 'tcmm', collector: '20' })];
	const out = serializeDecklist(z);
	check('tokens excluded', out, 'Deck\n1 Sol Ring (CMM) 2');
}

// 5. Fallback name-only (set ou collector manquant).
{
	const z = emptyZones();
	z.mainboard = [
		card('Custom Card', 'mainboard', {}),
		card('Set Only', 'mainboard', { set: 'abc' }),
	];
	const out = serializeDecklist(z);
	check('name-only fallback', out, 'Deck\n1 Custom Card\n1 Set Only');
}

// 6. Decklist vide → ''.
{
	check('empty decklist', serializeDecklist(emptyZones()), '');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx src/lib/deck/utils/serialize-decklist.test.ts`
Expected: FAIL — le module `./serialize-decklist` n'existe pas (erreur de résolution d'import).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/deck/utils/serialize-decklist.ts` :

```ts
import type { DeckZone } from '@/types/decks';
import type { ResolvedDeckCard } from '@/app/decks/[id]/useDeckDetail';

// Zones exportées, dans l'ordre du standard MTGA, avec leur en-tête de section.
// Les tokens sont volontairement absents (générés automatiquement, non gérés par
// les outils cibles).
const EXPORT_SECTIONS: { zone: DeckZone; header: string }[] = [
	{ zone: 'commander', header: 'Commander' },
	{ zone: 'mainboard', header: 'Deck' },
	{ zone: 'sideboard', header: 'Sideboard' },
	{ zone: 'maybeboard', header: 'Maybeboard' },
];

function cardKey(card: ResolvedDeckCard): string {
	return card.oracle_id ?? card.id;
}

// Ligne MTGA/MTGO : "{qty} {name} ({SET}) {collector}" ou "{qty} {name}" si set/collector
// manquant. Inverse exact de parseMtgaCardLine.
function formatLine(qty: number, card: ResolvedDeckCard): string {
	const set = card.set;
	const collector = card.collector_number;
	if (set && collector) {
		return `${qty} ${card.name} (${set.toUpperCase()}) ${collector}`;
	}
	return `${qty} ${card.name}`;
}

function serializeZone(cards: ResolvedDeckCard[]): string[] {
	// Regroupe par carte en préservant l'ordre de première apparition.
	const order: string[] = [];
	const byKey = new Map<string, { count: number; card: ResolvedDeckCard }>();
	for (const card of cards) {
		const key = cardKey(card);
		const existing = byKey.get(key);
		if (existing) {
			existing.count++;
		} else {
			byKey.set(key, { count: 1, card });
			order.push(key);
		}
	}
	return order.map((key) => {
		const { count, card } = byKey.get(key)!;
		return formatLine(count, card);
	});
}

/**
 * Sérialise un deck en decklist texte au format MTGA/MTGO.
 * Sections : Commander, Deck, Sideboard, Maybeboard (zones vides omises),
 * séparées par une ligne vide. Tokens exclus. Retourne '' si aucune carte.
 */
export function serializeDecklist(cardsByZone: Record<DeckZone, ResolvedDeckCard[]>): string {
	const blocks: string[] = [];
	for (const { zone, header } of EXPORT_SECTIONS) {
		const cards = cardsByZone[zone];
		if (!cards || cards.length === 0) continue;
		const lines = serializeZone(cards);
		blocks.push([header, ...lines].join('\n'));
	}
	return blocks.join('\n\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx src/lib/deck/utils/serialize-decklist.test.ts`
Expected: PASS — `11 passed, 0 failed` (les 11 appels `check`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/deck/utils/serialize-decklist.ts src/lib/deck/utils/serialize-decklist.test.ts
git commit -m "feat(deck): serializeDecklist export MTGA/MTGO"
```

---

### Task 2: Modale `DeckTextExportModal`

**Files:**

- Create: `src/app/decks/[id]/components/DeckTextExportModal/DeckTextExportModal.tsx`
- Create: `src/app/decks/[id]/components/DeckTextExportModal/DeckTextExportModal.module.css`

> Pas de test automatisé (pas de framework de rendu React dans le repo) ; vérification manuelle au câblage (Task 4) + `npm run check`.

- [ ] **Step 1: Create the CSS module**

Create `src/app/decks/[id]/components/DeckTextExportModal/DeckTextExportModal.module.css` :

```css
.dialog {
	display: flex;
	flex-direction: column;
	gap: 16px;
	max-width: 560px;
	width: 100%;
}

.title {
	margin: 0;
	font-size: var(--text-lg);
}

.textarea {
	width: 100%;
	min-height: 320px;
	resize: vertical;
	font-family: var(--font-mono, monospace);
	font-size: var(--text-sm);
	line-height: 1.5;
	padding: 12px;
	border: 1px solid var(--border, #444);
	border-radius: 6px;
	background: var(--surface-2, #1b1b1b);
	color: var(--text, #eee);
	white-space: pre;
	overflow: auto;
}

.error {
	margin: 0;
	color: var(--danger, #e06c6c);
	font-size: var(--text-sm);
}

.actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}
```

- [ ] **Step 2: Create the modal component**

Create `src/app/decks/[id]/components/DeckTextExportModal/DeckTextExportModal.tsx` :

```tsx
'use client';

import { useState } from 'react';
import { Modal } from '@/components/Modal/Modal';
import { Button } from '@/components/Button/Button';
import styles from './DeckTextExportModal.module.css';

type Props = {
	text: string;
	deckName: string;
	onClose: () => void;
};

function sanitizeFileName(name: string): string {
	const cleaned = name.replace(/[^\p{L}\p{N}\- _]/gu, '').trim();
	return cleaned || 'deck';
}

export function DeckTextExportModal({ text, deckName, onClose }: Props) {
	const [copied, setCopied] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(text);
			setError(null);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			setError('Copie impossible — sélectionnez le texte et copiez-le manuellement.');
		}
	}

	function handleDownload() {
		const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${sanitizeFileName(deckName)}.txt`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	return (
		<Modal onClose={onClose} className={styles.dialog} zIndex={1100}>
			<h2 className={styles.title}>Exporter la decklist</h2>

			<textarea className={styles.textarea} value={text} readOnly />

			{error && <p className={styles.error}>{error}</p>}

			<div className={styles.actions}>
				<Button variant="secondary" size="sm" onClick={onClose}>
					Fermer
				</Button>
				<Button variant="secondary" size="sm" onClick={handleDownload}>
					Télécharger .txt
				</Button>
				<Button variant="primary" size="sm" onClick={handleCopy}>
					{copied ? 'Copié ✓' : 'Copier'}
				</Button>
			</div>
		</Modal>
	);
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (aucune erreur). Si `Button` n'accepte pas `variant="secondary"`, vérifier les variantes acceptées dans `src/components/Button/Button.tsx` et ajuster.

- [ ] **Step 4: Commit**

```bash
git add src/app/decks/\[id\]/components/DeckTextExportModal/
git commit -m "feat(deck): modale DeckTextExportModal (aperçu/copier/télécharger)"
```

---

### Task 3: Entrée kebab dans `DeckHeader`

**Files:**

- Modify: `src/app/decks/[id]/components/DeckHeader/DeckHeader.tsx`

- [ ] **Step 1: Add the prop to the Props type**

Dans `src/app/decks/[id]/components/DeckHeader/DeckHeader.tsx`, modifier le type `Props` (lignes 8-14) pour ajouter `onExportText` :

```tsx
type Props = {
	deck: DeckMeta;
	onUpdate: (updates: Partial<Pick<DeckMeta, 'name' | 'format' | 'description'>>) => void;
	onAssignAllFromCollection?: () => void;
	onAddAllToCollection?: () => void;
	onGeneratePdf?: () => void;
	onExportText?: () => void;
};
```

- [ ] **Step 2: Destructure the new prop**

Modifier la signature de la fonction (lignes 16-22) :

```tsx
export function DeckHeader({
	deck,
	onUpdate,
	onAssignAllFromCollection,
	onAddAllToCollection,
	onGeneratePdf,
	onExportText,
}: Props) {
```

- [ ] **Step 3: Add the menu item**

Dans le dropdown, juste après le bloc `{onGeneratePdf && (...)}` (qui se termine ligne 141 par `)}`) et avant la fermeture `</div>` du dropdown, ajouter :

```tsx
{
	onExportText && (
		<button
			type="button"
			className={styles.dropdownItem}
			onClick={() => {
				setMenuOpen(false);
				onExportText();
			}}
		>
			⬇ Exporter la decklist
		</button>
	);
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/decks/\[id\]/components/DeckHeader/DeckHeader.tsx
git commit -m "feat(deck): entrée menu Exporter la decklist dans DeckHeader"
```

---

### Task 4: Câblage dans `page.tsx`

**Files:**

- Modify: `src/app/decks/[id]/page.tsx`

- [ ] **Step 1: Add the imports**

Dans `src/app/decks/[id]/page.tsx`, après l'import de `DeckPdfExportModal` (ligne 34), ajouter :

```tsx
import { DeckTextExportModal } from './components/DeckTextExportModal/DeckTextExportModal';
import { serializeDecklist } from '@/lib/deck/utils/serialize-decklist';
```

- [ ] **Step 2: Add the modal state**

Après la ligne `const [pdfSettingsModalOpen, setPdfSettingsModalOpen] = useState(false);` (ligne 86), ajouter :

```tsx
const [textExportModalOpen, setTextExportModalOpen] = useState(false);
```

- [ ] **Step 3: Memoize the decklist text**

Après le `useMemo` `pdfFilteredCards` (qui se termine ligne 91), ajouter :

```tsx
const decklistText = useMemo(() => serializeDecklist(cardsByZone), [cardsByZone]);
```

- [ ] **Step 4: Wire the DeckHeader prop**

Dans le JSX `<DeckHeader ... />` (lignes 490-496), ajouter la prop `onExportText` après `onGeneratePdf` :

```tsx
<DeckHeader
	deck={deck}
	onUpdate={(updates) => updateDeck(deckId, updates)}
	onAssignAllFromCollection={handleAssignAllFromCollection}
	onAddAllToCollection={() => setAddToCollectionModalOpen(true)}
	onGeneratePdf={() => setPdfExportModalOpen(true)}
	onExportText={() => setTextExportModalOpen(true)}
/>
```

- [ ] **Step 5: Render the modal**

Après le bloc `{pdfExportModalOpen && (...)}` (qui se termine ligne 624 par `)}`), ajouter :

```tsx
{
	textExportModalOpen && (
		<DeckTextExportModal
			text={decklistText}
			deckName={deck.name}
			onClose={() => setTextExportModalOpen(false)}
		/>
	);
}
```

- [ ] **Step 6: Full check**

Run: `npm run check`
Expected: PASS (tsc + eslint + prettier sans erreur).

- [ ] **Step 7: Manual verification**

Run: `npm run dev`, ouvrir un deck ayant des cartes dans plusieurs zones, cliquer ⋮ → « Exporter la decklist ». Vérifier :

- les sections `Commander`/`Deck`/`Sideboard`/`Maybeboard` apparaissent dans cet ordre, séparées par une ligne vide ;
- les lignes ont la forme `2 Lightning Bolt (2X2) 117` (set en MAJUSCULES) ;
- les tokens n'apparaissent pas ;
- « Copier » montre « Copié ✓ » puis le presse-papiers contient le texte ;
- « Télécharger .txt » télécharge `<nom du deck>.txt`.

- [ ] **Step 8: Commit**

```bash
git add src/app/decks/\[id\]/page.tsx
git commit -m "feat(deck): brancher export decklist texte sur la page deck"
```

---

## Self-Review

**Spec coverage** — chaque exigence du spec a une tâche :

- Sérialiseur pur, format ligne, MAJUSCULES, fallback, ordre sections, tokens exclus, vide → '' : Task 1 (impl + tests 1-6).
- Modale aperçu/copier/télécharger + gestion erreur clipboard : Task 2.
- Prop + entrée kebab `DeckHeader` : Task 3.
- État + `useMemo` + rendu modale dans `page.tsx` : Task 4.
- Tests du sérialiseur (round-trip, regroupement, ordre, exclusion tokens, fallback, casse set) : Task 1 Step 1.

**Placeholder scan** — aucun TBD/TODO ; tout le code est complet.

**Type consistency** — `serializeDecklist(cardsByZone: Record<DeckZone, ResolvedDeckCard[]>): string` est utilisée à l'identique en Task 1 (def), Task 4 (appel). `DeckTextExportModal` props `{ text, deckName, onClose }` cohérentes entre Task 2 (def) et Task 4 (usage). `onExportText?: () => void` cohérent entre Task 3 (def) et Task 4 (passage).

**Note** : le test (Task 1 Step 1) construit des `ResolvedDeckCard` via cast `as unknown as ResolvedDeckCard` avec seulement les champs lus par le sérialiseur — pas besoin d'objet ScryfallCard complet.
