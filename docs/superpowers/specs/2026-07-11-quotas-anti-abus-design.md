# Quotas anti-abus (volume de données) — Design

**Date** : 2026-07-11
**Contexte** : Toutes les écritures de decks et de cartes partent **directement
du navigateur vers Supabase (PostgREST) sous RLS** — il n'existe aucune couche
serveur applicative entre l'utilisateur et la base pour ces opérations (les
seules `route.ts` sont des proxies en lecture : edhrec, scryfall, moxfield).
Un utilisateur authentifié peut donc appeler PostgREST directement avec son
token et contourner tout le JavaScript. On veut empêcher l'accumulation infinie
de données (création en boucle de decks, ajout massif de cartes) **sans jamais
gêner un usage MTG normal**.

## Positionnement vs. `2026-07-10-securite-design.md`

Le spec sécurité a **explicitement écarté** un rate limit maison, jugé redondant
avec le rate limit auth (GoTrue), `max_rows = 1000` (anti-exfiltration) et le
pool de connexions. **Ce spec ne contredit pas cette décision** : il ne s'agit
pas d'un rate limit _réseau/auth/exfiltration_ (déjà couvert), mais d'un **quota
de volume de données** — un objet différent. GoTrue limite les tentatives de
login ; `max_rows` limite ce qu'une lecture renvoie ; aucun des deux n'empêche un
compte légitime d'insérer des millions de lignes `cards`. C'est ce trou-là qu'on
ferme.

## Objectif & non-objectifs

**Objectif** : plafonner le volume de données qu'un compte peut créer, avec une
protection **non contournable** (côté DB) et un **feedback UX clair** (côté
client). Les limites sont volontairement **très permissives** — un filet
anti-abus, pas un carcan.

**Non-objectifs** :

- Pas de rate limit réseau / anti-brute-force (déjà couvert, cf. ci-dessus).
- Pas de modification de RLS (les policies `auth.uid() = owner_id` restent).
- Pas de rollback transactionnel global des imports (ils sont déjà batchés
  non-atomiques aujourd'hui).

## Modèle de menace

RLS scope déjà toute écriture à `auth.uid() = owner_id` et l'auth anonyme est
désactivée (`ENABLE_ANONYMOUS_USERS=false`) → **l'attaquant est forcément un
compte authentifié**. Deux profils, traités en **défense en profondeur** :

1. **Utilisateur qui dérape** (import massif accidentel, script maladroit, bug en
   boucle) → garde-fous UX côté client.
2. **Compte malveillant** appelant PostgREST directement (bypass du JS) →
   limites dures côté DB, seule couche non contournable.

## Architecture — deux couches

### Couche DB (dure, non contournable) — la vraie protection

Triggers PL/pgSQL sur `decks` et `cards`. Ils s'appliquent même si l'attaquant
appelle PostgREST directement. Chaque violation lève une `EXCEPTION` avec un
message **préfixé reconnaissable** que le client mappe vers un texte lisible.

### Couche client (UX, contournable mais utile)

- Attrape les erreurs des triggers et les mappe vers des messages FR clairs.
- **Pré-vérifie** la taille des imports avant de lancer la rafale (avertit
  _avant_ d'insérer quoi que ce soit, pas de rafale à moitié écrite).

## Limites retenues

| Limite                      | Valeur              | Justification usage normal                             |
| --------------------------- | ------------------- | ------------------------------------------------------ |
| Decks par utilisateur       | **1000**            | Aucun joueur légitime n'approche ça ; power user ~200. |
| Cartes par deck             | **1000**            | Couvre cube (720), highlander, Commander (100).        |
| Cartes en collection        | **250 000**         | Quasi illimité ; plus grosse collection imaginable.    |
| Débit d'insertion de cartes | **50 000 / 15 min** | Absorbe le plus gros import réaliste en une rafale.    |

Cartes deck-only (`owner_id IS NULL`, `deck_id` posé) **ne comptent pas** dans le
quota collection — cohérent entre plafond et compteur.

## Perf : compteurs dénormalisés (pratique standard)

Un trigger `BEFORE INSERT` qui ferait `count(*)` par ligne (500× sur un batch de 500) ne scale pas — anti-pattern connu. On applique le pattern **rollup counter**
(pratique établie Postgres pour les quotas) :

### Table `user_usage`

```sql
create table public.user_usage (
  owner_id   uuid primary key references auth.users(id) on delete cascade,
  deck_count integer not null default 0,
  card_count integer not null default 0
);
```

- `card_count` = cartes de **collection** (`owner_id` posé). Les cartes deck-only
  n'y entrent pas.
- Maintenue par triggers `AFTER INSERT` / `AFTER DELETE` sur `decks` et `cards`,
  en `INSERT ... ON CONFLICT (owner_id) DO UPDATE SET ... = ... ± 1` (atomique,
  gère la contention d'un batch).
- Le check `BEFORE INSERT` lit **une ligne indexée** (PK) → O(1), robuste à 250k+.
- **Backfill** à la migration : `recompute_user_usage(uid)` recalcule depuis la
  vérité terrain, exécuté pour tous les users existants, et réutilisable si un
  compteur dérive.

### Plafond cartes/deck

Le nombre de cartes d'un **deck** donné n'est pas un compteur par user → il reste
un `count(*) FROM cards WHERE deck_id = NEW.deck_id`, appuyé sur l'index existant
`cards (deck_id) WHERE deck_id IS NOT NULL`. Borné par 1000 → count léger.

## Rate limit : horodatage DB non falsifiable

**Faille identifiée** : `date_added` est **fourni par le client**
(`cardRow.ts:92`, `collection.ts:107` l'envoient depuis `entry.dateAdded` ; le
`default now()` n'est utilisé que si le client ne l'envoie pas — or il l'envoie
toujours). Un attaquant peut donc poster `date_added` dans le passé pour esquiver
la fenêtre. **Le rate limit ne peut pas s'appuyer sur `date_added`.**

**Fix** : nouvelle colonne DB-générée, non modifiable par le client :

```sql
alter table public.cards add column created_at timestamptz not null default now();
revoke insert (created_at), update (created_at) on public.cards from anon, authenticated;
create index cards_owner_created_at_idx
  on public.cards (owner_id, created_at) where owner_id is not null;
```

Le check compte les lignes récentes :

```sql
select count(*) from public.cards
  where owner_id = NEW.owner_id
    and created_at > now() - interval '15 minutes'
```

La fenêtre est **bornée par la limite elle-même** (~50k max) : on ne compte que
la fenêtre récente, jamais toute la table (même à 250k). Count léger via l'index.

> Note honnête : un rate limit _purement SQL_ n'a pas de « pratique établie »
> (c'est normalement un token bucket applicatif type Redis). Le `count(*)` sur
> `created_at` borné est le compromis raisonnable en Postgres pur, et suffit à
> couper le débit **soutenu** sans casser une rafale d'import ponctuelle.

## Triggers — logique

**`decks` — BEFORE INSERT** : si `deck_count >= 1000` → `RAISE EXCEPTION
'WIZCARD_LIMIT_DECKS: ...'`.

**`cards` — BEFORE INSERT** :

- si `NEW.deck_id IS NOT NULL` et `count(cards WHERE deck_id=NEW.deck_id) >= 1000`
  → `WIZCARD_LIMIT_DECK_CARDS`.
- si `NEW.owner_id IS NOT NULL` :
  - `card_count >= 250000` → `WIZCARD_LIMIT_COLLECTION`.
  - `count(récent 15 min) >= 50000` → `WIZCARD_RATE_CARDS`.

**`decks` / `cards` — AFTER INSERT / AFTER DELETE** : maintien de `user_usage`.

## Codes d'erreur & mapping client

Messages préfixés stables :

| Limite       | Préfixe message            |
| ------------ | -------------------------- |
| Decks max    | `WIZCARD_LIMIT_DECKS`      |
| Cartes/deck  | `WIZCARD_LIMIT_DECK_CARDS` |
| Collection   | `WIZCARD_LIMIT_COLLECTION` |
| Débit cartes | `WIZCARD_RATE_CARDS`       |

Helper `mapUsageLimitError(error)` : reconnaît le préfixe dans `error.message` et
renvoie un texte FR lisible. Appelé par `insertCardRows`, `insertDeckCardRows`,
`insertDeckRow`.

## Pré-vérif imports & état partiel

- **Pré-vérif** : le flux d'import compare `pendingCount + currentCount` aux
  plafonds **avant** de lancer la rafale et avertit (« Cet import de N cartes
  dépasse la limite de X »). Pas de rafale à moitié écrite dans le cas nominal.
- **Accord avec l'UI** : `INSERT_BATCH_SIZE = 500`, batches séquentiels. Un import
  de 50 000 cartes = 100 batches en série, qui passe pile sous le débit
  50 000 / 15 min. Au-delà, la pré-vérif prévient et invite à scinder.
- **État partiel** (si bypass) : un import coupé laisse les lignes déjà écrites
  valides + une erreur de rate visible. Pas de rollback global (cohérent avec le
  comportement batché actuel).

## Livrables

1. Migration : table `user_usage`, colonne `cards.created_at` + revoke + index,
   fonction `recompute_user_usage`, triggers (plafonds + rate + maintien
   compteurs), backfill des users existants.
2. Mise à jour `supabase/bootstrap/init_schema.sql` (DB vierge).
3. Client : helper `mapUsageLimitError` + branchement dans les 3 fonctions
   d'insert ; pré-vérif taille dans le flux d'import.

## Vérification (pas de framework de test — cf. `project_no_test_framework`)

- `npm run sb:reset` puis Studio : insérer > 1000 decks / > 1000 cartes deck /
  simuler > seuils → l'insert est refusé avec le bon préfixe.
- Import légitime volumineux (~15k) → passe sans accroc, compteurs corrects.
- Falsification : poster `created_at` dans le passé via PostgREST → refusé
  (colonne non inscriptible).
- `recompute_user_usage` = `count(*)` réel après opérations mixtes insert/delete.
- `npm run check`.
