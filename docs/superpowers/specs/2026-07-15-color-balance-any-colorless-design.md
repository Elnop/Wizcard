# Color Balance — Any Color & Colorless visibility — Design

**Date:** 2026-07-15

## Problème

Sur la page d'un deck, le composant `ColorBalance` affiche deux barres empilées (Coût vs Production) sur 5 segments WUBRG. Deux défauts faussent la visualisation :

1. **Production "n'importe quelle couleur"** : une source arc-en-ciel (City of Brass, Command Tower, Chromatic Lantern) a `produced_mana: ["W","U","B","R","G"]`. Le code actuel compte `+1` sur **chacune** des 5 couleurs → gonfle uniformément toutes les couleurs et donne une fausse impression d'équilibre.
2. **Incolore/générique invisibles** : côté coût, `parseColorPips` ignore le générique (`{2}`, `{X}`) ET l'incolore pur (`{C}`). Le mana incolore requis (Eldrazi) n'apparaît nulle part.

## Objectif

- Une source produisant **exactement les 5 couleurs** compte dans un segment **"Any Color"** dédié (doré/multicolore), pas dans les couleurs individuelles.
- Le mana **incolore pur `{C}`** est visible comme segment **"Colorless"** (gris) côté Coût ET Production.
- Le mana **générique** (`{2}`, `{X}`, snow `{S}`) reste ignoré (payable avec n'importe quoi, ne contraint pas l'identité).
- Les proportions des barres sont **recalibrées** sur l'ensemble de leurs segments.

## Décisions (validées)

| Point                          | Décision                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Seuil "Any Color" (production) | **Exactement 5 couleurs** → segment `ANY`. Bicolores/tricolores comptent toujours +1 par couleur produite.               |
| `{C}` en production            | Segment `C` (Colorless), gris.                                                                                           |
| `{C}` en coût                  | Segment `C` (Colorless), gris.                                                                                           |
| Générique/X/snow en coût       | Ignoré (inchangé).                                                                                                       |
| Recalibrage %                  | Coût sur `[W,U,B,R,G,C]` ; Production sur `[W,U,B,R,G,C,ANY]`.                                                           |
| Notes comparatives             | Option A : conservées, calculées sur base **WUBRG normalisée à 5 couleurs seules**, découplées de l'affichage recalibré. |

## Modèle de données (`src/lib/deck/utils/deck-stats.ts`)

Nouvelle clé de balance :

```ts
type BalanceKey = 'W' | 'U' | 'B' | 'R' | 'G' | 'C' | 'ANY';
```

`colorsProduction: Record<BalanceKey, number>` :

- Pour chaque carte (mainboard + commander) :
  - Soit `prod = produced_mana ?? []`.
  - Nombre de couleurs WUBRG produites = `prod.filter(c => c ∈ WUBRG).length`.
  - **Si ce nombre === 5** → `ANY += 1` (une seule fois), et on **n'ajoute rien** à W/U/B/R/G.
  - **Sinon** → `+1` par couleur WUBRG présente dans `prod`.
  - Indépendamment : si `prod` contient `'C'` → `C += 1`. (Le type Scryfall n'inclut pas `'C'` mais l'API le renvoie ; on caste comme le code existant.)

`colorsCost: Record<BalanceKey, number>` :

- Pips WUBRG via `parseColorPips` : inchangé (mono +1, hybride +0.5).
- Nouveau : compter les pips `{C}` (incolore pur) → `C`.
- Générique/X/snow : ignoré.

`parseColorPips` est étendu pour retourner aussi le compte `C`, OU une nouvelle fonction dédiée `parseColorlessPips`. Décision : étendre `parseColorPips` pour renvoyer `Record<'W'|'U'|'B'|'R'|'G'|'C', number>` afin de garder un seul passage sur les symboles. Vérifier les autres appelants de `parseColorPips` (deck-stats uniquement d'après grep) — le `C` supplémentaire est ignoré par les boucles existantes sur `MANA_COLORS`, donc rétro-compatible.

## Affichage (`ColorBalance.tsx` + `.module.css`)

- Ordre des segments : `W, U, B, R, G, C, ANY`.
- Couleurs CSS : WUBRG inchangées ; `C` = gris incolore (`var(--mana-colorless)` si existant, sinon gris neutre) ; `ANY` = doré/dégradé multicolore.
- Barre Coût : n'affiche pas de segment `ANY` (les coûts n'ont pas de "any color"). Rendre uniquement les clés présentes.
- % recalibrés : `pct(map, keysDeLaBarre)` où keys = `[W,U,B,R,G,C]` pour le coût, `[W,U,B,R,G,C,ANY]` pour la prod.
- Alignement barres : labels de largeur fixe identique (déjà corrigé — `width: 96px`), `.bar` en `flex: 1` → début et fin alignés.

### Notes (option A)

Les notes d'écart restent sur WUBRG. Elles utilisent un pourcentage **normalisé sur les 5 couleurs seules** (dénominateur = somme WUBRG), distinct des % d'affichage recalibrés. Fonctions séparées : `costPctWubrg`, `prodPctWubrg` pour les notes ; `costPctBar`, `prodPctBar` pour les barres.

## i18n

Nouveaux labels (fr + en) :

- `colorBalanceColorless` : "Incolore" / "Colorless"
- `colorBalanceAny` : "Toutes couleurs" / "Any Color"

Utilisés comme `title`/tooltip des segments (via `COLOR_LABELS`) et éventuellement légende.

## Vérification

Pas de framework de test (cf. `project_no_test_framework`). Vérification :

1. Script de vérification jetable (Node/tsx) sur `computeDeckStats` avec cartes fixtures (mono, bicolore, arc-en-ciel 5c, Eldrazi {C}).
2. `npm run check` — pas de nouveau problème sur les fichiers modifiés.
3. Runtime : page deck FR, vérifier segments Any/Colorless visibles et barres alignées.
