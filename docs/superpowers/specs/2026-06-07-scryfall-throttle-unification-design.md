# Unification du throttle Scryfall & stabilisation de l'ingestion MPC

**Date:** 2026-06-07
**Statut:** Design approuvé (en relecture)

## Problème

L'ingestion des cartes MPC produit des erreurs 429 récurrentes, principalement
pendant la passe fuzzy (`/cards/named?fuzzy=`). Cause racine : le throttle Node
(`scryfall-throttle.ts`) applique un gap **uniforme de 130ms (~7.7 req/s) à tous
les endpoints**, alors que Scryfall plafonne `/cards/search|named|random|collection`
à **2 req/s (500ms)**. La passe fuzzy tape donc à ~7.7 req/s sur un endpoint
limité à 2 req/s → 429 garantis. Le backoff existant masque le symptôme (run lent
et bruyant) sans corriger le pacing.

Secondairement, il existe **deux implémentations de throttle séparées** :

- **Browser** : `endpoints/*.ts` → `fetcher.ts` (`scryfallGet`/`scryfallPost`) →
  `rate-limiter.ts` (`scryfallQueue`, gap 130ms, gestion 429 absente — le
  commentaire suppose qu'elles « ne devraient pas arriver »).
- **Node/ingestion** : `scryfall-resolver.ts` + `sources.ts` →
  `sharedScryfallThrottle` (`scryfall-throttle.ts`, gap 130ms, gestion 429 avec
  backoff + pénalité).

Les deux font le même travail différemment. La `priority: 'high'` de
`rate-limiter.ts` (« viewport-visible cards ») n'est **jamais utilisée** : aucun
appelant ne passe ce paramètre — code mort.

## Objectifs

1. Éliminer les 429 de la passe fuzzy en faisant respecter les limites
   **par endpoint** de Scryfall.
2. **Unifier** les deux throttles en une seule implémentation partagée
   browser + Node.
3. Simplifier `scryfall-resolver.ts` (duplication POST `/cards/collection`).
4. Activer la passe fuzzy **par défaut** (`--no-fuzzy` pour la désactiver), le
   throttle corrigé la rendant sûre.

Hors périmètre : refactoring non lié, changement du modèle de données, du
pipeline d'images ou du writer DB.

## Architecture cible

```
┌─ Endpoints (cards.ts, sets.ts, symbols.ts) ─┐   ┌─ Node ingestion ─────────┐
│        scryfallGet / scryfallPost           │   │ scryfall-resolver.ts     │
│         (fetcher.ts)                         │   │ sources.ts               │
│  · cache (TTL)                               │   │  (appel direct .fetch)   │
│  · in-flight dédup                           │   └──────────┬───────────────┘
│  · AbortSignal (combiné)                     │              │
└──────────────────┬──────────────────────────┘              │
                   └──────────────┬──────────────────────────┘
                                  ▼
                    scryfall-throttle.ts  (UNIQUE)
                    · sérialise (mutex)
                    · gap PAR endpoint (parsé de l'URL)
                    · 429 → backoff + pénalité décroissante
```

`rate-limiter.ts` est **supprimé**. La `priority: 'high'` (code mort) disparaît
avec lui. Le throttle devient la **seule autorité** sur le rate-limiting et les 429. `fetcher.ts` conserve cache, dédup in-flight et `AbortSignal` par-dessus.

### Responsabilités

| Module                 | Responsabilité                                     | Dépend de     |
| ---------------------- | -------------------------------------------------- | ------------- |
| `scryfall-throttle.ts` | Pacing par endpoint + gestion 429 + sérialisation  | `fetch` natif |
| `fetcher.ts`           | Cache, dédup in-flight, AbortSignal, parse erreurs | throttle      |
| `endpoints/*.ts`       | Construction des requêtes typées                   | fetcher       |
| `scryfall-resolver.ts` | Résolution 3 passes (set+num / nom / fuzzy)        | throttle      |
| `sources.ts`           | Discovery sources + set codes                      | throttle      |

## Throttle unifié — conception détaillée

### Interface publique (inchangée)

```ts
export interface ScryfallThrottle {
	fetch(url: string, init?: RequestInit): Promise<Response>;
}
export function createScryfallThrottle(opts?: ThrottleOptions): ScryfallThrottle;
export const sharedScryfallThrottle: ScryfallThrottle; // instance unique partagée
```

### Classification de l'endpoint (parse du path)

```ts
// Endpoints plafonnés à 2 req/s par Scryfall.
const SLOW_PATHS = /^\/cards\/(search|named|random|collection)\b/;

function gapFor(url: string): number {
	const path = new URL(url).pathname;
	return SLOW_PATHS.test(path) ? SLOW_GAP_MS : FAST_GAP_MS;
}
```

Constantes :

- `SLOW_GAP_MS = 550` — marge sûre sous le plafond 500ms (≈1.8 req/s).
- `FAST_GAP_MS = 110` — marge sûre sous le plafond 100ms (≈9 req/s).

Note : `/cards/{id}`, `/cards/{set}/{num}`, `/cards/multiverse/...`,
`/cards/autocomplete` ne matchent **pas** `SLOW_PATHS` → tier rapide. Correct :
ce sont des lookups directs, pas les endpoints limités à 2/s.
`/cards/collection` est un POST ; le path suffit à le classer, la méthode HTTP
n'entre pas dans la décision.

### Pacing

Mutex unique sérialisant tous les appels (chaînage de promesses, comme l'actuel
`scryfall-throttle.ts`). Avant chaque requête :

```
wait = max(0, gapFor(url) − (now − lastEndMs))
```

`lastEndMs` est un compteur **global** (fin de la dernière requête, quelle que
soit sa classe). Comme tout est sérialisé, viser 550ms sur `/cards/*` garantit
≤1.8 req/s sur cet endpoint ; les requêtes rapides intercalées ne font qu'ajouter
du délai, jamais en retirer. Pénalité 429 active → le gap de la requête courante
est multiplié par `PENALTY_FACTOR`.

### Gestion des 429 (conservée du throttle Node actuel)

- 429 → engage `penaltyRemaining = PENALTY_DECAY_REQUESTS` puis attend
  (`Retry-After` si présent, sinon backoff exp base 1s / cap 30s).
- `penaltyRemaining` décroît d'une unité par requête ; tant que > 0 le gap est
  doublé.
- Erreurs réseau → retry avec backoff.
- `maxRetries` (défaut 8) essais ; à épuisement, **retourne la dernière
  `Response` telle quelle** (possiblement 429). L'appelant décide.

Ce dernier point implémente la décision « carte non-résolue, continuer » : le
resolver loggue un warning et la carte tombe dans `unresolvedFiles`, sans
interrompre le run.

### Constantes

| Nom                      | Valeur | Rôle                                              |
| ------------------------ | ------ | ------------------------------------------------- |
| `SLOW_GAP_MS`            | 550    | Gap `/cards/{search,named,random,collection}`     |
| `FAST_GAP_MS`            | 110    | Gap tous autres endpoints                         |
| `PENALTY_FACTOR`         | 2      | Multiplicateur de gap après 429                   |
| `PENALTY_DECAY_REQUESTS` | 10     | Nb de requêtes sur lesquelles la pénalité décroît |
| `DEFAULT_MAX_RETRIES`    | 8      | Essais avant abandon                              |
| `BACKOFF_BASE_MS`        | 1000   | Base backoff exponentiel                          |
| `BACKOFF_CAP_MS`         | 30000  | Plafond backoff                                   |

## Changements dans `fetcher.ts`

- `scryfallGetInner` et `scryfallPost` remplacent
  `scryfallQueue.enqueue(() => fetch(...))` par
  `sharedScryfallThrottle.fetch(url, { ...init, signal })`.
- **Suppression de la gestion 429 propre à `fetcher.ts`** : le throttle est
  désormais la seule autorité sur le rate-limiting. `fetcher.ts` ne conserve un
  retry que pour 5xx / timeout / erreurs de parse — pas pour 429 (sinon double
  couche de backoff superposée).
- Cache, dédup in-flight (`inFlight` Map) et combinaison `AbortSignal.any`
  restent inchangés. Le `signal` est passé via `init` au throttle, propagé au
  `fetch` natif.
- `import { scryfallQueue }` supprimé.

## Simplification de `scryfall-resolver.ts`

- `passA` (clé set+num) et `batchCollection` (clé nom) dupliquent la boucle
  batch POST `/cards/collection` (slice par `BATCH_SIZE`, fetch, parse, warn).
  Factoriser un helper unique :

  ```ts
  async function postCollection(
  	identifiers: Record<string, string>[]
  ): Promise<Record<string, unknown>[]>; // cartes brutes, tous batches concaténés
  ```

  `passA` et `batchCollection` l'appellent puis indexent à leur façon
  (set/num vs nom). Réduit ~50 lignes dupliquées.

- `passC` (fuzzy) : **conserver** le negative cache (`knownMisses`) — correct et
  utile pour éviter de refirer des fuzzy GET sur des noms déjà connus comme
  échecs. Reste séquentiel (le throttle impose le pacing).
- `resolveByFuzzy` : inchangé hormis le bénéfice du gap 550ms.

## Valeurs par défaut — fuzzy opt-out

Dans `scripts/ingest/config.ts` :

```ts
// fuzzy activé par défaut — le throttle 550ms sur /cards/named le rend sûr.
// --no-fuzzy pour désactiver (ex. runs rapides où le fuzzy n'apporte rien).
fuzzy: !argv.includes('--no-fuzzy'),
```

Le commentaire « fuzzy opt-in only — avoid 429s » est supprimé. Le champ
`flags.fuzzy` du report reflète la nouvelle valeur effective.

La concurrence des sources (`ingest-mpc-cards.ts`) reste `1` quand Scryfall est
actif : logs lisibles et résolution batch cohérente.

## Stratégie de test

Le projet n'a pas de framework de test : les tests sont des fichiers `.test.ts`
exécutés via `tsx`, avec table de cas, `console.log` PASS/FAIL et
`process.exit(1)` à l'échec (cf. `src/lib/mpc/parse-filename.test.ts`). On suit
ce style.

Nouveau `src/lib/scryfall/utils/scryfall-throttle.test.ts` — `fetch` global et
`Date.now`/`setTimeout` mockés :

1. **Classification d'URL** : `/cards/named`, `/cards/search`, `/cards/random`,
   `/cards/collection` → `SLOW_GAP_MS` ; `/sets`, `/symbology`, `/cards/{id}`,
   `/cards/autocomplete` → `FAST_GAP_MS`.
2. **Espacement respecté** : deux appels `/cards/named` successifs sont espacés
   d'au moins `SLOW_GAP_MS` ; deux `/sets` d'au moins `FAST_GAP_MS`.
3. **429 → backoff + pénalité** : un 429 (sans `Retry-After`) déclenche une
   attente de backoff puis un gap doublé sur les requêtes suivantes ; un 429
   avec `Retry-After` honore l'en-tête.
4. **Épuisement** : après `maxRetries` 429, la dernière `Response` (429) est
   **retournée** (pas levée).

Le resolver : si un test du helper `postCollection` est faisable sans réseau
(mock du throttle), l'ajouter. Sinon, validation manuelle d'un run d'ingestion.

## Critères de succès

- Un run d'ingestion avec fuzzy actif (défaut) ne produit **aucun warning 429**
  dans des conditions normales.
- `rate-limiter.ts` supprimé ; aucun import résiduel.
- `npm run check` passe (tsc + eslint + prettier).
- Les tests du throttle passent.
- Le browser (recherche de cartes via `endpoints/*.ts`) fonctionne toujours :
  cache, dédup et annulation (AbortSignal) intacts.

## Risques

- **Régression browser** : le throttle unifié remplace `scryfallQueue` côté
  front. Mitigation : `fetcher.ts` garde cache/dédup/abort ; tester la recherche
  de cartes manuellement après le changement.
- **Lenteur fuzzy** : 550ms/requête rend la passe fuzzy plus lente qu'avant en
  apparence — mais elle ne génère plus de 429 ni de backoff 30s, donc plus
  rapide en pratique sur les gros runs. Acceptable et attendu.
