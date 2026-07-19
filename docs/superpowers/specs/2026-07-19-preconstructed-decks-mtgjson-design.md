# Decks préconstruits (MTGJSON) + visibilité par deck

Date: 2026-07-19
Statut: design validé, prêt pour plan d'implémentation

## Objectif

Importer tous les decks préconstruits officiels (precons WotC) depuis MTGJSON et les
exposer dans la page de recherche, fusionnés avec les decks utilisateurs. Un script de
sync backend tient les precons à jour ; la recherche lit simplement la base.

En cours de route, la visibilité des decks devient explicite : chaque deck porte un
`is_public` (défaut `true`), pour les decks utilisateurs comme pour les precons.

## Décisions structurantes

| Sujet                  | Décision                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Source des precons     | MTGJSON (`DeckList.json` + `AllDeckFiles/<fileName>.json`) — seule source publiant des listes complètes versionnées |
| Nature du « provider » | Script de sync backend (pas un React Context) ; la recherche lit la DB                                              |
| Stockage               | Dans `decks` / `cards` existantes, **pas** de tables dédiées                                                        |
| Exposition UI          | Fusionné dans le mode « Decks » du search, avec badge « Precon »                                                    |
| Portée                 | Precons = vrais decks navigables (réutilisent toute l'UI deck)                                                      |
| Visibilité             | `decks.is_public` par deck, combiné au gate profil existant                                                         |
| Enrichissement         | Délégué à l'enrich-worker Scryfall existant (`enriched_at IS NULL`)                                                 |

### Tension résolue

Tables dédiées (RLS propre) et « vrais decks navigables » (réutiliser l'UI) se
contredisaient : la page détail, les stats et le sample hand lisent `decks` + `cards`
avec un `deck_id`. Stocker les precons ailleurs aurait imposé de dupliquer cette UI.
Décision : precons dans `decks`/`cards`, discriminés par une colonne `source`.

## 1. Modèle de données

Migration `supabase/migrations/<ts>_add_deck_visibility_and_precons.sql`.

### Colonnes sur `public.decks`

- `is_public boolean not null default true` — partage par deck, pour tous les decks.
- `source text not null default 'user' check (source in ('user','mtgjson'))` — discrimine
  les precons pour le sync et l'affichage (badge), **pas** pour la RLS.
- `source_deck_id text` — clé stable MTGJSON (`fileName`), pour l'upsert idempotent.
- `source_version text` — version MTGJSON du dernier sync, pour skip si inchangé.
- `unique (source, source_deck_id)`.
- `owner_id` devient **nullable**.
- `check ((source = 'user') = (owner_id is not null))` — deck user ⇒ owner présent ;
  precon ⇒ owner null.

### `public.cards`

Aucun changement structurel : `deck_id`, `tags` et `owner_id` nullable existent déjà.

### RLS

Les policies publiques existantes sont **modifiées** (drop if exists + recreate, mêmes
noms — pattern de `20260713130000_privacy_gate_public_reads`), pas doublées.

Un precon a `owner_id = null` : `profile_is_public(null)` est `false`, donc les policies
actuelles le rendraient invisible. D'où la branche dédiée.

```sql
-- decks : lecture publique
using (
  (owner_id is null and is_public)                       -- precons
  or (is_public and public.profile_is_public(owner_id))  -- deck user : profil ET deck publics
  or auth.uid() = owner_id                               -- owner voit toujours les siens
)

-- cards (deck cards) : même prédicat via exists sur decks d
using (
  deck_id is not null
  and exists (
    select 1 from public.decks d
    where d.id = cards.deck_id
      and (
        (d.owner_id is null and d.is_public)
        or (d.is_public and public.profile_is_public(d.owner_id))
        or auth.uid() = d.owner_id
      )
  )
)
```

La policy « collection cards » (owner_id set, pas de deck_id) reste inchangée.
Aucune policy write publique : le sync écrit en `service_role` (bypass RLS).

### Backfill

`default true` + `not null` suffit : les decks existants deviennent publics, ce qui
préserve le comportement actuel (tout deck d'un profil public est déjà visible).
Aucune régression de visibilité.

## 2. Couche de sync MTGJSON

Nouveau script `scripts/sync-precons.ts` (+ modules dans `scripts/precons/`), lancé par
`npm run precons:sync`. Calqué sur le pipeline d'ingest MPC existant : client
`service_role` via `.env.local` / `.env.ingest`, logger, modules config/db-writer séparés.

### Source

- `Meta.json` → `version` globale.
- `DeckList.json` → manifeste (`fileName`, `name`, `releaseDate`, `type`).
- `AllDeckFiles/<fileName>.json` → `data.commander[]`, `data.mainBoard[]`,
  `data.sideBoard[]`, chaque carte portant `count` et `identifiers.scryfallId`.

### Pipeline (idempotent, par deck)

1. Récupérer `Meta.json` puis `DeckList.json`.
2. `source_deck_id = fileName`.
3. **Skip** si un deck `source='mtgjson'` avec ce `source_deck_id` a déjà
   `source_version === meta.version`.
4. Sinon, récupérer le fichier du deck et :
   - **upsert** `decks` sur `unique(source, source_deck_id)` : `name`, `format` (mappé
     depuis `type`), `source='mtgjson'`, `source_version`, `is_public=true`,
     `owner_id=null`.
   - **delete** toutes les `cards` du deck, puis **re-insert**. Pas d'upsert par carte :
     il n'existe pas de clé naturelle par exemplaire.

### Modèle des cartes

Le store deck (`deck-store.ts`, boucle `for (let i = 0; i < quantity; i++)`) stocke
**une ligne `cards` par exemplaire physique**, et encode la zone dans `tags` via
`setDeckZone` (`deck:<zone>`), pas dans la colonne `zone`. Le sync s'aligne strictement :

- `count = n` → **n lignes** insérées. Pas de colonne quantity.
- Chaque ligne : `deck_id`, `owner_id = null`, `scryfall_id`, `tags = ['deck:<zone>']`
  (`mainboard` / `sideboard` / `commander`), `enriched_at = null`.

### Enrichissement

Le sync **n'enrichit pas**. Il pose `scryfall_id` + `enriched_at = null` ; l'enrich-worker
Scryfall existant traite ces lignes au passage suivant, exactement comme les cartes MPC.
C'est le découplage parse/enrich déjà en place dans le projet.

### Flags

- `--force` — ignore le check de version, ré-importe tout.
- `--deck <fileName>` — cible un seul deck (debug).
- `--dry-run` — log sans écrire.

## 3. Recherche fusionnée + affichage

### Requête

La fusion est **native** : les precons vivent dans `decks`, donc la requête existante de
`searchDecks` (`from('decks').select('*', { count: 'exact' })`) les remonte déjà. Aucune
seconde source à unifier, aucune pagination à réconcilier.

Ajustements dans `src/lib/search/db/searchDecks.ts` :

- `rowToResult` mappe `source` et `isPublic` dans `DeckMeta`.
- Défense en profondeur : `.eq('is_public', true)` pour l'anon (la RLS reste l'autorité),
  avec branche `or` pour que l'owner voie ses decks privés.
- Filtre precon tri-état (tous / precons seuls / sans precons) mappé sur `.eq('source', …)`.
- Tri inchangé (`updated_at desc`). Les precons ont un `updated_at` figé à la date de sync ;
  un tri « pertinence/nouveauté » est hors périmètre (YAGNI).

### Affichage

- `DeckMeta` gagne `source: 'user' | 'mtgjson'` et `isPublic: boolean`.
- Résultat de recherche : badge « Precon » quand `source === 'mtgjson'`, **sans champ
  auteur** (les precons n'ont pas d'owner ; `resolveAuthorsById` ne renvoie rien pour eux).
- `DeckFilterModal` : toggle tri-état du filtre precon.

### Page détail

`decks/[id]` fonctionne déjà pour les precons (mêmes tables). Deux ajustements :

- `fetchDeckMetaServer` doit sélectionner `source, is_public`.
- L'UI d'édition est **masquée** pour un precon. Les policies update le bloquent déjà côté
  serveur ; l'UI ne doit pas proposer des actions vouées à échouer.

## 4. Toggle « Deck public » + orchestration

### Toggle UI

Tous les decks user portent `is_public` (défaut `true`), donc un contrôle est nécessaire,
dans l'UI d'édition/paramètres du deck (page détail), près des métadonnées existantes.

- Visible et actionnable seulement pour l'owner (`auth.uid() === deck.ownerId`).
- Écrit via les policies `update` existantes — aucune nouvelle policy write.
- Masqué pour les precons.
- Un deck privé disparaît de la recherche pour les tiers, reste visible pour son owner.

**Cohérence à signaler dans l'UI** : le gate est « profil ET deck ». Un deck `is_public=true`
sous un profil privé reste invisible aux tiers. Le toggle affiche un texte d'aide
conditionnel quand `profile.is_public === false`, sinon l'utilisateur croit publier alors
que son profil masque tout.

### Orchestration

- `npm run precons:sync` — manuel, calqué sur `npm run ingest`
  (`NODE_ENV=production npx tsx scripts/sync-precons.ts`).
- Pas de cron dans ce lot : MTGJSON publie quelques fois par mois ; un lancement manuel
  après une sortie suffit, et le check `source_version` rend un re-run quasi gratuit.
- Après le sync, l'enrich-worker existant traite les nouvelles cartes.

## Vérification

Pas de framework de test dans ce projet : vérification par migration + runtime.

- `npm run sb:migrate` puis `npm run sb:verify` (audit de schéma).
- `npm run precons:sync --dry-run`, puis sync réel sur un `--deck` unique.
- Runtime : precon visible dans `/search` mode Decks avec badge ; page détail navigable et
  non éditable ; filtre tri-état ; toggle `is_public` sur un deck user ; vérification en
  anonyme qu'un deck privé est bien invisible.
- `npx eslint` sur les fichiers touchés — le `check` global n'est pas vert à la base, la
  porte est « aucun nouveau problème ».

## Hors périmètre

- Cron / sync automatique.
- Tri « pertinence » ou mise en avant des precons.
- Copie d'un precon vers la collection de l'utilisateur (« cloner ce deck »).
- Import des precons non-MTGJSON (Arena starter decks, etc.).
