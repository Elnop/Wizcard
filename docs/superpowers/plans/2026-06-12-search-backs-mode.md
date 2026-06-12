# Mode « Backs » + suppression du mode « Tout » — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retirer les cardbacks des résultats de recherche, leur donner un mode dédié « Backs » dans le switcher, et supprimer le mode « Tout » (`all`) et sa logique de fusion.

**Architecture:** Filtrage `card_type` au niveau requête Supabase (`queryCustomCards`), nouveau membre `'backs'` du type `SearchMode` à la place de `'all'`, simplification de `page.tsx` (une seule source de données par mode), prop `variant` sur `FilterModal` pour masquer les filtres non pertinents, option `enabled` sur `useScryfallCardSearch` pour couper la requête Scryfall hors mode officiel.

**Tech Stack:** Next.js (app router, client components), Supabase JS (PostgREST), TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-06-12-search-backs-mode-design.md`

**Vérification:** Le projet n'a pas de runner de tests (pas de vitest/jest dans `package.json`). La porte de validation de chaque tâche est `npm run check` (tsc + ESLint + Prettier), plus une vérification manuelle en Task 6. Un hook lint-staged tourne au commit.

**Contexte DB:** `custom_cards.card_type` est `text not null default 'card'` avec check `('card','token','cardback')` (migration `20260604000003`). `.in('card_type', …)` est donc sûr (pas de NULL).

---

### Task 0: Commiter le travail en cours

Le working tree contient des modifications non commitées (filtres mpcTags/oracleId : `package.json`, `src/app/search/*`, `src/lib/search/components/*`, `src/lib/mpc/hooks/useCustomCards.ts`, `src/lib/supabase/custom-cards.ts`, `scripts/ingest/hud-runner.ts`). Le plan modifie les mêmes fichiers : il faut isoler ce travail dans son propre commit avant de commencer.

- [ ] **Step 1: Vérifier l'état**

Run: `git status --short`
Expected: les fichiers listés ci-dessus en ` M`, rien d'autre d'inattendu.

- [ ] **Step 2: Commiter le travail en cours tel quel**

```bash
git add -A
git commit -m "feat(search): work in progress — filtres mpcTags/oracleId et HUD ingest

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(Si `npm run check` échoue sur ce commit à cause du travail en cours, le noter mais ne pas corriger ici — ce n'est pas le scope du plan.)

---

### Task 1: Filtre `cardTypes` dans la couche données

**Files:**

- Modify: `src/lib/supabase/custom-cards.ts` (~ligne 140 `CustomCardQueryFilters`, ~ligne 199 `queryCustomCards`)

- [ ] **Step 1: Ajouter `cardTypes` à `CustomCardQueryFilters`**

Dans `src/lib/supabase/custom-cards.ts`, le type `CardType` est déjà importé en haut du fichier (`import type { CardSourceType, CardType, MpcCard, MpcSource } from '@/lib/mpc/types';`). Ajouter le champ dans l'interface :

```ts
export interface CustomCardQueryFilters {
	name?: string;
	colors?: string[];
	colorMatch?: 'exact' | 'include' | 'atMost';
	type?: string;
	set?: string;
	cmc?: string;
	rarities?: string[];
	oracleText?: string;
	mpcTagsMustHave?: string[];
	mpcTagsMustNotHave?: string[];
	oracleIdFilter?: 'all' | 'defined' | 'undefined';
	cardTypes?: CardType[];
	order?: string;
	dir?: 'asc' | 'desc' | 'auto';
}
```

- [ ] **Step 2: Appliquer le filtre dans `queryCustomCards`**

Dans `queryCustomCards`, après la ligne `if (filters.rarities?.length) q = q.in('rarity', filters.rarities);`, ajouter :

```ts
if (filters.cardTypes?.length) q = q.in('card_type', filters.cardTypes);
```

- [ ] **Step 3: Vérifier**

Run: `npm run check`
Expected: PASS (0 erreur TS/ESLint/Prettier)

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/custom-cards.ts
git commit -m "feat(search): filtre cardTypes dans queryCustomCards

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Propager `cardTypes` dans `useCustomCards`

**Files:**

- Modify: `src/lib/mpc/hooks/useCustomCards.ts`

- [ ] **Step 1: Étendre `UseCustomCardsFilters`**

Ajouter l'import de type et le champ optionnel :

```ts
import type { CustomCard, CardType } from '../types';
```

(remplace l'import existant `import type { CustomCard } from '../types';`)

```ts
export interface UseCustomCardsFilters extends CardFilters {
	mpcTagsMustHave: string[];
	mpcTagsMustNotHave: string[];
	oracleIdFilter?: 'all' | 'defined' | 'undefined';
	cardTypes?: CardType[];
}
```

- [ ] **Step 2: Intégrer `cardTypes` dans la clé de filtre et la requête**

Après la ligne `const oracleIdFilter = filters.oracleIdFilter ?? 'all';`, ajouter :

```ts
const cardTypesKey = (filters.cardTypes ?? []).join(',');
```

Ajouter `cardTypesKey` à la fin du tableau `filterKey` (après `oracleIdFilter`) :

```ts
const filterKey = [
	sourceId ?? '__all__',
	debouncedName,
	colorsKey,
	filters.colorMatch,
	debouncedType,
	filters.set,
	raritiesKey,
	debouncedOracleText,
	debouncedCmc,
	filters.order,
	filters.dir,
	mustHaveKey,
	mustNotHaveKey,
	oracleIdFilter,
	cardTypesKey,
].join('|');
```

Dans l'appel `queryCustomCards` (objet `filters`), après `oracleIdFilter: …`, ajouter :

```ts
							cardTypes: cardTypesKey ? (cardTypesKey.split(',') as CardType[]) : undefined,
```

Ajouter `cardTypesKey` au tableau de dépendances du `useCallback` de `fetchPage` (après `oracleIdFilter`).

- [ ] **Step 3: Vérifier**

Run: `npm run check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/mpc/hooks/useCustomCards.ts
git commit -m "feat(search): propagation cardTypes dans useCustomCards

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Option `enabled` sur `useScryfallCardSearch`

**Files:**

- Modify: `src/lib/scryfall/hooks/useScryfallCardSearch.ts`

Les autres consommateurs (`AddCardModal.tsx`, `CardSearchPanel.tsx`) appellent le hook avec un seul argument — le second paramètre doit être optionnel avec `enabled` par défaut à `true`.

- [ ] **Step 1: Ajouter le paramètre `options`**

```ts
export function useScryfallCardSearch(
	filters: SearchFilters,
	options: { enabled?: boolean } = {}
): UseScryfallCardSearchResult {
	const enabled = options.enabled ?? true;
```

- [ ] **Step 2: Court-circuiter l'effet de recherche quand `enabled` est faux**

Remplacer l'effet principal :

```ts
useEffect(() => {
	if (!enabled) {
		// Reset the key so re-enabling triggers a fresh search
		lastSearchKeyRef.current = '';
		abortControllerRef.current?.abort();
		return;
	}
	const query = buildQuery(debouncedName);
	const effectiveQuery = query.trim() || DEFAULT_QUERY;
	const searchKey = `${effectiveQuery}|${order}|${dir}`;

	if (searchKey !== lastSearchKeyRef.current) {
		lastSearchKeyRef.current = searchKey;
		setPage(1);
		fetchCards(query, 1, true);
	}
}, [enabled, debouncedName, buildQuery, fetchCards, order, dir]);
```

- [ ] **Step 3: Vérifier**

Run: `npm run check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/scryfall/hooks/useScryfallCardSearch.ts
git commit -m "feat(scryfall): option enabled pour couper la recherche hors mode officiel

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Prop `variant` sur `FilterModal`

**Files:**

- Modify: `src/lib/search/components/FilterModal/FilterModal.tsx`

Trois variantes :

- `'default'` (défaut) : comportement actuel, tous les filtres dont `CardTypeFilter` — utilisé par les consommateurs existants (collection/import/decks) sans changement.
- `'search'` : tout sauf `CardTypeFilter` (le switcher de mode fait foi côté recherche).
- `'backs'` : uniquement la section Cartes Custom (`CustomSourceFilter` + `MpcTagsFilter`), sans `OracleIdFilter`.

- [ ] **Step 1: Ajouter le type et la prop**

```ts
export type FilterModalVariant = 'default' | 'search' | 'backs';
```

Dans `FilterModalProps`, ajouter :

```ts
	variant?: FilterModalVariant;
```

Dans `FilterModalContentProps`, ajouter :

```ts
variant: FilterModalVariant;
```

- [ ] **Step 2: Rendu conditionnel dans `FilterModalContent`**

Ajouter `variant` à la destructuration des props de `FilterModalContent`, puis remplacer le bloc `<div className={styles.body}>…</div>` par :

```tsx
<div className={styles.body}>
	{variant !== 'backs' && (
		<>
			<ColorFilter
				selected={draftColors}
				onChange={setDraftColors}
				colorMatch={draftColorMatch}
				onColorMatchChange={setDraftColorMatch}
				symbolMap={symbolMap}
			/>
			<RarityFilter value={draftRarities} onChange={setDraftRarities} />
			<TypeFilter value={draftType} onChange={setDraftType} />
			<OracleTextFilter value={draftOracleText} onChange={setDraftOracleText} />
			<CmcFilter value={draftCmc} onChange={setDraftCmc} />
			<SetFilter value={draftSet} onChange={setDraftSet} sets={sets} isLoading={setsLoading} />
			<SortFilter
				order={draftOrder}
				onOrderChange={(v) => setDraftOrder(v as ScryfallSortOrder)}
				dir={draftDir}
				onDirChange={setDraftDir}
			/>
		</>
	)}
	{variant === 'default' && (
		<CardTypeFilter value={draftCardTypeFilter} onChange={setDraftCardTypeFilter} />
	)}

	{customSources.length > 0 && (
		<>
			<div className={styles.sectionDivider} />
			<div className={styles.sectionTitle}>Cartes Custom</div>
			<CustomSourceFilter
				sources={customSources}
				value={draftCustomSourceId}
				onChange={setDraftCustomSourceId}
			/>
			<MpcTagsFilter value={draftMpcTags} onChange={setDraftMpcTags} />
			{variant !== 'backs' && (
				<OracleIdFilter value={draftOracleIdFilter} onChange={setDraftOracleIdFilter} />
			)}
		</>
	)}
</div>
```

- [ ] **Step 3: Câbler la prop dans le wrapper `FilterModal`**

Dans la destructuration des props de `FilterModal`, ajouter `variant = 'default',` et passer `variant={variant}` à `<FilterModalContent …>`.

- [ ] **Step 4: Vérifier**

Run: `npm run check`
Expected: PASS (les consommateurs existants ne passent pas `variant` → `'default'` → rendu inchangé)

- [ ] **Step 5: Commit**

```bash
git add src/lib/search/components/FilterModal/FilterModal.tsx
git commit -m "feat(search): variantes search/backs du FilterModal

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Basculer `SearchMode` — types, switcher, URL, page

Tout dans une seule tâche/commit : changer le type `SearchMode` casse `page.tsx` tant que la logique de fusion `all` n'est pas retirée — un commit intermédiaire ne compilerait pas.

**Files:**

- Modify: `src/lib/search/types.ts:6`
- Modify: `src/app/search/useSearchFiltersFromUrl.ts:34`
- Modify: `src/app/search/components/SearchModeSwitcher/SearchModeSwitcher.tsx:8-12`
- Modify: `src/app/search/page.tsx`

- [ ] **Step 1: Le type**

`src/lib/search/types.ts` ligne 6 :

```ts
export type SearchMode = 'official' | 'custom' | 'backs';
```

- [ ] **Step 2: Le parseur d'URL**

`src/app/search/useSearchFiltersFromUrl.ts` ligne 34 :

```ts
const VALID_MODES = new Set(['official', 'custom', 'backs']);
```

(`parseMode` fait déjà retomber toute valeur inconnue — dont l'ancien `?mode=all` — sur `'official'`. Rien d'autre à changer dans ce fichier.)

- [ ] **Step 3: Le switcher**

`src/app/search/components/SearchModeSwitcher/SearchModeSwitcher.tsx` :

```ts
const OPTIONS: { value: SearchMode; label: string }[] = [
	{ value: 'official', label: 'Officiel' },
	{ value: 'custom', label: 'Custom' },
	{ value: 'backs', label: 'Backs' },
];
```

- [ ] **Step 4: Réécrire la logique de `page.tsx`**

Dans `SearchPageContent` (`src/app/search/page.tsx`), remplacer le bloc allant de l'appel `useScryfallCardSearch` jusqu'à `resolvedIsLoadingMore` inclus (lignes ~72-144 actuelles) par :

```tsx
const isBacks = mode === 'backs';

const {
	cards,
	isLoading,
	isLoadingMore,
	error,
	queryError,
	hasMore,
	totalCards,
	suggestions,
	loadMore,
} = useScryfallCardSearch(
	{
		name,
		colors,
		colorMatch,
		type,
		set,
		rarities,
		oracleText,
		cmc,
		order,
		dir,
	},
	{ enabled: mode === 'official' }
);

const {
	cards: customCards,
	isLoading: customLoading,
	isLoadingMore: customLoadingMore,
	hasMore: customHasMore,
	total: customTotal,
	loadMore: loadMoreCustom,
	error: customError,
} = useCustomCards(mode !== 'official' ? customSourceId : undefined, {
	name,
	colors: isBacks ? [] : colors,
	colorMatch,
	type: isBacks ? '' : type,
	set: isBacks ? '' : set,
	rarities: isBacks ? [] : rarities,
	oracleText: isBacks ? '' : oracleText,
	cmc: isBacks ? '' : cmc,
	order: isBacks ? 'name' : order,
	dir,
	mpcTagsMustHave: mpcTags.mustHave,
	mpcTagsMustNotHave: mpcTags.mustNotHave,
	oracleIdFilter: isBacks ? 'all' : oracleIdFilter,
	cardTypes: isBacks ? ['cardback'] : ['card', 'token'],
});

const displayedCards: AnyCard[] = mode === 'official' ? cards : customCards;
const displayedHasMore = mode === 'official' ? hasMore : customHasMore;
const displayedLoadMore = mode === 'official' ? loadMore : loadMoreCustom;
const displayedIsLoadingMore = mode === 'official' ? isLoadingMore : customLoadingMore;
```

Supprimer le `useMemo` de `mergedCards` et l'import `useMemo` s'il n'est plus utilisé ailleurs dans le fichier (vérifier : après ce changement il ne reste plus d'usage → retirer `useMemo` de l'import React ligne 3).

- [ ] **Step 5: Adapter compteur de filtres, infos résultats et rendu**

Toujours dans `page.tsx` :

Le compteur de filtres actifs (en mode backs, les filtres masqués ne comptent pas) — remplacer le calcul actuel de `totalActiveFilterCount` :

```tsx
const customFilterCount =
	(customSourceId !== null ? 1 : 0) +
	mpcTags.mustHave.length +
	(mpcTags.mustNotHave.join(',') !== 'NSFW' ? mpcTags.mustNotHave.length : 0);

const totalActiveFilterCount = isBacks
	? customFilterCount
	: activeFilterCount + customFilterCount + (oracleIdFilter !== 'all' ? 1 : 0);
```

`isDefaultQuery` ne concerne que le mode officiel (le placeholder « Cartes populaires EDH » n'a pas de sens pour custom/backs) :

```tsx
const hasFilters =
	name || colors.length > 0 || type || set || rarities.length > 0 || oracleText || cmc;
const isDefaultQuery = !hasFilters && mode === 'official';
```

Le bloc `resultInfo` (remplacer le contenu du premier bloc conditionnel) :

```tsx
{
	!isDefaultQuery && !isLoading && !customLoading && displayedCards.length > 0 && (
		<div className={styles.resultInfo}>
			<span>
				{mode === 'official' &&
					cards.length > 0 &&
					`Showing ${cards.length} of ${totalCards.toLocaleString()} cards`}
				{mode === 'custom' && `${customTotal} custom`}
				{mode === 'backs' && `${customTotal} cardbacks`}
			</span>
		</div>
	);
}
```

Les erreurs Scryfall ne s'affichent qu'en mode officiel (le hook étant coupé ailleurs, son état peut être périmé) :

```tsx
				{mode === 'official' && error && (
					<div className={styles.error}>
						<p>An error occurred. Please try again.</p>
					</div>
				)}

				{mode === 'official' && queryError && (
```

Le `FilterModal` reçoit la variante (seule la ligne `variant` est nouvelle, le reste est identique à l'existant) :

```tsx
<FilterModal
	isOpen={isModalOpen}
	variant={isBacks ? 'backs' : 'search'}
	colors={colors}
	colorMatch={colorMatch}
	type={type}
	set={set}
	rarities={rarities}
	oracleText={oracleText}
	cmc={cmc}
	sets={sets}
	setsLoading={setsLoading}
	order={order}
	dir={dir}
	customSources={customSources}
	customSourceId={customSourceId}
	mpcTags={mpcTags}
	oracleIdFilter={oracleIdFilter}
	onApply={applyFilters}
	onClose={() => setIsModalOpen(false)}
/>
```

Le `CardList` utilise les valeurs résolues :

```tsx
<CardList
	cards={displayedCards}
	isLoading={isLoading || customLoading}
	isLoadingMore={displayedIsLoadingMore}
	hasMore={displayedHasMore}
	onLoadMore={displayedLoadMore}
	onCardClick={handleCardClick}
	renderOverlay={withCustomBadge}
	sortOrder={order}
	sortDir={dir}
	onSortChange={(newOrder, newDir) => {
		setOrder(newOrder as Parameters<typeof setOrder>[0]);
		setDir(newDir);
	}}
	pageSize={false}
	tableColumns={tableColumns}
/>
```

Le bloc « No cards found » : remplacer `mergedCards.length === 0` par `displayedCards.length === 0`. Les `suggestions` (Scryfall) n'apparaissent de fait qu'en mode officiel — pas de changement nécessaire.

- [ ] **Step 6: Vérifier qu'il ne reste aucune référence au mode `all`**

Run: `grep -rn "'all'" src/lib/search/types.ts src/app/search --include="*.ts*" | grep -i mode`
Expected: aucune sortie (les `'all'` restants dans `page.tsx`/`useSearchFiltersFromUrl.ts` concernent `oracleIdFilter`, pas le mode).

Run: `grep -rn "mergedCards\|resolvedHasMore\|resolvedLoadMore\|resolvedIsLoadingMore" src/`
Expected: aucune sortie.

- [ ] **Step 7: Vérifier**

Run: `npm run check`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/lib/search/types.ts src/app/search/useSearchFiltersFromUrl.ts src/app/search/components/SearchModeSwitcher/SearchModeSwitcher.tsx src/app/search/page.tsx
git commit -m "feat(search): mode Backs dédié, suppression du mode Tout et de la fusion de résultats

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Vérification manuelle

**Files:** aucun (vérification uniquement)

- [ ] **Step 1: Lancer le dev server**

Run: `npm run dev` (suppose Supabase local démarré : `npm run sb:start` si besoin)

- [ ] **Step 2: Parcours de vérification sur `/search`**

1. Mode **Officiel** (défaut) : résultats Scryfall, URL sans `?mode`.
2. Mode **Custom** : uniquement cartes custom, **aucun cardback** dans la grille ; le total affiché (« N custom ») exclut les cardbacks ; pagination OK (« Charger plus »).
3. Mode **Backs** : uniquement des cardbacks ; info « N cardbacks » ; URL `?mode=backs`.
4. En mode Backs, ouvrir **Filtres** : seuls Source custom + Tags MPC sont visibles ; le badge de compteur ne compte que ces filtres.
5. En modes Officiel/Custom, ouvrir **Filtres** : le sélecteur « Type de carte » (CardTypeFilter) n'apparaît plus.
6. Naviguer sur `/search?mode=all` : retombe sur Officiel sans erreur.
7. Clic sur un cardback en mode Backs : le `CardModal` s'ouvre normalement.
8. Page **/collection** : le filtre « Type de carte » est toujours présent dans son modal (variante `default` intacte).

- [ ] **Step 3: Vérification réseau (optionnel mais recommandé)**

Onglet Network du navigateur en mode Backs/Custom : aucune requête `api.scryfall.com/cards/search` ne part quand on tape dans la barre de recherche.
