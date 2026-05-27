# Print List — Collection stackée par print — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dans la modale de sélection de print, grouper les copies de collection par print (scryfallId), afficher un badge "Utilisé" avec tooltip (nom du deck) sur les copies assignées, et isoler les copies sans correspondance Scryfall dans une section "Autre".

**Architecture:** On étend `CollectionCopyEntry` avec `assignedToDeckName?: string`, on ajoute `groupCollectionByPrint()` dans `PrintList.types.ts` qui retourne des `CardListSection[]` (une par scryfallId distinct + optionnelle "Autre"), et on assemble une section parente `"Ma collection"` avec `children`. Le badge CSS est ajouté dans `PrintList.module.css` et rendu dans `renderOverlay`. Les callers passent désormais toutes les copies (assignées comprises) avec le nom du deck.

**Tech Stack:** React, TypeScript, CSS Modules, CardListSection.children (déjà supporté par CardListGrid)

---

## File Map

| File                                                     | Action | Responsabilité                                                   |
| -------------------------------------------------------- | ------ | ---------------------------------------------------------------- |
| `src/lib/card/components/PrintList/PrintList.types.ts`   | Modify | Ajouter `assignedToDeckName` + `groupCollectionByPrint()`        |
| `src/lib/card/components/PrintList/PrintList.tsx`        | Modify | Utiliser `groupCollectionByPrint` + badge dans `renderOverlay`   |
| `src/lib/card/components/PrintList/PrintList.module.css` | Modify | Ajouter `.assignedBadge`                                         |
| `src/app/decks/[id]/page.tsx`                            | Modify | Passer toutes les copies (+ assignées) avec `assignedToDeckName` |

---

### Task 1 : Étendre `CollectionCopyEntry` et ajouter `groupCollectionByPrint`

**Files:**

- Modify: `src/lib/card/components/PrintList/PrintList.types.ts`

- [ ] **Step 1 : Ajouter `assignedToDeckName` à `CollectionCopyEntry`**

Dans `PrintList.types.ts`, remplacer l'interface `CollectionCopyEntry` :

```typescript
export interface CollectionCopyEntry {
	rowId: string;
	scryfallId: string;
	condition?: string;
	isFoil?: boolean;
	language?: string;
	assignedToDeckName?: string;
}
```

- [ ] **Step 2 : Ajouter la fonction `groupCollectionByPrint`**

Ajouter après `groupPrintsByLang` dans `PrintList.types.ts` :

```typescript
export function groupCollectionByPrint(
	copies: CollectionCopyEntry[],
	printMap: Map<string, ScryfallCard>
): CardListSection[] {
	const byPrint = new Map<string, CollectionCopyEntry[]>();
	const orphans: CollectionCopyEntry[] = [];

	for (const copy of copies) {
		if (printMap.has(copy.scryfallId)) {
			const group = byPrint.get(copy.scryfallId) ?? [];
			group.push(copy);
			byPrint.set(copy.scryfallId, group);
		} else {
			orphans.push(copy);
		}
	}

	const sections: CardListSection[] = [];

	for (const [scryfallId, group] of byPrint.entries()) {
		const scryfallCard = printMap.get(scryfallId)!;
		sections.push({
			label: `${scryfallCard.set_name} #${scryfallCard.collector_number} (${group.length})`,
			cards: group.map((copy) => {
				const card: Card = {
					...scryfallCard,
					entry: {
						rowId: copy.rowId,
						dateAdded: '',
						condition: (copy.condition as Card['entry']['condition']) ?? 'NM',
						isFoil: copy.isFoil,
						language: copy.language as Card['entry']['language'],
					},
				};
				return card as AnyCard;
			}),
		});
	}

	if (orphans.length > 0) {
		// Orphans have no matching Scryfall print — build minimal Card objects
		// We can't render a proper CardImage without a ScryfallCard, so we skip them for now
		// They're included in the count but shown in "Autre" without image
		sections.push({
			label: `Autre (${orphans.length})`,
			cards: [],
		});
	}

	return sections;
}
```

Note : `Card`, `AnyCard`, et `ScryfallCard` doivent être importés. Ajouter les imports manquants en haut du fichier :

```typescript
import type { Card } from '@/types/cards';
```

(`AnyCard` et `ScryfallCard` sont déjà importés.)

- [ ] **Step 3 : Vérifier la compilation TypeScript**

```bash
cd /home/elthinkbuntu/Documents/Wizcard && npm run check 2>&1 | head -40
```

Attendu : pas d'erreur TypeScript sur `PrintList.types.ts`.

- [ ] **Step 4 : Commit**

```bash
git add src/lib/card/components/PrintList/PrintList.types.ts
git commit -m "feat: add groupCollectionByPrint and assignedToDeckName to CollectionCopyEntry"
```

---

### Task 2 : Ajouter le badge CSS `.assignedBadge`

**Files:**

- Modify: `src/lib/card/components/PrintList/PrintList.module.css`

- [ ] **Step 1 : Ajouter la règle `.assignedBadge`**

À la fin de `PrintList.module.css`, ajouter :

```css
.assignedBadge {
	position: absolute;
	top: 4px;
	left: 4px;
	padding: 2px 6px;
	border-radius: 4px;
	font-size: 10px;
	font-weight: 700;
	background: #d97706;
	color: #fff;
	cursor: help;
	pointer-events: auto;
	z-index: 1;
	line-height: 1.4;
	white-space: nowrap;
}
```

- [ ] **Step 2 : Commit**

```bash
git add src/lib/card/components/PrintList/PrintList.module.css
git commit -m "feat: add assignedBadge CSS for collection copy overlay"
```

---

### Task 3 : Mettre à jour `PrintList.tsx` — groupage et badge

**Files:**

- Modify: `src/lib/card/components/PrintList/PrintList.tsx`

- [ ] **Step 1 : Importer `groupCollectionByPrint`**

Dans `PrintList.tsx`, la ligne d'import depuis `./PrintList.types` devient :

```typescript
import { type PrintListProps, groupPrintsByLang, groupCollectionByPrint } from './PrintList.types';
```

- [ ] **Step 2 : Remplacer la construction de la section collection**

Remplacer le bloc `if (collectionCopies && collectionCopies.length > 0 && prints.length > 0)` (lignes 40–66) par :

```typescript
if (collectionCopies && collectionCopies.length > 0 && prints.length > 0) {
	const printMap = new Map<string, ScryfallCard>(prints.map((p) => [p.id, p]));
	const printSections = groupCollectionByPrint(collectionCopies, printMap);

	if (printSections.length > 0) {
		const totalCopies = collectionCopies.length;
		sections.push({
			label: `Ma collection (${totalCopies})`,
			cards: [],
			children: printSections,
		});
	}
}
```

- [ ] **Step 3 : Mettre à jour `renderOverlay` pour le badge**

Remplacer le bloc `if ('entry' in anyCard)` dans `renderOverlay` (lignes 74–87) par :

```typescript
if ('entry' in anyCard) {
  const card = anyCard as Card;
  const assignedDeckName = (collectionCopies ?? []).find(
    (c) => c.rowId === card.entry.rowId
  )?.assignedToDeckName;

  return (
    <>
      {assignedDeckName && (
        <span
          className={styles.assignedBadge}
          title={`Utilisé dans : ${assignedDeckName}`}
        >
          Utilisé
        </span>
      )}
      <button
        type="button"
        className={styles.copySelectBtn}
        onClick={(e) => {
          e.stopPropagation();
          onSelectCollectionCopy?.(card.entry.rowId);
        }}
      >
        Utiliser
      </button>
    </>
  );
}
```

- [ ] **Step 4 : Vérifier la compilation TypeScript**

```bash
cd /home/elthinkbuntu/Documents/Wizcard && npm run check 2>&1 | head -40
```

Attendu : pas d'erreur.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/card/components/PrintList/PrintList.tsx
git commit -m "feat: group collection copies by print with children sections and Utilisé badge"
```

---

### Task 4 : Mettre à jour le caller dans `decks/[id]/page.tsx`

Le caller actuel filtre `!e.entry.deckId` — les copies assignées sont donc exclues. On doit passer toutes les copies pertinentes (assignées comprises) et ajouter `assignedToDeckName`.

**Files:**

- Modify: `src/app/decks/[id]/page.tsx`

- [ ] **Step 1 : Lire le contexte du deck pour récupérer le nom**

Vérifier que `deck` est disponible dans le composant (il l'est via `useDeckDetail`). On accède à `deck.name`.

- [ ] **Step 2 : Remplacer `freeCollectionCopies` par `allCollectionCopies`**

Localiser le `useMemo` de `freeCollectionCopies` (actuellement filtre `!e.entry.deckId`) et le remplacer par :

```typescript
const allCollectionCopies = useMemo(
	() =>
		entries
			.filter((e) => selectedScryfallIds.has(e.scryfallId))
			.map((e) => ({
				rowId: e.entry.rowId,
				scryfallId: e.scryfallId,
				condition: e.entry.condition,
				isFoil: e.entry.isFoil,
				language: e.entry.language,
				assignedToDeckName: e.entry.deckId === deck?.id ? deck?.name : undefined,
			})),
	[entries, selectedScryfallIds, deck]
);
```

Note : `e.entry.deckId === deck?.id` identifie les copies assignées à **ce** deck. Si la carte peut être assignée à un autre deck, il faudrait accéder au nom de cet autre deck — mais ce cas est hors scope ici, on marque juste `assignedToDeckName` si la copie est assignée au deck courant.

- [ ] **Step 3 : Mettre à jour la prop `collectionCopies`**

Remplacer `collectionCopies={freeCollectionCopies}` par `collectionCopies={allCollectionCopies}`.

- [ ] **Step 4 : Vérifier la compilation TypeScript**

```bash
cd /home/elthinkbuntu/Documents/Wizcard && npm run check 2>&1 | head -40
```

Attendu : pas d'erreur.

- [ ] **Step 5 : Commit**

```bash
git add src/app/decks/[id]/page.tsx
git commit -m "feat: pass all collection copies (assigned + free) with assignedToDeckName to PrintList"
```

---

### Task 5 : Vérification visuelle

- [ ] **Step 1 : Démarrer le serveur de développement**

```bash
cd /home/elthinkbuntu/Documents/Wizcard && npm run dev
```

- [ ] **Step 2 : Tester le scénario nominal**

1. Ouvrir un deck qui a des cartes avec des copies en collection
2. Ouvrir la modale "Changer d'édition" sur une carte
3. Vérifier que la section "Ma collection" affiche des sous-sections par print (ex. "Dominaria United #123 (2)")
4. Vérifier que les copies assignées au deck affichent le badge "Utilisé" en haut à gauche de la carte
5. Hoverer le badge → le tooltip doit afficher "Utilisé dans : [nom du deck]"
6. Cliquer "Utiliser" sur une copie avec badge → doit fonctionner (transfert deck à deck)

- [ ] **Step 3 : Tester le cas "Autre"**

Si une copie a un `scryfallId` qui n'est pas dans les prints chargés, vérifier qu'elle apparaît dans la sous-section "Autre".

- [ ] **Step 4 : Vérifier les sections par langue (régression)**

Les sections "Anglais (N)", "Français (N)" etc. doivent rester inchangées sous la section "Ma collection".

- [ ] **Step 5 : Commit final si tout est OK**

```bash
git add -p  # vérifier qu'il n'y a rien de non intentionnel
git commit -m "chore: verify print list collection stack feature"
```
