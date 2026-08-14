# Couronne légendaire — design

Peindre la couronne légendaire sur le cadre quand le supertype « Legendary » est saisi
dans la ligne de type du studio.

Date : 2026-07-27. Branche : `feat/custom-card-studio`.

## Le problème

On ne trouve aucun « cadre légendaire » dans la bibliothèque du studio. C'est normal : **il
n'en existe pas**, ni dans le studio ni dans Magic. Sur une vraie carte, le légendaire est
une **couronne posée sur le cadre normal**, pas un gabarit distinct.

MSE le modélise exactement ainsi (`magic-m15-godzilla.mse-style/style`) :

```
is_auto := {chosen(styling.crown, choice: "auto")}
match(card.super_type, match: "Legendary")
```

Le studio, lui, traite un gabarit comme « un PNG à peindre » et ignore les options de
styling. La couronne est le premier endroit où cette simplification se voit.

## Déclenchement

Automatique, sur le supertype — jamais une case à cocher :

```ts
parseTypeLine(draft.typeLine, vocabulary).supertypes.includes('Legendary');
```

Le studio parse déjà ce supertype (`type-line.ts:30`, `SUPERTYPE_ORDER`). La ligne de type
reste la source unique : aucun champ n'est ajouté au brouillon, donc rien ne peut diverger
entre ce qui est écrit et ce qui est peint.

## Le critère de compatibilité

Les couronnes du corpus sont dessinées pour la barre de titre M15. Elles ne peuvent pas
être posées sur n'importe quel cadre. Le périmètre est donc **mesuré, pas décidé** :

> Un cadre accepte la couronne si ses dimensions natives valent **375×523** ET si sa boîte
> de nom mesurée est identique à celle de `magic-m15` :
> `top 30, left 32, width 279.28, height 23`.

Comparaison à 0,5 px près, sur la géométrie déjà extraite du corpus.

### Pourquoi ce critère, et pas un autre

La couronne occupe la bande `y = 10 → 102` (mesuré sur `wcrown.png` : pixels d'alpha > 16).
C'est exactement la zone de la barre de titre, donc c'est la boîte du nom qui décide de
l'alignement.

Vérifié visuellement dans les deux sens, en composant la couronne sur des cadres réels :

| Cadres testés                                                                                 | Boîte de nom | Rendu                        |
| --------------------------------------------------------------------------------------------- | ------------ | ---------------------------- |
| `magic-m15`, `magic-new`, `magic-tenth`, `magic-classicshifted`                               | identique    | couronne alignée             |
| `magic-old`, `magic-veryold`, `magic-future`, `magic-megaman`, `magic-nokiou`, `magic-horror` | différente   | couronne qui écrase le titre |

**Un contre-exemple à mon intuition initiale** : je supposais que les cadres pré-M15
seraient incompatibles. C'est faux — `new style` et `tenth` réutilisent la géométrie de
titre M15 et acceptent la couronne. Seule la mesure l'a montré ; le nom de famille aurait
donné un mauvais périmètre.

### Résultat

**27 cadres sur 109** : 13 `new style`, 8 `m15 style`, 2 `Classicshifted`,
2 `Planeshifted`, 1 `tenth edition packaging style`, 1 `windy`.

### Ce que le corpus déclare, et pourquoi on ne s'en sert pas

Le module `magic-modules.mse-include/crowns` porte un `readme.txt` : un auteur de template
ajoute la couronne délibérément, avec une dépendance déclarée, deux `include file:` et un
script à adapter.

Sur les 109 cadres offerts, **un seul** fait cette inclusion (`magic-m15-textless`). Suivre
la déclaration donnerait donc un périmètre de 1 cadre, alors que 27 sont visuellement
compatibles. La déclaration dit « ce style a été câblé pour la couronne », pas « la
couronne s'y aligne » — ce sont deux questions différentes, et c'est la seconde qui nous
intéresse.

## Les assets

`magic-modules.mse-include/crowns/375/` — module **partagé**, donc utilisable avec
n'importe quel cadre compatible, pas enfermé dans un style.

- `wcrown.png`, `ucrown.png`, `bcrown.png`, `rcrown.png`, `gcrown.png`, `mcrown.png`,
  `acrown.png`, `ccrown.png`, `xcrown.png` — 375×523, **canal alpha**, donc une simple
  superposition suffit (pas de composition par masques).
- La nomenclature est celle des cadres, que `FRAME_FILE_STEMS` et `resolveMseFramePath`
  résolvent déjà.

**Une clé de cadre n'a pas d'équivalent : `land`.** `MseFrameKey` vaut
`Exclude<FrameStyleId,'auto'> | 'land'`, mais le corpus ne fournit aucune couronne terrain,
alors que les terrains légendaires existent (Dark Depths, Urborg). Sur un cadre résolu en
`land`, aucune couronne n'est peinte — même règle que pour un cadre incompatible. La
détection terrain existe déjà (`isLandTypeLine`, utilisée par `resolveAutomaticFrame`), donc
ce cas est atteignable et doit être traité explicitement plutôt que de produire un chemin
`lcrown.png` inexistant.

Les variantes `nyx/`, `companion/`, `brawl/`, `borderless/` et les résolutions `750` et
`744x1039` (qui sont des masques, pas des images peintes) sont **hors périmètre**.

## Modèle de données

Une colonne sur `card_templates`, remplie à l'ingestion :

| Colonne       | Type    | Contenu                                                              |
| ------------- | ------- | -------------------------------------------------------------------- |
| `crown_paths` | `jsonb` | `{ light, tide, void, ember, grove, prismatic, artifact }` ou `NULL` |

Même forme que `frame_paths`, aux mêmes clés **sauf `land`**, qui n'a pas de couronne dans
le corpus. `NULL` signifie « ce cadre n'accepte pas la couronne » — 27 lignes remplies, 82 à
`NULL`.

Le critère de compatibilité est donc appliqué **une seule fois, à l'ingestion**, là où la
géométrie du corpus est disponible. Le rendu ne fait que lire une colonne : il n'a pas à
comparer des boîtes à chaque frame.

## Rendu

Dans `CardCanvas`, un `<image>` supplémentaire peint **après** le cadre — l'ordre importe,
la couronne mord sur le haut du cadre :

```
1. illustration
2. PNG du cadre
3. PNG de la couronne   <- si crownPath ET supertype Legendary
4. textes, symboles, P/T
```

La couleur suit `resolveMseFramePath` : la couronne réutilise la même clé
(`frameStyle` → `light`/`tide`/…), donc elle s'accorde automatiquement au cadre choisi,
y compris en mode `auto` où la couleur est déduite du coût de mana.

Comme le cadre, la couronne est peinte en `preserveAspectRatio="none"` sur toute la carte :
son PNG est déjà cadré aux dimensions du gabarit.

## Cadre incompatible

**Rien n'est peint, et rien n'est signalé.** Saisir « Legendary » sur l'un des 82 autres
cadres écrit le mot dans la ligne de type, point.

C'est la règle « aucun fallback » du projet, déjà appliquée à la géométrie : un rendu
plausible mais faux est pire qu'une absence. Et c'est cohérent avec le studio, où un cadre
sans zone P/T masque simplement les statistiques sans expliquer pourquoi.

## Découpage

| Fichier                                         | Rôle                                                   |
| ----------------------------------------------- | ------------------------------------------------------ |
| `supabase/migrations/2026…_add_crown_paths.sql` | La colonne + grants                                    |
| `scripts/card-assets/crown-compat.mjs`          | Le critère de compatibilité (pur, testable)            |
| `scripts/card-assets/generate-manifests.mjs`    | Émet `crownPaths` au manifeste                         |
| `scripts/card-assets/upload-templates.ts`       | Écrit la colonne                                       |
| `src/lib/card-editor/mse-assets.ts`             | `crownPaths` sur `MseTemplate` + `resolveMseCrownPath` |
| `src/lib/card-editor/components/CardCanvas/`    | Peint la couronne                                      |

`crown-compat.mjs` est séparé de `generate-manifests.mjs` pour la même raison que
`frame-keywords.mjs` : le critère doit être vérifiable seul, contre le corpus réel.

## Coût de déploiement

Une **5e migration** (après `20260726120000`, `20260726130000`, `20260727120000`,
`20260727130000`) **et un passage `npm run card-assets`**, qui écrit en production.

Avant ce passage, `crown_paths` est `NULL` partout : aucune couronne ne s'affiche, rien ne
casse.

## Vérification

Pas de framework de test dans ce dépôt. Les portes :

- `npm run check` — aucun NOUVEAU problème (base ~60 dans des fichiers sans rapport)
- `npm run build`
- `npm run sb:verify` après migration
- Le critère doit retourner exactement **27** cadres sur le corpus local
- Navigateur : sur un cadre M15, saisir « Legendary » dans les supertypes fait apparaître
  la couronne ; la retirer la fait disparaître ; changer la palette change sa couleur ; sur
  un cadre `old style` rien n'apparaît

## Hors périmètre

- Les autres options de styling MSE : `nyx`, `companion`, `brawl`, `borderless`
- Les couronnes en 750 et 744x1039 (masques, composition différente)
- Rendre les 82 cadres incompatibles compatibles (redessiner des couronnes)
- Licences des cadres — bloquant distinct
