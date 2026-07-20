# Routes dédiées par mode de recherche

Date: 2026-07-20

## Problème

La page `/search` porte les trois modes de recherche (cartes, decks, profils) sur
une seule route, le mode courant étant sélectionné par un paramètre de requête
`?entity=decks`. Trois conséquences :

- **SEO** — les trois modes partagent une URL, donc un seul canonical. Google ne
  peut pas les indexer séparément ; ils se cannibalisent.
- **État** — `useSearchFiltersFromUrl` (372 lignes) porte l'état des trois modes
  simultanément, et sérialise les params des decks derrière un préfixe `d` pour
  éviter les collisions avec ceux des cartes.
- **Navigation** — le sélecteur de mode est un groupe de `<button>`, donc pas de
  clic-milieu, pas d'ouverture dans un nouvel onglet, pas de lien partageable
  vers un mode.

## Solution

Quatre routes réelles : une landing de recherche fédérée, et une route dédiée par
mode.

```
/search              → landing : barre unifiée + un aperçu par mode
/search/cards        → recherche de cartes
/search/decks        → recherche de decks
/search/profiles     → recherche de profils
```

Le paramètre `entity` disparaît. **Coupure nette assumée** : aucune redirection
des anciennes URLs `?entity=…`, le paramètre est simplement ignoré et l'URL
retombe sur la landing.

## Arborescence

```
src/app/[locale]/search/
├─ layout.tsx                    metadata de section, rend { children }
├─ page.tsx                      LANDING
├─ useLandingSearchUrlState.ts   param ?q=
├─ components/
│  ├─ SearchEntitySwitcher/      <Link>, rendu par les 3 sous-pages
│  └─ SearchModeSwitcher/        inchangé, propre aux cartes
├─ views/                        inchangés de place
│  ├─ CardSearchView.tsx
│  ├─ DeckSearchView.tsx
│  └─ ProfileSearchView.tsx
├─ cards/
│  ├─ page.tsx
│  └─ useCardSearchUrlState.ts
├─ decks/
│  ├─ page.tsx
│  └─ useDeckSearchUrlState.ts
└─ profiles/
   ├─ page.tsx
   └─ useProfileSearchUrlState.ts
```

## Landing `/search`

Recherche fédérée : un champ unique, trois sections de résultats bornées, chacune
avec un lien « Voir plus » vers sa route dédiée.

**Terme de recherche.** Persisté dans l'URL en `?q=`, cohérent avec la convention
du projet où tout l'état de recherche vit dans l'URL (lien partageable, survit au
rechargement). Débounce via le `useDebounce` existant.

**Sans terme saisi.** Les trois sections affichent leur titre, leur lien « Voir
plus » actif, et à la place des résultats une phrase de présentation décrivant ce
que le mode permet de chercher. **Aucune requête réseau n'est émise.**

**Avec terme saisi.** Chaque section affiche ses résultats bornés :

| Section | Rendu                   | Limite |
| ------- | ----------------------- | ------ |
| Cartes  | `CardList`              | 6      |
| Decks   | grille de `DeckCard`    | 3      |
| Profils | grille de `ProfileCard` | 4      |

Les limites diffèrent parce que les vignettes de cartes sont larges et les
profils compacts ; ces valeurs donnent des rangées de hauteur comparable.

**Rendu des sections — pas d'abstraction partagée.** Chaque section rend son
contenu directement, sans composant `SearchSection` générique. La section cartes
utilise `CardList` ; les sections decks et profils reprennent le markup de grille
de `DeckSearchView` / `ProfileSearchView`. Décision assumée : le chrome (titre,
lien, état vide) est dupliqué trois fois plutôt qu'extrait.

**Configuration de `CardList`.** La troncature se fait en amont
(`cards.slice(0, 6)`), pas dans le composant :

```tsx
<CardList
	cards={cards.slice(0, 6)}
	pageSize={false} // désactive la pagination interne
	viewModes={['grid']} // masque le sélecteur grille/tableau
/>
```

`pageSize={false}` est indispensable : sans lui, `CardList` pagine en interne et
affiche un « charger plus » qui n'a aucun sens dans un aperçu borné.

**« Voir plus ».** Transmet le terme vers la route dédiée, mappé sur le paramètre
de chaque entité :

| Section | Cible                    |
| ------- | ------------------------ |
| Cartes  | `/search/cards?name=<q>` |
| Decks   | `/search/decks?name=<q>` |
| Profils | `/search/profiles?q=<q>` |

**Le switcher n'apparaît pas sur la landing.** Il est rendu par les trois
sous-pages uniquement. Sur la landing, une barre d'onglets ferait doublon avec
les trois sections juste en dessous.

## Prérequis : flag `enabled` sur les hooks de recherche

**`useDeckSearch` et `useProfileSearch` requêtent inconditionnellement au
montage** — leur `useEffect` n'a pas de court-circuit pour un terme vide
(`src/lib/search/hooks/useDeckSearch.ts:18`,
`src/lib/search/hooks/useProfileSearch.ts:15`). Tels quels, la landing sans terme
saisi émettrait deux requêtes pour afficher des sections qui ne doivent montrer
que du texte de présentation.

Les deux hooks reçoivent donc un paramètre `enabled` (défaut `true`, les appelants
existants ne changent pas). Quand il vaut `false`, l'effet retourne immédiatement
en laissant l'état vide, sans appel réseau. La landing passe
`enabled={q.length > 0}`.

Les hooks doivent rester appelés de façon inconditionnelle — c'est le flag qui
gère le déclenchement, pas un appel conditionnel, qui violerait les règles des
hooks.

## Découpage de l'état d'URL

`useSearchFiltersFromUrl.ts` éclate en trois hooks colocalisés avec leur page.
Chaque page n'écrit que ses propres paramètres.

| Hook                                   | Paramètres                                                                                                                                           | Taille estimée |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `cards/useCardSearchUrlState.ts`       | `name`, `colors`, `colorMatch`, `ci`, `cim`, `type`, `set`, `rarities`, `oracle`, `cmc`, `order`, `dir`, `mode`, `source`, `mpcMust`, `mpcNot`, `ml` | ~300 l         |
| `decks/useDeckSearchUrlState.ts`       | `name`, `formats`, `author`, `card`, `commander`, `precon`                                                                                           | ~50 l          |
| `profiles/useProfileSearchUrlState.ts` | `q`                                                                                                                                                  | ~25 l          |
| `useLandingSearchUrlState.ts`          | `q`                                                                                                                                                  | ~25 l          |

Les parseurs partagés (`parseColors`, `parseOrder`, `parseTags`, `parseMode`…)
restent avec le hook cartes, seul consommateur. `parsePreconFilter` part avec les
decks.

**Le garde `isInitialMount`** de l'effet de synchronisation est repris tel quel
dans chaque hook — c'est lui qui empêche un `router.replace` parasite au montage.

### Renommage des paramètres decks

Le préfixe `d` n'a plus de raison d'être une fois les routes séparées : sur
`/search/decks` il n'y a plus d'ambiguïté possible avec les paramètres des cartes.

| Avant      | Après       |
| ---------- | ----------- |
| `dname`    | `name`      |
| `dformats` | `formats`   |
| `dauthor`  | `author`    |
| `dcard`    | `card`      |
| `dcmd`     | `commander` |
| `dprecon`  | `precon`    |

Pour les profils, `pq` devient `q`.

### Suppression du type `SearchEntity`

`SearchEntity` (`src/lib/search/types.ts:69`), `parseEntity`, `VALID_ENTITIES` et
le couple d'état `entity`/`setEntity` disparaissent. Vérifié : ce type n'est
importé que par `SearchEntitySwitcher` et `useSearchFiltersFromUrl`.

Le switcher détermine l'onglet actif via `usePathname()` au lieu d'une prop
`value`, et rend trois `<Link>` au lieu de trois `<button onClick>`.

## SEO

**Metadata par route.** Le `layout.tsx` actuel pose title/description/alternates
pour toute la section. Comme les quatre routes sont des pages distinctes, elles
hériteraient toutes du canonical `/fr/search` — ce qui les déclarerait comme une
seule page et reproduirait exactement le problème de cannibalisation que ce
changement doit résoudre. Chaque page reçoit donc son propre `generateMetadata` :

| Route              | `buildAlternates(locale, …)` | Clé i18n                                             |
| ------------------ | ---------------------------- | ---------------------------------------------------- |
| `/search`          | `'search'`                   | `seo.search` (existante, à réécrire pour la landing) |
| `/search/cards`    | `'search/cards'`             | `seo.searchCards` (nouvelle)                         |
| `/search/decks`    | `'search/decks'`             | `seo.searchDecks` (nouvelle)                         |
| `/search/profiles` | `'search/profiles'`          | `seo.searchProfiles` (nouvelle)                      |

Les nouvelles clés sont à ajouter dans `messages/en.json` et `messages/fr.json`,
avec une paire `title`/`description` chacune.

Les quatre pages restent `robots: { index: true, follow: true }`.

**Sitemap.** `src/app/sitemap.ts:41` émet aujourd'hui une seule entrée `search`.
Elle est conservée — `/search` est une vraie page, pas une redirection — et les
trois sous-routes s'y ajoutent :

| Chemin            | `priority` |
| ----------------- | ---------- |
| `search`          | 0.8        |
| `search/cards`    | 0.8        |
| `search/decks`    | 0.7        |
| `search/profiles` | 0.7        |

## Hors périmètre

- Les vues `CardSearchView`, `DeckSearchView`, `ProfileSearchView` ne changent
  pas au-delà de leurs props.
- Les hooks de données ne changent pas au-delà du flag `enabled`.
- Le CSS existant n'est pas retouché ; la landing ajoute ses propres règles.
- Aucune gestion de compatibilité pour `?entity=` (coupure nette validée).
- Aucun refactor non lié.

## Vérification

Le projet n'a pas de framework de test (voir `AGENTS.md`). La vérification est
donc :

- `npm run check` — en gatant sur « aucun nouveau problème », la base n'étant pas
  verte (~60 problèmes préexistants dans des fichiers non liés).
- Runtime en dev : les quatre routes répondent, le switcher navigue, les filtres
  se sérialisent dans l'URL et survivent au rechargement, la landing n'émet
  aucune requête tant que le champ est vide, et « Voir plus » pré-remplit bien le
  terme sur chaque route.
