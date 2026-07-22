# Cache serveur d'images/textes localisés — `localized_cards`

**Date** : 2026-07-22
**Statut** : design validé, prêt pour le plan d'implémentation

## Problème

En première visite d'une vue de cartes (`/collection`, `/decks/[id]`, `/wishlist`, page carte),
les cartes non-anglaises mettent longtemps à s'afficher. La cause est un **N+1 sur
`api.scryfall.com`** : `useLocalizedImage` (`src/lib/scryfall/hooks/useLocalizedImage.ts`)
fait **un GET `/cards/{set}/{number}/{lang}` par carte** dès qu'elle n'est pas en anglais.
Cet endpoint est sur le tier « slow » du throttle (2 req/s, `SLOW_GAP_MS = 550`), donc les
localisations arrivent au compte-gouttes. Chaque visiteur repaie ces fetchs — une carte FR
dans un deck public jamais importée est froide pour tout le monde.

`/cards/collection` (le batch de 75) **n'honore PAS le champ `lang`** par identifiant
(vérifié dans la doc Scryfall : clés supportées = `id, mtgo_id, multiverse_id, oracle_id,
illustration_id, name, set, collector_number`). On ne peut donc **pas** batcher les
localisations sur Scryfall.

## Faits Scryfall (contraintes)

- **API `api.scryfall.com`** : < 10 req/s, un 429 = accès coupé 30s, abus répété = ban.
  Le `sharedScryfallThrottle` actuel est déjà conforme et ne doit pas être desserré.
- **`*.scryfall.io`** (URLs d'images ET fichiers bulk data) : **aucun rate limit**.
- **Bulk data** : le fichier `all_cards` (toutes langues) fait ~2.58 GB en `.jsonl.gz`.
  Scryfall recommande explicitement le bulk pour les gros besoins plutôt que de marteler l'API.

## Invariant de conception

Le trafic vers `api.scryfall.com` ne peut que **baisser**. Le remplissage massif se fait via
le bulk file (`*.scryfall.io`, illimité). Le fallback client existant ne se déclenche plus que
sur les trous (éditions très récentes, gap entre deux seeds). **Aucun nouveau consommateur du
`sharedScryfallThrottle`. Aucune route d'écriture publique.**

## Périmètre retenu

- **Table `localized_cards`** partagée (lecture publique), pré-remplie par un seed bulk manuel.
- **Champs d'affichage** : images **+** texte localisé (`printed_name`, `printed_type_line`,
  `printed_text`), pas l'objet Scryfall complet.
- **Noms de champs = noms Scryfall à l'identique**, sur tout le chemin des données localisées
  (table → seed → lecture → cache client → consommation). Inclut le renommage du cache client
  existant `face_image_uris → card_faces`.

### Hors scope (follow-ups)

- Rendu progressif de la grille (`isFullyLoaded` dans `collection-store`) — chantier orthogonal.
- Refresh automatisé du seed (cron prod) — le seed reste manuel pour l'instant.
- Réchauffage du cache via le fallback client (« A' ») — rendu inutile par le seed bulk.
- **Unification globale du nommage Scryfall à l'échelle du codebase** — chantier de refactoring
  dédié, à brainstormer séparément. Ce spec unifie _uniquement_ le chemin des données localisées.

## Flux

```
SEED (manuel, local → prod)                  1re VISITE (navigateur)
──────────────────────────                   ──────────────────────────
script npm sur la machine dev                 useCollectionCards → CardStack[]
  └─ GET /bulk-data (métadonnées)                └─ collecte les (set, number, lang≠en) de la vue
  └─ download all_cards .jsonl.gz (scryfall.io)  └─ 1 requête batch → localized_cards
  └─ stream ligne par ligne (jamais tout en RAM) └─ injecte les hits dans le cache IndexedDB
  └─ filtre lang≠en + scan réel (hasRealScan)       (store `localized-images`, format Scryfall)
  └─ extrait set/number/lang → image_uris,        └─ useLocalizedImage lit le cache chaud
     printed_*, card_faces                              → 0 fetch api.scryfall.com
  └─ UPSERT idempotent en prod (batch)            miss → fallback API actuel (INCHANGÉ)
     ON CONFLICT (set, collector_number, lang)
```

## Composants

### 1. Table `localized_cards` (migration Supabase)

Clé primaire composite `(set, collector_number, lang)` — c'est la clé de cache déjà utilisée
côté client (`set/collector_number/lang`).

Colonnes, **nommées exactement comme Scryfall** :

| Colonne             | Type        | Notes                                                                                                                                                   |
| ------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `set`               | text        | partie 1 de la clé                                                                                                                                      |
| `collector_number`  | text        | partie 2 de la clé                                                                                                                                      |
| `lang`              | text        | partie 3 de la clé ; toujours ≠ `en`                                                                                                                    |
| `image_uris`        | jsonb       | `{ small, normal, large, png, art_crop, border_crop }` (Scryfall). NULL pour les DFC.                                                                   |
| `printed_name`      | text        | NULL pour les DFC (le texte vit dans `card_faces`)                                                                                                      |
| `printed_type_line` | text        | idem                                                                                                                                                    |
| `printed_text`      | text        | idem                                                                                                                                                    |
| `card_faces`        | jsonb       | DFC uniquement : `[{ image_uris, printed_name, printed_type_line, printed_text }, …]` — structure Scryfall exacte (B1). NULL pour les cartes mono-face. |
| `updated_at`        | timestamptz | date du dernier upsert                                                                                                                                  |

- **RLS** : `SELECT` autorisé à tous, **y compris `anon`** (un deck public doit être consultable
  sans login ; ce sont des URLs d'images publiques, pas de données privées). **Aucune policy
  `INSERT`/`UPDATE`/`DELETE`** — la table n'est écrite que par le seed via une connexion directe
  (rôle service / `postgres`), qui bypasse la RLS.
- **Contenu** : uniquement `lang ≠ en` et **scan réel** (réutilise la logique `hasRealScan` /
  `image_status` : on ne persiste jamais les placeholders Scryfall — même règle que le cache client actuel).
- **Poids estimé** : ~250k lignes (impressions non-en, scan réel) × ~1 Ko utile ≈ **500–700 MB**
  table+index. Acceptable pour le Postgres prod self-hosted.

### 2. Script de seed (`npm run seed:localized-cards`)

Lancé **manuellement en local, écrit directement en prod** (connexion Postgres directe de la
prod self-hosted Coolify — la même que pour appliquer les migrations idempotentes à la main).

Étapes :

1. GET `https://api.scryfall.com/bulk-data`, lire l'entrée `type: "all_cards"` (URL + taille).
2. Download le `.jsonl.gz` depuis `*.scryfall.io` (pas de rate limit).
3. **Streamer ligne par ligne** (décompression gzip en flux ; ne JAMAIS charger les 2.58 GB en
   mémoire — cf. les incidents OOM d'ingestion passés). Pour chaque objet carte :
   - ignorer si `lang === 'en'`.
   - ignorer si pas de scan réel (`image_status` placeholder/missing) — sauf DFC dont au moins
     une face a un scan réel.
   - extraire `set`, `collector_number`, `lang`, `image_uris`, `printed_name`,
     `printed_type_line`, `printed_text`, et `card_faces` (sous-ensemble des champs ci-dessus).
4. **UPSERT par batch** (`INSERT … ON CONFLICT (set, collector_number, lang) DO UPDATE SET …`).
   Idempotent : ré-exécutable sans doublon ni corruption.

Emplacement : script Node hors `src/app` (ex. `scripts/` ou `supabase/seed/`), n'utilise PAS le
`sharedScryfallThrottle` (aucun appel à l'API `api.scryfall.com` hormis le GET `/bulk-data`
initial, qui est unique).

### 3. Lecture client — batch au montage (lecture pure)

Nouvelle requête (couche `src/lib/supabase/` conformément à AGENTS.md : « never call the Supabase
client outside `src/lib/supabase/` ») : prend une liste de `(set, collector_number, lang)` et
renvoie les lignes `localized_cards` correspondantes (rows only ; le mapping row→domaine, s'il
existe, vit dans un module `db/`).

Câblage : là où les `CardStack[]` sont résolus (collection, deck, wishlist). Au montage de la
vue :

1. collecter les clés `(set, collector_number, lang)` **non-en** de la vue.
2. **1 requête batch** → hits `localized_cards`.
3. **injecter les hits dans le cache IndexedDB** (le store `localized-images` de la DB
   `wizcard-cache`, celui que `useLocalizedImage` lit déjà — voir §4 pour l'alignement de format).
   Le nom du store reste `localized-images` (interne) même si la table serveur s'appelle
   `localized_cards` — renommer le store forcerait un bump/purge supplémentaire sans bénéfice.

`useLocalizedImage` reste **inchangé dans sa logique** : il lit son cache, désormais pré-rempli
→ 0 fetch API. Sur un miss (carte pas encore seedée), il retombe **exactement** sur le
comportement actuel (fetch API + cache). **Zéro régression possible** : le serveur n'est qu'une
couche d'accélération, jamais une dépendance dure.

### 4. Unification nommage Scryfall — cache client

Aujourd'hui le cache client utilise un nom **non-Scryfall** : `face_image_uris`
(`CachedLocalizedImage` dans `src/lib/scryfall/utils/card-cache.ts`, et `cachedToResult` /
`putLocalizedImageInCache` dans `useLocalizedImage.ts`). Pour que la table, le seed, la lecture
et le cache parlent tous Scryfall :

- Renommer `face_image_uris` → **`card_faces`** dans `CachedLocalizedImage` et tout le code qui
  le lit/écrit, en adoptant la structure Scryfall (tableau de faces portant `image_uris` +
  `printed_*`).
- **Bumper la version de la DB IndexedDB** (`wizcard-cache`, actuellement v3) → v4, avec un
  `clear()` du store `localized-images` dans `onupgradeneeded` (comme le précédent v3 l'a fait) :
  purge l'ancien format, le cache se re-remplit naturellement. Aucune migration de données à écrire.
- Aligner `cachedToResult` / le type `LocalizedImageResult` sur `card_faces`.

## Stratégie de test

Pas de framework de test (cf. `project_no_test_framework`). Vérification via :

- `npm run check` (TS + ESLint + Prettier ; gate sur « aucun NOUVEAU problème » — le baseline est
  rouge, cf. `project_check_red_baseline` — via `npx eslint` sur les fichiers changés).
- `npm run build` (le seul à attraper certains TS2589 sur les builders Supabase, cf.
  `project_supabase_builder_ts2589`).
- Runtime dev : `sb:migrate`/`sb:reset` + Studio pour la migration ; lancer le seed en local
  contre la DB locale, vérifier le peuplement ; ouvrir une vue avec des cartes non-en et
  confirmer 0 appel `/cards/{set}/{number}/{lang}` en 1re visite (Network tab) une fois seedé,
  et le fallback qui repart sur un miss.

## Déploiement (prod)

- Migration `localized_cards` appliquée en prod via le workflow idempotent habituel
  (`project_prod_migration_workflow` : diff main..origin/deploy, script idempotent dans le SQL
  editor, sync `schema_migrations`).
- Seed exécuté à la main depuis la machine dev contre la prod, quand un rafraîchissement est
  voulu (nouvelles éditions).
