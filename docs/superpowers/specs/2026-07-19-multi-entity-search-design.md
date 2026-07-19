# Recherche multi-entités (Cartes / Decks / Profils)

**Date**: 2026-07-19
**Statut**: Design validé — CORRIGÉ 2026-07-19 après découverte du modèle de visibilité pré-existant (voir « Correction »)

## Correction (2026-07-19)

Découverte pendant l'implémentation : les decks/cards sont **déjà publiquement
lisibles**, gouvernés par le flag `is_public` du **profil du propriétaire** via
`profile_is_public()` (migrations `20260616000000_public_read_sharing` →
`20260713130000_privacy_gate_public_reads`). Il n'existe **aucune** visibilité
par-deck. Le design initial supposait à tort des decks owner-only.

**Décision** : réutiliser la visibilité profil existante. **Pas de migration,
pas de colonne `decks.is_public`, pas de toggle par-deck.** La Section 2 et le
toggle de la Section 5 sont **abandonnés**. Le toggle « Profil public » existe
déjà dans les Settings. La recherche de decks s'appuie sur la policy existante
`"Public can view all decks"` (qui filtre déjà aux profils publics).

## Objectif

Faire évoluer la page `/search` (aujourd'hui limitée à la recherche de cartes) pour
permettre de chercher aussi des **decks** et des **profils**. Les decks disposent
d'une modale de filtres dédiée inspirée de Moxfield. Les profils utilisent une
simple barre de recherche par nickname.

## Contexte existant

- `/search` (`src/app/[locale]/search/page.tsx`, ~387 lignes) gère 3 modes de
  **cartes** via `SearchModeSwitcher` : `official` / `custom` / `backs`.
- `FilterModal` (`src/lib/search/components/FilterModal/`) + filtres unitaires
  dans `src/lib/search/components/filters/`.
- Types cartes dans `src/lib/search/types.ts` (`CardFilters`, `countActiveFilters`).
- Table `decks` : `id, owner_id, name, format, description, folder_id,
cover_art_url, created_at, updated_at`. **RLS SELECT owner-only** — pas de
  notion de deck public aujourd'hui.
- Table `profiles` : `id, nickname, description, avatar_url, is_public,
created_at, updated_at`. **RLS SELECT publique** (`is_public or auth.uid()=id`)
  — déjà recherchable.
- `decks.owner_id → auth.users(id)` ; `profiles.id = auth.users(id)`, donc la
  jointure `decks.owner_id → profiles.id` est valide.
- `DeckCard` (`src/app/[locale]/decks/components/DeckCard/`) possède déjà un prop
  `readOnly` prévu pour les vues publiques.
- `useDeckSummaries` + `fetchDeckCardEntries` fournissent mana curve / couleurs.
- Vue publique de deck déjà existante à `/decks/[id]` (read-only).

## Décisions produit

1. **Portée decks** : ajouter la visibilité publique (`is_public`) + la recherche.
2. **Navigation** : sélecteur d'entité de premier niveau **Cartes / Decks / Profils**.
   En mode Cartes, le `SearchModeSwitcher` official/custom/backs actuel est
   intégralement préservé.
3. **Filtres decks V1** : Deck Name, Format, Author(s), Card in Board, et un input
   **Commander conditionnel** (visible seulement si format ∈ {commander, brawl,
   oathbreaker}). Commander déduit de la zone `commander` des cartes du deck.
   Reporté (YAGNI) : Partner, Theme, Companion, Commander Bracket.
4. **Filtres profils** : barre de recherche simple par nickname, pas de modale.
5. **Affichage résultats** : `DeckCard` (readOnly) + nouvelle `ProfileCard`, avec
   bascule vers une vue liste/tableau compacte.
6. **Visibilité deck** : **public par défaut** (`is_public=true`) + toggle
   Public/Privé dans l'édition de deck. ⚠️ Rend les decks existants immédiatement
   recherchables — choix validé par l'utilisateur.

## Section 1 — Navigation

Nouveau `SearchEntitySwitcher` au-dessus de la zone de recherche, 3 valeurs
persistées dans l'URL (`?entity=cards|decks|profiles`, défaut `cards`).

- `entity=cards` → comportement actuel intégral (`SearchModeSwitcher`,
  `FilterModal`, `CardList`).
- `entity=decks` → `SearchBar` (nom) + bouton Filtres → `DeckFilterModal` +
  résultats `DeckCard` / vue liste.
- `entity=profiles` → `SearchBar` (nickname) uniquement + résultats `ProfileCard`
  / vue liste.

**Décomposition de `page.tsx`** (fichier déjà dense) :

- `CardSearchView` — extraction de toute la logique cartes actuelle.
- `DeckSearchView` — nouvelle vue decks.
- `ProfileSearchView` — nouvelle vue profils.
- `page.tsx` ne garde que le `SearchEntitySwitcher` + routage vers la vue active
  (dans le `Suspense` existant).

## Section 2 — Fondations DB (decks publics)

Nouvelle migration `supabase/migrations/<timestamp>_add_deck_visibility.sql` :

```sql
-- is_public gère la découvrabilité des decks. default true → les decks
-- existants deviennent publics (choix produit validé). Owner voit toujours
-- ses decks ; les autres seulement si public.
alter table public.decks
  add column if not exists is_public boolean not null default true;

create index on public.decks (is_public) where is_public;

drop policy "Users can view their own decks" on public.decks;
create policy "Anyone can view public decks, owners view their own"
  on public.decks for select
  using (is_public or auth.uid() = owner_id);

-- Les cartes des decks publics doivent être lisibles (contenu, commander).
drop policy "Users can view their own cards" on public.cards;
create policy "Users can view their own cards"
  on public.cards for select
  using (
    auth.uid() = owner_id
    or deck_id in (select id from public.decks where is_public or owner_id = auth.uid())
  );
```

- Policies INSERT/UPDATE/DELETE de `decks` **inchangées** (owner-only).
- Aligner `supabase/bootstrap/init_schema.sql`.
- Vérifier via `npm run sb:migrate` puis `npm run sb:verify`.

## Section 3 — Modale de filtres Decks

Nouveau `DeckFilterModal` dans `src/lib/search/components/DeckFilterModal/`,
calqué structurellement sur `FilterModal`.

| Filtre                     | Source                        | Comportement                                                  |
| -------------------------- | ----------------------------- | ------------------------------------------------------------- |
| Deck Name                  | `decks.name`                  | `ilike %term%` (aussi via SearchBar principale)               |
| Format                     | `decks.format`                | Multi-select des formats existants                            |
| Author(s)                  | jointure `profiles.nickname`  | nickname → résout `owner_id`                                  |
| Card in Board              | table `cards` (par `deck_id`) | deck contient la carte (nom/scryfall_id)                      |
| Commander _(conditionnel)_ | `cards` zone=`commander`      | visible seulement si format ∈ {commander, brawl, oathbreaker} |

- Type partagé `DeckSearchFilters` + `DEFAULT_DECK_FILTERS` +
  `countActiveDeckFilters` dans `src/lib/search/types.ts`.
- Badge compteur de filtres réutilise le pattern existant.
- **Logique Commander conditionnelle** : si aucun format ou format non-commander
  sélectionné, le champ Commander est masqué ; une valeur Commander saisie puis
  invalidée par un changement de format n'est pas appliquée (cf. la façon dont
  `isBacks` neutralise déjà certains filtres cartes).

## Section 4 — Couche données & requêtes

**Decks** — `src/lib/search/db/searchDecks.ts` :

- `searchDecks(filters, { limit, offset })` sur `decks` (RLS restreint déjà au
  public), `name ilike`, `format in`, `owner_id` résolu depuis nickname author.
- Card in Board / Commander : résoudre d'abord les `deck_id` matchant la carte
  via `cards` (`scryfall_id = …`, et pour Commander `tags @> '{deck:commander}'`
  via `.contains('tags', ['deck:commander'])`), puis filtrer les decks sur ces
  `deck_id`. ⚠️ **La zone d'un deck est stockée dans `cards.tags`** (ex.
  `deck:commander`), PAS dans la colonne `cards.zone` — c'est la colonne `tags`
  qui fait foi côté application (cf. `fetchDeckCardTagRows`, `getDeckZone`).
  ⚠️ **TS2589** : utiliser des réassignations `q = q.eq(...)` plutôt qu'un
  chaînage dans l'initialiseur `let q = client.from()...`.
- Auteur : `select('*, profiles!decks_owner_id_fkey(nickname, avatar_url)')`.

**Profils** — `src/lib/search/db/searchProfiles.ts` :

- `searchProfiles(term, { limit, offset })` sur `profiles` (RLS public),
  `nickname ilike %term%`, ordre alphabétique.

**Hooks** dans `src/lib/search/hooks/` :

- `useDeckSearch` / `useProfileSearch`, calqués sur la pagination de
  `useCustomCards` (`cards`/`isLoading`/`isLoadingMore`/`hasMore`/`total`/`loadMore`).
- Résumés decks : `useDeckSummaries` + `fetchDeckCardEntries` sur les `deck_id`
  de la page de résultats.

## Section 5 — Rendu & toggle de visibilité

**`DeckSearchView`** :

- Vue cartes (défaut) : grille `DeckCard readOnly` + ligne auteur (avatar +
  nickname → `/users/[nickname]`). Clic deck → `/decks/[id]`.
- Vue liste : tableau compact (nom, format, auteur, date maj), toggle de vue
  dans le même esprit que le mode tableau de `CardList`.
- Pagination "load more".

**`ProfileSearchView`** :

- Nouvelle `ProfileCard` (avatar + nickname + description tronquée) →
  `/users/[nickname]`. Vue liste compacte également disponible.

**Toggle visibilité deck** :

- Contrôle Public/Privé dans l'édition des métadonnées du deck (là où name/format/
  description sont éditées — emplacement exact confirmé à l'implémentation via
  `updateDeckMeta` et `/decks/[id]`).
- `is_public` ajouté à `DeckMeta`, `DeckDbRow`, `rowToDeckMeta`, `insertDeck`,
  `updateDeckMeta`.

**i18n** : nouvelles clés `search.*` (onglets entité, labels filtres decks,
colonnes liste) + `deck.*` (toggle visibilité) dans **tous** les locales
existants (couche i18n stricte du projet).

## Vérification

- `npm run check` — gate = **pas de nouveaux problèmes** vs baseline rouge
  existante (~60 problèmes pré-existants). Utiliser `npx eslint` sur les fichiers
  modifiés.
- Runtime : `npm run sb:migrate` + `npm run sb:verify` ; dev server ; tester les
  3 onglets ; publier/dépublier un deck ; recherche par author et card-in-board ;
  filtre Commander conditionnel.
- Pas de framework de test (vitest/jest absent) — validation runtime.

## Hors périmètre (YAGNI)

- Filtres Partner, Theme, Companion, Commander Bracket (pas de champs en base).
- Tri avancé des profils (alphabétique par défaut suffit).
- Modale de filtres pour les profils.
