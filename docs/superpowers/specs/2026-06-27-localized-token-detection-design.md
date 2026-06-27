# Détection & localisation des tokens pour les cartes localisées

**Date :** 2026-06-27
**Statut :** design approuvé, prêt pour planification

## Problème

La détection des tokens/emblèmes d'un deck ne fonctionne pas en production pour
les cartes stockées dans une langue non-anglaise (ex. FR), alors qu'elle
fonctionne en local. Symptôme rapporté : l'emblème de _Lolth, Spider Queen_
(carte FR) n'est pas détecté en prod ; il l'est en local. Même deck, même code.

## Cause racine (prouvée)

Les impressions Scryfall **non-anglaises n'exposent pas le champ `all_parts`**
(les relations token/emblème ne sont présentes que sur l'impression oracle/EN).

Quand une carte de deck est résolue/stockée dans une langue localisée — typiquement
via `EditCardModal` → `getCardBySetNumberAndLang` (`/cards/{set}/{num}/{lang}`) —
l'objet `ScryfallCard` mis en cache (IndexedDB `wizcard-cache`) n'a pas `all_parts`.

`collectDeckTokenIds` lit `card.all_parts ?? []` → `[]` → ni token ni emblème
détecté. Le code de détection (fix emblème `c30e7dc`) est **correct et déployé** ;
il manque simplement la donnée.

### Preuves recueillies (debugging systématique)

| Hypothèse                            | Verdict      | Preuve                                                                                                                      |
| ------------------------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Fix non déployé / absent de `deploy` | réfuté       | `c30e7dc` ancêtre de `origin/deploy`, source identique à `main`                                                             |
| Build/bundle périmé                  | réfuté       | `combo_piece` présent dans le JS prod (`/_next/static`)                                                                     |
| Cache IndexedDB périmé               | réfuté       | cache vidé / navigation privée → toujours partiel                                                                           |
| Batch réseau qui échoue              | réfuté       | aucun fetch lors de la détection                                                                                            |
| **Carte localisée sans `all_parts`** | **confirmé** | prod : `all_parts` absent + champs `printed_name/text/type_line` présents ; local : `all_parts` complet, pas de `printed_*` |

Inspection IndexedDB de Lolth :

- **local** : `all_parts` présent (Spider token + Emblem `combo_piece`, `type_line: "Emblem — Lolth"`), pas de `printed_*`.
- **prod** : `all_parts` absent, champs `printed_name/printed_text/printed_type_line` présents (impression localisée).

## Objectif

1. La détection de tokens/emblèmes fonctionne quelle que soit la langue de la carte.
2. Les tokens s'affichent dans la **langue de la carte qui les produit**, avec
   fallback EN quand l'impression localisée n'existe pas.

## Architecture

Deux unités isolées, branchées au point d'étranglement `resolveCardsByScryfallIds`
(passage obligé de toutes les cartes du deck et des tokens).

### Unité A — Hydratation de `all_parts` (langue-invariant)

- **Rôle :** garantir que toute `ScryfallCard` résolue possède son `all_parts`,
  même localisée.
- **Fonction :** `hydrateAllParts(cards)`.
  - Repère les cartes telles que `lang !== 'en' && !all_parts && oracle_id`.
  - Fait **un POST groupé** `/cards/collection` avec des identifiers
    `{ oracle_id }` (Scryfall renvoie l'impression oracle/EN, qui contient
    `all_parts`).
  - **Greffe uniquement `all_parts`** sur l'objet localisé existant — ne remplace
    pas la carte ; `printed_name`, image FR, etc. restent intacts.
  - Réécrit la version enrichie en cache (coût payé une fois par carte / TTL 24 h).
- **Insertion :** dans `resolveCardsByScryfallIds`, après la résolution. Tous les
  consommateurs (deck detail, `useCardTokens`, `useDeckTokens`, `TokensTab`) en
  bénéficient globalement, sans recâblage.
- **Échec :** hérite du retry/backoff du `fetcher` (`MAX_RETRIES = 3`). Si échec
  persistant → carte inchangée (sans `all_parts`), `console.warn`, pas de throw
  (dégradation silencieuse, jamais pire que l'état actuel).

### Unité B — Localisation des tokens (langue de la carte source)

- **Rôle :** résoudre chaque token dans la langue de **sa carte source**, fallback EN.
- **Fonction :** `localizeTokens(tokensWithSourceLang)`.
  - Pour chaque token EN résolu, si la langue de la carte source ≠ EN :
    tenter l'impression localisée du token (`set` + `collector_number` + `lang`,
    via `getCardBySetNumberAndLang`, pattern identique à `useLocalizedImage`).
  - 404 / échec → garder le token EN déjà résolu (fallback).
  - Langue source = EN → pas d'appel localisé.
- **Dépendances :** `getCardBySetNumberAndLang`, `LANGUAGE_TO_SCRYFALL_CODE`.

### Changement de signature : `collectDeckTokens`

`collectDeckTokenIds(cards)` aplatit aujourd'hui en `string[]` et perd le lien
token → carte source. Unité B a besoin de la langue source par token.

→ Ajouter une variante retournant le lien token → langue source
(`Map<tokenId, MtgLanguage>` ou structure équivalente). Changement isolé, les
appelants existants peuvent conserver l'API actuelle ou migrer vers la variante.

## Flux de données (cas Lolth FR)

```
useDeckDetail → resolveCardsByScryfallIds(printIds)
  → [Unité A] hydrateAllParts : POST /cards/collection {oracle_id} EN, greffe all_parts, réécrit cache
  → ScryfallCard Lolth FR + all_parts (Spider EN + Emblem EN)
Détection → collectDeckTokens (variante) → Map<tokenId EN, langue source>
  → isProducedToken matche l'Emblem
  → resolveCardsByScryfallIds(tokenIds EN)
  → [Unité B] localizeTokens : getCardBySetNumberAndLang(...) ou fallback EN
  → Tokens affichés en FR (Jeton Araignée + Emblème)
```

Points actés :

- **Cache enrichi** : hydratation payée une fois par carte (TTL 24 h), chargements
  suivants gratuits.
- **Identité préservée** : Unité A ajoute un champ langue-invariant, n'écrase rien.

## Gestion des erreurs

| Cas                                              | Comportement                                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Hydratation `all_parts` échoue (réseau/Scryfall) | retry/backoff du fetcher ; si échec persistant → carte sans `all_parts`, `console.warn`, pas de throw |
| Token sans impression localisée (404)            | fallback sur l'impression EN du token                                                                 |
| Carte custom/MPC sans `oracle_id`                | pas d'hydratation tentée ; comportement actuel préservé                                               |

## Stratégie de test

Pas de runner de test configuré → scripts ponctuels (`tsx`/node), écrits avant le
fix, qui échouent d'abord.

**Test 1 — `collectDeckTokens` (pur, sans réseau)**

- Carte avec `all_parts` contenant un Emblem `combo_piece` → ID emblème collecté
  avec la langue source.
- Carte sans `all_parts` → liste vide, pas de crash.
- Carte custom sans `oracle_id` → ignorée proprement.

**Test 2 — `hydrateAllParts` (Unité A, réseau mocké)**

- Carte FR sans `all_parts` + `oracle_id` → `all_parts` présent après hydratation,
  identité FR préservée (`printed_name` intact). `getCardCollection` mocké renvoie
  l'oracle EN avec `all_parts`.
- Échec réseau → carte inchangée, pas de throw.

**Test 3 — `localizeTokens` (Unité B, réseau mocké)**

- Token EN + source FR, impression FR existe → token FR.
- Impression FR 404 → fallback token EN.
- Source EN → pas d'appel localisé.

**Vérification finale (manuelle, prod) :** rouvrir le deck Lolth FR → emblème +
token Spider apparaissent en FR.
