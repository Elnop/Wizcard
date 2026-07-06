# Refonte des outils de deck building & graphiques — Design

**Date**: 2026-07-06
**Statut**: Approuvé, prêt pour plan d'implémentation

## Objectif

Enrichir le panneau `DeckStats` de la page détail deck (`/decks/[id]`) avec de
nouveaux graphiques (colors cost, colors production) et une analyse actionnable
(équilibre de la manabase, répartition des types), le tout dans la direction
artistique existante du site (verre + or/laiton, fond nuit, coins nets, pips MTG).
Améliorer aussi visuellement la `MiniManaCurve` de la liste des decks.

Disposition retenue : **flux vertical « centré sur l'analyse »** — un panneau de
verre continu, sections séparées par des filets dorés, sans grille rigide de boîtes.

## Décisions de calcul (arbitrées)

| Sujet                            | Décision                                                                                                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Colors cost**                  | Pips colorés parsés depuis `mana_cost`. `{R}`→+1 R. Hybride `{G/U}`→**+0.5** à chaque couleur. Phyrexian `{G/P}`→+1 pour la couleur. Générique `{2}`,`{X}`,`{C}` (incolore) → ignoré.               |
| **Colors production**            | Toutes sources : chaque carte avec `produced_mana` compte +1 par couleur produite (inclut `C`). Terrains + dorks + rocks.                                                                           |
| **Color identity**               | = `colorDistribution` actuel (renommé `colorIdentity`).                                                                                                                                             |
| **Double-face (MDFC/transform)** | Chaque **face** = une entrée distincte dans les **distributions** (mana curve, colors cost, types). Le KPI « nb de cartes » reste le nombre d'**exemplaires physiques** (un deck de 99 affiche 99). |
| **Production & faces**           | `produced_mana` n'existe **que** sur `ScryfallCard`, pas sur `ScryfallCardFace`. La production reste donc calculée **au niveau carte** (une carte = ses sources), pas par face.                     |
| **Ratio terrains**               | Informatif, **jamais prescriptif** (trop d'exceptions légitimes). Affiche le nombre ; pas d'alerte rouge.                                                                                           |
| **Note équilibre manabase**      | Ton **neutre/informatif** : `◆ Rouge : 40% des pips, 30% des sources`. Jamais alarmant.                                                                                                             |
| **Anneaux/donuts**               | **Non** dans ce chantier (flux B = barres seules). Si besoin plus tard : SVG léger, pas de lib.                                                                                                     |

## Modèle de données — `deck-stats.ts` étendu

```ts
type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G';
type ProdColor = ManaColor | 'C';
type TypeCategory =
	| 'Creature'
	| 'Instant'
	| 'Sorcery'
	| 'Enchantment'
	| 'Artifact'
	| 'Planeswalker'
	| 'Land'
	| 'Other';

interface DeckStats {
	// Totaux — exemplaires PHYSIQUES (inchangés)
	totalCards: number;
	mainboardCount: number;
	sideboardCount: number;
	maybeboardCount: number;
	commanderCount: number;

	// Distributions — PAR FACE (sauf production, par carte)
	landCount: number; // faces terrain (mainboard+commander)
	averageCmc: number; // faces non-terrain
	manaCurve: Record<number, number>; // floor(cmc), 7+ groupé à l'affichage
	colorsCost: Record<ManaColor, number>; // pips, hybride 0.5 → décimaux possibles
	colorsProduction: Record<ProdColor, number>; // par carte, produced_mana
	colorIdentity: Record<ManaColor, number>; // ex-colorDistribution
	typeDistribution: Record<TypeCategory, number>;
}
```

**Portée des calculs** : distributions sur `mainboard` + `commander`.
`maybeboard` et `sideboard` exclus des distributions (comme aujourd'hui).
`colorIdentity` : conserver le comportement actuel (tous zones sauf maybeboard).

## Fonctions utilitaires pures (testables, isolées)

À placer dans `deck-stats.ts` ou un voisin `mana-cost.ts` :

- `parseColorPips(manaCost: string): Record<ManaColor, number>`
  Parse les symboles `{...}`. Mono-couleur +1 ; hybride couleur/couleur +0.5 chacun ;
  Phyrexian `{X/P}` +1 pour la couleur ; générique/`{X}`/`{C}` ignoré.
  Retourne un enregistrement partiel (0 par défaut).
- `iterateFaces(card: ScryfallCard): Array<{ mana_cost?: string; cmc?: number; type_line?: string }>`
  Retourne `card.card_faces` si présent et non vide, sinon `[card]` normalisé.
  Sert au cost / curve / types (pas à la production).
- `categorizeType(typeLine: string): TypeCategory`
  Ordre de priorité MTG : Land > Creature > Planeswalker > Instant > Sorcery >
  Enchantment > Artifact > Other. (Un « Artifact Creature » compte Creature ;
  un terrain reste Land.)

**Contrainte face/CMC** : les faces n'ont pas toujours de `cmc` propre ; si absent,
retomber sur le `cmc` de la carte pour la face avant, 0 sinon. À préciser à
l'implémentation en observant les données réelles.

## Composants UI (flux B, DA du site)

Panneau de verre continu (`--glass-bg`, `--glass-border`, `blur(12px)`), sections
séparées par un filet dégradé doré (`hair`). De haut en bas :

1. **KPIs** — rangée : `Cartes` / `CMC moyen` / `Terrains` / `Créatures`.
   Chiffres en `--gold`, labels `--text-muted` uppercase. Créatures depuis
   `typeDistribution.Creature`.
2. **Mana Curve** — `ManaCurve` **existant conservé** (barres brass→gold, `riseUp`).
   Amélioration : label `7+`, tooltip au survol (count). Consomme `stats.manaCurve`.
3. **Color Balance** (nouveau `ColorBalance/`) — deux barres empilées **alignées**
   `Coût` / `Production`, segments aux couleurs `--mana-*`. Sous les barres, notes
   dorées neutres par couleur lorsque l'écart pips/sources est notable (ton informatif).
4. **Type Bar** (nouveau `TypeBar/`) — ruban empilé + légende à pips par catégorie.

Nouveaux dossiers composants : `ColorBalance/` et `TypeBar/`, chacun `.tsx` +
`.module.css`, réutilisant les tokens globaux. Barres = CSS (flex + width %).

## MiniManaCurve (liste des decks)

Polish visuel aligné sur la DA, **sans nouvelle donnée** : cohérence du dégradé
brass→gold, éventuellement accent sur la barre la plus haute. Signature `Props`
inchangée (`curve: Record<number, number>`).

## Périmètre des fichiers

**Modifiés**

- `src/lib/deck/utils/deck-stats.ts` — interface + calculs étendus.
- `src/app/decks/[id]/components/DeckStats/DeckStats.tsx` (+ `.module.css`) — flux B.
- `src/app/decks/[id]/components/ManaCurve/ManaCurve.tsx` — tooltip (mineur).
- `src/app/decks/components/DeckCard/MiniManaCurve.tsx` (+ `.module.css`) — polish.

**Créés**

- `src/app/decks/[id]/components/ColorBalance/ColorBalance.tsx` + `.module.css`
- `src/app/decks/[id]/components/TypeBar/TypeBar.tsx` + `.module.css`
- (optionnel) `src/lib/deck/utils/mana-cost.ts` — parseur de pips isolé.

**Consommateurs à vérifier** : tout code lisant `DeckStats.colorDistribution`
(renommé `colorIdentity`) — grep avant de renommer, ou garder un alias.

## Vérification

Pas de framework de test dans ce projet (cf. mémoire `project_no_test_framework`).
Vérifier via :

- `npm run check` (TypeScript + ESLint + Prettier).
- Runtime : `npm run dev`, ouvrir `/decks/[id]` sur un deck réel — vérifier
  curve, color balance (Coût vs Production), types, KPIs ; tester un deck mono-
  couleur, un multicolore, et un deck avec cartes double-face + MDFC terrain.

## Hors périmètre (YAGNI)

- Anneaux/donuts SVG (reportés).
- Alertes prescriptives sur le ratio de terrains.
- Onglets / vue par tab.
- Comparaison entre decks, courbe « idéale » superposée.
