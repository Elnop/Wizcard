# Enrichissement de la modale de détail — métadonnées de copie

## Contexte

La modale de détail d'une carte (`src/lib/card/components/CardModal/CardModal.tsx`,
sous-composant `CardDetailSection`) affiche les données Scryfall (nom, coût, type,
set, oracle, artiste, print, langue ≠ English, keywords, tokens). Elle n'affiche
**aucune** métadonnée de la copie physique (`CardEntry`) : foil, proxy, condition,
langue, tags, prix d'achat, à échanger, alter, date d'ajout.

## Objectif

Afficher un maximum d'informations sur la **copie sélectionnée** dans le panneau de
détail, pour le cas collection/deck (carte portant une `entry`).

## Périmètre

- **Inclus** : cas collection (`Card` avec `entry`), via `CardModalInner`. La section
  reflète la copie actuellement sélectionnée (`selectedCard`) et se met à jour quand
  l'utilisateur change de copie dans la liste « Copies ».
- **Exclus** : carte Scryfall seule (recherche/import), custom cards, légalités par
  format, liens externes, données Scryfall étendues (cmc, prix marché, etc.).

## Conception

### 1. Passage de l'`entry`

`CardModalInner` passe l'`entry` de `selectedCard` à `CardDetailSection` via un
nouveau prop optionnel `entry?: CardEntry`. Les autres appelants
(`ScryfallCardModalInner`, `CustomCardModalInner`) ne passent pas d'`entry` : la
section reste donc absente pour eux.

### 2. Nouvelle sous-section « Cette copie » dans `CardDetailSection`

Rendue uniquement si `entry` est défini, après les détails Scryfall, séparée par un
`<hr className={styles.divider}>` et titrée « Cette copie ». Chaque champ n'est rendu
que s'il est présent / pertinent :

| Champ        | Source                          | Rendu                                                         |
| ------------ | ------------------------------- | ------------------------------------------------------------- |
| Finition     | `isFoil` + `foilType`           | `✨ Foil` ou `✨ Etched` selon `foilType`, sinon `Normal`     |
| Proxy        | `proxy`                         | badge `Proxy` (à la suite de la finition)                     |
| Alter        | `alter`                         | badge `Alter` (à la suite de la finition)                     |
| État         | `condition`                     | valeur brute (NM / LP / MP / HP / DMG)                        |
| Langue       | `language`                      | valeur (affichée même pour English, contrairement à Scryfall) |
| Prix d'achat | `purchasePrice`                 | valeur brute si définie                                       |
| À échanger   | `forTrade`                      | badge `Trade` si vrai                                         |
| Tags         | `tags` via `removeDeckZoneTags` | chips ; section masquée si liste vide après filtrage          |
| Ajoutée le   | `dateAdded`                     | date formatée (locale fr) si présente                         |

Les tags `deck:*` internes sont filtrés via `removeDeckZoneTags`
(`src/types/decks.ts`) pour ne montrer que les tags utilisateur.

### 3. CSS

Réutilise les classes existantes du module :

- lignes : `.detailRow` / `.detailLabel` / `.detailValue`
- badges finition/proxy/trade : `.copyBadge`, `.copyBadgeFoil` (déjà présents)
- chips tags : `.keywords` / `.keyword`

Ajout au besoin d'un petit conteneur flex pour aligner finition + badges sur une
même ligne (réutilise un style inline ou une classe légère type `.copyBadges`).

## Tests / vérification

- `npm run check` (TypeScript + ESLint + Prettier).
- Vérification manuelle : ouvrir la modale sur une copie foil/proxy/avec tags/prix ;
  changer de copie dans la liste et confirmer que la section « Cette copie » se met à
  jour ; vérifier qu'elle est absente pour une carte Scryfall seule et une custom card.
