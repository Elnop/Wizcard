# Nouveau dossier depuis le menu clic droit d'un deck

## Objectif

Ajouter une option « Nouveau dossier » au menu contextuel (clic droit) d'un deck.
Au clic, l'utilisateur saisit un nom dans une petite modale ; un nouveau dossier est
créé puis le deck est immédiatement déplacé dedans.

## Comportement

- Clic droit sur un deck → le menu `MoveMenu` existant s'affiche.
- Une entrée « + Nouveau dossier » est ajoutée en haut du menu.
- Au clic : une petite modale s'ouvre avec un champ texte pour le nom.
  - Entrée ou bouton « Créer » → valide.
  - Échap ou bouton « Annuler » → ferme sans rien faire.
  - Nom vide (après trim) → aucune création.
- À la validation :
  1. Un dossier est créé **dans le dossier actuellement visualisé**
     (`parentId = activeFolderId` si on regarde un dossier précis ; `null` si on est
     sur « My Decks » ou « Sans dossier »).
  2. Le deck est déplacé dans ce nouveau dossier.

## Composants modifiés

### `src/app/decks/components/DeckCard/DeckCard.tsx`

- Nouveau prop `onCreateFolderAndMove?: (name: string) => void`.
  Le parent connaît le dossier actif, il gère donc le calcul du `parentId`.
- `MoveMenu` : ajouter un bouton « + Nouveau dossier » en tête de menu qui
  ouvre la modale de saisie.
- Nouvel état local pour la modale (ouverte / nom saisi).
- La modale réutilise les composants `Modal` et `Button` existants avec un `<input>`.

### `src/app/decks/DecksPageClient.tsx`

- Câbler le prop sur chaque `DeckCard` :
  ```ts
  onCreateFolderAndMove={(name) => {
    const parentId =
      activeFolderId !== null && activeFolderId !== 'none' ? activeFolderId : null;
    const id = createFolder(name, parentId);
    moveDeckToFolder(deck.id, id);
  }}
  ```

### `src/app/decks/components/DeckCard/DeckCard.module.css`

- Réutiliser `.contextItem` pour le bouton du menu.
- Petits styles pour l'input et les actions de la modale.

## Flux de données

`DeckCard` (saisie du nom) → `onCreateFolderAndMove(name)` →
`DecksPageClient` calcule `parentId` depuis l'URL → `createFolder(name, parentId)`
(retourne l'id) → `moveDeckToFolder(deck.id, id)`.

Aucune nouvelle logique de store n'est nécessaire : `createFolder` et
`moveDeckToFolder` existent déjà.

## Hors périmètre

- Pas de renommage / suppression depuis ce menu (déjà géré dans la sidebar).
- Pas de modification du système de dossiers ou de la synchro.
