# Design : Masquer les cartes custom sans match officiel

Date : 2026-07-16

## Problème

Les cartes custom qui ne correspondent à aucune carte officielle apparaissent
actuellement sur le site (recherche, prints, compteurs de sources). Elles ne
doivent plus être listées nulle part.

## Règle métier

Une carte custom est **« matchée »** si et seulement si `oracle_id IS NOT NULL`.
Le champ `oracle_id` est renseigné lors de l'enrichissement Scryfall quand la
carte custom correspond à une carte officielle.

Les cartes non-matchées :

- **restent en base** (`custom_cards`) — récupérables si un `oracle_id` est
  trouvé ultérieurement lors d'un ré-enrichissement ;
- sont **invisibles** sur toutes les surfaces du site.

Aucune migration, aucune modification de RLS, aucune suppression de données.

## Point d'application : le layer requête

Toutes les surfaces d'affichage des custom cards passent par
`src/lib/supabase/queries/custom-cards.ts`. Le filtre est posé là, en dur, comme
invariant non contournable par les filtres applicatifs.

### 1. `queryCustomCardRows`

Couvre la liste de recherche custom (`useCustomCards`) **et** les prints sur la
page d'une carte officielle (`useCustomCardPrints`).

Ajouter, immédiatement après `.eq('is_public', true)` :

```ts
q = q.not('oracle_id', 'is', null);
```

Ce filtre est inconditionnel. Il prime sur `filters.oracleIdFilter` (qui, s'il
traîne encore dans une URL, devient sans effet).

### 2. `fetchCustomCardSourceRowsWithCounts`

La requête de comptage exclut aussi les non-matchées :

```ts
client.from('custom_cards').select('source_id').eq('is_public', true).not('oracle_id', 'is', null);
```

Sans ça, les compteurs par source surcompteraient, et une source ne contenant
**que** des cartes non-matchées apparaîtrait à tort (le filtre `cardCount > 0`
en aval ne l'exclurait pas).

### 3. `fetchCustomCardRowById`

Accès direct par URL à une carte custom (`/card/[id]`). Pour rester cohérent avec
« ne plus être listée », une carte non-matchée accédée par son URL directe doit
renvoyer 404.

Ajouter `.not('oracle_id', 'is', null)` à la requête → `data` vaut `null` → la
fonction retourne `null` → la page not-found existante s'affiche.

## Nettoyage UI : filtre `oracleIdFilter`

Le filtre utilisateur `oracleIdFilter` (`all` / `defined` / `undefined`) devient
mort : tout résultat est désormais forcément `defined`. On retire le contrôle de
l'UI et la plomberie associée.

Fichiers concernés (repérés par `grep -rn oracleIdFilter`) :

- `src/lib/search/components/filters/OracleIdFilter/OracleIdFilter.tsx` +
  `OracleIdFilter.module.css` — **supprimer** le composant (labels hardcodés,
  aucune clé i18n à nettoyer).
- `src/lib/search/components/FilterModal/FilterModal.tsx` — retirer la prop
  `oracleIdFilter`, le state `draftOracleIdFilter`, le rendu du composant et sa
  contribution au comptage de filtres actifs.
- `src/app/[locale]/search/page.tsx` — retirer `oracleIdFilter`,
  `oracleIdFilterCount`, et le passage de la prop au FilterModal.
- `src/app/[locale]/search/useSearchFiltersFromUrl.ts` — retirer le state
  `oracleIdFilter` / `setOracleIdFilter`, le type `OracleIdFilterValue`, la
  sérialisation du param URL `oracleId`, et les entrées correspondantes dans les
  objets de retour / reset.
- `src/lib/mpc/hooks/useCustomCards.ts` — retirer le champ `oracleIdFilter` de
  l'interface de filtres et son passage à `queryCustomCards`.
- `src/lib/supabase/queries/custom-cards.ts` — retirer `oracleIdFilter` de
  `CustomCardQueryFilters` et les deux branches `if (filters.oracleIdFilter ...)`.
  (Le champ `oracleId` exact, utilisé par `useCustomCardPrints`, est conservé.)

Le param URL `oracleId` laissé dans une ancienne URL est inoffensif : plus aucun
code ne le lit, et le filtre en dur prime de toute façon.

## Ce qu'on ne touche PAS

- Table `custom_cards`, RLS, migrations : rien.
- Ingestion / enrichissement Scryfall : inchangé. Une carte peut toujours être
  insérée sans `oracle_id` ; elle reste simplement invisible jusqu'à
  enrichissement.
- Le filtre `oracleId` (match exact par oracle id) utilisé pour les prints :
  conservé.

## Vérification

Pas de framework de test (cf. mémoire projet `project_no_test_framework`).
Gate : `npm run check` sur les fichiers touchés (baseline rouge → « pas de
NOUVEAU problème », cf. `project_check_red_baseline`), puis vérif runtime :

1. Liste de recherche custom : seules des cartes matchées apparaissent.
2. Compteurs de sources : cohérents (une source 100 % non-matchée disparaît).
3. Page d'une carte custom non-matchée par URL directe → 404.
4. Prints sur une page de carte officielle : toujours affichés (les prints ont
   par définition un `oracle_id`).
5. FilterModal : plus de contrôle « Oracle ID ».
