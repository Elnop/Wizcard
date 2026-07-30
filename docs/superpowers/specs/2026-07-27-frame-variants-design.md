# Variantes de cadre manquantes — design

Exposer les cadres terrain, incolore et les fondus bicolores que le corpus MSE fournit mais
que `frame_paths` ignore.

Date : 2026-07-27. Branche : `feat/custom-card-studio`.

## Le problème

Le studio stocke **7 variantes par cadre** — une par couleur — alors que le corpus en
fournit une quinzaine. Mesuré sur les 109 cadres proposés, voici ce qui existe sur disque et
n'est jamais stocké :

| Fichier                     | Cadres concernés | Ce que c'est              |
| --------------------------- | ---------------- | ------------------------- |
| `multicolor_blend_card.png` | 107              | masque de fondu bicolore  |
| `ccard.jpg`                 | 89               | cadre **incolore**        |
| `artifact_blend_card.png`   | 95               | masque de fondu artefact  |
| `hybrid_blend_card.png`     | 85               | masque de fondu hybride   |
| `clcard.jpg`                | 82               | terrain incolore          |
| `wlcard` … `mlcard`         | 73–74 chacun     | terrains, une par couleur |

Deux défauts en découlent, visibles dans `resolveAutomaticFrame` :

- **`land` est déjà une clé de `MseFrameKey`**, et `isLandTypeLine` la renvoie déjà — mais
  aucun cadre ne fournit cette clé. La détection terrain existe et ne mène nulle part.
- **`{C}` renvoie `artifact`.** Le mana `{C}` est _incolore_, pas de l'artefact. Le studio
  confond les deux parce que `ccard` n'est exposé nulle part, alors que `acard` (artefact)
  l'est.

## Deux natures de fichiers, à ne pas confondre

L'inspection visuelle des fichiers sépare nettement :

**Des vrais cadres** — `ccard` est un gris-brun incolore, distinct du bleu-métal `acard` ;
les `*lcard` sont des bordures terre à zone de texte teintée. Ils se peignent exactement
comme les 7 actuels.

**Des masques** — `multicolor_blend_card.png` et ses deux frères sont des images
quasi-binaires (mesuré : 0,2 à 0,4 % de pixels intermédiaires seulement). Peints tels
quels, ils donneraient une carte blanche.

## Ce que fait MSE avec les masques

`magic-classicshifted.mse-style/style` montre la mécanique :

```
masked_blend(
    mask:  "alpha_blend.png",
    dark:  land_template(colors[0]),
    light: land_template(colors[1]),
)
```

Le masque décide **par pixel** lequel de **deux cadres colorés** apparaît. Un fondu entre
deux couleurs, pas un cadre autonome.

## Modèle de données

| Colonne       | Évolution                                                          |
| ------------- | ------------------------------------------------------------------ |
| `frame_paths` | 7 clés → **15** : les 7 actuelles + 7 terrains + 1 incolore        |
| `blend_masks` | **nouveau** `jsonb` : `{ multicolor, hybrid, artifact }` ou `NULL` |

`frame_paths` ne change pas de forme, seulement de contenu : `FRAME_FILE_STEMS` gagne les
tiges manquantes et l'ingestion les ramasse comme les autres. Aucune migration n'est
nécessaire pour cette partie.

`blend_masks` est séparé de `frame_paths` **parce que ce ne sont pas des cadres**. Les
mélanger inviterait un futur lecteur à en peindre un directement, ce qui produit une carte
blanche. `NULL` signifie « ce cadre ne fournit pas de masque de fondu ».

### Clés ajoutées à `MseFrameKey`

Les 7 terrains prennent le préfixe `land-` sur la clé de couleur existante :
`land-light`, `land-tide`, `land-void`, `land-ember`, `land-grove`, `land-prismatic`,
`land-colorless`. Plus `colorless` pour `ccard`.

La clé `land` actuelle, qui ne pointe sur rien, **disparaît** : elle est remplacée par les
sept clés typées. `resolveAutomaticFrame` la renvoyait déjà ; il renverra désormais celle de
la bonne couleur.

## Déclenchement

Automatique, sur les données déjà saisies — la palette garde ses 7 pastilles plus
« Automatique », aucune nouvelle entrée :

| Condition                           | Cadre choisi           |
| ----------------------------------- | ---------------------- |
| `isLandTypeLine(typeLine)`          | `land-<couleur>`       |
| aucun symbole coloré, `{C}` présent | `colorless` (`ccard`)  |
| exactement 2 couleurs               | fondu de la paire      |
| 3 couleurs ou plus                  | `prismatic` (inchangé) |
| 1 couleur                           | la couleur (inchangé)  |

`resolveAutomaticFrame` porte déjà toute cette détection. Il lui manque seulement des clés
vers lesquelles pointer.

### L'ordre des couleurs d'un fondu

**Ordre WUBRG canonique**, pas l'ordre de saisie. Une vraie carte `{U}{W}` s'imprime
toujours blanc-bleu ; suivre la frappe produirait un cadre inversé par rapport à l'imprimé.

Dix paires possibles : WU, WB, WR, WG, UB, UR, UG, BR, BG, RG.

## Rendu des fondus

Un `<mask>` SVG, composé dans le navigateur — rien n'est généré ni stocké :

```
<mask id="blend">
  <image href={masque} … />
</mask>
<image href={cadre couleur A} … />
<image href={cadre couleur B} mask="url(#blend)" … />
```

Le masque étant quasi-binaire, le rendu est une découpe franche, fidèle à l'imprimé.

**L'export PNG suit sans modification.** Vérifié : `inlineSvgImages` (dans
`card-editor/export.ts`) parcourt `svg.querySelectorAll('image')`, ce qui inclut les images
placées dans un `<mask>`. Les trois images seront inlinées en data-URI comme les autres.

Coût : trois images chargées au lieu d'une, sur les seules cartes bicolores.

## Cadre sans variante

Tous les cadres ne fournissent pas les 15 clés — `ccard` existe sur 89 des 109, les terrains
sur 73 à 82. Quand la clé calculée est absente, on retombe sur la **couleur de base**
(`land-tide` absent → `tide`), pas sur un cadre d'une autre couleur.

C'est un repli délibéré et différent de celui de la couronne : un cadre bleu là où on
attendait un terrain bleu reste juste, seulement moins spécifique — alors qu'une couronne de
la mauvaise couleur est une erreur visible. Le principe « aucun fallback » interdit
d'inventer, pas de dégrader vers moins précis.

## Découpage

| Fichier                                         | Rôle                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| `scripts/card-assets/generate-manifests.mjs`    | `FRAME_FILE_STEMS` étendu + collecte des masques                 |
| `supabase/migrations/2026…_add_blend_masks.sql` | La colonne `blend_masks` + grants                                |
| `scripts/card-assets/upload-templates.ts`       | Écrit la colonne, ajoute les masques à l'upload                  |
| `src/lib/card-editor/mse-assets.ts`             | `MseFrameKey` étendu, `resolveAutomaticFrame`, `resolveMseBlend` |
| `src/lib/card-editor/components/CardCanvas/`    | Le `<mask>` SVG                                                  |

Le piège d'upload rencontré sur la couronne se répète ici : `collectReferencedPaths` ne
ramasse que ce qu'il connaît. Les masques doivent y être ajoutés explicitement, sinon ils ne
seront jamais téléversés en production.

## Coût de déploiement

Une **6e migration** et un passage `npm run card-assets` — qui écrit en production et
téléversera les nouveaux fichiers. Avant ce passage, `frame_paths` garde ses 7 clés et
`blend_masks` est `NULL` : le rendu actuel est inchangé, rien ne casse.

## Vérification

Pas de framework de test dans ce dépôt. Les portes :

- `npm run check` — aucun NOUVEAU problème (base ~60 dans des fichiers sans rapport)
- `npm run build`
- `npm run sb:verify` après migration
- Les comptes attendus après ingestion : `ccard` sur 89 cadres, terrains sur 73–82,
  masques sur 85–107
- Navigateur : une carte terrain prend un cadre terrain ; un coût `{C}` prend `ccard` et non
  `acard` ; un coût `{W}{U}` affiche un fondu blanc-bleu ; l'export PNG contient le fondu

## Hors périmètre

- Les variantes `snow/`, `shifted/`, `beyond/` des dossiers de cadres
- Les modules dynamiques `stamps` (sceau sous la P/T) et `indicators` (pastille d'identité)
- Le traitement Nyx des enchantements
- La netteté de la couronne légendaire — chantier reporté
- Licences des cadres — bloquant distinct
