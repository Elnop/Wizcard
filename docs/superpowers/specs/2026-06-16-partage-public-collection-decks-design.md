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

**Décision structurante** : il n'existe **qu'une seule URL canonique** par
surface, et elle contient toujours l'`userId` — donc elle est partageable telle
quelle, sans manipulation. La **vue** s'adapte au visiteur (propriétaire →
éditable ; autre → lecture seule), pas l'URL. `/collection` et `/decks` ne sont
plus des pages d'affichage : ce sont des raccourcis qui **redirigent** vers
l'URL canonique de l'utilisateur connecté.

Résultat attendu : trois surfaces publiques consultables par n'importe qui
connaissant l'URL, sans exposer les données financières privées.

## Décisions actées

- **Modèle d'accès** : tout public, pas de token, pas d'opt-in. RLS autorise le
  `SELECT` anonyme. Réversible (drop policies).
- **URLs canoniques** (toujours partageables, contiennent l'`userId`) :
  - `/users/[userId]/collection` — collection, vue adaptée à `isOwner`
  - `/users/[userId]/decks` — liste de decks, vue adaptée à `isOwner`
  - `/decks/[id]` — un deck individuel (`id` = `deckId`), consultable par tous
- **Raccourcis (redirect 308 côté serveur)** :
  - `/collection` → `/users/[userId]/collection`
  - `/decks` → `/users/[userId]/decks`
  - Ces pages ne contiennent plus aucune logique d'affichage : `getUser()` →
    connecté ⇒ `redirect('/users/<id>/...')`, anonyme ⇒ `redirect('/login')`.
  - Choix de `/users/[id]/...` (et **pas** `/decks/[userId]`) : `/decks/[id]`
    existe déjà pour un deck individuel ; `/decks/[userId]` créerait une
    collision de segment dynamique (deux UUID indistinguables au même niveau).
    Le préfixe `/users/` isole proprement l'espace « ressources d'un user ».
- **Vue fusionnée owner/visiteur** : une seule page par surface calcule
  `isOwner = !!user && user.id === params.userId` et propage `readOnly = !isOwner`.
  Pas de pages parallèles owner vs public (réduit la duplication).
- **Permissions visiteur** : lecture seule + exports (CSV/texte/PDF). Visiteur
  **connecté** : bouton « Copier ce deck dans mon compte ».
- **Données sensibles** : seul `purchase_price` est masqué. La page collection
  choisit sa **source** selon `isOwner` : `cards` (owner, prix inclus) vs la vue
  `public_collection_cards` (visiteur, prix absent). La **wishlist reste
  publique**.
- **Découverte de l'URL de partage** : l'URL **est déjà** `/users/<id>/...` quand
  le propriétaire navigue (donc partageable depuis la barre d'adresse). Un bouton
  **« Partager »** (visible owner) dans l'en-tête de la collection et de la liste
  de decks copie l'URL courante au presse-papier + toast, pour rendre explicite
  que l'URL est publique.
- **Prérequis (chantier séparé)** : refactor de la page collection extrayant la
  logique d'affichage dans des hooks/contexts découplés du propriétaire, pour que
  `/users/[userId]/collection` réutilise l'affichage sans le contexte owner. Cette
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
`purchase_price` dans la projection le rend non-récupérable via la vue.

**Frontière de sécurité** : la défense est le **RLS Postgres**, pas le flag
`isOwner` du client (manipulable). `isOwner` ne fait que choisir _quelle requête
tenter_ :

- mode owner → lecture de `cards` (le RLS owner-only `auth.uid() = owner_id`
  autorise le `purchase_price` de ses propres cartes ; pour les cartes d'un autre
  owner il renverrait zéro ligne) ;
- mode visiteur → lecture de `public_collection_cards` (prix absent de la
  projection).

Un visiteur qui forcerait `fetchCollectionPage` sur les cartes d'autrui ne
récupère rien (RLS). La vue est une commodité d'UI, pas la défense.

### 2. Couche données

`src/lib/deck/db/decks.ts` et `src/lib/collection/db/collection.ts` prennent déjà
`userId`/`deckId` en paramètre et fonctionneront pour n'importe quel propriétaire
une fois le RLS en place (client anon).

Ajouts :

- `src/lib/deck/db/decks.ts` :
  - `fetchDeckMetaById(deckId: string): Promise<DeckMeta | null>` — comme
    `fetchDeckMeta` mais **sans** le filtre `.eq('owner_id', ...)`, pour résoudre
    un deck + son owner sans le connaître d'avance. (`DeckMeta` expose déjà
    `ownerId` dans `src/types/decks.ts` — rien à ajouter côté type ; vérifier
    que `rowToDeckMeta` le conserve.)
- `src/lib/collection/db/collection.ts` :
  - `fetchPublicCollectionPage(ownerId: string, from: number)` — identique à
    `fetchCollectionPage` mais lit `public_collection_cards`.
- Inchangés (déjà paramétrés par id) : `fetchDecks(userId)`, `fetchFolders(userId)`,
  `fetchDeckCards(deckId)`, `fetchDeckScryfallIds`, `fetchDeckCardEntries`.

Nouveaux hooks (les pages canoniques ne peuvent pas utiliser les contextes owner
qui hydratent depuis `auth.uid()`) :

- `src/app/users/[userId]/decks/useUserDecks.ts` — `fetchDecks(userId)` +
  `fetchFolders(userId)` dans un état local ; réutilise la logique de présentation
  `useDeckSummaries` (rendue owner-agnostique par le refactor prérequis). Sert les
  deux modes à l'identique (aucune donnée deck n'est sensible).
- `src/app/users/[userId]/collection/useUserCollection.ts` — prend
  `(userId, isOwner)` ; pagine `fetchCollectionPage(userId, from)` si `isOwner`,
  sinon `fetchPublicCollectionPage(userId, from)`, en état local ; alimente
  ensuite les hooks de présentation existants (`useCollectionCards`, filtrage) qui
  prennent déjà `entries` en argument.
- `src/app/decks/[id]/usePublicDeckDetail.ts` — `fetchDeckMetaById(deckId)` +
  `fetchDeckCards(deckId)` en état local, puis réutilise `resolveCardsByScryfallIds`
  - `useDeckCardSections` pour produire la même forme que `useDeckDetail`.

### 3. Routes et gating d'auth

Les redirects d'auth vivent aujourd'hui dans `src/app/collection/layout.tsx` et
`src/app/decks/layout.tsx`.

- **Nouveau** `src/app/users/layout.tsx` — layout passe-plat, **sans** `getUser()`
  ni redirect : c'est le mécanisme qui rend `/users/...` public.
- **Nouveau** `src/app/users/[userId]/collection/page.tsx` — `'use client'`,
  calcule `isOwner = !!user && user.id === params.userId` (via `useAuth()`), lit
  `useUserCollection(userId, isOwner)`, réutilise la structure JSX de l'ancienne
  page collection avec `readOnly = !isOwner` (masque Import/Clear et l'édition
  inline ; garde Export CSV ; affiche le bouton « Partager » si `isOwner`).
- **Nouveau** `src/app/users/[userId]/decks/page.tsx` — `'use client'`, même
  calcul `isOwner`, lit `useUserDecks(userId)` ; `readOnly = !isOwner` masque la
  création/import/renommage/drag et les menus edit/delete ; affiche « Partager »
  si `isOwner`.
- **`/collection` et `/decks` deviennent des redirects serveur** : remplacer le
  corps de `src/app/collection/page.tsx` et `src/app/decks/page.tsx` (et
  simplifier leurs `layout.tsx`) par `getUser()` → connecté ⇒
  `redirect('/users/<id>/collection')` (resp. `.../decks`) ; anonyme ⇒
  `redirect('/login')`. Plus aucune logique d'affichage dedans.
- **`/decks/[id]` consultable par les non-propriétaires** :
  - Retirer le redirect owner du layout `decks` (le gating owner vit désormais
    dans le redirect de `/decks`). `/decks/[id]` reste donc public.
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
- **Collection** : masquer Import + Clear + édition inline (foil/condition/tags/
  prix), garder Export CSV et filtres. `purchase_price` n'apparaît que pour
  l'owner (déjà assuré par la source de données § 2).
- **Vue deck lecture seule** : composants feuilles en mode affichage —
  - `DeckHeader` : `readOnly` masque `onUpdate`, `onAssignAllFromCollection`,
    `onAddAllToCollection` ; garde `onExportText`/`onGeneratePdf`.
  - `CardList`/`DeckTokens` : sans overlay d'édition (badge de compte uniquement).
  - `CardModal` : mode vue (omettre `onSave`, `onRemoveEntry`, `onIncrement`,
    `onChangeZone`, `onChangePrint`, `onAssignCollectionCopy`).
  - Ne pas monter `CardSearchPanel`, barre bulk-select, ni
    `AddDeckToCollectionModal`.

### 5. Bouton « Partager » (propriétaire)

Petit composant réutilisable (en-tête collection + liste de decks), visible
seulement si `isOwner` :

- copie `window.location.href` (déjà `/users/<id>/...`) au presse-papier via
  `navigator.clipboard.writeText` ;
- affiche un toast « Lien de partage copié » ;
- libellé explicite (« Partager » + icône lien) pour signaler que l'URL est
  publique.

### 6. « Copier ce deck dans mon compte » (visiteur connecté)

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
   `useUserCollection`/`useUserDecks`/`usePublicDeckDetail`.
3. **Routes & layout** — `users/layout.tsx`, pages `/users/[userId]/...`,
   conversion de `/collection` et `/decks` en redirects, assouplir le layout
   `decks`, split de la page deck.
4. **UI lecture seule** — props `readOnly` sur les composants ; bouton « Partager ».
5. **Bouton copier** — `useCopyDeckToMyCollection` + bouton.

## Vérification (bout-en-bout)

- **RLS** (avant tout) : appel PostgREST anonyme (curl, clé anon, sans header
  d'auth) — `select * from decks` renvoie des decks de plusieurs owners ;
  `select id, purchase_price from public_collection_cards` échoue (colonne
  absente) ; `insert into decks` rejeté. Propriétaire authentifié : son dashboard
  charge toujours ses decks/collection/wishlist.
- **Redirects** : connecté, `/collection` → `/users/<monId>/collection` (308),
  `/decks` → `/users/<monId>/decks` ; anonyme, les deux → `/login`.
- **Anonyme** : `/users/<id>/collection`, `/users/<id>/decks`, `/decks/<autreId>`
  s'affichent sans redirection vers login ; aucun contrôle d'édition ; pas de
  bouton « Partager » ; export texte/CSV fonctionne ; `purchasePrice` absent côté
  collection publique.
- **Propriétaire** : `/users/<monId>/collection` montre `purchasePrice` + le
  bouton « Partager » (copie l'URL courante) ; `/users/<monId>/decks` rend la vue
  éditable ; `/decks/<sonId>` rend la vue éditable complète.
- **Visiteur connecté** : sur `/decks/<autreId>`, clic « Copier » → nouveau deck
  dans son `/users/<sonId>/decks` avec toutes les cartes ; le deck source inchangé
  (comparer le nombre de `cards` avant/après) ; bouton absent pour anonyme et pour
  le propriétaire.

## Risques

- **Exposition de données** : tout `cards` devient lisible (hors `purchase_price`
  via la vue). La wishlist est publique par décision. Réversible en supprimant les
  policies publiques.
- **Couplage de la page deck** : le split owner/read-only doit réutiliser les
  composants feuilles sans réintroduire les contextes owner dans la vue publique.
- **Source collection selon `isOwner`** : le choix `cards` vs
  `public_collection_cards` est une commodité d'UI ; la garantie reste le RLS. Ne
  jamais lire `cards` pour afficher la collection d'un autre owner.
- **Dépendance** : la vue canonique de collection suppose le refactor préalable
  des hooks/contexts collection découplés du propriétaire.

```

```
