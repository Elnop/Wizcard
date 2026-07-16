# Uniformiser les actions cartes custom / officielles — Design

**Date** : 2026-07-17
**Statut** : validé, prêt pour plan d'implémentation
**Prérequis** : feature « custom prints everywhere » (commits `06ecf55..a027ad2`) —
un print custom matché est désormais une copie persistable partout.

## Objectif

Un custom matché (avec `oracle_id` — les non-matchés sont cachés partout, invariant
DB de la feature « hide unmatched ») doit offrir **les mêmes actions** qu'une carte
officielle sur toutes les surfaces « carte pas encore possédée » : menus contextuels,
modale de carte (variante bare), page carte.

**Sémantique validée** : « Ajouter à la collection/wishlist/deck » sur un custom
ajoute **le print custom lui-même** (copie `scryfall_id = mpc:<id>`), pas la carte
officielle correspondante. L'`AddCardModal` s'ouvre avec le print custom
présélectionné ; le picker (custom-safe depuis la feature précédente) permet d'en
changer.

## État actuel (écarts recensés)

| Surface                                         | Officiel                                                        | Custom aujourd'hui                                       |
| ----------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------- |
| `searchCardMenu.ts` (menu clic-droit recherche) | View details, Open page, Add collection/wishlist/deck           | View details seul (early-return `isCustomCard` ligne 42) |
| `viewerCardMenu.ts` (menu profil public)        | View details, Add collection/wishlist/deck                      | View details seul (early-return ligne 50)                |
| `CardModal` variante bare                       | `ScryfallCardModalInner` : boutons Add collection/wishlist/deck | `CustomCardModalInner` : aucun bouton                    |
| `CardPageHeader` (page `/card/[id]`)            | `AddToCollectionButton`                                         | rien (`{!custom && …}` ligne 79)                         |

Les commentaires justifiant ces restrictions (« custom cards aren't tracked in the
collection or wishlist », `searchCardMenu.ts:40-41`) sont **devenus faux** depuis la
persistance des prints custom.

**Hors périmètre (déjà fonctionnel)** : le menu image owner et toutes les actions
sur une copie custom _possédée_ passent par le chemin `Card` normal depuis la
persistance — aucun travail.

## Architecture (approche validée : fusion)

Supprimer la variante appauvrie plutôt que la ré-enrichir : `CustomCardModalInner`
disparaît, `ScryfallCardModalInner` devient l'unique variante bare et gère le cas
custom par garde `isCustomCard` (pattern cast établi). Un seul composant = plus de
divergence future possible.

## Unités de travail

### 1. CardModal : fusionner `CustomCardModalInner` dans `ScryfallCardModalInner`

`src/lib/card/components/CardModal/CardModal.tsx` :

- Supprimer `CustomCardModalInner` (lignes ~943-991) et la branche
  `isCustomCard(first)` du dispatcher `CardModal` (lignes ~1030-1033) — le custom
  suit désormais le chemin `ScryfallCardModalInner` (il n'est PAS une
  collection-card : `'entry' in card` est faux, le dispatch tombe naturellement
  dans la bonne branche).
- `ScryfallCardModalInner` :
  - la prop `card` reste typée `ScryfallCard` (le custom arrive casté — pattern
    établi) ;
  - rendre `<CustomCardSection card={card as unknown as CustomCard} />` sous
    `CardDetailSection` quand `isCustomCard(...)` ;
  - passer `isCustom` à `CardDetailSection` quand custom (il gère déjà le lien
    « More info » différemment) — préserver le lien `/card/mpc:<id>` existant ;
  - les boutons Add collection/wishlist/deck restent inconditionnels : les
    handlers (`onAddToCollection`…) sont fournis ou non par l'appelant
    (CardModalProvider), pas par le type de carte.
- `CardModalProvider` : vérifier que la branche qui construit les props de la
  variante bare ne filtre pas les handlers pour un custom ; si elle le fait,
  retirer le filtre. `buildImageMenuItems` retourne `null` pour les customs
  aujourd'hui (doc du prop) — l'uniformiser aussi : le menu image bare offre les
  mêmes items.

### 2. Menus contextuels : retirer les early-returns

- `src/app/[locale]/search/searchCardMenu.ts` : supprimer le bloc
  `if (isCustomCard(card)) return items;` (lignes ~40-44) et le commentaire
  mensonger. « Open card page » fonctionne déjà (`/card/mpc:…` SSR 200).
- `src/lib/card/viewerCardMenu.ts` : idem (lignes ~50-52) + mettre à jour la
  JSDoc du composant (lignes ~27-29).
- Si `isCustomCard` devient inutilisé dans l'un des fichiers, retirer l'import.

### 3. Page carte : `AddToCollectionButton` pour les customs

`src/app/[locale]/card/[id]/components/CardPageHeader/CardPageHeader.tsx` :
remplacer `{!custom && <AddToCollectionButton card={card as ScryfallCard} />}`
par un rendu inconditionnel (le cast reste). `AddToCollectionButton` passe par
`openAddCard` → `AddCardModal` → `useCardEntryForm`, tous custom-safe depuis la
feature précédente : le print custom arrive présélectionné avec image custom,
sans fetch de langue.

## Flux de données (inchangé, réutilisé)

`Add …` sur un custom → `openAddCard({ scryfallCard: custom-as-ScryfallCard, onAdd })`
→ `AddCardModal`/`useCardEntryForm` (guards `isCustomCard` déjà en place)
→ `onAdd(selectedPrint, entry, count)` → `addCards`/`addToWishlist`/flux deck
→ copie `scryfall_id = mpc:<id>` → hydratation par préfixe (résolveur).
Aucun nouveau flux ; on ouvre des portes vers des chemins déjà custom-safe.

## Cas limites

- **Custom sans `oracle_id`** : ne peut pas apparaître sur ces surfaces (filtre DB
  dur `.not('oracle_id','is',null)` — feature « hide unmatched »). Aucun code à
  écrire.
- **Cardbacks / tokens custom** : passent par les mêmes queries filtrées ; un token
  custom matché offre les mêmes actions qu'un token officiel — voulu.
- **Doublon wishlist/collection** : invariant existant géré par les stores
  (toggleOwned), rien de spécifique au custom.

## Vérification (pas de framework de test)

- `npx eslint` propre sur les fichiers modifiés ; `npm run build` vert (gate TS2589).
- Runtime (dev :3100) :
  1. Recherche mode custom → clic droit sur un custom → le menu montre les 5 items ;
     « Add to collection » ouvre l'AddCardModal avec l'image custom → Save → la copie
     apparaît en collection.
  2. Clic gauche sur un custom (modale bare) → boutons Add collection/wishlist/deck
     présents + `CustomCardSection` visible.
  3. `/card/mpc:<id>` → bouton « Add to collection » présent et fonctionnel.
  4. Non-régression : mêmes surfaces sur une carte officielle, comportement inchangé.

## Hors périmètre (YAGNI)

- Aucun changement de flux d'ajout, de store, de DB.
- Pas d'action « voir la carte officielle correspondante » (idée future).
- Le menu owner (copies possédées) — déjà fonctionnel.
