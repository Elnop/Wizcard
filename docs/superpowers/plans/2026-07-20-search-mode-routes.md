# Routes dédiées par mode de recherche — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le paramètre `?entity=` de `/search` par quatre routes réelles — une landing de recherche fédérée plus une route par mode (cartes, decks, profils).

**Architecture:** Le hook monolithique `useSearchFiltersFromUrl` (372 lignes) éclate en un hook par route, colocalisé avec sa page. Les vues existantes (`CardSearchView`, `DeckSearchView`, `ProfileSearchView`) sont réutilisées telles quelles, seules leurs props changent. La landing appelle les hooks de données existants avec un flag `enabled` et tronque les résultats en amont.

**Tech Stack:** Next.js App Router (RSC + client components), next-intl (routing localisé), TypeScript, CSS Modules, Supabase.

**Spec:** `docs/superpowers/specs/2026-07-20-search-mode-routes-design.md`

## Global Constraints

- **Pas de framework de test.** Aucun vitest/jest dans ce projet. La vérification de chaque tâche est `npm run check` + validation runtime en dev. Ne jamais écrire de fichier `*.test.ts` ni proposer d'en ajouter.
- **`npm run check` n'est PAS vert à la base** — environ 60 problèmes préexistants dans des fichiers non liés. Le critère est « aucun NOUVEAU problème ». Vérifier avec `npx eslint <fichiers modifiés>` sur le périmètre touché, pas sur le repo entier.
- **Navigation localisée** — importer `Link`, `useRouter`, `usePathname`, `redirect` depuis `@/i18n/navigation`, JAMAIS depuis `next/link` ou `next/navigation`. Seuls `useSearchParams`, `notFound` et `useParams` viennent de `next/navigation`. Un import depuis `next/navigation` casse le préfixe de locale (`/fr/...`).
- **Coupure nette sur `?entity=`** — aucune redirection, aucun code de compatibilité. Le paramètre est ignoré.
- **Toute clé i18n ajoutée doit l'être dans `messages/en.json` ET `messages/fr.json`.** Une clé présente dans un seul fichier casse la locale manquante à l'exécution.
- **Les hooks React sont appelés inconditionnellement.** Le déclenchement conditionnel passe par un flag `enabled`, jamais par un appel de hook dans un `if`.
- **Commits fréquents**, un par tâche, en français ou anglais selon la convention du repo (les commits récents sont en anglais, format `type(scope): sujet`).

---

## Structure des fichiers

**Créés :**

| Fichier                                                        | Responsabilité                                                    |
| -------------------------------------------------------------- | ----------------------------------------------------------------- |
| `src/app/[locale]/search/cards/page.tsx`                       | Route cartes : appelle le hook + rend switcher & `CardSearchView` |
| `src/app/[locale]/search/cards/useCardSearchUrlState.ts`       | État d'URL des filtres cartes (~300 l)                            |
| `src/app/[locale]/search/decks/page.tsx`                       | Route decks                                                       |
| `src/app/[locale]/search/decks/useDeckSearchUrlState.ts`       | État d'URL des filtres decks (~50 l)                              |
| `src/app/[locale]/search/profiles/page.tsx`                    | Route profils                                                     |
| `src/app/[locale]/search/profiles/useProfileSearchUrlState.ts` | État d'URL du terme profils (~25 l)                               |
| `src/app/[locale]/search/useLandingSearchUrlState.ts`          | État d'URL du terme landing (~25 l)                               |
| `src/app/[locale]/search/landing.module.css`                   | Styles propres à la landing                                       |

**Modifiés :**

| Fichier                                                                            | Changement                                                                                     |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/app/[locale]/search/page.tsx`                                                 | Devient la landing fédérée                                                                     |
| `src/app/[locale]/search/layout.tsx`                                               | Metadata réduite au périmètre landing                                                          |
| `src/app/[locale]/search/components/SearchEntitySwitcher/SearchEntitySwitcher.tsx` | `<button>` → `<Link>`, actif via `usePathname()`                                               |
| `src/app/[locale]/search/views/DeckSearchView.tsx`                                 | Params renommés (via le type `DeckSearchFilters`, inchangé) — aucun changement de code attendu |
| `src/lib/search/hooks/useDeckSearch.ts`                                            | Ajout du flag `enabled`                                                                        |
| `src/lib/search/hooks/useProfileSearch.ts`                                         | Ajout du flag `enabled`                                                                        |
| `src/lib/search/types.ts`                                                          | Suppression du type `SearchEntity`                                                             |
| `src/app/sitemap.ts`                                                               | 1 entrée `search` → 4 entrées                                                                  |
| `messages/en.json`, `messages/fr.json`                                             | Nouvelles clés `seo.*` et `search.landing*`                                                    |

**Supprimé :**

| Fichier                                              | Raison                          |
| ---------------------------------------------------- | ------------------------------- |
| `src/app/[locale]/search/useSearchFiltersFromUrl.ts` | Éclaté en trois hooks (tâche 3) |

**Ordre des tâches.** Les tâches 1 et 2 sont des prérequis sans dépendance entre elles. Les tâches 3 à 5 créent les trois routes. La tâche 6 construit la landing (dépend de 1 et 2). Les tâches 7 et 8 finalisent SEO et nettoyage.

---

### Task 1: Flag `enabled` sur les hooks de recherche

`useDeckSearch` et `useProfileSearch` lancent leur requête au montage sans condition. La landing sans terme saisi doit n'émettre aucune requête ; ce flag est le prérequis.

**Files:**

- Modify: `src/lib/search/hooks/useDeckSearch.ts:17-40`
- Modify: `src/lib/search/hooks/useProfileSearch.ts:14-38`

**Interfaces:**

- Consumes: rien.
- Produces: `useDeckSearch(filters: DeckSearchFilters, enabled?: boolean)` et `useProfileSearch(term: string, enabled?: boolean)`. Le paramètre vaut `true` par défaut — les appelants existants (`DeckSearchView`, `ProfileSearchView`) ne changent pas. La forme de retour est inchangée : `{ decks | profiles, isLoading, isLoadingMore, hasMore, total, loadMore }`.

- [ ] **Step 1: Ajouter le flag à `useDeckSearch`**

Dans `src/lib/search/hooks/useDeckSearch.ts`, changer la signature et court-circuiter l'effet :

```ts
export function useDeckSearch(filters: DeckSearchFilters, enabled = true) {
	const [decks, setDecks] = useState<DeckSearchResult[]>([]);
	const [total, setTotal] = useState(0);
	const [isLoading, setIsLoading] = useState(false);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const offsetRef = useRef(0);
	const key = JSON.stringify(filters);

	useEffect(() => {
		// La landing monte ce hook sans terme de recherche : sans ce court-circuit
		// elle émettrait une requête pour une section qui n'affiche que du texte
		// de présentation.
		if (!enabled) {
			setDecks([]);
			setTotal(0);
			offsetRef.current = 0;
			return;
		}
		let cancelled = false;
		// eslint-disable-next-line react-hooks/set-state-in-effect -- initializes loading state for async search
		setIsLoading(true);
		offsetRef.current = 0;
		searchDecks(filters, { limit: PAGE, offset: 0 })
			.then((res) => {
				if (cancelled) return;
				setDecks(res.decks);
				setTotal(res.total);
				offsetRef.current = res.decks.length;
			})
			.catch(() => {
				if (!cancelled) {
					setDecks([]);
					setTotal(0);
				}
			})
			.finally(() => {
				if (!cancelled) setIsLoading(false);
			});
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key, enabled]);
```

Le reste du fichier (`loadMore`, le `return`) est inchangé. Noter l'ajout de `enabled` au tableau de dépendances.

- [ ] **Step 2: Ajouter le flag à `useProfileSearch`**

Même transformation dans `src/lib/search/hooks/useProfileSearch.ts` :

```ts
export function useProfileSearch(term: string, enabled = true) {
	const [profiles, setProfiles] = useState<ProfileSearchResult[]>([]);
	const [total, setTotal] = useState(0);
	const [isLoading, setIsLoading] = useState(false);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const offsetRef = useRef(0);

	useEffect(() => {
		// Voir useDeckSearch : la landing sans terme ne doit émettre aucune requête.
		if (!enabled) {
			setProfiles([]);
			setTotal(0);
			offsetRef.current = 0;
			return;
		}
		let cancelled = false;
		// eslint-disable-next-line react-hooks/set-state-in-effect -- initializes loading state for async search
		setIsLoading(true);
		offsetRef.current = 0;
		searchProfiles(term, { limit: PAGE, offset: 0 })
			.then((res) => {
				if (cancelled) return;
				setProfiles(res.profiles);
				setTotal(res.total);
				offsetRef.current = res.profiles.length;
			})
			.catch(() => {
				if (!cancelled) {
					setProfiles([]);
					setTotal(0);
				}
			})
			.finally(() => {
				if (!cancelled) setIsLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [term, enabled]);
```

Le reste du fichier est inchangé.

- [ ] **Step 3: Vérifier**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "useDeckSearch|useProfileSearch" || echo "OK: aucune erreur sur ces fichiers"
npx eslint src/lib/search/hooks/useDeckSearch.ts src/lib/search/hooks/useProfileSearch.ts
```

Attendu : aucune erreur. Les appelants existants compilent sans modification puisque `enabled` a une valeur par défaut.

- [ ] **Step 4: Vérifier runtime**

Lancer `npm run dev`, ouvrir `/search?entity=decks` et `/search?entity=profiles` (le paramètre fonctionne encore à ce stade). Les deux modes doivent continuer à afficher leurs résultats normalement — le flag par défaut ne change rien.

- [ ] **Step 5: Commit**

```bash
git add src/lib/search/hooks/useDeckSearch.ts src/lib/search/hooks/useProfileSearch.ts
git commit -m "feat(search): add enabled flag to deck and profile search hooks"
```

---

### Task 2: Clés i18n

Toutes les clés de texte nécessaires aux tâches suivantes, ajoutées en une fois pour éviter que chaque tâche touche les deux fichiers de messages.

**Files:**

- Modify: `messages/en.json`
- Modify: `messages/fr.json`

**Interfaces:**

- Consumes: rien.
- Produces: sous `search.` — `landingPlaceholder`, `landingCardsTitle`, `landingCardsPitch`, `landingDecksTitle`, `landingDecksPitch`, `landingProfilesTitle`, `landingProfilesPitch`, `landingSeeMore`, `landingNoResults`. Sous `seo.` — les objets `searchCards`, `searchDecks`, `searchProfiles`, chacun `{ title, description }`, plus la réécriture de `seo.search`.

- [ ] **Step 1: Ajouter les clés dans `messages/en.json`**

Dans l'objet `search` (ligne ~682), ajouter à la suite des clés existantes :

```json
"landingPlaceholder": "Search cards, decks, and players…",
"landingCardsTitle": "Cards",
"landingCardsPitch": "Filter every Magic card by color, type, mana cost, set, and rarity.",
"landingDecksTitle": "Decks",
"landingDecksPitch": "Browse public decks by format, commander, author, or a card they run.",
"landingProfilesTitle": "Players",
"landingProfilesPitch": "Find a player by nickname and explore their decks and collection.",
"landingSeeMore": "See more",
"landingNoResults": "No results"
```

Dans l'objet `seo` (ligne ~818), remplacer l'objet `search` existant et ajouter les trois nouveaux :

```json
"search": {
	"title": "Search",
	"description": "Search Magic: The Gathering cards, public decks, and players — all from one place."
},
"searchCards": {
	"title": "Card Search",
	"description": "Search every Magic: The Gathering card by name, color, type, and set."
},
"searchDecks": {
	"title": "Deck Search",
	"description": "Browse public Magic: The Gathering decks by format, commander, and author."
},
"searchProfiles": {
	"title": "Player Search",
	"description": "Find Magic: The Gathering players and explore their public decks and collections."
}
```

- [ ] **Step 2: Ajouter les mêmes clés dans `messages/fr.json`**

Dans l'objet `search` :

```json
"landingPlaceholder": "Rechercher des cartes, des decks, des joueurs…",
"landingCardsTitle": "Cartes",
"landingCardsPitch": "Filtrez toutes les cartes Magic par couleur, type, coût de mana, édition et rareté.",
"landingDecksTitle": "Decks",
"landingDecksPitch": "Parcourez les decks publics par format, commandant, auteur ou carte jouée.",
"landingProfilesTitle": "Joueurs",
"landingProfilesPitch": "Trouvez un joueur par son pseudo et explorez ses decks et sa collection.",
"landingSeeMore": "Voir plus",
"landingNoResults": "Aucun résultat"
```

Dans l'objet `seo` :

```json
"search": {
	"title": "Recherche",
	"description": "Recherchez des cartes Magic: The Gathering, des decks publics et des joueurs, au même endroit."
},
"searchCards": {
	"title": "Recherche de cartes",
	"description": "Recherchez toutes les cartes Magic: The Gathering par nom, couleur, type et édition."
},
"searchDecks": {
	"title": "Recherche de decks",
	"description": "Parcourez les decks Magic: The Gathering publics par format, commandant et auteur."
},
"searchProfiles": {
	"title": "Recherche de joueurs",
	"description": "Trouvez des joueurs Magic: The Gathering et explorez leurs decks et collections publics."
}
```

- [ ] **Step 3: Vérifier la parité des clés entre les deux locales**

```bash
python3 -c "
import json
en=json.load(open('messages/en.json')); fr=json.load(open('messages/fr.json'))
for ns in ('search','seo'):
    a,b=set(en[ns]),set(fr[ns])
    assert a==b, f'{ns} désynchronisé: en-only={a-b} fr-only={b-a}'
print('OK: clés search et seo identiques dans les deux locales')
"
```

Attendu : `OK: clés search et seo identiques dans les deux locales`.

- [ ] **Step 4: Commit**

```bash
git add messages/en.json messages/fr.json
git commit -m "feat(search): add i18n keys for search landing and per-mode SEO"
```

---

### Task 3: Route `/search/cards`

Extrait l'état d'URL des cartes du hook monolithique et crée la première route dédiée. Le fichier source `useSearchFiltersFromUrl.ts` n'est PAS encore supprimé — la landing actuelle l'utilise toujours jusqu'à la tâche 6.

**Files:**

- Create: `src/app/[locale]/search/cards/useCardSearchUrlState.ts`
- Create: `src/app/[locale]/search/cards/page.tsx`
- Read for reference: `src/app/[locale]/search/useSearchFiltersFromUrl.ts`

**Interfaces:**

- Consumes: `SearchEntitySwitcher` (tâche 4 le convertit en `<Link>` ; ici on le rend avec ses props actuelles si la tâche 4 n'est pas encore faite — voir Step 3).
- Produces: `useCardSearchUrlState()` retournant exactement les champs que `CardSearchView` destructure : `name`, `setName`, `colors`, `colorMatch`, `colorIdentity`, `colorIdentityMatch`, `type`, `set`, `rarities`, `oracleText`, `cmc`, `order`, `setOrder`, `dir`, `setDir`, `mode`, `setMode`, `customSourceId`, `mpcTags`, `includeMultilingual`, `setIncludeMultilingual`, `applyFilters`, `activeFilterCount`. Plus le type exporté `SearchFilters`.

- [ ] **Step 1: Créer `useCardSearchUrlState.ts`**

Copier `src/app/[locale]/search/useSearchFiltersFromUrl.ts` vers `src/app/[locale]/search/cards/useCardSearchUrlState.ts`, puis retirer tout ce qui concerne les autres entités :

1. Renommer la fonction exportée : `useSearchFiltersFromUrl` → `useCardSearchUrlState`.
2. Supprimer les imports devenus inutiles : `SearchEntity`, `DeckSearchFilters`, `PreconFilter`, `DEFAULT_DECK_FILTERS`.
3. Supprimer les constantes `VALID_ENTITIES` et `VALID_PRECON_FILTERS`, et les fonctions `parseEntity` et `parsePreconFilter`.
4. Dans le type `UrlSyncState`, supprimer les champs `entity`, `profileTerm`, `deckFilters`.
5. Supprimer entièrement la fonction `appendDeckFilterParams`.
6. Dans `buildSearchParams`, supprimer les trois dernières lignes avant le `return` :
   ```ts
   if (state.entity !== 'cards') params.set('entity', state.entity);
   if (state.profileTerm) params.set('pq', state.profileTerm);
   appendDeckFilterParams(params, state.deckFilters);
   ```
7. Supprimer les trois déclarations d'état `entity`, `profileTerm`, `deckFilters` (lignes ~242-252 de l'original).
8. Retirer `entity`, `profileTerm`, `deckFilters` de l'objet passé à `buildSearchParams`, du tableau de dépendances de l'effet, et de l'objet retourné (ainsi que `setEntity`, `setProfileTerm`, `setDeckFilters`).
9. Changer la cible du `router.replace` :
   ```ts
   router.replace(queryString ? `/search/cards?${queryString}` : '/search/cards', {
   	scroll: false,
   });
   ```

Tout le reste — les parseurs `parseColors`/`parseOrder`/`parseDir`/`parseColorMatch`/`parseColorIdentityMatch`/`parseRarities`/`parseMode`/`parseTags`/`parseMpcTags`, la logique `mlParamValue`, le garde `isInitialMount`, `applyFilters`, `activeFilterCount` — est repris **tel quel**. Le garde `isInitialMount` est essentiel : il empêche un `router.replace` parasite au montage.

- [ ] **Step 2: Vérifier l'extraction**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "useCardSearchUrlState" || echo "OK"
grep -cE "entity|profileTerm|deckFilters|appendDeckFilterParams" "src/app/[locale]/search/cards/useCardSearchUrlState.ts"
```

Attendu : `OK`, puis `0` — plus aucune trace des autres entités dans le hook cartes.

- [ ] **Step 3: Créer la page `/search/cards`**

```tsx
'use client';

import { Suspense } from 'react';
import { Spinner } from '@/components/Spinner/Spinner';
import { SearchEntitySwitcher } from '../components/SearchEntitySwitcher/SearchEntitySwitcher';
import { CardSearchView } from '../views/CardSearchView';
import { useCardSearchUrlState } from './useCardSearchUrlState';
import styles from '../page.module.css';

export default function SearchCardsPage() {
	return (
		<Suspense
			fallback={
				<div className={styles.page}>
					<main className={styles.main}>
						<div className={styles.loading}>
							<Spinner size="lg" />
						</div>
					</main>
				</div>
			}
		>
			<SearchCardsContent />
		</Suspense>
	);
}

function SearchCardsContent() {
	const cardState = useCardSearchUrlState();
	return (
		<div className={styles.page}>
			<main className={styles.main}>
				<div className={styles.searchSection}>
					<SearchEntitySwitcher />
				</div>
				<CardSearchView cardState={cardState} />
			</main>
		</div>
	);
}
```

Le `<Suspense>` est requis : `useSearchParams` force le rendu client, et sans frontière Suspense le build Next échoue avec une erreur de prerendering.

`<SearchEntitySwitcher />` est appelé **sans props** — la tâche 4 le convertit pour qu'il détermine l'onglet actif via `usePathname()`. Si la tâche 4 n'est pas encore faite, TypeScript signalera les props manquantes ; c'est attendu et résolu par la tâche 4. Pour garder cette tâche compilable isolément, faire la tâche 4 avant de lancer `npm run check`.

- [ ] **Step 4: Mettre à jour le type de prop de `CardSearchView`**

Dans `src/app/[locale]/search/views/CardSearchView.tsx`, l'import de type pointe vers l'ancien hook. Remplacer :

```ts
import type { useSearchFiltersFromUrl } from '../useSearchFiltersFromUrl';
```

par :

```ts
import type { useCardSearchUrlState } from '../cards/useCardSearchUrlState';
```

et le type de props :

```ts
type CardSearchViewProps = {
	cardState: ReturnType<typeof useCardSearchUrlState>;
};
```

Aucun autre changement dans ce fichier : `CardSearchView` ne destructure que des champs cartes, vérifié.

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/search/cards" "src/app/[locale]/search/views/CardSearchView.tsx"
git commit -m "feat(search): add dedicated /search/cards route"
```

---

### Task 4: Switcher en liens + routes decks et profils

Convertit le switcher en navigation par `<Link>` et crée les deux routes restantes. Groupées parce que le switcher sans props ne compile qu'une fois converti, et que les deux routes sont symétriques et triviales.

**Files:**

- Modify: `src/app/[locale]/search/components/SearchEntitySwitcher/SearchEntitySwitcher.tsx`
- Create: `src/app/[locale]/search/decks/useDeckSearchUrlState.ts`
- Create: `src/app/[locale]/search/decks/page.tsx`
- Create: `src/app/[locale]/search/profiles/useProfileSearchUrlState.ts`
- Create: `src/app/[locale]/search/profiles/page.tsx`

**Interfaces:**

- Consumes: `DeckSearchFilters` et `DEFAULT_DECK_FILTERS` depuis `@/lib/search/types` ; `PreconFilter` idem.
- Produces: `SearchEntitySwitcher` sans props. `useDeckSearchUrlState()` → `{ filters: DeckSearchFilters, setFilters: (f: DeckSearchFilters) => void }`. `useProfileSearchUrlState()` → `{ term: string, setTerm: (t: string) => void }`.

- [ ] **Step 1: Convertir le switcher en `<Link>`**

Remplacer intégralement `SearchEntitySwitcher.tsx` :

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import styles from './SearchEntitySwitcher.module.css';

/** Les trois modes de recherche, dans l'ordre d'affichage. `href` est le chemin
 * SANS préfixe de locale — `Link` de `@/i18n/navigation` l'ajoute. */
const ENTITIES = [
	{ href: '/search/cards', labelKey: 'entityCards' },
	{ href: '/search/decks', labelKey: 'entityDecks' },
	{ href: '/search/profiles', labelKey: 'entityProfiles' },
] as const;

export function SearchEntitySwitcher() {
	const t = useTranslations('search');
	const pathname = usePathname();

	return (
		<nav className={styles.switcher} aria-label={t('entityAriaLabel')}>
			{ENTITIES.map(({ href, labelKey }) => {
				const isActive = pathname === href;
				return (
					<Link
						key={href}
						href={href}
						className={`${styles.option} ${isActive ? styles.active : ''}`}
						aria-current={isActive ? 'page' : undefined}
					>
						{t(labelKey)}
					</Link>
				);
			})}
		</nav>
	);
}
```

Points d'attention : `usePathname` de `@/i18n/navigation` retourne le chemin **sans** préfixe de locale, donc la comparaison avec `/search/cards` fonctionne dans les deux locales. `role="group"` devient `<nav>` et `aria-pressed` devient `aria-current="page"`, sémantique correcte pour de la navigation.

Le CSS n'est pas à modifier : `.option` et `.active` s'appliquent identiquement à un `<a>`. Vérifier tout de même que `.option` ne pose pas de style spécifique à `<button>` :

```bash
grep -A12 "^\.option" "src/app/[locale]/search/components/SearchEntitySwitcher/SearchEntitySwitcher.module.css"
```

Si une règle `border: none` ou `background: none` y figure, elle est inoffensive sur un `<a>`. Ajouter `text-decoration: none;` à `.option` si absent.

- [ ] **Step 2: Créer `useDeckSearchUrlState.ts`**

```ts
'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { DEFAULT_DECK_FILTERS } from '@/lib/search/types';
import type { DeckSearchFilters, PreconFilter } from '@/lib/search/types';

const VALID_PRECON_FILTERS = new Set(['all', 'only', 'exclude']);

function parsePreconFilter(param: string | null): PreconFilter {
	if (param && VALID_PRECON_FILTERS.has(param)) return param as PreconFilter;
	return 'all';
}

/** Sérialise les filtres decks en query string. Les paramètres n'ont plus le
 * préfixe `d` : la route dédiée écarte toute collision avec ceux des cartes. */
function buildDeckParams(filters: DeckSearchFilters): URLSearchParams {
	const params = new URLSearchParams();
	if (filters.name) params.set('name', filters.name);
	if (filters.formats.length > 0) params.set('formats', filters.formats.join(','));
	if (filters.authorNickname) params.set('author', filters.authorNickname);
	if (filters.cardInBoard) params.set('card', filters.cardInBoard);
	if (filters.commander) params.set('commander', filters.commander);
	if (filters.precon !== 'all') params.set('precon', filters.precon);
	return params;
}

export function useDeckSearchUrlState() {
	const router = useRouter();
	const searchParams = useSearchParams();

	const [filters, setFilters] = useState<DeckSearchFilters>(() => ({
		name: searchParams.get('name') ?? DEFAULT_DECK_FILTERS.name,
		formats: (searchParams.get('formats')?.split(',').filter(Boolean) ??
			DEFAULT_DECK_FILTERS.formats) as DeckSearchFilters['formats'],
		authorNickname: searchParams.get('author') ?? DEFAULT_DECK_FILTERS.authorNickname,
		cardInBoard: searchParams.get('card') ?? DEFAULT_DECK_FILTERS.cardInBoard,
		commander: searchParams.get('commander') ?? DEFAULT_DECK_FILTERS.commander,
		precon: parsePreconFilter(searchParams.get('precon')),
	}));

	// Sans ce garde, le premier rendu réécrirait l'URL et écraserait les
	// paramètres entrants d'un lien partagé.
	const isInitialMount = useRef(true);

	useEffect(() => {
		if (isInitialMount.current) {
			isInitialMount.current = false;
			return;
		}
		const queryString = buildDeckParams(filters).toString();
		router.replace(queryString ? `/search/decks?${queryString}` : '/search/decks', {
			scroll: false,
		});
	}, [filters, router]);

	return { filters, setFilters };
}
```

- [ ] **Step 3: Créer la page `/search/decks`**

```tsx
'use client';

import { Suspense } from 'react';
import { Spinner } from '@/components/Spinner/Spinner';
import { SearchEntitySwitcher } from '../components/SearchEntitySwitcher/SearchEntitySwitcher';
import { DeckSearchView } from '../views/DeckSearchView';
import { useDeckSearchUrlState } from './useDeckSearchUrlState';
import styles from '../page.module.css';

export default function SearchDecksPage() {
	return (
		<Suspense
			fallback={
				<div className={styles.page}>
					<main className={styles.main}>
						<div className={styles.loading}>
							<Spinner size="lg" />
						</div>
					</main>
				</div>
			}
		>
			<SearchDecksContent />
		</Suspense>
	);
}

function SearchDecksContent() {
	const { filters, setFilters } = useDeckSearchUrlState();
	return (
		<div className={styles.page}>
			<main className={styles.main}>
				<div className={styles.searchSection}>
					<SearchEntitySwitcher />
				</div>
				<DeckSearchView filters={filters} onFiltersChange={setFilters} />
			</main>
		</div>
	);
}
```

- [ ] **Step 4: Créer `useProfileSearchUrlState.ts`**

```ts
'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';

export function useProfileSearchUrlState() {
	const router = useRouter();
	const searchParams = useSearchParams();

	const [term, setTerm] = useState(() => searchParams.get('q') ?? '');

	// Voir useDeckSearchUrlState : évite d'écraser un lien partagé au montage.
	const isInitialMount = useRef(true);

	useEffect(() => {
		if (isInitialMount.current) {
			isInitialMount.current = false;
			return;
		}
		const params = new URLSearchParams();
		if (term) params.set('q', term);
		const queryString = params.toString();
		router.replace(queryString ? `/search/profiles?${queryString}` : '/search/profiles', {
			scroll: false,
		});
	}, [term, router]);

	return { term, setTerm };
}
```

- [ ] **Step 5: Créer la page `/search/profiles`**

```tsx
'use client';

import { Suspense } from 'react';
import { Spinner } from '@/components/Spinner/Spinner';
import { SearchEntitySwitcher } from '../components/SearchEntitySwitcher/SearchEntitySwitcher';
import { ProfileSearchView } from '../views/ProfileSearchView';
import { useProfileSearchUrlState } from './useProfileSearchUrlState';
import styles from '../page.module.css';

export default function SearchProfilesPage() {
	return (
		<Suspense
			fallback={
				<div className={styles.page}>
					<main className={styles.main}>
						<div className={styles.loading}>
							<Spinner size="lg" />
						</div>
					</main>
				</div>
			}
		>
			<SearchProfilesContent />
		</Suspense>
	);
}

function SearchProfilesContent() {
	const { term, setTerm } = useProfileSearchUrlState();
	return (
		<div className={styles.page}>
			<main className={styles.main}>
				<div className={styles.searchSection}>
					<SearchEntitySwitcher />
				</div>
				<ProfileSearchView term={term} onTermChange={setTerm} />
			</main>
		</div>
	);
}
```

- [ ] **Step 6: Vérifier**

```bash
npx eslint "src/app/[locale]/search/cards" "src/app/[locale]/search/decks" "src/app/[locale]/search/profiles" "src/app/[locale]/search/components/SearchEntitySwitcher"
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "search/(cards|decks|profiles)|SearchEntitySwitcher" || echo "OK: aucune erreur sur les nouvelles routes"
```

Attendu : aucune erreur.

- [ ] **Step 7: Vérifier runtime**

`npm run dev`, puis pour chaque route :

| URL                | Attendu                                                                    |
| ------------------ | -------------------------------------------------------------------------- |
| `/search/cards`    | Recherche cartes, onglet « Cards » actif                                   |
| `/search/decks`    | Recherche decks, onglet « Decks » actif                                    |
| `/search/profiles` | Recherche profils, onglet « Profiles » actif                               |
| `/fr/search/decks` | Idem en français, onglet actif correct (valide `usePathname` sans préfixe) |

Taper un nom dans la recherche decks → l'URL devient `/search/decks?name=…` **sans préfixe `d`**. Recharger la page → le filtre est conservé. Cliquer un onglet → navigation, et clic-milieu → ouverture dans un nouvel onglet (ce que les `<button>` ne permettaient pas).

- [ ] **Step 8: Commit**

```bash
git add "src/app/[locale]/search"
git commit -m "feat(search): link-based mode switcher and dedicated deck/profile routes"
```

---

### Task 5: Landing fédérée `/search`

Remplace la page `/search` par la recherche fédérée : barre unifiée, trois sections bornées, présentation de la feature tant que rien n'est saisi.

**Files:**

- Create: `src/app/[locale]/search/useLandingSearchUrlState.ts`
- Create: `src/app/[locale]/search/landing.module.css`
- Modify: `src/app/[locale]/search/page.tsx` (remplacement intégral)

**Interfaces:**

- Consumes: `useLandingSearchUrlState()` (créé ici) ; `useDeckSearch(filters, enabled)` et `useProfileSearch(term, enabled)` de la tâche 1 ; les clés i18n de la tâche 2 ; `CardList`, `DeckCard`, `ProfileCard`, `SearchBar` existants.
- Produces: rien que les tâches suivantes consomment.

- [ ] **Step 1: Créer `useLandingSearchUrlState.ts`**

```ts
'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';

export function useLandingSearchUrlState() {
	const router = useRouter();
	const searchParams = useSearchParams();

	const [term, setTerm] = useState(() => searchParams.get('q') ?? '');

	// Voir useDeckSearchUrlState : évite d'écraser un lien partagé au montage.
	const isInitialMount = useRef(true);

	useEffect(() => {
		if (isInitialMount.current) {
			isInitialMount.current = false;
			return;
		}
		const params = new URLSearchParams();
		if (term) params.set('q', term);
		const queryString = params.toString();
		router.replace(queryString ? `/search?${queryString}` : '/search', { scroll: false });
	}, [term, router]);

	return { term, setTerm };
}
```

- [ ] **Step 2: Créer `landing.module.css`**

```css
.sections {
	display: flex;
	flex-direction: column;
	gap: 2.5rem;
	margin-top: 2rem;
}

.section {
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

.sectionHeader {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 1rem;
	border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.1));
	padding-bottom: 0.5rem;
}

.sectionTitle {
	font-size: 1.25rem;
	font-weight: 600;
	margin: 0;
}

.seeMore {
	font-size: 0.875rem;
	white-space: nowrap;
	text-decoration: none;
	opacity: 0.85;
}

.seeMore:hover {
	opacity: 1;
	text-decoration: underline;
}

.pitch {
	margin: 0;
	opacity: 0.7;
	line-height: 1.5;
}

.sectionEmpty {
	padding: 0.5rem 0 1rem;
}
```

Les valeurs de `var(--border, …)` reprennent la convention du projet ; si une variable de bordure existe déjà dans le thème global, l'utiliser à la place. Vérifier avec :

```bash
grep -rn "^\s*--border" src/app/globals.css src/styles 2>/dev/null | head -5
```

- [ ] **Step 3: Écrire la landing**

Remplacer intégralement `src/app/[locale]/search/page.tsx` :

```tsx
'use client';

import { Suspense, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { Spinner } from '@/components/Spinner/Spinner';
import { SearchBar } from '@/lib/search/components/SearchBar/SearchBar';
import { CardList } from '@/lib/card/components/CardList/CardList';
import { DeckCard } from '@/app/[locale]/decks/components/DeckCard/DeckCard';
import { ProfileCard } from '@/lib/search/components/ProfileCard/ProfileCard';
import { useScryfallCardSearch } from '@/lib/scryfall/hooks/useScryfallCardSearch';
import { useDeckSearch } from '@/lib/search/hooks/useDeckSearch';
import { useProfileSearch } from '@/lib/search/hooks/useProfileSearch';
import { useProfileStats } from '@/lib/search/hooks/useProfileStats';
import { useDeckSummaries } from '@/app/[locale]/decks/useDeckSummaries';
import { useScryfallSymbols } from '@/lib/scryfall/hooks/useScryfallSymbols';
import { useDebounce } from '@/lib/search/hooks/useDebounce';
import { DEFAULT_DECK_FILTERS } from '@/lib/search/types';
import { useLandingSearchUrlState } from './useLandingSearchUrlState';
import styles from './page.module.css';
import landing from './landing.module.css';

/** Nombre d'éléments par section. Les cartes sont larges et les profils
 * compacts : ces limites donnent des rangées de hauteur comparable. */
const CARD_LIMIT = 6;
const DECK_LIMIT = 3;
const PROFILE_LIMIT = 4;

export default function SearchLandingPage() {
	return (
		<Suspense
			fallback={
				<div className={styles.page}>
					<main className={styles.main}>
						<div className={styles.loading}>
							<Spinner size="lg" />
						</div>
					</main>
				</div>
			}
		>
			<SearchLandingContent />
		</Suspense>
	);
}

function SearchLandingContent() {
	const t = useTranslations('search');
	const { term, setTerm } = useLandingSearchUrlState();
	// `useScryfallCardSearch` débounce `filters.name` en interne (300 ms), mais pas
	// `useDeckSearch` / `useProfileSearch`. On débounce donc ici pour ces deux-là et
	// on passe `term` brut à la section cartes, sinon le délai s'applique deux fois.
	const debounced = useDebounce(term, 300);
	const hasTerm = debounced.trim().length > 0;

	return (
		<div className={styles.page}>
			<main className={styles.main}>
				<div className={styles.searchRow}>
					<SearchBar value={term} onChange={setTerm} placeholder={t('landingPlaceholder')} />
				</div>

				<div className={landing.sections}>
					{/* La section cartes reçoit `term` brut : son hook débounce lui-même.
					    Le `enabled` reste calculé sur la valeur débouncée pour que les
					    trois sections basculent ensemble entre pitch et résultats. */}
					<CardsSection term={term} enabled={hasTerm} />
					<DecksSection term={debounced} enabled={hasTerm} />
					<ProfilesSection term={debounced} enabled={hasTerm} />
				</div>
			</main>
		</div>
	);
}

/** En-tête commun aux trois sections : titre + lien « Voir plus » vers la route
 * dédiée, avec le terme courant pré-rempli sur le paramètre de cette entité. */
function SectionHeader({ title, href }: { title: string; href: string }) {
	const t = useTranslations('search');
	return (
		<div className={landing.sectionHeader}>
			<h2 className={landing.sectionTitle}>{title}</h2>
			<Link href={href} className={landing.seeMore}>
				{t('landingSeeMore')} →
			</Link>
		</div>
	);
}

function CardsSection({ term, enabled }: { term: string; enabled: boolean }) {
	const t = useTranslations('search');

	// Filtres neutres : la landing ne fait qu'une recherche par nom, les filtres
	// avancés vivent sur /search/cards. Mémoïsé car le hook a l'objet en dépendance.
	const filters = useMemo(
		() => ({
			name: term,
			colors: [],
			type: [],
			set: '',
			rarities: [],
			oracleText: '',
			cmc: '',
		}),
		[term]
	);

	const { cards, isLoading } = useScryfallCardSearch(filters, { enabled });

	const href = `/search/cards?name=${encodeURIComponent(term)}`;
	// `useScryfallCardSearch` CONSERVE ses derniers `cards` quand `enabled` repasse
	// à false (documenté dans le hook) : sans ce garde, vider le champ laisserait
	// les résultats précédents affichés à la place du pitch.
	const shown = useMemo(() => (enabled ? cards.slice(0, CARD_LIMIT) : []), [cards, enabled]);

	return (
		<section className={landing.section}>
			<SectionHeader title={t('landingCardsTitle')} href={enabled ? href : '/search/cards'} />
			{!enabled ? (
				<p className={`${landing.pitch} ${landing.sectionEmpty}`}>{t('landingCardsPitch')}</p>
			) : isLoading ? (
				<div className={styles.loading}>
					<Spinner size="md" />
				</div>
			) : shown.length === 0 ? (
				<p className={`${landing.pitch} ${landing.sectionEmpty}`}>{t('landingNoResults')}</p>
			) : (
				<CardList cards={shown} pageSize={false} viewModes={['grid']} />
			)}
		</section>
	);
}

function DecksSection({ term, enabled }: { term: string; enabled: boolean }) {
	const t = useTranslations('search');
	const router = useRouter();
	const symbolMap = useScryfallSymbols();

	const filters = useMemo(() => ({ ...DEFAULT_DECK_FILTERS, name: term }), [term]);
	const { decks, isLoading } = useDeckSearch(filters, enabled);

	const shown = useMemo(() => decks.slice(0, DECK_LIMIT), [decks]);
	const deckMetas = useMemo(() => shown.map((d) => d.deck), [shown]);
	const summaryMap = useDeckSummaries(deckMetas);

	const href = `/search/decks?name=${encodeURIComponent(term)}`;

	return (
		<section className={landing.section}>
			<SectionHeader title={t('landingDecksTitle')} href={enabled ? href : '/search/decks'} />
			{!enabled ? (
				<p className={`${landing.pitch} ${landing.sectionEmpty}`}>{t('landingDecksPitch')}</p>
			) : isLoading ? (
				<div className={styles.loading}>
					<Spinner size="md" />
				</div>
			) : shown.length === 0 ? (
				<p className={`${landing.pitch} ${landing.sectionEmpty}`}>{t('landingNoResults')}</p>
			) : (
				<div className={styles.deckGrid}>
					{shown.map(({ deck, authorNickname }) => (
						<DeckCard
							key={deck.id}
							deck={deck}
							summary={summaryMap[deck.id]}
							symbolMap={symbolMap}
							authorNickname={authorNickname}
							isPrecon={deck.source === 'mtgjson'}
							readOnly
							onClick={() => router.push(`/decks/${deck.id}`)}
						/>
					))}
				</div>
			)}
		</section>
	);
}

function ProfilesSection({ term, enabled }: { term: string; enabled: boolean }) {
	const t = useTranslations('search');
	const { profiles, isLoading } = useProfileSearch(term, enabled);

	const shown = useMemo(() => profiles.slice(0, PROFILE_LIMIT), [profiles]);
	const ownerIds = useMemo(() => shown.map((p) => p.id), [shown]);
	const statsMap = useProfileStats(ownerIds);

	const href = `/search/profiles?q=${encodeURIComponent(term)}`;

	return (
		<section className={landing.section}>
			<SectionHeader title={t('landingProfilesTitle')} href={enabled ? href : '/search/profiles'} />
			{!enabled ? (
				<p className={`${landing.pitch} ${landing.sectionEmpty}`}>{t('landingProfilesPitch')}</p>
			) : isLoading ? (
				<div className={styles.loading}>
					<Spinner size="md" />
				</div>
			) : shown.length === 0 ? (
				<p className={`${landing.pitch} ${landing.sectionEmpty}`}>{t('landingNoResults')}</p>
			) : (
				<div className={styles.profileGrid}>
					{shown.map((p) => (
						<ProfileCard key={p.id} profile={p} stats={statsMap[p.id]} />
					))}
				</div>
			)}
		</section>
	);
}
```

**Signatures confirmées** (lues à l'écriture du plan, `src/lib/scryfall/hooks/useScryfallCardSearch.ts:15-56` et `src/lib/search/hooks/useDebounce.ts`) :

- `useScryfallCardSearch(filters: SearchFilters, options?: { enabled?: boolean })` — **le flag `enabled` existe déjà** sur ce hook, contrairement à `useDeckSearch`/`useProfileSearch` que la tâche 1 doit modifier. Dans `SearchFilters`, seuls `name`, `colors`, `type`, `set`, `rarities`, `oracleText`, `cmc` sont requis ; tout le reste est optionnel et omis ici.
- Le hook **débounce `filters.name` en interne** sur 300 ms (`useDebounce(filters.name, 300)`), d'où le `term` brut passé à cette section.
- `useDebounce<T>(value: T, delay: number): T`.

**Piège documenté dans le hook** : quand `enabled` passe à `false`, les requêtes en vol sont annulées mais `cards` et `isLoading` **gardent leurs dernières valeurs**. Le commentaire du hook l'énonce explicitement — « callers must gate their rendering on the same condition ». D'où le garde `enabled ? cards.slice(…) : []` ci-dessus : sans lui, vider le champ de recherche laisserait les résultats précédents affichés à la place du pitch.

- [ ] **Step 4: Vérifier**

```bash
npx eslint "src/app/[locale]/search/page.tsx" "src/app/[locale]/search/useLandingSearchUrlState.ts"
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "search/page" || echo "OK"
```

Attendu : aucune erreur.

- [ ] **Step 5: Vérifier runtime — le point critique**

`npm run dev`, ouvrir `/search` avec l'onglet **Réseau** des devtools ouvert :

| Vérification                           | Attendu                                                                                                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chargement de `/search` sans terme     | Les 3 sections affichent leur pitch. **Zéro requête** vers Supabase ou Scryfall. C'est le point que la tâche 1 rend possible — si des requêtes partent, le flag `enabled` n'est pas câblé. |
| Taper « bolt »                         | Après le débounce, les 3 sections se peuplent : ≤6 cartes, ≤3 decks, ≤4 profils                                                                                                            |
| L'URL                                  | devient `/search?q=bolt`                                                                                                                                                                   |
| Recharger `/search?q=bolt`             | Le terme est restauré et les sections se peuplent                                                                                                                                          |
| Section cartes                         | Aucun bouton « charger plus », aucun sélecteur grille/tableau (effet de `pageSize={false}` et `viewModes={['grid']}`)                                                                      |
| **Vider le champ après une recherche** | Les 3 sections reviennent au pitch. Si la section cartes garde ses résultats, le garde `enabled ? … : []` manque (voir Step 3).                                                            |
| « Voir plus » cartes                   | Mène à `/search/cards?name=bolt`, recherche pré-remplie                                                                                                                                    |
| « Voir plus » decks                    | Mène à `/search/decks?name=bolt`                                                                                                                                                           |
| « Voir plus » profils                  | Mène à `/search/profiles?q=bolt`                                                                                                                                                           |
| Vider le champ                         | Les sections reviennent à leur pitch                                                                                                                                                       |

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/search/page.tsx" "src/app/[locale]/search/useLandingSearchUrlState.ts" "src/app/[locale]/search/landing.module.css"
git commit -m "feat(search): federated search landing at /search"
```

---

### Task 6: Metadata par route et sitemap

Chaque route reçoit son canonical propre. Sans ça, les quatre pages héritent du canonical `/fr/search` du layout et se déclarent comme une seule page — exactement le problème de cannibalisation que ce chantier doit résoudre.

**Files:**

- Modify: `src/app/[locale]/search/layout.tsx`
- Create: metadata dans les 3 sous-pages (voir Step 2)
- Modify: `src/app/sitemap.ts:41`

**Interfaces:**

- Consumes: `buildAlternates(locale, path)` de `@/lib/seo/alternates` ; les clés i18n de la tâche 2.
- Produces: rien.

- [ ] **Step 1: Restreindre le layout à la landing**

`src/app/[locale]/search/layout.tsx` : la metadata qu'il pose ne doit plus valoir que pour `/search`, les sous-routes définissant la leur. Le contenu actuel convient déjà pour la landing (il pointe sur `seo.search` et `buildAlternates(locale, 'search')`, tous deux mis à jour en tâche 2), donc **aucune modification n'est nécessaire** — mais ajouter un commentaire pour éviter qu'un futur lecteur croie que cette metadata couvre les sous-routes :

```tsx
/**
 * Metadata de la landing `/search` uniquement. Chaque sous-route
 * (`cards`, `decks`, `profiles`) définit son propre `generateMetadata` avec son
 * canonical : sans ça toutes hériteraient de `/search` et se déclareraient comme
 * une seule et même page.
 */
export async function generateMetadata({
```

- [ ] **Step 2: Ajouter `generateMetadata` aux trois sous-pages**

Problème : les trois `page.tsx` sont des Client Components (`'use client'`), et un Client Component ne peut pas exporter `generateMetadata`. La solution conforme à App Router est d'ajouter un `layout.tsx` serveur par sous-route.

Créer `src/app/[locale]/search/cards/layout.tsx` :

```tsx
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildAlternates } from '@/lib/seo/alternates';

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: 'seo.searchCards' });
	return {
		title: t('title'),
		description: t('description'),
		alternates: buildAlternates(locale, 'search/cards'),
		robots: { index: true, follow: true },
	};
}

export default function SearchCardsLayout({ children }: { children: React.ReactNode }) {
	return children;
}
```

Créer `src/app/[locale]/search/decks/layout.tsx`, identique en remplaçant `searchCards` → `searchDecks`, `'search/cards'` → `'search/decks'`, et le nom de fonction → `SearchDecksLayout`.

Créer `src/app/[locale]/search/profiles/layout.tsx`, identique avec `searchProfiles`, `'search/profiles'`, `SearchProfilesLayout`.

- [ ] **Step 3: Mettre à jour le sitemap**

Dans `src/app/sitemap.ts`, remplacer la ligne 41 :

```ts
...localizedEntries('search', { changeFrequency: 'weekly', priority: 0.8 }),
```

par :

```ts
...localizedEntries('search', { changeFrequency: 'weekly', priority: 0.8 }),
...localizedEntries('search/cards', { changeFrequency: 'weekly', priority: 0.8 }),
...localizedEntries('search/decks', { changeFrequency: 'weekly', priority: 0.7 }),
...localizedEntries('search/profiles', { changeFrequency: 'weekly', priority: 0.7 }),
```

`/search` reste dans le sitemap : c'est une vraie page, pas une redirection.

- [ ] **Step 4: Vérifier les canonicals**

```bash
npm run build
```

Attendu : build réussi. Puis vérifier les balises rendues :

```bash
npm run dev
# dans un autre terminal :
for p in search search/cards search/decks search/profiles; do
  echo "--- /$p ---"
  curl -s "http://localhost:3000/en/$p" | grep -oE '<link rel="canonical"[^>]*>'
done
```

Attendu : quatre canonicals **distincts**, `/en/search`, `/en/search/cards`, `/en/search/decks`, `/en/search/profiles`. Si les quatre sont identiques, les layouts de sous-route ne sont pas pris en compte.

Vérifier aussi le sitemap :

```bash
curl -s http://localhost:3000/sitemap.xml | grep -oE '<loc>[^<]*search[^<]*</loc>' | sort -u
```

Attendu : 8 entrées (4 chemins × 2 locales).

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/search" src/app/sitemap.ts
git commit -m "feat(search): per-route canonicals and sitemap entries"
```

---

### Task 7: Nettoyage

Supprime le hook monolithique et le type `SearchEntity`, désormais sans référence.

**Files:**

- Delete: `src/app/[locale]/search/useSearchFiltersFromUrl.ts`
- Modify: `src/lib/search/types.ts:69`

**Interfaces:**

- Consumes: rien.
- Produces: rien.

- [ ] **Step 1: Vérifier que plus rien ne référence l'ancien hook**

```bash
grep -rn "useSearchFiltersFromUrl" src --include="*.ts" --include="*.tsx"
```

Attendu : **aucun résultat** (le fichier lui-même exclu). S'il en reste, ne pas supprimer — corriger d'abord le référent.

- [ ] **Step 2: Supprimer le hook**

```bash
git rm "src/app/[locale]/search/useSearchFiltersFromUrl.ts"
```

- [ ] **Step 3: Vérifier que `SearchEntity` est orphelin, puis le supprimer**

```bash
grep -rn "SearchEntity" src --include="*.ts" --include="*.tsx"
```

Attendu : uniquement sa définition dans `src/lib/search/types.ts:69`. Si le switcher y fait encore référence, la tâche 4 est incomplète.

Supprimer alors la ligne :

```ts
export type SearchEntity = 'cards' | 'decks' | 'profiles';
```

- [ ] **Step 4: Vérification finale**

```bash
npm run check
```

Le résultat n'est PAS vert à la base (~60 problèmes préexistants). Le critère est **aucun nouveau problème dans les fichiers touchés** :

```bash
npx eslint "src/app/[locale]/search" src/lib/search src/app/sitemap.ts
```

Attendu : aucune erreur sur ce périmètre.

```bash
npm run build
```

Attendu : build réussi. C'est la seule vérification qui attrape certaines erreurs de typage Supabase (voir la note TS2589 dans les mémoires du projet).

- [ ] **Step 5: Vérification runtime complète**

`npm run dev`, parcours de bout en bout :

| Vérification              | Attendu                                                          |
| ------------------------- | ---------------------------------------------------------------- |
| `/search` sans terme      | 3 pitches, zéro requête réseau                                   |
| `/search?q=bolt`          | 3 sections peuplées et bornées                                   |
| Les 3 « Voir plus »       | Terme pré-rempli sur chaque route                                |
| `/search/cards` + filtres | URL sérialisée, rechargement conservant l'état                   |
| `/search/decks` + filtres | Paramètres **sans préfixe `d`**, rechargement OK                 |
| `/search/profiles?q=x`    | Terme restauré                                                   |
| Onglets                   | Navigation correcte, onglet actif juste, clic-milieu OK          |
| `/fr/search/decks`        | Tout fonctionne, onglet actif correct                            |
| `/search?entity=decks`    | Affiche la **landing**, paramètre ignoré (coupure nette assumée) |

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(search): drop monolithic url-state hook and SearchEntity type"
```

---

## Notes de vérification transverses

**Le piège principal de ce chantier** est le canonical hérité : sans les layouts de sous-route de la tâche 6, les quatre pages se déclarent comme `/search` et le bénéfice SEO — la raison d'être du chantier — est nul, alors que tout fonctionne parfaitement à l'écran. La vérification par `curl` du Step 4 de la tâche 6 est le seul moyen de l'attraper.

**Le second piège** est le flag `enabled` : s'il n'est pas correctement câblé, la landing fonctionne visuellement à l'identique mais émet deux requêtes inutiles à chaque visite. Seul l'onglet Réseau le révèle.

**Le troisième piège** est la rémanence des résultats cartes. `useScryfallCardSearch` conserve ses derniers `cards` quand `enabled` repasse à `false`, ce qui est un choix délibéré du hook mais impose au consommateur de garder son rendu sur la même condition. Le symptôme — vider le champ laisse les cartes affichées alors que decks et profils reviennent au pitch — n'apparaît qu'en testant ce geste précis.

**Trois hooks, trois comportements différents** sur le déclenchement conditionnel, à ne pas confondre :

| Hook                    | État initial                                                                                    | Après la tâche 1                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `useScryfallCardSearch` | a déjà `options.enabled`, débounce `name` en interne, **conserve** ses résultats à l'extinction | inchangé                                                |
| `useDeckSearch`         | requête inconditionnellement, pas de débounce                                                   | reçoit `enabled`, **vide** ses résultats à l'extinction |
| `useProfileSearch`      | requête inconditionnellement, pas de débounce                                                   | reçoit `enabled`, **vide** ses résultats à l'extinction |

Le flag ajouté en tâche 1 vide l'état, contrairement à celui qui préexiste sur le hook cartes. C'est volontaire : vider est le comportement attendu par la landing, et le hook cartes ne peut pas être changé sans risque pour `CardSearchView` qui en dépend.
