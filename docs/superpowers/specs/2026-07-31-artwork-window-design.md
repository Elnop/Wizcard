# Fenêtre d'illustration — design

Découper la fenêtre d'illustration dans les cadres MSE, qui la peignent en noir opaque et
recouvrent donc l'illustration.

Date : 2026-07-31. Branche : `feat/custom-card-studio`.

## Le problème

Importer une illustration dans le studio ne l'affiche sous aucun cadre.

L'illustration n'est pas en cause. Constaté dans le DOM : elle est présente (data URI
webp), positionnée à (54,123) en 636×811, correctement découpée par son `clipPath`. En
masquant le cadre dans la page, elle apparaît immédiatement — au centre de la zone d'art,
`elementsFromPoint` renvoie alors `image[data-uri]` au sommet.

La cause est l'ordre de peinture confronté à la nature des cadres. `CardCanvas` peint
l'illustration (ligne 483) **puis** le cadre (ligne 588) — l'ordre juste pour une carte
Magic, dont le cadre est censé porter une fenêtre. Or les cadres de ce corpus sont des
**JPEG opaques** qui peignent la zone d'illustration en **noir pur** :

| Cadre                               | Pixel au centre de la boîte `image` |
| ----------------------------------- | ----------------------------------- |
| `magic-m15` / `wcard.jpg`           | `(0, 0, 0)`                         |
| `magic-m15-commander` / `mcard.jpg` | `(0, 0, 0)`                         |

Ce noir est prévu pour être recouvert : dans MSE l'illustration se compose **au-dessus**.
Chez nous, le cadre passe après et son rectangle noir gagne.

## La mécanique

Deux niveaux, selon ce que le gabarit fournit. Mesuré sur les 140 gabarits ayant une
géométrie (109 sont proposés dans la bibliothèque) :

| Situation                     | Gabarits | Découpe                        |
| ----------------------------- | -------- | ------------------------------ |
| masque d'illustration déclaré | 68       | découpe exacte du corpus       |
| aucun masque                  | 41       | rectangle `geometry.ast.image` |

Les 41 sans masque ne sont pas un cas dégradé inventé : leur style MSE ne déclare
simplement aucun masque sur le champ image — vérifié sur `magic-m15.mse-style/style`, qui
ne porte que `border_mask.png` (ligne 201) et `foil_mask*.png` (ligne 364). MSE y ouvre la
fenêtre par la seule géométrie, exactement ce que le repli reproduit.

### Polarité

Constante sur les variantes normales : **blanc = la fenêtre**, noir = le cadre à
conserver.

| Fichier                      | Centre | Coin | Blanc  |
| ---------------------------- | ------ | ---- | ------ |
| `image_mask.png` (commander) | 255    | 255  | 96,6 % |
| `imagemask.png` (b1234)      | 255    | 0    | 82,7 % |
| `mask_image.png` (future)    | 255    | 0    | 82,0 % |

**Sauf `image_mask_inv.png`, qui est inversé** — centre 0, coin 255, mesuré sur
`magic-m15-Kaladesh` et `magic-m15-devoid`. Le prendre pour un masque normal peindrait la
carte à l'envers : le cadre disparaîtrait et seule la fenêtre resterait. Ces fichiers sont
donc **exclus**, et les gabarits concernés retombent sur le repli géométrique.

### Le masque se positionne sur la boîte `image`

Un masque fait la taille de la zone d'illustration, pas de la carte :
`image_mask.png` de `magic-m15-commander` est en 316×231, et la géométrie de ce gabarit
donne `image = {left: 29, top: 60, width: 316, height: 231}`. Le masque se pose donc aux
coordonnées de cette boîte, sans calcul ni mise à l'échelle.

Cette boîte est déjà disponible au rendu : `template-geometry.ts:48` mappe `boxes.image`
sur `geometry.art`, que `CardCanvas` utilise déjà pour le `clipPath` de l'illustration
(ligne 466). Le repli géométrique ne demande donc **aucune donnée nouvelle** — c'est la
même boîte, déjà mise à l'échelle de la carte.

## Rendu SVG

Un seul masque, appliqué **au cadre** — l'inverse de l'usage habituel, puisqu'on veut
_retirer_ la fenêtre plutôt que la garder :

```
<mask id="{clipId}-artwin" maskUnits="userSpaceOnUse"
      x="0" y="0" width={geometry.width} height={geometry.height}>
  <rect x="0" y="0" width={geometry.width} height={geometry.height} fill="white" />
  <image href={masque} {...geometry.art} preserveAspectRatio="none" />
</mask>

<image href={cadre} … mask="url(#{clipId}-artwin)" />
```

Le `<rect>` blanc rend tout le cadre visible ; le masque, blanc dans sa fenêtre, y creuse
le trou. Sans masque déclaré, la deuxième ligne devient :

```
<rect {...geometry.art} fill="black" />
```

Même mécanisme, fenêtre rectangulaire.

`maskUnits="userSpaceOnUse"` est **explicite** : le défaut `objectBoundingBox`
recadrerait le masque sur la boîte de l'élément masqué au lieu de la carte. Le masque du
fondu hybride n'y échappe que par accident de son contenu ; ne pas s'en remettre à ça.

`clipId` est déjà unique par instance via `useId()` : les trois canvas restent
indépendants sans mécanisme nouveau.

## Interaction avec le fondu hybride

Le cadre hybride est peint en trois couches (plaque grise, puis deux couleurs groupées
sous le masque hybride). Le masque de fenêtre s'applique alors **au groupe entier**, pas à
chaque couche : une seule fenêtre, creusée une fois, quelle que soit la composition
au-dessus. Le `<image>` de la plaque grise et le `<g>` des couleurs sont donc enveloppés
ensemble.

## L'ingestion

Le nom du fichier n'est pas normalisé : `image_mask.png` (98 déclarations), `imagemask.png`
(29), `image_mask_full.png` (20), `mask_image.png` (17), `imgmask.png` (8), et d'autres.
**Ne pas deviner par motif de nom** — c'est ce qui ferait avaler les `_inv`.

La source de vérité est la déclaration `mask:` du champ image dans le fichier `style` de
chaque paquet.

**Ce n'est pas ce que fait l'ingestion aujourd'hui.** `resolveBlendMasks`
(`scripts/card-assets/generate-manifests.mjs:188`) travaille sur une liste de noms figés
(`BLEND_MASK_FILES` : `multicolor_blend_card.png`, `hybrid_blend_card.png`,
`artifact_blend_card.png`) et cherche un fichier qui s'y termine. Cette approche suffisait
parce que ces trois masques portent un nom stable dans tout le corpus ; elle ne transpose
pas ici, où le même rôle se cache derrière au moins huit noms. Il faut donc **lire la
déclaration**, ce qui est un ajout au script d'ingestion, pas une réutilisation.

34 déclarations sont pilotées par un script plutôt que littérales, par exemple :

```
script: if styling.image_size == "extended" then "imagemask_extended.png"
        else "imagemask_standard.png"
```

Le studio n'expose pas l'option `image_size` de MSE. On retient donc la **branche `else`**,
c'est-à-dire `standard` — le défaut de MSE lui-même, pas une préférence arbitraire. Quand
un script est trop complexe pour être réduit à une constante, le gabarit n'a pas de
masque et prend le repli géométrique : jamais de valeur inventée.

Stockage : une clé `image` dans la colonne `blend_masks` existante. Pas de nouvelle
colonne — `blend_masks` est déjà un objet de masques nommés, et une clé de plus n'oblige
à aucune migration de forme.

## Vérification

Pas de framework de test dans ce dépôt. Les portes :

- `npm run check` — aucun NOUVEAU problème (base ~60 dans des fichiers sans rapport)
- `npm run build`
- Navigateur : importer une illustration, puis
  - sur `magic-m15-commander` (masque déclaré) : l'illustration est visible, la fenêtre
    épouse la forme du cadre ;
  - sur `magic-m15` (aucun masque) : l'illustration est visible dans un rectangle ;
  - sur un hybride `{G/U}` : l'illustration est visible ET le dégradé reste correct ;
  - le PNG exporté porte l'illustration.
- Le DOM doit montrer un `<mask>` supplémentaire, et le cadre doit porter son `mask=`.

## Hors périmètre

- Les masques `_inv` — exclus par sécurité, repli géométrique pour ces gabarits
- L'option `image_size` de MSE (`extended`) — le studio n'a pas de champ pour la choisir
- Les masques `border_mask` et `foil_mask`, qui répondent à d'autres besoins
- Le recadrage de l'illustration (zoom, décalage) — déjà en place et inchangé
- Les licences des cadres — bloquant distinct
