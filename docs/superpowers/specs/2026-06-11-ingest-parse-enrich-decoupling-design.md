# Ingest — Découplage parsing / enrichissement Scryfall

**Date** : 2026-06-11
**Statut** : Design validé, prêt pour le plan d'implémentation

## Contexte

Le pipeline d'ingest MPC (`scripts/ingest-mpc-cards.ts`) traite les sources en deux phases
séquentielles avec deux barrières bloquantes :

1. **Barrière listing** : `await Promise.all([listingsDone, ...dbJobs])` attend que **toutes**
   les sources soient listées (Drive) et pre-checkées (DB) avant de démarrer le moindre ingest.
2. **Barrière Scryfall par source** : dans `ingestSource`, la résolution Scryfall (`resolveBatch`)
   bloque la phase d'upsert de la source entière. Et comme le `sharedScryfallThrottle` est un
   mutex global sérialisé, l'orchestrateur force `sourceConcurrency = 1` quand Scryfall est actif
   → tout le pipeline se sérialise derrière le goulot Scryfall.

**Conséquence** : avec Scryfall actif, le débit total est limité par le rate limit Scryfall
(~1.8 req/s sur `/cards/collection`), même si les phases parsing / image / écriture DB pourraient
tourner bien plus vite en parallèle. On attend aussi la fin du listing complet avant de commencer.

**Objectif** : découpler complètement le **parsing+insertion** de l'**enrichissement Scryfall**.
Le parsing devient rapide et massivement parallèle ; l'enrichissement Scryfall devient un process
indépendant qui respecte son propre rate limit sans bloquer le reste. État partagé = la DB
(`custom_cards.enriched_at IS NULL` comme marqueur), pas de queue mémoire fragile.

## Architecture : 2 stages découplés via la DB

Une **seule commande `ingest`**. Par défaut, les deux stages tournent **en parallèle** dans le
même process. Des flags permettent de n'exécuter qu'un stage.

```
STAGE 1 — Parse + Insert (sans Scryfall)          STAGE 2 — Enrich Scryfall (transversal)
  Pour chaque source, dès que son listing            Worker unique :
  Drive + pre-check DB sont prêts (pipeliné,           - draine une queue mémoire des cartes
  plus de barrière globale) :                            insérées par le Stage 1 (flux du run)
    1. buildPendingFromDrive (parse noms)             - + scan DB final : enriched_at IS NULL
    2. image/hash si activé                            - resolveBatch (75/batch) via le throttle
    3. upsertNewCard(p, sourceId, NULL, ...)           - reEnrichCard(cardId, resolution)
       → enriched_at = null, oracle_id = null         Respecte sharedScryfallThrottle (mutex
  Concurrence : pLimit(5) Drive + pLimit(20)          global, rate limit déjà géré). Ne bloque
  upsert/source, PLUSIEURS sources en parallèle       jamais le Stage 1.
  (plus de sourceConcurrency=1 — plus de Scryfall
  dans ce stage).
```

**Pourquoi c'est sûr** :

- Scryfall : `sharedScryfallThrottle` (`src/lib/scryfall/utils/scryfall-throttle.ts:166`) est un
  mutex global déjà sérialisé. Un seul worker l'utilise → rate limit respecté de bout en bout.
- Drive : `pLimit(5)` conservé pour le quota Google.
- Race conditions : la déduplication image est déjà per-source via requête DB
  (`scripts/ingest/image-pipeline.ts:55` — `.eq('source_id', sourceId)`). Aucun état mutable
  partagé entre sources. Le Stage 1 et le Stage 2 écrivent des colonnes disjointes de la même
  ligne (`upsertNewCard` pose les champs parsing + `enriched_at=null` ; `reEnrichCard` met à jour
  les champs Scryfall + `enriched_at`), donc pas de conflit d'écriture concurrente problématique.

## Le marqueur DB existe déjà

Aucune migration nécessaire. La table `custom_cards` a déjà :

- `enriched_at timestamptz` (nullable, pas de default) — migration `20260601000003_add_scryfall_enrichment.sql`
- `oracle_id text` (nullable)

`upsertNewCard` (`scripts/ingest/db-writer.ts:136`) pose déjà
`enriched_at: resolution ? now() : null`. Donc insérer **sans** résolution
(`upsertNewCard(p, sourceId, null, ...)`) produit exactement une carte non-enrichie
(`enriched_at IS NULL, oracle_id NULL`).

`fetchStaleCards` (`scripts/ingest/db-writer.ts:100`) sélectionne déjà
`enriched_at.is.null,enriched_at.lt.${threshold}` — c'est le **template exact** de la requête de
scan du Stage 2 ; il suffit de le généraliser (global au lieu de per-source).

## Stage 1 — Parse + Insert

Fichiers : `scripts/ingest-mpc-cards.ts`, `scripts/ingest/ingest-source.ts`.

- Supprimer la barrière `await Promise.all([listingsDone, ...dbJobs])` qui précède l'ingest.
  À la place : **pipeliner** — pour chaque source, chaîner `listing source → ingest source` dès
  que le couple (listing Drive + pre-check DB) de cette source est prêt. Réutiliser le
  `registerTaskHud` existant (déclenché quand les deux moitiés sont prêtes) comme point de départ
  de l'ingest de la source.
- Dans `ingestSource`, **retirer la Phase 2 Scryfall** (`resolveBatch`) : appeler
  `upsertNewCard(p, sourceId, null, imageHash, storagePath)` directement. La phase 3 (upsert/image,
  `pLimit(20)`) reste, mais sans dépendre d'une résolution.
- Chaque carte insérée est **poussée dans la queue mémoire** du Stage 2 (id + champs nécessaires à
  `CardToResolve` : `parsed`, `cardType`, `setCode`).
- Concurrence sources : plusieurs sources en parallèle (p.ex. `pLimit(5)`), puisque Scryfall ne
  sérialise plus ce stage. Drive reste à `pLimit(5)`.
- Le mode re-enrich (`fetchStaleCards`) n'a plus de rôle dans le Stage 1 ; la logique de
  re-enrichissement bascule dans le Stage 2 (cf. ci-dessous).

## Stage 2 — Enrich Scryfall (worker transversal)

Nouveau module : `scripts/ingest/enrich-worker.ts` (ou similaire).

- **Source de travail (hybride)** :
  1. Une **queue mémoire** alimentée par le Stage 1 (cartes du run courant) — drainée par batches
     de 75.
  2. Un **scan DB final** : une fois le Stage 1 terminé ET la queue vidée, exécuter une requête
     globale `enriched_at IS NULL` (+ `OR enriched_at < threshold` si `--re-enrich`) pour rattraper
     les cartes restantes (anciens runs, échecs partiels). Réutiliser le pattern `fetchStaleCards`,
     généralisé (pas de `.eq('source_id', ...)` sauf si `--source`/`--limit-sources` passés).
- **Résolution** : `resolveBatch(cards, { fuzzy: flags.fuzzy })` (réutilisé tel quel) → renvoie un
  `Map<cardId, ScryfallResolution>`.
- **Écriture** : `reEnrichCard(cardId, resolution ?? null)` pour chaque carte — pose les champs
  Scryfall + `enriched_at` (ou `enriched_at=null` si non résolue, ce qui la laisse rattrapable).
- **Condition de fin** : Stage 1 signalé fini (flag/promesse `parsingDone`) ET queue vide ET un scan
  DB final ne retourne plus rien.
- **Rate limit** : tous les appels passent par `sharedScryfallThrottle` (déjà le cas dans
  `resolveBatch`). Un seul worker → pas de sur-débit.

## Flags de la commande `ingest`

- (défaut, aucun flag) : Stage 1 + Stage 2 en parallèle.
- `--parse-only` : Stage 1 seul (insère sans enrichir). Utile pour ingérer vite puis enrichir plus
  tard.
- `--enrich-only` : Stage 2 seul. Scanne la DB pour `enriched_at IS NULL` (global par défaut).
  **Respecte `--source` / `--limit-sources`** s'ils sont passés (filtrage par source). Combinable
  avec `--re-enrich` pour réenrichir les cartes anciennes (`enriched_at < threshold`).

Câblage des flags dans `scripts/ingest/config.ts` (où vivent déjà `flags`).

## HUD — Section SCRYFALL

Le HUD actuel est pensé par-source (`TaskRow`). Le Stage 2 est transversal → il lui faut sa propre
visualisation.

- **Nouveau composant** `scripts/ingest/hud/ScryfallSection.tsx`, calqué sur
  `scripts/ingest/hud/GlobalSection.tsx`. Réutilise le composant **existant** `SegmentedBar`
  (`scripts/ingest/hud/SegmentedBar.tsx`) — une barre unique multi-couleurs représentant les
  proportions de statut, exactement ce qui est demandé. Aucune nouvelle logique de barre.
- **Mapping couleurs** (réutilise les 4 segments de `SegmentedBar`) :
  - 🟢 vert = résolues (`set_num` / `name` / `fuzzy`)
  - 🔴 rouge = échec (erreur réseau / Scryfall)
  - 🟡 jaune (slot « stale ») = non résolues (tentées, 0 match)
  - ⬜ dim = restantes à traiter (`enriched_at IS NULL` pas encore vues par le worker)
- **Placement** : section fixe permanente dans le pane gauche, **juste sous GLOBAL**, au-dessus de
  la liste des sources. Insérée dans `scripts/ingest/hud/index.tsx` après `<GlobalSection />`.
- **Contenu** (comme GLOBAL) : barre segmentée + `done/total + %` + ETA/vitesse + compteurs
  `resolved / unresolved` + badges warn/error.

### Deux barres séparées : GLOBAL (Stage 1) + SCRYFALL (Stage 2)

> Note d'implémentation : finalement, **deux barres distinctes** plutôt qu'une seule barre GLOBAL
> combinée. La barre **GLOBAL** suit le Stage 1 (parse + insert / skip) ; la section **SCRYFALL
> ENRICH** suit le Stage 2 (résolu / non résolu / échec). C'est plus lisible qu'une barre combinée
> qui mélangerait deux rythmes très différents (insert rapide, enrich lent au rate limit Scryfall),
> et ça montre clairement que le parsing finit avant l'enrichissement.

Implémentation : l'état HUD (`scripts/ingest/logger.ts`) est étendu avec des compteurs d'enrich
(`enrichTotal`, `enrichDone`, `enrichResolved`, `enrichUnresolved`, `enrichFailed`) et des méthodes
`logger.progress.enrichStart(total)` / `enrichTick({...})`, sur le modèle des méthodes
`start`/`taskTick` existantes. La section SCRYFALL lit ces compteurs ; le `globalTotal` reste celui
du Stage 1 (cartes Drive).

## Fichiers impactés (récap)

| Fichier                                  | Changement                                                                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/ingest-mpc-cards.ts`            | supprimer barrière listing ; pipeliner listing→ingest ; lancer le worker Stage 2 en // ; câbler flags ; condition de fin hybride |
| `scripts/ingest/ingest-source.ts`        | retirer la phase Scryfall ; `upsertNewCard(..., null, ...)` ; pousser les cartes en queue Stage 2                                |
| `scripts/ingest/enrich-worker.ts`        | **nouveau** — worker Scryfall (queue + scan DB final + resolveBatch + reEnrichCard)                                              |
| `scripts/ingest/db-writer.ts`            | généraliser `fetchStaleCards` en scan global `enriched_at IS NULL` (filtrable par source)                                        |
| `scripts/ingest/config.ts`               | flags `--parse-only`, `--enrich-only`                                                                                            |
| `scripts/ingest/logger.ts`               | état + méthodes de progression enrich                                                                                            |
| `scripts/ingest/hud/ScryfallSection.tsx` | **nouveau** — section HUD (réutilise SegmentedBar)                                                                               |
| `scripts/ingest/hud/index.tsx`           | insérer `<ScryfallSection />` sous `<GlobalSection />`                                                                           |

## Réutilisé tel quel

- `upsertNewCard(p, sourceId, null, ...)` — insertion non-enrichie (`scripts/ingest/db-writer.ts:136`)
- `reEnrichCard(cardId, resolution)` — update Scryfall (`scripts/ingest/db-writer.ts:175`)
- `resolveBatch(cards, { fuzzy })` — résolution batch (`src/lib/mpc/scryfall-resolver.ts:284`)
- `sharedScryfallThrottle` — rate limit (`src/lib/scryfall/utils/scryfall-throttle.ts:166`)
- `SegmentedBar` — barre multi-couleurs (`scripts/ingest/hud/SegmentedBar.tsx`)
- `GlobalSection` — template de la nouvelle section (`scripts/ingest/hud/GlobalSection.tsx`)
- `fetchStaleCards` — template de la requête de scan (`scripts/ingest/db-writer.ts:100`)

## Vérification (end-to-end)

1. `npm run check` — TypeScript + ESLint + Prettier doivent passer.
2. **Run par défaut** sur une source de test (`--source mpcfill:<key>` + `--limit-sources 1`) :
   observer dans le HUD que la barre GLOBAL et la section SCRYFALL avancent ; que le parsing
   (insert) progresse plus vite que l'enrich.
3. **Vérif DB intermédiaire** : pendant/juste après le Stage 1, requêter
   `select count(*) from custom_cards where enriched_at is null` → doit être > 0 puis tendre vers 0
   quand le Stage 2 finit.
4. **`--parse-only`** : vérifier que toutes les cartes sont insérées avec `enriched_at IS NULL` et
   qu'aucun appel Scryfall n'est émis (pas d'event `card.resolved`).
5. **`--enrich-only`** ensuite : vérifier qu'il rattrape les cartes `enriched_at IS NULL` et les
   passe à résolu ; tester `--enrich-only --source mpcfill:<key>` pour le filtrage par source.
6. **Idempotence / reprise** : relancer un run complet → les cartes déjà enrichies sont skip
   (pas re-résolues sauf `--re-enrich`), aucun doublon.
7. Respect du rate limit : vérifier l'absence d'events `drive.retry`/429 en rafale et que le débit
   Scryfall reste sous le plafond (le throttle s'en charge — confirmer qu'un seul worker l'utilise).
