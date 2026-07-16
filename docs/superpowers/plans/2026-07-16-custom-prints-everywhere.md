# Custom Prints Everywhere Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre de sélectionner un print custom (`mpc:<uuid>`) comme copie persistée dans la collection, la wishlist et les decks, avec une section « Custom » dans le picker de prints.

**Architecture:** Les copies sont stockées par `scryfall_id` (colonne `text` sans contrainte) — on y stocke `mpc:<uuid>` tel quel. L'hydratation unique (`resolveCardsByScryfallIds`, consommée par `useCollectionCards` ET `useDeckDetail`) est routée par préfixe d'ID : `mpc:` → table `custom_cards`, sinon → API Scryfall. Les customs circulent dans les pipes typées `ScryfallCard` via le cast `as unknown as ScryfallCard` déjà établi dans le codebase (`CardModal.tsx:974`, `CardImage.tsx:85`), avec garde `isCustomCard` là où le comportement diffère.

**Tech Stack:** Next.js (App Router), Supabase client, Zustand, next-intl. Spec : `docs/superpowers/specs/2026-07-16-custom-prints-everywhere-design.md`.

## Global Constraints

- **Pas de framework de test** — vérification = `npm run check` (gate « pas de NOUVEAU problème », baseline rouge ~60 pbs connus) + `npm run build` (seul à attraper TS2589) + runtime dev.
- Pour la gate ESLint sur fichiers modifiés : `npx eslint <fichiers changés>` doit être propre.
- **Aucune migration DB.** `public.cards.scryfall_id` est `text not null` sans FK/CHECK.
- **Jamais** écrire un `CustomCard` dans le cache IndexedDB Scryfall (`putCardsInCache`).
- Ne proposer comme prints custom **que** les cartes avec `oracle_id` (invariant existant : `queryCustomCardRows` force `.not('oracle_id', 'is', null)` — déjà garanti côté DB).
- Clés i18n `card.customCards` / `card.officialPrints` existent déjà (`messages/{fr,en}.json:124-125`).
- Commits : suffixe `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- TS2589 : ne jamais chaîner un filtre Supabase dans l'initializer d'un `let q = client.from()...` — utiliser des réassignations `q = q.x()`.

---

### Task 1: Batch fetch client-side `getCustomCardsByIds`

**Files:**

- Modify: `src/lib/supabase/queries/custom-cards.ts` (ajout `fetchCustomCardRowsByIds`)
- Modify: `src/lib/mpc/db/custom-cards.ts` (ajout `getCustomCardsByIds`)

**Interfaces:**

- Consumes: `CustomCardRow`, `CUSTOM_CARD_SELECT`, `rowToMpcCard` (existants dans ces fichiers), `toCustomCard(card: MpcCard, source: MpcSource): CustomCard` (`src/lib/mpc/adapter.ts`).
- Produces: `getCustomCardsByIds(ids: string[]): Promise<Map<string, CustomCard>>` — clés = IDs **préfixés** `mpc:<uuid>` (identiques aux IDs stockés dans `scryfall_id`), valeurs = `CustomCard` (dont `id` est aussi préfixé, via `toCustomCard`).

- [ ] **Step 1: Ajouter `fetchCustomCardRowsByIds` dans la couche Supabase**

Dans `src/lib/supabase/queries/custom-cards.ts`, après `fetchCustomCardSourceRowsWithCounts` (ligne ~112) :

```ts
/** Batch by-id fetch for hydration of stored custom-card copies. `ids` are raw
 *  UUIDs (no `mpc:` prefix). Only public cards resolve — a private/deleted card
 *  is simply absent from the result, mirroring Scryfall's unresolved-id behavior. */
export async function fetchCustomCardRowsByIds(ids: string[]): Promise<CustomCardRow[]> {
	if (ids.length === 0) return [];
	const client = createClient();
	const { data, error } = await client
		.from('custom_cards')
		.select(CUSTOM_CARD_SELECT)
		.in('id', ids)
		.eq('is_public', true);
	if (error) throw new Error(`Failed to load custom cards by ids: ${error.message}`);
	return data as CustomCardRow[];
}
```

Note : pas de `let q =` chaîné avec filtres conditionnels ici (requête fixe), donc pas de risque TS2589.

- [ ] **Step 2: Ajouter `getCustomCardsByIds` dans la couche domaine**

Dans `src/lib/mpc/db/custom-cards.ts` :

1. Ajouter `fetchCustomCardRowsByIds` à l'import existant depuis `@/lib/supabase/queries/custom-cards`.
2. Ajouter l'import de l'adapter et du type en tête de fichier :

```ts
import { toCustomCard } from '@/lib/mpc/adapter';
import type { CustomCard, MpcSource } from '@/lib/mpc/types';
```

(`MpcSource` est peut-être déjà importé — vérifier et fusionner les imports.)

3. Après `getCustomCardSourcesWithCount` :

```ts
// Placeholder source for copy hydration: the exact source is not needed to
// display a stored copy (same pattern as useCustomCardPrints).
const UNKNOWN_SOURCE: MpcSource = {
	id: 'unknown',
	name: 'Custom',
	isBuiltIn: false,
	tags: [],
	driveFolderId: null,
};

/**
 * Resolve stored custom-card copy IDs (`mpc:<uuid>`) into CustomCards.
 * Accepts prefixed or raw UUIDs; the returned Map is keyed by the PREFIXED id
 * so callers can look up with the exact id they stored.
 */
export async function getCustomCardsByIds(ids: string[]): Promise<Map<string, CustomCard>> {
	const rawIds = [...new Set(ids.map((id) => (id.startsWith('mpc:') ? id.slice(4) : id)))];
	const rows = await fetchCustomCardRowsByIds(rawIds);
	const result = new Map<string, CustomCard>();
	for (const row of rows) {
		const card = toCustomCard(rowToMpcCard(row), UNKNOWN_SOURCE);
		result.set(card.id, card); // card.id is `mpc:<uuid>` via toCustomCard
	}
	return result;
}
```

- [ ] **Step 3: Vérifier types + lint sur les fichiers modifiés**

Run: `npx eslint src/lib/supabase/queries/custom-cards.ts src/lib/mpc/db/custom-cards.ts && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "custom-cards" || echo OK-TSC`
Expected: eslint silencieux, `OK-TSC` (aucune erreur TS dans ces fichiers).

- [ ] **Step 4: Vérification runtime (console dev)**

Avec `npm run dev` et Supabase local démarré, dans la console navigateur d'une page de l'app :
prendre l'UUID d'une carte custom publique en DB (Studio → table `custom_cards`, colonne `id`, une ligne avec `oracle_id` non null), puis vérifier dans un composant temporaire OU via l'étape runtime de la Task 2 (préférée — pas de code jetable). Si on veut vérifier isolément : ajouter temporairement dans une page un `useEffect(() => { getCustomCardsByIds(['mpc:<uuid>']).then(console.log) })`, constater une Map de taille 1 avec la clé préfixée, puis **retirer** le code temporaire.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/queries/custom-cards.ts src/lib/mpc/db/custom-cards.ts
git commit -m "feat(custom-cards): batch by-ids fetch for copy hydration

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Hydratation mixte dans `resolveCardsByScryfallIds`

**Files:**

- Modify: `src/lib/scryfall/resolveCardsByScryfallIds.ts`

**Interfaces:**

- Consumes: `getCustomCardsByIds(ids: string[]): Promise<Map<string, CustomCard>>` (Task 1).
- Produces: signature inchangée — `resolveCardsByScryfallIds(ids, options): Promise<Map<string, ScryfallCard>>`. Les IDs `mpc:*` résolvent désormais en `CustomCard` casté `ScryfallCard` (pattern codebase). Tous les consommateurs (`useCollectionCards`, `useDeckDetail`, `useCardTokens`) fonctionnent sans modification.

- [ ] **Step 1: Router les IDs `mpc:*` vers la table custom**

Dans `src/lib/scryfall/resolveCardsByScryfallIds.ts` :

1. Ajouter l'import :

```ts
import { getCustomCardsByIds } from '@/lib/mpc/db/custom-cards';
```

2. Dans le corps de la fonction, juste après `const uniqueIds = [...new Set(ids)];` et le early-return, séparer les deux familles et résoudre les customs en parallèle du chemin Scryfall. Remplacer :

```ts
const uniqueIds = [...new Set(ids)];
const resolved = new Map<string, ScryfallCard>();

if (uniqueIds.length === 0) return resolved;

let missIds = uniqueIds;
```

par :

```ts
const allIds = [...new Set(ids)];
const resolved = new Map<string, ScryfallCard>();

if (allIds.length === 0) return resolved;

// Custom-card copies are stored with an `mpc:<uuid>` id in the same column
// as Scryfall ids. Route them to the custom_cards table; everything else
// follows the Scryfall cache+API path unchanged. Custom cards NEVER enter
// the Scryfall IndexedDB cache (putCardsInCache below only sees `fetched`).
const customIds = allIds.filter((id) => id.startsWith('mpc:'));
const uniqueIds = allIds.filter((id) => !id.startsWith('mpc:'));

if (customIds.length > 0) {
	try {
		const customCards = await getCustomCardsByIds(customIds);
		for (const [id, card] of customCards) {
			resolved.set(id, card as unknown as ScryfallCard);
		}
		putCards([...customCards.values()] as unknown as ScryfallCard[]);
	} catch (err) {
		console.error('[resolveCardsByScryfallIds] custom-card batch failed:', err);
	}
}
if (isCancelled?.()) return resolved;

if (uniqueIds.length === 0) return resolved;

let missIds = uniqueIds;
```

**Attention destructuring** : `const { isCancelled, onProgress, skipCache = false } = options;` est déjà au-dessus — ne pas le dupliquer. Le reste de la fonction (cache Scryfall, batches réseau, `putCardsInCache(fetched)`) est inchangé : `fetched` ne contient que des cartes Scryfall, donc le cache IndexedDB reste pur.

- [ ] **Step 2: Vérifier types + lint**

Run: `npx eslint src/lib/scryfall/resolveCardsByScryfallIds.ts && npm run build 2>&1 | tail -5`
Expected: eslint silencieux ; build vert (c'est le point le plus exposé au TS2589 par contagion de types — le build entier est la seule gate fiable, mémoire projet).

- [ ] **Step 3: Vérification runtime — la preuve de bout en bout**

Avec `npm run dev` + Supabase local :

1. Studio (`npm run sb:studio`) → table `custom_cards` → copier l'`id` (UUID) d'une carte publique **avec `oracle_id`**.
2. Studio → table `cards` → éditer une ligne de SA collection (owner = utilisateur de test connecté) : remplacer `scryfall_id` par `mpc:<uuid copié>`.
3. Recharger `/collection` dans l'app : la copie doit apparaître **avec l'image custom** (avant ce commit, elle disparaissait silencieusement).
4. Vérifier la console : pas d'erreur `[resolveCardsByScryfallIds]`.

Expected: la copie custom s'affiche dans la collection ; remettre ensuite le `scryfall_id` d'origine ou laisser (donnée de test).

- [ ] **Step 4: Commit**

```bash
git add src/lib/scryfall/resolveCardsByScryfallIds.ts
git commit -m "feat(custom-cards): hydrate mpc: ids from custom_cards in resolver

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Section « Custom » dans `PrintList` (picker de sélection)

**Files:**

- Modify: `src/lib/card/components/PrintList/PrintList.types.ts` (props)
- Modify: `src/lib/card/components/PrintList/PrintList.tsx`
- Modify: `src/lib/card/components/CardPrintPickerModal/CardPrintPickerModal.tsx` (prop pass-through)

**Interfaces:**

- Consumes: `useCustomCardPrints(oracleId: string | undefined, excludeId: string): { prints: CustomCard[]; loading: boolean }` (`src/lib/mpc/hooks/useCustomCardPrints.ts`, existant) ; `t('customCards')` / `t('officialPrints')` (clés existantes).
- Produces: `PrintListProps` gagne `oracleId?: string` ; `CardPrintPickerModal` gagne la même prop et la forwarde. `onSelect` reste typé `(print: ScryfallCard) => void` — un print custom est passé via le cast établi (le comportement custom est géré en aval par `isCustomCard`, Tasks 4-5).

- [ ] **Step 1: Ajouter `oracleId` aux props**

Dans `src/lib/card/components/PrintList/PrintList.types.ts`, modifier `PrintListProps` :

```ts
export interface PrintListProps {
	prints_search_uri: string;
	currentCardId: string;
	currentSet?: string;
	currentCollectorNumber?: string;
	currentLang?: string;
	/** Oracle id of the card whose prints are listed; enables the Custom section. */
	oracleId?: string;
	onSelect: (print: ScryfallCard) => void;
}
```

- [ ] **Step 2: Rendre la section custom dans `PrintList`**

Dans `src/lib/card/components/PrintList/PrintList.tsx` :

1. Ajouter les imports :

```ts
import { useCustomCardPrints } from '@/lib/mpc/hooks/useCustomCardPrints';
```

2. Destructurer `oracleId` dans les props du composant (ligne ~16-23).

3. Après `const { prints, loading, error } = useCardPrints(prints_search_uri);` ajouter :

```ts
const { prints: customPrints, loading: customLoading } = useCustomCardPrints(
	oracleId,
	currentCardId
);
```

4. Remplacer le `useMemo` des sections (lignes ~41-44) par une version qui suffixe la section custom (même structure que `PrintsTab.tsx:66-89` : sous-groupe « Impressions officielles » seulement quand il y a des customs) :

```ts
const sections: CardListSection[] = useMemo(() => {
	if (loading || error) return [];
	const hasCustom = customPrints.length > 0;

	let officialSections: CardListSection[] = [];
	if (prints.length > 0) {
		const byLang = groupPrintsByLang(prints, currentLang ?? 'en', preferredLang);
		if (byLang.length > 0) {
			officialSections = hasCustom
				? [{ label: t('officialPrints'), cards: [], children: byLang }]
				: byLang;
		}
	}

	const customSection: CardListSection | null = hasCustom
		? { label: t('customCards'), cards: customPrints as unknown as AnyCard[] }
		: null;

	return [...officialSections, ...(customSection ? [customSection] : [])];
}, [prints, loading, error, currentLang, preferredLang, customPrints, t]);
```

Note : `t` vient du `useTranslations('card')` déjà présent ; l'ajouter aux deps du memo comme montré.

5. Adapter `isCurrentPrint` pour marquer « Selected » un print custom courant. Remplacer la fonction (lignes ~30-39) par :

```ts
function isCurrentPrint(card: ScryfallCard): boolean {
	if (card.id === currentCardId) return true;
	// set/number/lang matching only applies to official prints — a custom
	// card can share a set_code with an official print without being it.
	if (isCustomCard(card as ScryfallCard | CustomCard)) return false;
	if (currentSet && currentCollectorNumber && currentLang) {
		return (
			card.set === currentSet &&
			card.collector_number === currentCollectorNumber &&
			(card.lang ?? 'en') === currentLang
		);
	}
	return false;
}
```

avec les imports :

```ts
import { isCustomCard } from '@/lib/mpc/types';
import type { CustomCard } from '@/lib/mpc/types';
```

**Attention** : l'ancien `isCurrentPrint` retournait `card.id === currentCardId` UNIQUEMENT quand set/number/lang étaient absents. La nouvelle version teste l'id d'abord dans tous les cas — comportement identique pour les officiels (un id égal implique set/number/lang égaux) et correct pour les customs.

6. Le gate `if (sections.length === 0)` (ligne ~94) doit couvrir le chargement custom : remplacer `if (loading) return <p …>` par `if (loading || customLoading) return <p …>` (même message `loadingPrints`).

- [ ] **Step 3: Forwarder `oracleId` dans `CardPrintPickerModal`**

Dans `src/lib/card/components/CardPrintPickerModal/CardPrintPickerModal.tsx` :

1. Ajouter `oracleId?: string;` à l'interface `Props` (après `currentLang`).
2. Le destructurer dans la signature du composant.
3. Le passer à `<PrintList … oracleId={oracleId} …/>`.

- [ ] **Step 4: Vérifier types + lint**

Run: `npx eslint src/lib/card/components/PrintList/PrintList.tsx src/lib/card/components/PrintList/PrintList.types.ts src/lib/card/components/CardPrintPickerModal/CardPrintPickerModal.tsx`
Expected: silencieux.

- [ ] **Step 5: Vérification runtime**

`npm run dev` : ouvrir une carte de la collection qui possède des prints custom (une carte dont l'`oracle_id` matche des lignes `custom_cards`) → Edit → « Changer d'impression ». **À ce stade `oracleId` n'est pas encore câblé par l'appelant (Task 4)** : vérifier seulement l'absence de régression — le picker officiel s'affiche comme avant. La section custom apparaîtra après la Task 4.

- [ ] **Step 6: Commit**

```bash
git add src/lib/card/components/PrintList/ src/lib/card/components/CardPrintPickerModal/CardPrintPickerModal.tsx
git commit -m "feat(custom-cards): custom section in print picker (PrintList)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Câbler le picker depuis le formulaire d'entrée (`useCardEntryForm` / `CardEntryFormBody`)

**Files:**

- Modify: `src/lib/card/components/EditCardModal/useCardEntryForm.ts`
- Modify: `src/lib/card/components/EditCardModal/CardEntryFormBody.tsx`

**Interfaces:**

- Consumes: `CardPrintPickerModal` avec prop `oracleId` (Task 3) ; `isCustomCard` (`src/lib/mpc/types.ts`).
- Produces: comportement — le picker reçoit `oracle_id` (section custom visible) ; sélectionner un print custom met à jour `selectedPrint` (image custom en preview) ; le changement de langue est court-circuité pour un print custom ; le bouton « Changer d'impression » reste disponible quand le print courant est custom (fallback `prints_search_uri` par oracle_id). Signatures TS inchangées (le custom circule casté `ScryfallCard`).

- [ ] **Step 1: Court-circuit langue pour un print custom dans `useCardEntryForm`**

Dans `src/lib/card/components/EditCardModal/useCardEntryForm.ts` :

1. Ajouter l'import :

```ts
import { isCustomCard } from '@/lib/mpc/types';
import type { CustomCard } from '@/lib/mpc/types';
```

2. Dans `handleLanguageChange`, juste après `save({ language });` (ligne ~30), ajouter le garde :

```ts
// A custom print has no Scryfall-localized variants — keep its image as-is.
if (isCustomCard(selectedPrint as ScryfallCard | CustomCard)) {
	setLangInfoMessage(null);
	langFetchAbort.current?.abort();
	return;
}
```

3. Dans `selectPrint` (ligne ~84), gérer la langue d'un custom (`print.lang` est `undefined` sur un `CustomCard` casté ; le `custom.lang` n'est pas mappé vers `MtgLanguage`) — comportement voulu : ne pas toucher la langue du draft quand on choisit un custom. Remplacer :

```ts
function selectPrint(print: ScryfallCard) {
	setSelectedPrint(print);
	const lang = print.lang ? SCRYFALL_CODE_TO_LANGUAGE[print.lang] : undefined;
	save({ language: lang });
	setLangInfoMessage(null);
	setShowPrintPicker(false);
}
```

par :

```ts
function selectPrint(print: ScryfallCard) {
	setSelectedPrint(print);
	if (!isCustomCard(print as ScryfallCard | CustomCard)) {
		const lang = print.lang ? SCRYFALL_CODE_TO_LANGUAGE[print.lang] : undefined;
		save({ language: lang });
	}
	setLangInfoMessage(null);
	setShowPrintPicker(false);
}
```

Note : `resolveLanguageChange` skippe déjà quand `set`/`collector_number` manquent, mais un custom PEUT avoir un `set_code` — le garde explicite est nécessaire.

- [ ] **Step 2: Fallback `prints_search_uri` + `oracleId` dans `CardEntryFormBody`**

Dans `src/lib/card/components/EditCardModal/CardEntryFormBody.tsx`, le picker est gaté par `selectedPrint.prints_search_uri` (ligne ~202) — absent sur un custom, ce qui cacherait le picker quand le print courant est custom. Remplacer le bloc :

```tsx
{
	form.showPrintPicker && selectedPrint.prints_search_uri && (
		<CardPrintPickerModal
			prints_search_uri={selectedPrint.prints_search_uri}
			currentCardId={selectedPrint.id}
			currentSet={selectedPrint.set}
			currentCollectorNumber={selectedPrint.collector_number}
			currentLang={form.entryLangCode}
			onSelect={form.selectPrint}
			onClose={() => form.setShowPrintPicker(false)}
		/>
	);
}
```

par (même fallback URI que `PrintsTab.tsx:42-46`) :

```tsx
{
	form.showPrintPicker && printsSearchUri && (
		<CardPrintPickerModal
			prints_search_uri={printsSearchUri}
			currentCardId={selectedPrint.id}
			currentSet={selectedPrint.set}
			currentCollectorNumber={selectedPrint.collector_number}
			currentLang={form.entryLangCode}
			oracleId={selectedPrint.oracle_id}
			onSelect={form.selectPrint}
			onClose={() => form.setShowPrintPicker(false)}
		/>
	);
}
```

avec, dans le corps du composant (après `const { draftEntry: entry, selectedPrint } = form;`) :

```ts
// A custom print has no prints_search_uri; fall back to an oracle_id search
// so the picker still lists the official prints (same as PrintsTab).
const printsSearchUri =
	selectedPrint.prints_search_uri ??
	(selectedPrint.oracle_id
		? `https://api.scryfall.com/cards/search?q=oracle_id%3A${selectedPrint.oracle_id}&unique=prints&order=released`
		: undefined);
```

- [ ] **Step 3: Vérifier types + lint**

Run: `npx eslint src/lib/card/components/EditCardModal/useCardEntryForm.ts src/lib/card/components/EditCardModal/CardEntryFormBody.tsx`
Expected: silencieux.

- [ ] **Step 4: Vérification runtime — sélection en preview**

`npm run dev` : collection → carte avec prints custom → Edit → « Changer d'impression » :

1. La section « Cartes custom » apparaît sous « Impressions officielles ».
2. Cliquer « Select » sur un print custom → le picker se ferme, la **preview** du formulaire affiche l'image custom.
3. Changer la langue dans le formulaire → l'image custom ne change pas, pas de fetch d'erreur.
4. (Ne pas sauver encore — la persistance se vérifie en Task 5.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/card/components/EditCardModal/
git commit -m "feat(custom-cards): select custom print in card entry form

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Persistance du changement de print custom (collection / wishlist / deck)

**Files:**

- Modify: `src/contexts/CardModalProvider.tsx` (`handleChangePrint` : ne pas cacher un custom dans IndexedDB ; oracle key)
- Verify (pas de modif attendue) : `src/lib/collection/store/collection-store.ts` `changePrint`, chemin deck équivalent.

**Interfaces:**

- Consumes: `putCards` (`src/lib/scryfall/store/cards-store.ts`), `isCustomCard`, `putCardsInCache` (import existant dans `CardModalProvider`).
- Produces: comportement — `handleChangePrint(rowId, newCard, source)` accepte un `newCard` custom : il est mirroré dans le store in-memory (PAS le cache IndexedDB Scryfall), le `scryfall_id` stocké devient `mpc:<uuid>`, et le modal se re-cible sur la carte.

- [ ] **Step 1: Garde custom dans `handleChangePrint`**

Dans `src/contexts/CardModalProvider.tsx`, localiser `handleChangePrint` (ligne ~252) :

```ts
	const handleChangePrint = useCallback(
		(rowId: string, newCard: ScryfallCard, source: 'collection' | 'wishlist') => {
			void putCardsInCache([newCard]);
			const language = newCard.lang ? SCRYFALL_CODE_TO_LANGUAGE[newCard.lang] : undefined;
			…
```

Remplacer le corps par :

```ts
const handleChangePrint = useCallback(
	(rowId: string, newCard: ScryfallCard, source: 'collection' | 'wishlist') => {
		if (isCustomCard(newCard as ScryfallCard | CustomCard)) {
			// Custom prints never enter the Scryfall IndexedDB cache; mirror them
			// into the in-memory store so the reopened stack resolves synchronously.
			putCards([newCard]);
		} else {
			void putCardsInCache([newCard]);
		}
		const language = newCard.lang ? SCRYFALL_CODE_TO_LANGUAGE[newCard.lang] : undefined;
		if (source === 'wishlist') {
			wishlist.changePrint(rowId, newCard.id);
		} else {
			collection.changePrint(rowId, newCard.id, language ? { language } : undefined);
		}
		setOpen({ kind: 'stack', oracleKey: oracleKeyOf(newCard) });
	},
	[collection, wishlist]
);
```

Ajouter les imports manquants en tête de fichier (vérifier les existants — `putCardsInCache` et `isCustomCard` peuvent déjà y être) :

```ts
import { putCards } from '@/lib/scryfall/store/cards-store';
import { isCustomCard } from '@/lib/mpc/types';
import type { CustomCard } from '@/lib/mpc/types';
```

Note : `oracleKeyOf(newCard)` fonctionne pour un custom matché — il a un `oracle_id`. Vérifier la définition de `oracleKeyOf` dans le fichier ; si elle fallback sur autre chose que `oracle_id`, s'assurer qu'un custom avec `oracle_id` produit la même clé que la carte officielle (c'est ce qui garde le modal ouvert sur le bon stack).

- [ ] **Step 2: Vérifier le chemin deck**

Le deck change de print via son propre flux (chercher `changePrint` dans `src/app/[locale]/decks/[id]/useDeckCardModalProps.tsx` et `src/lib/deck/store/deck-store.ts`). Lire ces call-sites : si le deck route par `newCard.id` en string comme la collection (attendu), **aucune modification** ; si un chemin fait `putCardsInCache(newCard)` sans garde, appliquer le même garde `isCustomCard` que Step 1. Documenter la conclusion dans le message de commit.

- [ ] **Step 3: Vérifier types + lint + build**

Run: `npx eslint src/contexts/CardModalProvider.tsx && npm run build 2>&1 | tail -5`
Expected: eslint silencieux, build vert.

- [ ] **Step 4: Vérification runtime — persistance de bout en bout (critère du spec)**

`npm run dev` + Supabase local :

1. **Collection** : carte avec prints custom → Edit → choisir un print custom → Save. La copie affiche l'image custom. **Recharger la page** → la copie custom persiste (Studio : la ligne `cards` a `scryfall_id = mpc:<uuid>`).
2. **Wishlist** : même scénario sur une carte de la wishlist.
3. **Deck** : ouvrir un deck → une carte → Edit → print custom → Save → reload → persiste.
4. **Non-régression** : une carte sans print custom → Edit → picker → aucune section custom, sélection d'un print officiel fonctionne comme avant.

Expected: les 4 scénarios passent. C'est LA vérification du feature.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/CardModalProvider.tsx
git commit -m "feat(custom-cards): persist custom print selection (collection/wishlist/deck)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Gate finale

**Files:**

- Aucun nouveau — vérification globale.

**Interfaces:**

- Consumes: tout le travail des Tasks 1-5.
- Produces: branche prête pour revue.

- [ ] **Step 1: Check global**

Run: `npm run check 2>&1 | tail -20`
Expected: pas de NOUVEAU problème vs la baseline (~60 pré-existants dans des fichiers non touchés). Comparer : chaque fichier modifié par ce plan doit être absent de la sortie d'erreurs.

- [ ] **Step 2: Build**

Run: `npm run build 2>&1 | tail -5`
Expected: succès (gate TS2589).

- [ ] **Step 3: Balayage runtime des surfaces annexes**

`npm run dev` :

1. Page `/card/mpc:<uuid>` d'un custom persisté : s'ouvre normalement (chemin déjà existant).
2. `/collection` en vue table : la ligne custom affiche set/collector (le custom a `set`/`collector_number` optionnels — vérifier pas de `undefined #undefined` moche ; si c'est le cas, noter pour un fix cosmétique de suivi, ne pas bloquer).
3. DeckStats d'un deck contenant une copie custom : pas de crash (le custom enrichi a `cmc`/`colors`/`type_line`).

- [ ] **Step 4: Commit final éventuel + fin de branche**

Si le balayage a produit des micro-fixes, les committer. Puis suivre la skill `superpowers:finishing-a-development-branch`.
