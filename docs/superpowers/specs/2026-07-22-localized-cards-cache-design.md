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
- **Faces normalisées (Option 1)** : les images/textes vivent **toujours** dans un unique tableau
  `card_faces` de **1 ou 2 entrées**, jamais dans des champs racine séparés. Une carte mono-face
  = 1 entrée ; une carte à deux images physiques (transform, modal_dfc) = 2 entrées. Le seed
  normalise à l'écriture ; tout lecteur itère `card_faces` sans jamais tester « racine ou faces ».

  **Pourquoi pas le miroir Scryfall strict.** Chez Scryfall, la place des `image_uris` dépend du
  `layout` : à la racine pour split/flip/adventure (une image physique) et mono-face ; **dans
  `card_faces[]`** pour transform/modal_dfc (deux images physiques). Reproduire ça imposerait à
  chaque lecteur de refaire la logique `layout` et laisserait une colonne systématiquement NULL.
  Le cache localisé n'est pas un miroir de Scryfall (exclu — cf. follow-up « objet complet ») :
  son job est de fournir les **faces à afficher**. Un `card_faces` uniforme sert exactement ce
  besoin, se lit sans branche, garde des noms Scryfall (`card_faces`, `image_uris`, `printed_*`),
  et concentre la seule complexité (racine → face unique) dans le seed, pas dans les lecteurs.

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
  └─ normalise en card_faces (1 ou 2 entrées)     └─ useLocalizedImage lit le cache chaud
     { image_uris, printed_* } par face                → 0 fetch api.scryfall.com
  └─ UPSERT idempotent en prod (batch)            miss → fallback API actuel (INCHANGÉ)
     ON CONFLICT (set, collector_number, lang)
```

## Composants

### 1. Table `localized_cards` (migration Supabase)

Clé primaire composite `(set, collector_number, lang)` — c'est la clé de cache déjà utilisée
côté client (`set/collector_number/lang`).

Colonnes, **nommées exactement comme Scryfall** :

| Colonne            | Type        | Notes                                                                                                                                                                                                                   |
| ------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `set`              | text        | partie 1 de la clé                                                                                                                                                                                                      |
| `collector_number` | text        | partie 2 de la clé                                                                                                                                                                                                      |
| `lang`             | text        | partie 3 de la clé ; toujours ≠ `en`                                                                                                                                                                                    |
| `card_faces`       | jsonb       | **Toujours** un tableau de **1 ou 2 entrées** (Option 1, jamais NULL). Chaque entrée : `{ image_uris, printed_name, printed_type_line, printed_text }` — noms Scryfall. Mono-face = 1 entrée ; transform/modal_dfc = 2. |
| `updated_at`       | timestamptz | date du dernier upsert                                                                                                                                                                                                  |

`image_uris` d'une entrée = `{ small, normal, large, png, art_crop, border_crop }` (objet Scryfall).
Aucune colonne racine `image_uris` / `printed_*` séparée — tout passe par `card_faces` (voir
« Faces normalisées » en § Périmètre).

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
   - **normaliser en `card_faces`** (Option 1) : si l'objet Scryfall a `image_uris`/`printed_*` à
     la racine (mono-face, ou split/flip/adventure à image unique) → produire **1 entrée**
     `{ image_uris, printed_name, printed_type_line, printed_text }`. S'il a des `card_faces` avec
     `image_uris` par face (transform, modal_dfc) → produire **2 entrées**, en reprenant les
     `image_uris` + `printed_*` de chaque face. La logique de discrimination vit **ici seulement**.
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
  le lit/écrit, en adoptant le format **uniforme Option 1** (tableau de 1-2 faces portant
  `image_uris` + `printed_*`).
- **Point d'attention — les consommateurs actuels lisent un `image_uris` racine** :
  `cachedToResult` reconstruit aujourd'hui un `LocalizedImageResult` avec `image_uris` (mono-face)
  OU `card_faces` (DFC), et `useLocalizedImage`/`CardImage` fusionnent ça sur la carte de base via
  `{ ...card, ...localized }` (le rendu lit alors `card.image_uris` pour une mono-face,
  `card.card_faces[i].image_uris` pour une DFC — cf. `resolveImageUri` / `computeIsDoubleFaced`).
  L'uniformisation ne doit **pas** casser ce rendu : `cachedToResult` (ou son remplaçant) mappe le
  `card_faces` uniforme du cache vers la forme attendue par le merge — **1 face → `image_uris`
  racine** de l'override, **2 faces → `card_faces`** de l'override. La normalisation « tout en
  `card_faces` » est le format de **stockage** (table + store IndexedDB) ; la **projection** vers
  ce que `CardImage` consomme reste faite au point de lecture, sans toucher `CardImage`.
- **Bumper la version de la DB IndexedDB** (`wizcard-cache`, actuellement v3) → v4, avec un
  `clear()` du store `localized-images` dans `onupgradeneeded` (comme le précédent v3 l'a fait) :
  purge l'ancien format, le cache se re-remplit naturellement. Aucune migration de données à écrire.
- Aligner le type `CachedLocalizedImage` sur `card_faces` uniforme ; `LocalizedImageResult` reste
  la forme projetée que consomme `CardImage` (inchangée).

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
