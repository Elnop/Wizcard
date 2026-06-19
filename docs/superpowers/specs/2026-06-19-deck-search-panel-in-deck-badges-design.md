# Badges « dans le deck » dans le panel de recherche de cartes

Date : 2026-06-19

## Objectif

Dans le panel de recherche de cartes de la page d'un deck
(`CardSearchPanel`), chaque carte du résultat de recherche doit indiquer
visuellement si elle est **déjà présente dans le deck**, en montrant pour
chaque zone concernée la **zone** et le **nombre** de copies.

Exemple : une carte présente en 2 exemplaires dans le mainboard et 1 dans le
sideboard affiche deux pastilles : `Main 2` et `Side 1`.

## Décisions de conception

- **Correspondance par nom de carte (`oracle_id`)** : n'importe quelle édition
  du même sort présente dans le deck compte. C'est le comportement attendu en
  deckbuilding MTG. Cela nécessite de résoudre les `scryfallId` des copies du
  deck en `oracle_id`.
- **Badge en coin** : pastilles compactes dans un coin de la carte (haut
  droite), sans masquer l'art.
- **Un badge par zone** : pour une carte multi-zones, on empile une pastille
  par zone (très lisible), chacune affichant `{zone abrégée} {quantité}`.

## Architecture

### 1. Source de données — index deck par `oracle_id`

Nouveau hook `useDeckCardIndex(deckId)` (dossier `CardSearchPanel/`).

- Lit `activeDeckCards` via `useDeckContext`, uniquement si
  `activeDeckId === deckId` (sinon index vide).
- Dédup des `scryfallId` uniques, résolus via `resolveCardsByScryfallIds`
  pour obtenir leur `oracle_id`. La page deck ayant déjà résolu ces cartes,
  ce sont quasi exclusivement des hits du cache IndexedDB.
- Construit une `Map<oracleId, Map<DeckZone, number>>` : pour chaque copie,
  `getDeckZone(entry.tags)` donne la zone, et on incrémente le compteur de
  cette zone.
- Expose `getDeckZones(oracleId: string | undefined): Map<DeckZone, number> | undefined`
  (retourne `undefined` si l'oracle_id est absent ou non présent dans le deck).

Gestion d'erreurs : si la résolution réseau échoue, le hook retourne ce qui a
été résolu (cache) ; les non-résolus n'apparaissent simplement pas dans
l'index. Jamais de `throw`. Deck non chargé → index vide.

### 2. Affichage — `DeckZoneBadges`

Nouveau composant de présentation pur `DeckZoneBadges` + CSS module.

- Props : `zones: Map<DeckZone, number> | undefined`.
- Si `undefined` ou vide → ne rend rien.
- Sinon : empile une pastille par zone (ordre stable :
  mainboard, sideboard, maybeboard, commander, tokens) dans le coin haut
  droit, chacune `{abréviation} {quantité}`.
- Abréviations : `mainboard → Main`, `sideboard → Side`,
  `maybeboard → Maybe`, `commander → Cmd`, `tokens → Tok`.
- Chaque zone a une couleur de fond distincte (variables CSS de thème
  existantes).
- `pointer-events: none` sur le conteneur de badges pour ne pas gêner le
  clic ni le menu contextuel de l'overlay sous-jacent.

### 3. Câblage dans `CardSearchPanel`

- Instancier `const { getDeckZones } = useDeckCardIndex(deckId);`.
- `renderSearchOverlay(card)` conserve sa `div` de clic/menu contextuel et y
  ajoute `<DeckZoneBadges zones={getDeckZones(card.oracle_id)} />`.
- Fonctionne pour les deux modes du panel (recherche Scryfall et « in
  collection only ») car les deux fournissent des `AnyCard` avec `oracle_id`.
- Mode token : l'index inclut la zone `tokens`, donc les tokens déjà ajoutés
  sont marqués.
- `oracle_id` absent (ex. custom cards MPC) → lookup `undefined` → pas de
  badge.

## Tests

- **Builder d'index** : copies multi-zones d'un même oracle_id → map correcte
  (quantités cumulées par zone) ; oracle_id absent → non présent.
- **`DeckZoneBadges`** : une pastille par zone, abréviations correctes, rien
  rendu si map `undefined` ou vide, ordre des zones stable.

## Hors périmètre (YAGNI)

- Pas de mise à jour des badges en temps réel au-delà de la réactivité
  naturelle de `activeDeckCards` (l'ajout d'une carte met déjà à jour le
  store, donc l'index se recalcule).
- Pas de distinction d'édition (volontaire : matching par oracle_id).
