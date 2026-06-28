# Wishlist Move-to-Collection Edit Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire en sorte que l'action « Déplacer vers la collection » de la page wishlist (menu contextuel et bouton du `CardModal`) ouvre une modale d'édition pré-remplie (quantité, foil, proxy, langue, condition, édition, tags) au lieu de déplacer la copie en silence.

**Architecture:** On réutilise `EditCardModal` en mode `add` (qui expose déjà tout le formulaire) en lui ajoutant une prop `initialEntry` pour pré-remplir les champs depuis la copie wishlist. La page wishlist tient un state `movingCard` qui pilote l'ouverture de la modale. La signature de `WishlistContext.moveToCollection` est enrichie pour recevoir l'édition choisie, le patch de métadonnées et la quantité.

**Tech Stack:** Next.js 16 App Router, React, TypeScript strict, Zustand stores, CSS Modules.

## Global Constraints

- TypeScript strict mode ; path alias `@/*` → `./src/*`.
- React Compiler désactivé — les hooks et dépendances de `useCallback`/`useMemo` doivent être corrects manuellement.
- Pas de barrel exports (`index.ts`) — importer les fichiers directement.
- Vérification par tâche : `npm run check` (tsc + eslint + prettier) doit passer. **Aucun framework de test unitaire dans ce repo** — la validation est statique + manuelle.
- Ne jamais appeler le client Supabase hors de `src/lib/supabase/`. Ce plan ne touche pas la couche Supabase.
- Toujours appeler `triggerSync()` après `enqueue()` — déjà respecté par les stores réutilisés (`addCards`, `removeFromWishlist`).

---

### Task 1: Ajouter la prop `initialEntry` à `EditCardModal` (mode add)

Permet de pré-remplir les champs du formulaire en mode `add` depuis une entry existante. Sans cette prop, le mode `add` initialise `draftEntry` uniquement avec `tags`.

**Files:**

- Modify: `src/lib/card/components/EditCardModal/EditCardModal.tsx`

**Interfaces:**

- Consumes: rien (point de départ).
- Produces: `EditCardModal` accepte désormais `initialEntry?: Partial<CardEntry>` quand `mode="add"`. En présence de cette prop, le `draftEntry` initial est `{ tags: setDeckZone(undefined, initialZone), ...initialEntry }`.

- [ ] **Step 1: Ajouter `initialEntry` à l'interface `AddProps`**

Dans `src/lib/card/components/EditCardModal/EditCardModal.tsx`, l'interface `AddProps` (actuellement lignes ~25-33) :

```ts
interface AddProps {
	mode: 'add';
	scryfallCard: ScryfallCard;
	onAdd: (card: ScryfallCard, entry: Partial<CardEntry>, count: number) => void;
	onClose: () => void;
	availableZones?: DeckZone[];
	defaultZone?: DeckZone;
	hideQuantity?: boolean;
	initialEntry?: Partial<CardEntry>;
}
```

(Ajout de la seule ligne `initialEntry?: Partial<CardEntry>;`.)

- [ ] **Step 2: Fusionner `initialEntry` dans l'initialisation de `draftEntry`**

Toujours dans le même fichier, l'initialisation du state (actuellement lignes ~53-55) :

```ts
const [draftEntry, setDraftEntry] = useState<Partial<CardEntry>>(
	addMode
		? { tags: setDeckZone(undefined, initialZone), ...props.initialEntry }
		: { ...props.card.entry }
);
```

Note : `props.initialEntry` est accessible ici car `addMode` garantit `props` de type `AddProps`. Si TypeScript se plaint du narrowing, remplacer par `...(addMode ? props.initialEntry : undefined)` dans la branche add — mais la forme ci-dessus suffit car elle est dans la branche `addMode ? … : …`.

- [ ] **Step 3: Vérifier que la compilation et le lint passent**

Run: `npm run check`
Expected: PASS (aucune erreur TS/ESLint/Prettier). Les appelants existants ne passent pas `initialEntry`, donc leur comportement est inchangé.

- [ ] **Step 4: Commit**

```bash
git add src/lib/card/components/EditCardModal/EditCardModal.tsx
git commit -m "feat(edit-card-modal): support initialEntry to seed add-mode fields

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Enrichir la signature de `WishlistContext.moveToCollection`

`moveToCollection(rowId)` devient `moveToCollection(rowId, scryfallId, entryPatch, count)` : il ajoute `count` copies de l'édition choisie avec le patch de métadonnées, puis retire la copie wishlist source via le `removeFromWishlist` du contexte (qui gère déjà le cas deck-card vs wishlist pure).

**Files:**

- Modify: `src/lib/wishlist/context/WishlistContext.tsx`

**Interfaces:**

- Consumes: `collectionStore.addCards(card, count, userId, triggerSync, entryPatch)` (déjà existant dans `src/lib/collection/store/collection-store.ts`) ; `removeFromWishlist(rowId)` du contexte (déjà défini plus haut dans le même fichier).
- Produces: `moveToCollection: (rowId: string, scryfallId: string, entryPatch: Partial<CardEntry>, count: number) => void` sur `WishlistContextValue`.

- [ ] **Step 1: Mettre à jour le type dans `WishlistContextValue`**

Dans `src/lib/wishlist/context/WishlistContext.tsx`, le type (actuellement ligne ~22) :

```ts
moveToCollection: (
	rowId: string,
	scryfallId: string,
	entryPatch: Partial<CardEntry>,
	count: number
) => void;
```

- [ ] **Step 2: Réécrire l'implémentation `moveToCollection`**

Remplacer le `const moveToCollection = useCallback(...)` actuel (lignes ~119-128) par :

```ts
const moveToCollection = useCallback(
	(rowId: string, scryfallId: string, entryPatch: Partial<CardEntry>, count: number) => {
		const copy = store.entries[rowId];
		if (!copy) return;
		const stubCard = { id: scryfallId } as Parameters<typeof collectionStore.addCards>[0];
		collectionStore.addCards(stubCard, count, userId, triggerSync, entryPatch);
		// removeFromWishlist (du contexte) gère déjà le cas deck-card vs wishlist pure.
		removeFromWishlist(rowId);
	},
	[store, collectionStore, userId, triggerSync, removeFromWishlist]
);
```

Important : `removeFromWishlist` est déjà déclaré plus haut dans le composant (le `useCallback` du contexte). `moveToCollection` doit être défini **après** `removeFromWishlist` pour que la référence soit valable — c'est déjà l'ordre actuel du fichier (removeFromWishlist ~ligne 80, moveToCollection ~ligne 119).

- [ ] **Step 3: Vérifier que la compilation échoue sur l'appelant**

Run: `npm run check`
Expected: FAIL — `src/app/wishlist/page.tsx` appelle encore `moveToCollection(rowId)` à un argument (deux endroits : ligne ~198 dans `onMoveToCollection` du CardModal, ligne ~236 dans les handlers du menu). C'est attendu ; la Task 3 corrige les appelants. Si `page.tsx` n'apparaît pas dans les erreurs, vérifier qu'on a bien changé le type.

- [ ] **Step 4: Commit**

```bash
git add src/lib/wishlist/context/WishlistContext.tsx
git commit -m "feat(wishlist): moveToCollection accepts print, entry patch and count

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Câbler la modale d'édition dans la page wishlist

La page tient un state `movingCard`. Les deux points d'entrée (menu contextuel + bouton du CardModal) ouvrent la modale au lieu d'appeler `moveToCollection` directement. La confirmation appelle la nouvelle signature et ferme les modales.

**Files:**

- Modify: `src/app/wishlist/page.tsx`

**Interfaces:**

- Consumes: `moveToCollection(rowId, scryfallId, entryPatch, count)` (Task 2) ; `EditCardModal` avec prop `initialEntry` (Task 1) ; `stacks: CardStack[]` et `handleCloseModal` déjà présents dans le composant.
- Produces: comportement final (terminal).

- [ ] **Step 1: Ajouter les imports manquants**

En haut de `src/app/wishlist/page.tsx`, ajouter aux imports existants :

```ts
import type { Card, CardEntry } from '@/types/cards';
import { EditCardModal } from '@/lib/card/components/EditCardModal/EditCardModal';
```

Note : `CardStack` est déjà importé depuis `@/types/cards` (ligne 5) — fusionner le type import en `import type { CardStack, Card, CardEntry } from '@/types/cards';` plutôt que dupliquer la ligne, pour satisfaire ESLint.

- [ ] **Step 2: Ajouter le state et le helper de résolution**

Dans `WishlistPageInner`, après le state `pdfGenerating` (ligne ~42) :

```ts
const [movingCard, setMovingCard] = useState<Card | null>(null);
```

Et après le `useMemo` `stackByCardId` (vers ligne ~83), ajouter une map rowId → Card :

```ts
const cardByRowId = useMemo(() => {
	const map = new Map<string, Card>();
	for (const stack of stacks) {
		for (const card of stack.cards) map.set(card.entry.rowId, card);
	}
	return map;
}, [stacks]);
```

- [ ] **Step 3: Ajouter le helper d'ouverture et la fonction `buildInitialEntry`**

Après `cardByRowId`, ajouter le handler qui ouvre la modale :

```ts
const handleRequestMove = useCallback(
	(rowId: string) => {
		const card = cardByRowId.get(rowId);
		if (card) setMovingCard(card);
	},
	[cardByRowId]
);
```

Et, en dehors du composant (au niveau module, bas du fichier ou juste au-dessus de `WishlistPageInner`), la fonction pure :

```ts
function buildInitialEntry(entry: CardEntry): Partial<CardEntry> {
	const patch: Partial<CardEntry> = { ...entry };
	delete patch.rowId;
	delete patch.dateAdded;
	delete patch.deckId;
	delete patch.ownerId;
	delete patch.wishlist;
	return patch;
}
```

- [ ] **Step 4: Recâbler le bouton du `CardModal`**

Dans le JSX du `<CardModal>` (actuellement lignes ~197-200), remplacer :

```tsx
onMoveToCollection={(rowId) => {
	moveToCollection(rowId);
	handleCloseModal();
}}
```

par :

```tsx
onMoveToCollection = { handleRequestMove };
```

(La modale d'édition gère la confirmation et la fermeture ; on ne ferme plus le CardModal ici — il sera fermé à la confirmation, Step 6.)

- [ ] **Step 5: Recâbler le handler du menu contextuel**

Dans les handlers passés à `buildWishlistMenuItems` (actuellement ligne ~236), remplacer :

```ts
onMoveToCollection: moveToCollection,
```

par :

```ts
onMoveToCollection: handleRequestMove,
```

- [ ] **Step 6: Rendre la modale d'édition**

Avant le bloc `{cardMenu.menu && (...)}` (vers ligne ~227), ajouter :

```tsx
{
	movingCard && (
		<EditCardModal
			mode="add"
			scryfallCard={movingCard as ScryfallCard}
			initialEntry={buildInitialEntry(movingCard.entry)}
			onAdd={(selectedPrint, entry, count) => {
				moveToCollection(movingCard.entry.rowId, selectedPrint.id, entry, count);
				setMovingCard(null);
				handleCloseModal();
			}}
			onClose={() => setMovingCard(null)}
		/>
	);
}
```

Note : `ScryfallCard` est déjà importé (ligne 6). `movingCard` est de type `Card` (= ScryfallCard|CustomCard & {entry}) ; le cast `as ScryfallCard` est cohérent avec la façon dont `representativeCards`/`stacks` sont déjà traités ailleurs sur cette page.

- [ ] **Step 7: Vérifier compilation, lint et formatage**

Run: `npm run check`
Expected: PASS. Plus aucune erreur sur les appels à `moveToCollection` (les deux appelants passent maintenant 4 arguments via la modale).

- [ ] **Step 8: Test manuel**

1. `npm run dev`, se connecter, aller sur `/wishlist` avec au moins une carte.
2. Clic droit sur une carte → « Déplacer vers la collection » : la modale d'édition s'ouvre, pré-remplie (foil/condition/langue/proxy/tags de la copie), quantité = 1.
3. Modifier quantité, foil, langue, et changer l'édition → confirmer.
4. Vérifier : la carte quitte la wishlist ; la collection contient `quantité` copies avec l'édition + métadonnées choisies.
5. Ouvrir une carte (clic gauche → CardModal) → bouton « Move to Collection » : la même modale s'ouvre par-dessus ; confirmer ferme les deux modales.
6. Cas carte de deck wishlistée (si disponible) : confirmer ne supprime pas la carte du deck, retire seulement le flag wishlist.

- [ ] **Step 9: Commit**

```bash
git add src/app/wishlist/page.tsx
git commit -m "feat(wishlist): edit modal on move-to-collection from menu and card modal

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**

- Spec §1 (prop `initialEntry`) → Task 1. ✓
- Spec §2 (signature `moveToCollection`) → Task 2. ✓
- Spec §3 (state, `cardByRowId`, `handleRequestMove`, `buildInitialEntry`, rendu modale, recâblage des deux points d'entrée) → Task 3. ✓
- Spec « fichiers touchés » : `EditCardModal.tsx` (T1), `WishlistContext.tsx` (T2), `page.tsx` (T3), `wishlistCardMenu.ts` inchangé (confirmé : le handler garde `(rowId) => void`, aucune tâche ne le modifie). ✓
- Flux complet (ouverture → édition → confirm → addCards + remove → fermeture) couvert par T3 Steps 4-6 + test manuel Step 8. ✓

**2. Placeholder scan:** Aucun TBD/TODO ; chaque step montre le code réel et la commande exacte. ✓

**3. Type consistency:**

- `initialEntry?: Partial<CardEntry>` cohérent entre T1 (déclaration) et T3 Step 6 (usage). ✓
- `moveToCollection(rowId, scryfallId, entryPatch, count)` cohérent entre T2 (déclaration) et T3 Step 6 (appel : `movingCard.entry.rowId, selectedPrint.id, entry, count`). ✓
- `collectionStore.addCards(card, count, userId, triggerSync, entryPatch)` correspond à la signature réelle du store. ✓
- `buildInitialEntry(entry: CardEntry): Partial<CardEntry>` défini et utilisé en T3. ✓
