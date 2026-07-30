# Fondu hybride fidèle — design

Reproduire le cadre hybride bicolore tel que MSE le compose : un dégradé horizontal entre
les deux couleurs, avec les plaques de titre en gris neutre.

Date : 2026-07-27. Branche : `feat/custom-card-studio`.

## Le problème

Le studio peint aujourd'hui un hybride `{G/U}` avec `masked_blend` seul : le masque
`hybrid_blend_card.png` découpe entre deux cadres de couleur. Deux défauts en découlent.

**Pas de dégradé.** Le masque est binaire — mesuré : 0,17 % de pixels intermédiaires, et
entièrement blanc sur toute la largeur à mi-hauteur. Il ne peut structurellement pas
produire la transition gauche-droite qu'une carte hybride imprimée porte.

**Les mauvaises plaques.** La barre de titre et la ligne de type prennent la couleur du
cadre au lieu du gris neutre.

## Ce que fait MSE

`magic-blends.mse-include/new-blends` définit `color_combination`, et son commentaire
énonce le principe :

> Usually, the basic gradient is used on the "light" parts of the mask
> And one of those three are used on the "dark" parts
> hybrid mode is expected to add a plate effect, but leave the trim and pinline alone

Deux mécanismes **superposés**, pas alternatifs. La branche qui nous concerne — hybride
pur, ni artefact ni multicolore :

```
else if color_count > 1 then (
    mode := "hybrid"
    dark := land_template      ## les plaques viennent du cadre TERRAIN
)
```

Et le dégradé lui-même, depuis `magic-m15-showcase-capenna-art-deco.mse-style` :

```
card_hybrid_2 := linear_blend(
    image1: template(colors[0]),
    image2: template(colors[1]),
    x1: 0.45, y1: 0
    x2: 0.55, y2: 0
)
```

`y1 = y2 = 0` : le dégradé est **horizontal**, avec une bande de transition de 10 % centrée
sur la carte.

La formule complète, vérifiée en la composant sur les fichiers réels :

```
masked_blend(
    mask:  hybrid_blend_card.png
    light: linear_blend(couleur₁, couleur₂, x1: 0.45, x2: 0.55)
    dark:  clcard
)
```

Le masque que le studio utilise déjà était donc le bon — ce sont ses deux **entrées** qui
étaient fausses.

## Rendu SVG

Trois couches au lieu de deux :

```
<linearGradient id="{clipId}-hygrad" x1="45%" y1="0%" x2="55%" y2="0%">
  <stop offset="0" stopColor="black" />
  <stop offset="1" stopColor="white" />
</linearGradient>
<mask id="{clipId}-hygrad-mask" maskUnits="userSpaceOnUse"
      x="0" y="0" width={geometry.width} height={geometry.height}>
  <rect x="0" y="0" width={geometry.width} height={geometry.height}
        fill="url(#{clipId}-hygrad)" />
</mask>
<mask id="{clipId}-hyplate" maskUnits="userSpaceOnUse"
      x="0" y="0" width={geometry.width} height={geometry.height}>
  <image href={masque hybrid} … />
</mask>

<image href={clcard} … />                                  ← dark : les plaques
<g mask="url(#{clipId}-hyplate)">                          ← light : la bordure
  <image href={couleur₁} … />
  <image href={couleur₂} mask="url(#{clipId}-hygrad-mask)" … />
</g>
```

Deux précisions qui évitent un piège d'implémentation :

- **`maskUnits="userSpaceOnUse"` explicite** sur les deux masques, avec les dimensions du
  gabarit. Le défaut est `objectBoundingBox`, qui recadrerait le masque sur la boîte de
  l'élément masqué plutôt que sur la carte. Le masque existant y échappe par accident,
  parce que son contenu porte déjà des coordonnées absolues ; ne pas s'en remettre à cet
  accident.
- **Le dégradé reste en pourcentages.** `linearGradient` est en `objectBoundingBox` par
  défaut, ce qui est exactement voulu ici : 45 % et 55 % de la largeur, quel que soit le
  gabarit — les 27 cadres en paysage compris.

`clipId` est déjà généré par instance via `useId()` et sert déjà de préfixe au masque
actuel : les trois canvas restent indépendants sans mécanisme nouveau.

**Les valeurs 45 % / 55 % sont codées en dur**, avec un commentaire disant d'où elles
viennent. Un seul style du corpus déclare `card_hybrid_2` ; les extraire à l'ingestion
ajouterait une colonne presque toujours vide et un passage `card-assets` pour une donnée
unique.

**L'export PNG suit sans modification.** `inlineSvgImages` parcourt
`svg.querySelectorAll('image')`, ce qui inclut les images dans un `<mask>` — déjà vérifié
lors du chantier précédent. Le `<linearGradient>` n'est pas une image et n'a rien à inliner.

## Cadres sans `clcard`

Mesuré sur les 109 cadres proposés :

| Situation                      | Cadres | Comportement              |
| ------------------------------ | ------ | ------------------------- |
| masque + `land-colorless`      | 66     | formule fidèle            |
| masque + `colorless` seulement | 17     | même formule avec `ccard` |
| masque, ni l'un ni l'autre     | 2      | pas de fondu — cadre or   |
| pas de masque `hybrid`         | 24     | pas de fondu — cadre or   |

La chaîne `land-colorless` → `colorless` → rien reprend celle de `frameDegradationChain` :
on dégrade vers moins spécifique **au sein du gris**, jamais vers une autre couleur. Un
cadre or sur un hybride reste juste, seulement moins fidèle ; un fond coloré serait faux.

## Découpage

| Fichier                                      | Rôle                                               |
| -------------------------------------------- | -------------------------------------------------- |
| `src/lib/card-editor/mse-assets.ts`          | `resolveMseBlend` renvoie aussi le fond de plaques |
| `src/lib/card-editor/components/CardCanvas/` | Le `<linearGradient>` et les trois couches         |

Aucune migration, aucune ré-ingestion, aucun nouvel asset : `hybrid_blend_card.png`,
`clcard` et `ccard` sont déjà ingérés, stockés et téléversés.

## Type de retour

`resolveMseBlend` passe de trois URL à quatre :

```ts
{ base: string; overlay: string; mask: string; plate: string } | null
```

`plate` est le fond gris (`clcard` ou `ccard`). `null` dès qu'une pièce manque — coût non
hybride, carte pas exactement bicolore, masque absent, cadre manquant pour une couleur, ou
aucun fond gris disponible.

## Vérification

Pas de framework de test dans ce dépôt. Les portes :

- `npm run check` — aucun NOUVEAU problème (base ~60 dans des fichiers sans rapport)
- `npm run build`
- Navigateur, sur un cadre `m15 style` : un coût `{G/U}` affiche une bordure verte à gauche
  qui devient bleue à droite, avec une barre de titre **grise** ; `{G}{U}` reste or ; le PNG
  exporté porte le dégradé
- Le DOM doit montrer quatre `<image>` et deux `<mask>` sur une carte hybride

## Hors périmètre

- Hybride à trois couleurs ou plus
- Le mode `artifact` et le mode `multicolor` de `color_combination`
- Les terrains bicolores (mode `multicolor` + `land`)
- Les formes `radial`, `vertical`, `overlay` — le studio n'a pas de champ pour les choisir
- Les chaînages de blends (un artefact hybride enchaîne deux compositions)
- Licences des cadres — bloquant distinct
