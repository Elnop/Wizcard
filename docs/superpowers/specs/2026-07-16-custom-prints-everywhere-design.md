# Utiliser un print custom partout — Design

**Date** : 2026-07-16
**Statut** : validé, prêt pour plan d'implémentation
**Portée** : persistance complète (collection, wishlist, deck)

## Objectif

Permettre de choisir un **print custom** (carte MPC / user-created) pour une carte
dans la collection, la wishlist et les decks — partout où on sélectionne un print.
Le print custom choisi doit être **sauvegardé et rechargé** comme une vraie copie
(il survit au reload), pas seulement affiché.

Dans les listes de prints (picker de sélection), ajouter une section **« Custom »**
listant les prints custom disponibles pour cette carte, sous les prints officiels.

## Contexte codebase (état actuel)

- `Card = (ScryfallCard | CustomCard) & { entry: CardEntry }` (`src/types/cards.ts`).
  Le modèle porte déjà une copie custom.
- Le store de cartes (`cards-store`) accepte déjà `ScryfallCard | CustomCard`.
- La section « Custom » existe **déjà** dans `PrintsTab` (page `/card/[id]`) via
  `useCustomCardPrints(oracleId)` → section `t('customCards')`. Elle n'existe **pas**
  dans le picker de sélection (`PrintList` / `CardPrintPickerModal`).
- Le pattern de routage par préfixe `id.startsWith('mpc:')` est déjà établi
  (`card/[id]/page.tsx`, `RulingsTab`, `custom-cards.ts`).
- `toCustomCard(mpcCard, source)` produit un `CustomCard` avec `id = 'mpc:<uuid>'`.

## Contrainte clé (feasibilité)

`public.cards.scryfall_id` est **`text not null`, sans FK, sans CHECK, sans contrainte
de format** (`supabase/bootstrap/init_schema.sql:44`). Un ID `mpc:<uuid>` peut donc y
être stocké tel quel — **aucune migration DB nécessaire**.

Collection et deck partagent la même table `cards` et le même mécanisme de stockage
(`{ scryfallId, entry }`). Ce qui rend l'hydratation le seul point de rupture :
`useCollectionCards` fait `scryfallMap.get(copy.scryfallId)` et
`resolveCardsByScryfallIds` résout l'ID via **l'API Scryfall** — un ID `mpc:*` n'y
résout jamais et la copie **disparaît silencieusement**.

## Architecture

Traiter un print custom comme n'importe quelle copie stockée : stocker `mpc:<uuid>`
dans `scryfall_id`, et **router l'hydratation par préfixe** — `mpc:` → table
`custom_cards`, sinon → API Scryfall.

## Unités de travail

### 1. Hydratation mixte (cœur du travail)

`resolveCardsByScryfallIds(ids)` doit :

1. Séparer les IDs en deux groupes : `mpc:*` et Scryfall.
2. Résoudre les IDs Scryfall comme aujourd'hui (cache IndexedDB + batch API).
3. Résoudre les IDs `mpc:*` via un **nouveau** fetch batch client-side
   `getCustomCardsByIds(ids: string[])` :
   - requête `custom_cards` avec `.in('id', <uuids sans préfixe>)`,
   - map `rowToMpcCard` → `toCustomCard(...)` → `CustomCard` (id ré-préfixé `mpc:`),
   - source : réutiliser le `unknownSource` déjà utilisé par `useCustomCardPrints`
     (id `unknown`, `isBuiltIn: false`) — la source réelle n'est pas requise pour
     l'affichage d'une copie.
4. Fusionner les deux maps et mirror dans le `cards-store` (qui accepte déjà
   `CustomCard`).

Conséquence : `useCollectionCards`, la wishlist et les decks hydratent une copie
custom **sans aucun changement chez eux**.

**Note cache** : le cache IndexedDB Scryfall ne doit pas être pollué par les customs.
Les `mpc:*` sont résolus hors du chemin cache Scryfall (pas de `putCardsInCache`
sur les customs). Le cache in-memory (`cards-store`) est partagé et OK.

### 2. Section « Custom » dans le picker de sélection

Porter la section custom (aujourd'hui dans `PrintsTab`) dans **`PrintList`**
(`src/lib/card/components/PrintList/PrintList.tsx`), le composant utilisé par
`CardPrintPickerModal` → `EditCardModal` / `useCardEntryForm`.

`PrintList` reçoit déjà `currentCardId` ; on lui passe aussi l'`oracle_id` de la
carte (pour `useCustomCardPrints`). Il rend une section `t('customCards')` sous les
sections de langue officielles. Sélectionner un print custom appelle le même
`onSelect(print)`.

`PrintsTab` continue de fonctionner (déjà OK) ; on factorise si pertinent, sans
régression.

### 3. `onSelect` / `onChangePrint` acceptent un print custom

Plutôt qu'élargir chaque signature en union `ScryfallCard | CustomCard` (~15 call
sites, churn massif, contagion de types), on suit le **pattern cast déjà établi**
dans le codebase (`CardModal.tsx`, `CardImage.tsx`, `PrintsTab.tsx`) : le custom
circule casté `as unknown as ScryfallCard` dans les pipes typées `ScryfallCard`,
avec garde `isCustomCard` partout où le comportement diffère.

Le `changePrint` du store écrit alors `scryfallId = 'mpc:<id>'`. **Aucune migration.**

Surveiller **TS2589** au `npm run build` (seule gate fiable, mémoire projet).

### 4. Ajout initial avec un print custom (`useCardEntryForm`)

`useCardEntryForm` type `selectedPrint` en `ScryfallCard` et déclenche un fetch de
langue localisée Scryfall (`getCardBySetNumberAndLang`). Pour un print custom :

- élargir `selectedPrint` à `ScryfallCard | CustomCard`,
- **court-circuiter** `handleLanguageChange` / la résolution de langue Scryfall quand
  `isCustomCard(selectedPrint)` (pas de traduction Scryfall ; garder image/set custom),
- `AddCardModal` peut ainsi passer un print custom sans casser.

## Frictions / risques (tous non bloquants)

| #   | Friction                                                       | Décision                                                                                                                |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| A   | Print custom **sans `oracle_id`** non groupable                | On ne propose que les customs avec `oracle_id` (cohérent avec commit `9ad399f` qui cache les non-matchés).              |
| B   | Types `ScryfallCard` à élargir sur plusieurs fichiers          | Mécanique ; surface : EditCardModal, useCardEntryForm, CardPrintPickerModal, PrintList, PrintsTab, CardModal.           |
| C   | Round-trip DB supplémentaire pour `mpc:*`                      | Batch unique `.in('id', …)` + cache store. Négligeable.                                                                 |
| D   | Images custom via `/_next/image` (UA bloqué cards.scryfall.io) | Les customs utilisent `image_url` propre ; vérifier que `CardImage` route bien via `isCustomCard` (déjà géré ailleurs). |
| E   | Logique de langue Scryfall inutile pour un custom              | Court-circuit explicite (unité 4).                                                                                      |

La seule friction qui aurait été bloquante — une contrainte DB sur `scryfall_id` —
n'existe pas.

## Vérification (pas de framework de test)

- `npm run check` (TS + ESLint + Prettier) — gate sur "pas de NOUVEAU problème"
  (baseline rouge connue).
- `npm run build` — seul à attraper un éventuel TS2589.
- Runtime (dev + Studio) :
  1. Choisir un print custom pour une carte en **collection** → reload → la copie
     persiste et s'affiche avec l'image custom.
  2. Idem **wishlist**.
  3. Idem **deck** (une zone).
  4. Le picker de prints affiche la section « Custom » sous les prints officiels.
  5. Une carte sans print custom : aucun changement de comportement.

## Hors périmètre (YAGNI)

- Pas de nouvelle table, pas de migration.
- Pas de gestion de la source custom exacte au niveau copie (source `unknown` suffit
  pour l'affichage).
- Pas de traduction de langue pour les prints custom.
