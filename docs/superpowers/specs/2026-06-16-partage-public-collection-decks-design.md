# Partage public : collection, liste de decks, deck

Date : 2026-06-16

## Contexte

Wizcard est un gestionnaire de collection/decks MTG. Aujourd'hui les trois pages
clés — `/collection`, `/decks`, `/decks/[id]` — sont des composants `'use client'`
verrouillés au propriétaire : le RLS Supabase n'autorise la lecture que pour
`auth.uid() = owner_id`, et chaque page hydrate ses données depuis les contextes
globaux (`AuthProvider → CollectionProvider → WishlistProvider → DeckProvider`)
liés à l'utilisateur connecté.

L'utilisateur veut pouvoir **partager** sa collection, sa liste de decks et un
deck individuel via une simple URL, sans aucun système de token ni opt-in :
**tout est public maintenant** (réversible plus tard). Les visiteurs (anonymes
ou connectés) ont un accès **lecture seule** ; un visiteur **connecté** peut en
plus **copier un deck dans son propre compte**.

Résultat attendu : trois surfaces publiques consultables par n'importe qui
connaissant l'URL, sans exposer les données financières privées.

## Décisions actées

- **Modèle d'accès** : tout public, pas de token, pas d'opt-in. RLS autorise le
  `SELECT` anonyme. Réversible (drop policies).
- **URLs** :
  - `/u/[userId]/collection` — collection publique d'un utilisateur
  - `/u/[userId]/decks` — liste de decks publique d'un utilisateur
  - `/decks/[id]` — devient consultable par les non-propriétaires
- **Permissions visiteur** : lecture seule + export texte existant. Visiteur
  **connecté** : bouton « Copier ce deck dans mon compte ».
- **Données sensibles** : seul `purchase_price` est masqué (via une vue publique).
  La **wishlist reste publique** et apparaît dans la vue publique de collection.
- **UI** : flag `isOwner`/`readOnly` sur les pages simples (collection, liste de
  decks) ; pour la page deck (très couplée aux contextes propriétaire), **split**
  en vue propriétaire / vue lecture seule.
- **Prérequis (chantier séparé)** : refactor de la page collection extrayant la
  logique d'affichage dans des hooks/contexts découplés du propriétaire, pour que
  `/u/[userId]/collection` réutilise l'affichage sans le contexte owner. Cette
  spec **dépend** de ce refactor mais ne le couvre pas.

## Architecture

### 1. Migration RLS (à faire et vérifier en premier)

Fichier : `supabase/migrations/20260616000000_public_read_sharing.sql`
(convention horodatée ; `supabase migration new public_read_sharing`). Répliquer
les mêmes instructions dans `supabase/PROD_REBUILD.sql` et ajouter la ligne de
version au bloc `schema_migrations`.

**Approche** : AJOUTER de nouvelles policies `SELECT` nommées (Postgres combine
les policies permissives en OR), sans toucher aux policies owner ni aux
INSERT/UPDATE/DELETE (écritures owner-only préservées).

```sql
-- decks : entièrement publics en lecture
create policy "Public can view all decks"
  on public.decks for select to anon, authenticated using (true);

-- deck_folders : publics (la liste publique a besoin des noms/hiérarchie)
create policy "Public can view all deck folders"
  on public.deck_folders for select to anon, authenticated using (true);

-- cards (deck) : une carte appartenant à un deck est publique
create policy "Public can view deck cards"
  on public.cards for select to anon, authenticated using (deck_id is not null);

-- cards (collection) : publiques (wishlist incluse, décision actée)
create policy "Public can view collection cards"
  on public.cards for select to anon, authenticated using (owner_id is not null);
```

**Vue publique pour masquer `purchase_price`** (seule donnée sensible masquée) :

```sql
create view public.public_collection_cards
  with (security_invoker = true) as
  select id, owner_id, scryfall_id, date_added, is_foil, foil_type, condition,
         language, for_trade, alter, proxy, tags, deck_id, wishlist
  from public.cards
  where owner_id is not null;
grant select on public.public_collection_cards to anon, authenticated;
```

Avec `security_invoker = true`, la vue applique le RLS de `cards` ; l'absence de
`purchase_price` dans la projection le rend non-récupérable via la vue. Les pages
publiques de collection lisent **cette vue**, jamais `cards`.

### 2. Couche données

`src/lib/deck/db/decks.ts` et `src/lib/collection/db/collection.ts` prennent déjà
`userId`/`deckId` en paramètre et fonctionneront pour n'importe quel propriétaire
une fois le RLS en place (client anon).

Ajouts :

- `src/lib/deck/db/decks.ts` :
  - `fetchDeckMetaById(deckId: string): Promise<DeckMeta | null>` — comme
    `fetchDeckMeta` mais **sans** le filtre `.eq('owner_id', ...)`, pour résoudre
    un deck + son owner sans le connaître d'avance.
  - Exposer `ownerId` dans `DeckMeta` (`rowToDeckMeta` le supprime actuellement) ;
    ajouter le champ dans `src/types/decks.ts`. Nécessaire pour calculer `isOwner`.
- `src/lib/collection/db/collection.ts` :
  - `fetchPublicCollectionPage(ownerId: string, from: number)` — identique à
    `fetchCollectionPage` mais lit `public_collection_cards`.
- Inchangés (déjà paramétrés par id) : `fetchDecks(userId)`, `fetchFolders(userId)`,
  `fetchDeckCards(deckId)`, `fetchDeckScryfallIds`, `fetchDeckCardEntries`.

Nouveaux hooks lecture seule (les pages publiques ne peuvent pas utiliser les
contextes owner qui hydratent depuis `auth.uid()`) :

- `src/app/u/[userId]/decks/usePublicDecks.ts` — `fetchDecks(ownerId)` +
  `fetchFolders(ownerId)` dans un état local ; réutilise la logique de présentation
  `useDeckSummaries` (rendue owner-agnostique par le refactor prérequis).
- `src/app/u/[userId]/collection/usePublicCollection.ts` — pagine
  `fetchPublicCollectionPage(ownerId, from)` en état local, puis alimente les hooks
  de présentation existants (`useCollectionCards`, filtrage) qui prennent déjà
  `entries` en argument.
- `src/app/decks/[id]/usePublicDeckDetail.ts` — `fetchDeckMetaById(deckId)` +
  `fetchDeckCards(deckId)` en état local, puis réutilise `resolveCardsByScryfallIds`
  - `useDeckCardSections` pour produire la même forme que `useDeckDetail`.

### 3. Routes et gating d'auth

Les redirects d'auth vivent uniquement dans `src/app/collection/layout.tsx` et
`src/app/decks/layout.tsx`.

- **Nouveau** `src/app/u/layout.tsx` — layout passe-plat, **sans** `getUser()` ni
  redirect : c'est le mécanisme qui rend `/u/...` public.
- **Nouveau** `src/app/u/[userId]/collection/page.tsx` — `'use client'`, lit
  `usePublicCollection(userId)`, réutilise la structure JSX de
  `src/app/collection/page.tsx` avec `readOnly` (masque Import/Clear ; garde Export
  CSV).
- **Nouveau** `src/app/u/[userId]/decks/page.tsx` — `'use client'`, lit
  `usePublicDecks(userId)` en lecture seule (pas de création de deck/dossier).
- **`/decks/[id]` consultable par les non-propriétaires** :
  - Retirer le redirect de `src/app/decks/layout.tsx` ; déplacer le gating owner
    sur la page **liste** `src/app/decks/page.tsx` (redirige l'anonyme vers login).
    Ainsi `/decks/[id]` est public, `/decks` reste protégé.
  - Dans `src/app/decks/[id]/page.tsx`, calculer
    `isOwner = !!user && deck?.ownerId === user.id` (via `useAuth()` +
    `fetchDeckMetaById`). Brancher :
    `return isOwner ? <DeckDetailOwnerView deckId/> : <DeckDetailReadOnlyView deckId/>`.
  - `DeckDetailOwnerView` = corps actuel de la page (quasi inchangé).
  - `DeckDetailReadOnlyView` = nouvelle vue utilisant `usePublicDeckDetail(deckId)`,
    sans `useDeckContext`/`CardSearchPanel`/modals d'édition.

### 4. Propagation `readOnly`/`isOwner`

Règle générale : un contrôle de mutation ne s'affiche que si `isOwner`. Les
exports (texte/PDF/CSV) et le bouton « copier » restent accessibles aux visiteurs.

- **Liste decks** (`DeckCard`, sidebar dossiers, triggers création/import) :
  ajouter `readOnly?: boolean` pour masquer création/renommage/drag/import et le
  menu contextuel edit/delete.
- **Collection** : masquer Import + Clear, garder Export CSV.
- **Vue deck lecture seule** : composants feuilles en mode affichage —
  - `DeckHeader` : `readOnly` masque `onUpdate`, `onAssignAllFromCollection`,
    `onAddAllToCollection` ; garde `onExportText`/`onGeneratePdf`.
  - `CardList`/`DeckTokens` : sans overlay d'édition (badge de compte uniquement).
  - `CardModal` : mode vue (omettre `onSave`, `onRemoveEntry`, `onIncrement`,
    `onChangeZone`, `onChangePrint`, `onAssignCollectionCopy`).
  - Ne pas monter `CardSearchPanel`, barre bulk-select, ni
    `AddDeckToCollectionModal`.

### 5. « Copier ce deck dans mon compte » (visiteur connecté)

> Important : **ne pas réutiliser `useAddDeckToCollection.execute()`**. Ce hook
> revendique des lignes existantes via `toggleOwned` (mutation owner-only) — faux
> et bloqué par le RLS pour un visiteur. Il faut **insérer de nouvelles lignes**
> dans un nouveau deck appartenant au visiteur.

- Nouveau `src/app/decks/[id]/useCopyDeckToMyCollection.ts` :
  `copyDeck(deckName, format, resolvedCards): Promise<string>` qui, via les
  primitives owner existantes du `DeckContext` (opèrent sur `auth.uid()` du
  visiteur, donc INSERT autorisé) :
  1. `createDeck(name + ' (copie)', format, description)` → nouvel `deckId`.
  2. `bulkAddCardsToDeck(newDeckId, cards)` → cartes du deck copiées.
  3. Navigation vers `/decks/<newDeckId>` (désormais éditable, vue owner).
     Le deck source n'est jamais modifié.
- Bouton visible seulement si `!!user && !isOwner` dans `DeckDetailReadOnlyView`.
  L'anonyme ne voit que l'export texte.

## Découpage par phases

1. **RLS** — migration + miroir `PROD_REBUILD.sql`. Vérifier en isolation.
2. **Couche données** — `fetchDeckMetaById`, `fetchPublicCollectionPage`,
   `ownerId` dans `DeckMeta`, hooks publics.
3. **Routes & layout** — `u/layout.tsx`, pages `/u/[userId]/...`, assouplir
   `decks/layout.tsx` + gater `/decks`, split de la page deck.
4. **UI lecture seule** — props `readOnly` sur les composants.
5. **Bouton copier** — `useCopyDeckToMyCollection` + bouton.

## Vérification (bout-en-bout)

- **RLS** (avant tout) : appel PostgREST anonyme (curl, clé anon, sans header
  d'auth) — `select * from decks` renvoie des decks de plusieurs owners ;
  `select id, purchase_price from public_collection_cards` échoue (colonne
  absente) ; `insert into decks` rejeté. Propriétaire authentifié : son dashboard
  charge toujours ses decks/collection/wishlist.
- **Anonyme** : `/u/<id>/collection`, `/u/<id>/decks`, `/decks/<autreId>`
  s'affichent sans redirection vers login ; aucun contrôle d'édition ; export
  texte/CSV fonctionne ; `purchasePrice` absent côté collection publique.
- **Propriétaire** : `/decks/<sonId>` rend la vue éditable complète ; `/decks`
  reste protégé (anonyme redirigé).
- **Visiteur connecté** : sur `/decks/<autreId>`, clic « Copier » → nouveau deck
  dans son `/decks` avec toutes les cartes ; le deck source inchangé (comparer le
  nombre de `cards` avant/après) ; bouton absent pour anonyme et pour le
  propriétaire.

## Risques

- **Exposition de données** : tout `cards` devient lisible (hors `purchase_price`
  via la vue). La wishlist est publique par décision. Réversible en supprimant les
  policies publiques.
- **Couplage de la page deck** : le split owner/read-only doit réutiliser les
  composants feuilles sans réintroduire les contextes owner dans la vue publique.
- **Dépendance** : la vue publique de collection suppose le refactor préalable des
  hooks/contexts collection découplés du propriétaire.
