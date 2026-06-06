# Search URL Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchroniser tous les filtres de la page de recherche dans l'URL, en ajoutant `mode`, `source`, et `mpcTags` aux params existants.

**Architecture:** Étendre `useSearchFiltersFromUrl` pour gérer `mode`, `customSourceId`, et `mpcTagsFilter`. Refactorer `SearchModeSwitcher` pour être un composant contrôlé (valeur depuis l'URL, plus localStorage). Étendre `applyFilters` pour inclure les deux nouveaux filtres du modal.

**Tech Stack:** Next.js App Router (`useRouter`, `useSearchParams`), React, TypeScript

---

## File Map

| Fichier                                                               | Action   | Changement                                                                     |
| --------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------ |
| `src/app/search/useSearchFiltersFromUrl.ts`                           | Modifier | Ajouter `mode`, `customSourceId`, `mpcTagsFilter` + étendre `applyFilters`     |
| `src/app/search/components/SearchModeSwitcher/SearchModeSwitcher.tsx` | Modifier | Passer de localStorage à prop contrôlée                                        |
| `src/app/search/page.tsx`                                             | Modifier | Supprimer les `useState` locaux pour `mode`, `customSourceId`, `mpcTagsFilter` |

---

### Task 1: Étendre `useSearchFiltersFromUrl` avec `mode`, `customSourceId`, `mpcTagsFilter`

**Files:**

- Modify: `src/app/search/useSearchFiltersFromUrl.ts`

**Contexte :** Le hook lit/écrit déjà l'URL via `useRouter` + `useSearchParams`. Il faut ajouter 3 nouveaux params : `mode` (sync immédiat), `source` et `mpcTags` (sync via `applyFilters`).

- [ ] **Step 1: Ajouter les constantes de validation et parsers**

Dans `useSearchFiltersFromUrl.ts`, ajouter après `VALID_RARITIES` :

```ts
const VALID_MODES = new Set(['official', 'all', 'custom']);

function parseMode(param: string | null): SearchMode {
	if (param && VALID_MODES.has(param)) return param as SearchMode;
	return 'official';
}

function parseMpcTags(param: string | null): string[] {
	if (!param) return [];
	return param.split(',').filter(Boolean);
}
```

Ajouter l'import en haut du fichier :

```ts
import type { SearchMode } from './components/SearchModeSwitcher/SearchModeSwitcher';
```

- [ ] **Step 2: Ajouter les états dans le hook**

Dans `useSearchFiltersFromUrl`, après la déclaration de `dir` :

```ts
const [mode, setModeState] = useState<SearchMode>(() => parseMode(searchParams.get('mode')));
const [customSourceId, setCustomSourceId] = useState<string | null>(
	() => searchParams.get('source') ?? null
);
const [mpcTagsFilter, setMpcTagsFilter] = useState<string[]>(() =>
	parseMpcTags(searchParams.get('mpcTags'))
);
```

- [ ] **Step 3: Étendre l'effet de sync URL**

Dans le `useEffect` qui fait `router.replace`, ajouter après la ligne `dir` :

```ts
if (mode !== 'official') params.set('mode', mode);
if (customSourceId) params.set('source', customSourceId);
if (mpcTagsFilter.length > 0) params.set('mpcTags', mpcTagsFilter.join(','));
```

Et ajouter `mode`, `customSourceId`, `mpcTagsFilter` dans le tableau de dépendances du `useEffect`.

- [ ] **Step 4: Ajouter `setMode` avec sync immédiat**

```ts
const setMode = (next: SearchMode) => {
	setModeState(next);
};
```

(Le useEffect existant s'occupe de la sync URL — pas besoin d'appel router manuel.)

- [ ] **Step 5: Étendre le type `SearchFilters` et `applyFilters`**

Modifier le type exporté `SearchFilters` :

```ts
export type SearchFilters = {
	colors: ScryfallColor[];
	colorMatch: 'exact' | 'include' | 'atMost';
	type: string;
	set: string;
	rarities: string[];
	oracleText: string;
	cmc: string;
	order: ScryfallSortOrder;
	dir: ScryfallSortDir;
	customSourceId: string | null;
	mpcTagsFilter: string[];
};
```

Modifier `applyFilters` :

```ts
const applyFilters = (filters: SearchFilters) => {
	setColors(filters.colors);
	setColorMatch(filters.colorMatch);
	setType(filters.type);
	setSet(filters.set);
	setRarities(filters.rarities);
	setOracleText(filters.oracleText);
	setCmc(filters.cmc);
	setOrder(filters.order);
	setDir(filters.dir);
	setCustomSourceId(filters.customSourceId);
	setMpcTagsFilter(filters.mpcTagsFilter);
};
```

- [ ] **Step 6: Étendre le return du hook**

```ts
return {
	name,
	setName,
	colors,
	colorMatch,
	type,
	set,
	rarities,
	oracleText,
	cmc,
	order,
	setOrder,
	dir,
	setDir,
	mode,
	setMode,
	customSourceId,
	mpcTagsFilter,
	applyFilters,
	activeFilterCount,
};
```

- [ ] **Step 7: Vérifier que TypeScript compile**

```bash
npm run check
```

Expected: 0 errors TypeScript sur `useSearchFiltersFromUrl.ts` (des erreurs peuvent apparaître dans les fichiers consommateurs — elles seront résolues dans les tâches suivantes).

---

### Task 2: Refactorer `SearchModeSwitcher` en composant contrôlé

**Files:**

- Modify: `src/app/search/components/SearchModeSwitcher/SearchModeSwitcher.tsx`

**Contexte :** Actuellement, le composant lit/écrit `localStorage` via `useSyncExternalStore` et est donc non-contrôlé. Il doit devenir contrôlé : recevoir `value` et `onChange` en props. Supprimer toute logique localStorage.

- [ ] **Step 1: Réécrire le composant**

Remplacer tout le contenu de `SearchModeSwitcher.tsx` par :

```ts
'use client';

import styles from './SearchModeSwitcher.module.css';

export type SearchMode = 'official' | 'all' | 'custom';

const OPTIONS: { value: SearchMode; label: string }[] = [
  { value: 'official', label: 'Officiel' },
  { value: 'all', label: 'Tout' },
  { value: 'custom', label: 'Custom' },
];

type Props = {
  value: SearchMode;
  onChange: (mode: SearchMode) => void;
};

export function SearchModeSwitcher({ value, onChange }: Props) {
  return (
    <div className={styles.switcher} role="group" aria-label="Mode de recherche">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`${styles.option} ${value === opt.value ? styles.active : ''}`}
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Vérifier TypeScript**

```bash
npm run check
```

Expected: erreur dans `page.tsx` sur `SearchModeSwitcher` (prop `value` manquante) — c'est normal, sera corrigé à la tâche 3.

---

### Task 3: Mettre à jour `page.tsx` pour consommer les nouvelles valeurs du hook

**Files:**

- Modify: `src/app/search/page.tsx`

**Contexte :** Supprimer les `useState` locaux pour `mode`, `customSourceId`, `mpcTagsFilter`. Les récupérer depuis `useSearchFiltersFromUrl`. Passer `value` à `SearchModeSwitcher`. Passer `mpcTagsFilter` au `FilterModal`.

- [ ] **Step 1: Supprimer les useState locaux et récupérer depuis le hook**

Dans `SearchPageContent`, remplacer :

```ts
const [mode, setMode] = useState<SearchMode>('official');
const [customSources, setCustomSources] = useState<MpcSourceWithCount[]>([]);
const [customSourceId, setCustomSourceId] = useState<string | null>(null);
```

par :

```ts
const [customSources, setCustomSources] = useState<MpcSourceWithCount[]>([]);
```

Et dans la destructuration de `useSearchFiltersFromUrl`, ajouter :

```ts
const {
	name,
	setName,
	colors,
	colorMatch,
	type,
	set,
	rarities,
	oracleText,
	cmc,
	order,
	setOrder,
	dir,
	setDir,
	mode,
	setMode,
	customSourceId,
	mpcTagsFilter,
	applyFilters,
	activeFilterCount,
} = useSearchFiltersFromUrl();
```

- [ ] **Step 2: Passer `value` à `SearchModeSwitcher`**

Modifier le JSX :

```tsx
<SearchModeSwitcher value={mode} onChange={setMode} />
```

- [ ] **Step 3: Mettre à jour l'appel `onApply` du `FilterModal`**

Modifier le callback `onApply` pour ne plus gérer `customSourceId` séparément (il vient maintenant d'`applyFilters`) :

```tsx
onApply={(filters) => {
  applyFilters(filters);
}}
```

- [ ] **Step 4: Passer `mpcTagsFilter` au `FilterModal`**

Ajouter la prop `mpcTagsFilter` :

```tsx
<FilterModal
	isOpen={isModalOpen}
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
	mpcTagsFilter={mpcTagsFilter}
	onApply={applyFilters}
	onClose={() => setIsModalOpen(false)}
/>
```

- [ ] **Step 5: Mettre à jour `totalActiveFilterCount`**

Le `customSourceId` vient maintenant du hook, donc la ligne :

```ts
const totalActiveFilterCount = activeFilterCount + (customSourceId !== null ? 1 : 0);
```

reste valide — rien à changer ici.

- [ ] **Step 6: Vérifier que TypeScript compile sans erreurs**

```bash
npm run check
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/search/useSearchFiltersFromUrl.ts src/app/search/components/SearchModeSwitcher/SearchModeSwitcher.tsx src/app/search/page.tsx
git commit -m "feat(search): sync mode, customSourceId, mpcTagsFilter to URL"
```

---

### Task 4: Mettre à jour `FilterModal` pour inclure `mpcTagsFilter` dans `onApply`

**Files:**

- Modify: `src/lib/search/components/FilterModal/FilterModal.tsx`

**Contexte :** Le `onApply` du `FilterModal` passe déjà `mpcTagsFilter` dans son payload — mais le type `SearchFilters` importé dans `page.tsx` via `useSearchFiltersFromUrl` doit correspondre au type attendu par `FilterModal.onApply`. Vérifier l'alignement des types et corriger si nécessaire.

- [ ] **Step 1: Aligner le type `onApply` de `FilterModal` avec `SearchFilters`**

Dans `FilterModal.tsx`, le type `onApply` est actuellement :

```ts
onApply: (filters: {
  colors: ScryfallColor[];
  colorMatch: ColorMatch;
  type: string;
  set: string;
  rarities: string[];
  oracleText: string;
  cmc: string;
  order: ScryfallSortOrder;
  dir: ScryfallSortDir;
  customSourceId: string | null;
  cardTypeFilter: CardType | 'all';
  mpcTagsFilter: string[];
}) => void;
```

Importer et utiliser `SearchFilters` depuis `useSearchFiltersFromUrl` n'est pas possible (dépendance circulaire). Laisser le type inline dans `FilterModal`. Vérifier que `page.tsx` passe bien `applyFilters` directement comme `onApply` — TypeScript validera la compatibilité structurelle.

Si TypeScript se plaint d'incompatibilité (`cardTypeFilter` est dans le type de `FilterModal` mais pas dans `SearchFilters`), modifier `applyFilters` dans `useSearchFiltersFromUrl` pour ignorer `cardTypeFilter` :

```ts
const applyFilters = (filters: SearchFilters & { cardTypeFilter?: CardType | 'all' }) => {
	setColors(filters.colors);
	setColorMatch(filters.colorMatch);
	setType(filters.type);
	setSet(filters.set);
	setRarities(filters.rarities);
	setOracleText(filters.oracleText);
	setCmc(filters.cmc);
	setOrder(filters.order);
	setDir(filters.dir);
	setCustomSourceId(filters.customSourceId);
	setMpcTagsFilter(filters.mpcTagsFilter);
};
```

- [ ] **Step 2: Vérifier TypeScript**

```bash
npm run check
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/search/useSearchFiltersFromUrl.ts src/lib/search/components/FilterModal/FilterModal.tsx
git commit -m "fix(search): align FilterModal onApply type with SearchFilters"
```

---

### Task 5: Vérification manuelle dans le navigateur

**Contexte :** Tester que tous les filtres apparaissent bien dans l'URL et sont restaurés à l'hydratation.

- [ ] **Step 1: Démarrer le serveur de dev**

```bash
npm run dev
```

- [ ] **Step 2: Tester `name`**

Aller sur `/search`, taper "lightning bolt" dans la barre. Vérifier que l'URL contient `?name=lightning+bolt`.

- [ ] **Step 3: Tester `mode`**

Cliquer sur "Custom". Vérifier que l'URL contient `mode=custom`. Recharger la page — le bouton "Custom" doit être actif.

- [ ] **Step 4: Tester les filtres du modal**

Ouvrir le modal Filtres, sélectionner une couleur (ex: Rouge), une rareté (ex: rare), cliquer Appliquer. Vérifier que l'URL contient `colors=R&rarities=rare`.

- [ ] **Step 5: Tester `source` et `mpcTags`**

Si des cartes custom existent : ouvrir le modal, sélectionner une source custom et des tags MPC, cliquer Appliquer. Vérifier que l'URL contient `source=<uuid>&mpcTags=<tag>`.

- [ ] **Step 6: Tester la restauration depuis URL**

Copier une URL avec plusieurs params (ex: `/search?name=bolt&mode=all&colors=R&rarities=rare`), ouvrir un nouvel onglet avec cette URL. Vérifier que tous les filtres sont correctement restaurés.

- [ ] **Step 7: Tester le reset**

Ouvrir le modal, cliquer "Réinitialiser", cliquer "Appliquer". Vérifier que l'URL ne contient plus que les params par défaut (ou aucun).
