# Quotas anti-abus (volume de données) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Empêcher qu'un compte authentifié accumule un volume abusif de decks/cartes, via des limites DB non contournables + un feedback UX clair, sans gêner l'usage MTG normal.

**Architecture:** Défense en profondeur. Couche DB : triggers PL/pgSQL sur `decks`/`cards` (plafonds + rate limit sur une colonne `created_at` non falsifiable) et compteurs dénormalisés `user_usage` maintenus par triggers `AFTER`. Couche client : le runner de sync-queue classe les rejets de trigger comme erreurs **permanentes** (fail-fast, pas de retry storm) et les mappe vers un message FR affiché par la bannière `lastError` existante ; le flux d'import pré-vérifie la taille avant d'insérer.

**Tech Stack:** Supabase/Postgres (migrations SQL, PL/pgSQL), Next.js 16 + React 19 + TypeScript strict, Zustand, sync-queue optimiste maison.

## Global Constraints

- Limites (verbatim du spec) : **1000 decks/user**, **5000 cartes/deck**, **250 000 cartes/collection**, **débit 50 000 lignes/15 min**.
- Cartes deck-only (`owner_id IS NULL`) **ne comptent pas** dans le quota collection.
- **Ne pas modifier RLS** ni les policies `auth.uid() = owner_id`.
- Le rate limit s'appuie **uniquement** sur `cards.created_at` (DB-généré), jamais `date_added` (falsifiable par le client).
- Préfixes d'erreur stables : `WIZCARD_LIMIT_DECKS`, `WIZCARD_LIMIT_DECK_CARDS`, `WIZCARD_LIMIT_COLLECTION`, `WIZCARD_RATE_CARDS`.
- Pas de framework de test (cf. `project_no_test_framework`) → vérification = migration SQL exécutée dans Studio + `npm run check` + runtime. Chaque tâche décrit sa vérification manuelle explicite.
- Convention migrations : `supabase/migrations/YYYYMMDDHHMMSS_<slug>.sql`, style `snake_case`, idempotence non requise (append-only), mais **répliquer** tout changement de schéma dans `supabase/bootstrap/init_schema.sql` (DB vierge).

---

## File Structure

- **Create** `supabase/migrations/20260711120000_add_usage_quotas.sql` — colonne `cards.created_at` + revoke + index ; table `user_usage` ; fonctions + triggers (plafonds, rate, maintien compteurs) ; backfill.
- **Modify** `supabase/bootstrap/init_schema.sql` — répliquer le schéma ci-dessus pour une DB vierge.
- **Create** `src/lib/supabase/usage-limit-error.ts` — `isUsageLimitError(err)` + `mapUsageLimitError(err)` (classification + message FR). Fichier plat (1 responsabilité, pas de CSS).
- **Modify** `src/lib/supabase/useSyncQueue.ts` — brancher la classification fail-fast + message.
- **Modify** `src/lib/import/hooks/useImportConfirmation.ts` — pré-vérif taille avant insertion.

---

## Task 1 : Migration DB — colonne `created_at`, `user_usage`, triggers, backfill

**Files:**

- Create: `supabase/migrations/20260711120000_add_usage_quotas.sql`

**Interfaces:**

- Consumes: tables existantes `public.decks`, `public.cards` (colonnes `owner_id`, `deck_id`), rôles `anon`/`authenticated`.
- Produces (contrat consommé par Task 3 côté client) : rejets `RAISE EXCEPTION` dont le message **commence** par l'un des 4 préfixes de la Global Constraints. Table `public.user_usage(owner_id, deck_count, card_count)`. Fonction `public.recompute_user_usage(uid uuid)`.

- [ ] **Step 1: Écrire la migration complète**

Créer `supabase/migrations/20260711120000_add_usage_quotas.sql` :

```sql
-- =========================================================================
-- Quotas anti-abus (volume de données). Défense en profondeur : ces triggers
-- s'appliquent même sur un appel PostgREST direct (bypass du JS client).
-- Limites : 1000 decks/user, 5000 cartes/deck, 250000 cartes/collection,
-- débit 50000 lignes/15min. Cf. docs/superpowers/specs/2026-07-11-quotas-anti-abus-design.md
-- =========================================================================

-- 1. Horodatage d'insertion NON falsifiable (le client fournit date_added,
--    donc on ne peut pas s'en servir pour le rate limit).
alter table public.cards
  add column created_at timestamptz not null default now();

-- Le client ne doit jamais écrire created_at (sinon le rate limit est esquivable).
revoke insert (created_at), update (created_at) on public.cards from anon, authenticated;

-- Index pour le count de la fenêtre de rate limit (borné par ~50k lignes récentes).
create index cards_owner_created_at_idx
  on public.cards (owner_id, created_at)
  where owner_id is not null;

-- 2. Compteurs dénormalisés (pattern rollup counter — check O(1) au lieu de count(*)).
create table public.user_usage (
  owner_id   uuid    primary key references auth.users(id) on delete cascade,
  deck_count integer not null default 0,
  card_count integer not null default 0
);

alter table public.user_usage enable row level security;
-- Lecture par le propriétaire uniquement (utile si l'UI veut afficher l'usage).
create policy "Users can view their own usage"
  on public.user_usage for select
  using (auth.uid() = owner_id);
-- Aucune policy insert/update/delete : seuls les triggers SECURITY DEFINER écrivent.

-- 3. Recalcul depuis la vérité terrain (backfill + réparation d'un compteur dérivé).
create or replace function public.recompute_user_usage(uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_usage (owner_id, deck_count, card_count)
  values (
    uid,
    (select count(*) from public.decks where owner_id = uid),
    (select count(*) from public.cards where owner_id = uid)
  )
  on conflict (owner_id) do update
    set deck_count = excluded.deck_count,
        card_count = excluded.card_count;
end;
$$;

-- 4a. Maintien du compteur de decks.
create or replace function public.trg_decks_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.user_usage (owner_id, deck_count)
    values (new.owner_id, 1)
    on conflict (owner_id) do update
      set deck_count = public.user_usage.deck_count + 1;
  elsif tg_op = 'DELETE' then
    update public.user_usage
      set deck_count = greatest(deck_count - 1, 0)
      where owner_id = old.owner_id;
  end if;
  return null; -- AFTER trigger : valeur de retour ignorée
end;
$$;

-- 4b. Maintien du compteur de cartes de COLLECTION (owner_id posé uniquement).
create or replace function public.trg_cards_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.owner_id is not null then
    insert into public.user_usage (owner_id, card_count)
    values (new.owner_id, 1)
    on conflict (owner_id) do update
      set card_count = public.user_usage.card_count + 1;
  elsif tg_op = 'DELETE' and old.owner_id is not null then
    update public.user_usage
      set card_count = greatest(card_count - 1, 0)
      where owner_id = old.owner_id;
  end if;
  return null;
end;
$$;

-- 5a. Plafond decks/user (BEFORE INSERT, lecture O(1) sur user_usage).
create or replace function public.trg_decks_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare current_count integer;
begin
  select deck_count into current_count
    from public.user_usage where owner_id = new.owner_id;
  if coalesce(current_count, 0) >= 1000 then
    raise exception 'WIZCARD_LIMIT_DECKS: limite de 1000 decks atteinte';
  end if;
  return new;
end;
$$;

-- 5b. Plafonds + rate limit cartes (BEFORE INSERT).
create or replace function public.trg_cards_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  deck_card_count integer;
  coll_count      integer;
  recent_count    integer;
begin
  -- Plafond cartes/deck : count(*) borné par 5000, appuyé sur l'index deck_id.
  if new.deck_id is not null then
    select count(*) into deck_card_count
      from public.cards where deck_id = new.deck_id;
    if deck_card_count >= 5000 then
      raise exception 'WIZCARD_LIMIT_DECK_CARDS: limite de 5000 cartes par deck atteinte';
    end if;
  end if;

  if new.owner_id is not null then
    -- Plafond collection : lecture O(1) sur user_usage.
    select card_count into coll_count
      from public.user_usage where owner_id = new.owner_id;
    if coalesce(coll_count, 0) >= 250000 then
      raise exception 'WIZCARD_LIMIT_COLLECTION: limite de 250000 cartes en collection atteinte';
    end if;

    -- Rate limit : fenêtre récente bornée par la limite elle-même (~50k max).
    select count(*) into recent_count
      from public.cards
      where owner_id = new.owner_id
        and created_at > now() - interval '15 minutes';
    if recent_count >= 50000 then
      raise exception 'WIZCARD_RATE_CARDS: débit d''insertion trop élevé, réessayez dans quelques minutes';
    end if;
  end if;

  return new;
end;
$$;

-- 6. Attacher les triggers.
create trigger decks_limit_before
  before insert on public.decks
  for each row execute function public.trg_decks_limit();

create trigger decks_usage_after
  after insert or delete on public.decks
  for each row execute function public.trg_decks_usage();

create trigger cards_limit_before
  before insert on public.cards
  for each row execute function public.trg_cards_limit();

create trigger cards_usage_after
  after insert or delete on public.cards
  for each row execute function public.trg_cards_usage();

-- 7. Backfill des utilisateurs existants.
do $$
declare u record;
begin
  for u in select id from auth.users loop
    perform public.recompute_user_usage(u.id);
  end loop;
end;
$$;
```

- [ ] **Step 2: Appliquer la migration**

Run: `npm run sb:reset`
Expected: reset OK, toutes les migrations s'appliquent sans erreur, la dernière ligne mentionne `20260711120000_add_usage_quotas`.

- [ ] **Step 3: Vérifier le schéma dans Studio**

Run: `npm run sb:studio`
Vérifier manuellement :

- Table `user_usage` existe avec 3 colonnes.
- `cards.created_at` existe, type `timestamptz`, not null, default `now()`.
- 4 triggers listés (`decks_limit_before`, `decks_usage_after`, `cards_limit_before`, `cards_usage_after`).

- [ ] **Step 4: Vérifier le maintien des compteurs (SQL editor dans Studio)**

Exécuter dans le SQL editor de Studio (remplacer par un uuid de test — créer un user via Auth si besoin) :

```sql
-- Insérer 3 cartes de collection puis vérifier le compteur.
-- (owner_id = un user réel de auth.users)
insert into public.cards (owner_id, scryfall_id) values
  ('<UID>', 'a'), ('<UID>', 'b'), ('<UID>', 'c');
select card_count from public.user_usage where owner_id = '<UID>'; -- attendu : 3

delete from public.cards where owner_id = '<UID>' and scryfall_id = 'a';
select card_count from public.user_usage where owner_id = '<UID>'; -- attendu : 2

-- recompute doit donner le même résultat que la vérité terrain.
select public.recompute_user_usage('<UID>');
select card_count from public.user_usage where owner_id = '<UID>'; -- attendu : 2
```

Expected: 3, puis 2, puis 2.

- [ ] **Step 5: Vérifier le plafond cartes/deck (rapide, seuil abaissé temporairement)**

Pour ne pas insérer 5000 lignes à la main, tester la logique avec un deck réel : insérer une carte deck normale doit **passer**. Le test du seuil complet est couvert au runtime (Task 4). Vérifier au minimum qu'une insertion deck-only légitime réussit :

```sql
-- <DECK_ID> = un deck existant de auth.users
insert into public.cards (deck_id, scryfall_id) values ('<DECK_ID>', 'x');
```

Expected: succès (aucune exception).

- [ ] **Step 6: Vérifier que le client ne peut pas écrire created_at**

Dans le SQL editor, simuler le rôle authenticated :

```sql
set local role authenticated;
insert into public.cards (owner_id, scryfall_id, created_at)
  values ('<UID>', 'z', now() - interval '1 year');
reset role;
```

Expected: **ERREUR** `permission denied for column created_at` (ou équivalent). Confirme la non-falsifiabilité du rate limit.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260711120000_add_usage_quotas.sql
git commit -m "feat(db): usage quotas — caps + rate limit triggers + user_usage counters"
```

---

## Task 2 : Répliquer le schéma dans le bootstrap (DB vierge)

**Files:**

- Modify: `supabase/bootstrap/init_schema.sql`

**Interfaces:**

- Consumes: définition de `public.cards` et `public.decks` déjà présentes dans le bootstrap.
- Produces: rien de nouveau côté API — garantit qu'une DB créée depuis le bootstrap a le même comportement que la DB migrée (Task 1).

- [ ] **Step 1: Localiser le point d'insertion**

Run: `grep -n "create table public.cards\|create table public.decks\|enable row level security" supabase/bootstrap/init_schema.sql`
Repérer la fin des définitions de `cards` et `decks` (après leurs index/policies).

- [ ] **Step 2: Ajouter la colonne created_at à la définition de `cards`**

Dans le `create table public.cards (...)` du bootstrap, ajouter la colonne juste après `date_added` :

```sql
  created_at     timestamptz not null default now(),
```

- [ ] **Step 3: Ajouter le reste du bloc quotas en fin de fichier**

Coller, à la fin de `init_schema.sql`, tout le SQL de la Task 1 **à partir du `revoke ...`** (sections 1-revoke, 1-index, 2, 3, 4, 5, 6) — c'est-à-dire tout SAUF le `alter table ... add column created_at` (déjà fait au Step 2) et SAUF le backfill section 7 (une DB vierge n'a pas d'utilisateurs à backfiller). Reproduire verbatim les blocs `revoke`, l'index `cards_owner_created_at_idx`, la table `user_usage` + sa policy, la fonction `recompute_user_usage`, les 4 fonctions trigger et les 4 `create trigger`.

- [ ] **Step 4: Vérifier qu'une DB vierge se construit**

Run: `npm run sb:reset`
Expected: reset OK sans erreur (le reset applique les migrations, PAS le bootstrap — mais on vérifie qu'il n'y a pas de conflit de nom). Puis vérifier manuellement la cohérence bootstrap↔migration :
Run: `grep -c "create trigger" supabase/bootstrap/init_schema.sql`
Expected: le nombre inclut les 4 nouveaux triggers.

- [ ] **Step 5: Commit**

```bash
git add supabase/bootstrap/init_schema.sql
git commit -m "chore(db): mirror usage-quota schema into bootstrap for fresh DBs"
```

---

## Task 3 : Helper client — classification + message FR

**Files:**

- Create: `src/lib/supabase/usage-limit-error.ts`

**Interfaces:**

- Consumes: message d'erreur brut renvoyé par PostgREST (les préfixes `WIZCARD_*` de Task 1 apparaissent dans `error.message`).
- Produces (consommé par Task 4 & 5) :
  - `isUsageLimitError(err: unknown): boolean`
  - `mapUsageLimitError(err: unknown): string | null` — message FR lisible, ou `null` si ce n'est pas une erreur de quota.

- [ ] **Step 1: Écrire le helper**

Créer `src/lib/supabase/usage-limit-error.ts` :

```ts
/**
 * Classe et humanise les rejets des triggers de quota DB
 * (cf. supabase/migrations/20260711120000_add_usage_quotas.sql).
 * Les triggers lèvent des exceptions dont le message COMMENCE par un préfixe
 * WIZCARD_*. Le préfixe traverse PostgREST dans error.message.
 */

const USAGE_LIMIT_MESSAGES: Record<string, string> = {
	WIZCARD_LIMIT_DECKS: 'Limite atteinte : 1000 decks maximum par compte.',
	WIZCARD_LIMIT_DECK_CARDS: 'Limite atteinte : 5000 cartes maximum par deck.',
	WIZCARD_LIMIT_COLLECTION: 'Limite atteinte : 250 000 cartes maximum en collection.',
	WIZCARD_RATE_CARDS:
		'Trop de cartes ajoutées en peu de temps. Patientez quelques minutes avant de réessayer.',
};

function extractMessage(err: unknown): string {
	if (err && typeof err === 'object' && 'message' in err) {
		const m = (err as { message?: unknown }).message;
		if (typeof m === 'string') return m;
	}
	return typeof err === 'string' ? err : '';
}

/** true si l'erreur est un rejet de quota DB (message permanent, ne pas retry). */
export function isUsageLimitError(err: unknown): boolean {
	const message = extractMessage(err);
	return Object.keys(USAGE_LIMIT_MESSAGES).some((prefix) => message.includes(prefix));
}

/** Message FR lisible, ou null si ce n'est pas une erreur de quota. */
export function mapUsageLimitError(err: unknown): string | null {
	const message = extractMessage(err);
	for (const [prefix, humanMessage] of Object.entries(USAGE_LIMIT_MESSAGES)) {
		if (message.includes(prefix)) return humanMessage;
	}
	return null;
}
```

- [ ] **Step 2: Vérifier le typecheck/lint**

Run: `npm run check`
Expected: PASS (0 erreur TypeScript/ESLint/Prettier sur le nouveau fichier).

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/usage-limit-error.ts
git commit -m "feat(sync): usage-limit error classifier + FR messages"
```

---

## Task 4 : Fail-fast des rejets de quota dans le runner de sync

**Files:**

- Modify: `src/lib/supabase/useSyncQueue.ts:140-162`

**Interfaces:**

- Consumes: `isUsageLimitError`, `mapUsageLimitError` (Task 3) ; helpers existants `skipFailed`, `MAX_RETRIES`, `setLastError`, `refreshStatus`, `dequeue`.
- Produces: comportement — un op rejeté pour quota est marqué **définitivement échoué immédiatement** (pas de boucle de retry/backoff) et `lastError` porte le message FR. La bannière `SyncIndicator` (déjà branchée sur `lastError`) l'affiche.

- [ ] **Step 1: Importer le helper**

Dans `src/lib/supabase/useSyncQueue.ts`, ajouter en haut avec les autres imports depuis `@/lib/supabase/...` :

```ts
import { isUsageLimitError, mapUsageLimitError } from '@/lib/supabase/usage-limit-error';
```

- [ ] **Step 2: Brancher la classification fail-fast dans le catch**

Dans le bloc `catch (err) { ... }` (actuellement lignes ~140-162), **juste après** la branche `if (isAuthError(err)) { ... }` et **avant** le calcul de `delay`, insérer :

```ts
// Rejet de quota DB : erreur permanente. Inutile de retry
// (le volume ne baissera pas tout seul) — on marque l'op échouée
// immédiatement et on affiche un message clair.
if (isUsageLimitError(err)) {
	setLastError(mapUsageLimitError(err));
	// Épuiser les retries d'un coup → l'op est traitée comme
	// permanently-failed par skipFailed en tête de boucle.
	for (let i = op.retries; i < MAX_RETRIES; i++) incrementRetry(op.id);
	refreshStatus();
	continue;
}
```

Note : `mapUsageLimitError(err)` renvoie une `string` non-null ici (garanti par `isUsageLimitError`), compatible avec `setLastError(string | null)`.

- [ ] **Step 3: Typecheck/lint**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Vérification runtime — plafond deck (seuil réel)**

Run: `npm run dev`

- Se connecter, ouvrir un deck, tenter d'y ajouter des cartes jusqu'à dépasser 5000 (ou abaisser temporairement le seuil à 3 dans la migration + `sb:reset` pour tester vite, puis remettre 5000).
- Attendu : à partir du seuil, la carte n'est PAS persistée, la bannière de sync affiche « Limite atteinte : 5000 cartes maximum par deck. », et le runner ne boucle pas indéfiniment (pas de spinner de sync infini).

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/useSyncQueue.ts
git commit -m "feat(sync): fail fast on quota rejections + surface FR message"
```

---

## Task 5 : Pré-vérif de taille d'import avant insertion

**Files:**

- Modify: `src/lib/import/hooks/useImportConfirmation.ts`

**Interfaces:**

- Consumes: `resolved.resolved.length` (nombre de cartes à importer, déjà dispo) ; le compte courant de collection via `entries.length` du `CollectionContext` (déjà exposé, cf. `CollectionContext.tsx` `entries`).
- Produces: si `courant + à-importer > 250000`, `confirm()` **n'appelle pas** `importCards` et pose un `result.errors` explicite + `status = 'error'`. Sinon comportement inchangé.

- [ ] **Step 1: Étendre les deps du hook avec le compte courant**

Le hook reçoit ses dépendances via `deps`. Ajouter un champ `currentCollectionCount: number` à l'objet `deps` (type inline) et le déstructurer :

```ts
export function useImportConfirmation(deps: {
	resolved: ResolvedImportResult | null;
	setStatus: (s: ImportStatus) => void;
	setProgress: (p: ImportProgress) => void;
	setResult: (r: ImportResult) => void;
	importCards: (cards: Array<{ scryfallId: string; entry: CardEntry }>) => void;
	currentCollectionCount: number;
}) {
	const { resolved, setStatus, setProgress, setResult, importCards, currentCollectionCount } =
		deps;
```

- [ ] **Step 2: Ajouter la pré-vérif en tête de `confirm`**

Dans `confirm`, **après** `if (!resolved) return;` et **avant** `setStatus('merging')` :

```ts
const COLLECTION_CAP = 250000;
const incoming = resolved.resolved.length;
if (currentCollectionCount + incoming > COLLECTION_CAP) {
	setResult({
		imported: 0,
		notFound: resolved.notFound.length,
		errors: [
			`Cet import de ${incoming} cartes dépasserait la limite de ${COLLECTION_CAP} cartes en collection (${currentCollectionCount} déjà présentes). Réduisez la sélection.`,
		],
	});
	setStatus('error');
	return;
}
```

- [ ] **Step 3: Passer `currentCollectionCount` au hook depuis son appelant**

Run: `grep -rn "useImportConfirmation" src/lib/import`
Dans le fichier appelant (le hook `useImport` qui compose les sous-hooks), récupérer le compte depuis le contexte collection déjà disponible et le passer. Si `useImport` a accès au `CollectionContext` (via `useCollectionContext().entries`), ajouter :

```ts
const { entries } = useCollectionContext();
// ... dans l'appel :
const { confirm } = useImportConfirmation({
	resolved,
	setStatus,
	setProgress,
	setResult,
	importCards,
	currentCollectionCount: entries.length,
});
```

Si `useImport` n'importe pas déjà `useCollectionContext`, l'ajouter :

```ts
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
```

(Vérifier au Step 1 de grep quel est le fichier exact et son accès au contexte ; l'import Collection est légitime ici car le flux d'import écrit déjà dans la collection.)

- [ ] **Step 4: Typecheck/lint**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Vérification runtime — pré-vérif import**

Run: `npm run dev`

- Pour tester sans 250k cartes : abaisser temporairement `COLLECTION_CAP` à un petit nombre (ex. 5) dans le code, importer un fichier de >5 cartes.
- Attendu : l'import s'arrête AVANT toute insertion, l'écran d'import affiche le message d'erreur « dépasserait la limite… », et aucune carte n'est ajoutée à la collection.
- Remettre `COLLECTION_CAP = 250000`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/import/hooks/useImportConfirmation.ts src/lib/import/hooks/useImport.ts
git commit -m "feat(import): pre-check collection cap before insert with clear message"
```

---

## Self-Review notes (résolues)

- **Couverture spec** : plafonds decks/deck-cards/collection (Task 1 §5) ; rate limit non falsifiable (Task 1 §1 + §5b) ; compteurs dénormalisés + backfill (Task 1 §2-4, §7) ; bootstrap (Task 2) ; mapping erreurs (Task 3) ; feedback UX runner (Task 4) ; pré-vérif import (Task 5). ✅
- **Cohérence types** : `isUsageLimitError`/`mapUsageLimitError` définis en Task 3, consommés tels quels en Task 4. `currentCollectionCount: number` cohérent Task 5 Step 1↔3. Préfixes `WIZCARD_*` identiques entre SQL (Task 1) et helper (Task 3).
- **Décision fail-fast** (non triviale, documentée) : un rejet de quota est permanent ; le runner l'épuise en retries d'un coup plutôt que de boucler MAX_RETRIES × backoff — évite de wedger la sync-queue.
