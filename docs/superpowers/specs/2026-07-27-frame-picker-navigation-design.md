# Navigation de la bibliothèque de cadres — design

Le sélecteur d'apparences du studio (`/[locale]/studio`, onglet Layout) propose 109
cadres. Il est difficilement navigable. Ce document décrit comment le rendre parcourable.

Date : 2026-07-27. Branche : `feat/custom-card-studio`.

## Le problème

Les 109 cadres sont présentés en sections par `kind`, triées alphabétiquement sur le
libellé, paginées par tranches de 30.

Quatre défauts, tous constatés sur les données réelles :

1. **69 des 109 tombent dans une seule section** (`kind = 'card'`). Le regroupement
   principal ne regroupe donc rien.
2. **Le tri alphabétique détruit l'ordre qui a du sens.** « 10th edition » sous 1,
   « After M15 » sous A, « Before 8th edition » sous B : la chronologie des cadres Magic
   est éclatée sur tout l'alphabet.
3. **Les noms sont un dump MSE.** « After 8th edition » apparaît 4 fois à l'identique ;
   « YOU GOT Card Maker » désigne un cadre Megaman ; « Buttock1234 style » nomme un
   auteur, pas une apparence.
4. **Trois des facettes sur lesquelles le code s'appuie sont mortes** : `source` (les 109
   sont `mse`), `quality` (les 109 sont `legacy`), `layout_id` (les 109 sont `null`). La
   règle de tri « CardConjurer d'abord » de `frame-choices.ts` ne trie rien.

## Principe directeur : fidélité à la source

La première version de ce design inventait une taxonomie (`era` à 6 valeurs) déduite des
id par expressions régulières. C'était une erreur : **le corpus MSE déclare déjà sa
propre taxonomie**, et elle est complète.

Chaque `.mse-style/style` contient :

```
short name: M15 style
full name: After M15
installer group: magic/m15 style/normal cards
position hint: 010
```

Vérifié sur les 109 cadres : `installer group` et `position hint` sont présents
**109/109**. `position hint` est numérique sur les 109, de `001` à `907`, 88 valeurs
distinctes.

On ne réinterprète donc pas la source, on l'expose.

## Modèle de données

### `kind` est retiré

`kind` n'est pas de la donnée : c'est une cascade de regex sur `id + name`
(`generate-manifests.mjs:112`) dont le résultat dépend de l'ordre des tests. L'audit sur
les 109 cadres montre trois défauts rédhibitoires :

- **Faux positifs.** `magic-planeshifted` est classé `oversized` parce que `/planar/`
  matche son nom « **Planar** Chaos Timeshifts » — alors que son chemin déclaré dit
  `magic/Planeshifted/Normal Cards`, soit des cartes normales. `magic-m15-bigtext` est
  classé `packaging` parce que `/box/` matche « After M15 with Taller Text**box** ». Ces
  deux catégories ne comptent qu'un cadre chacune, et **les deux sont des erreurs**.
- **Confusion flip / double-face.** La regex `/double|transform|flip|meld/` range les flip
  cards avec les DFC. Ce sont deux mécaniques distinctes : un flip a **une seule face**
  qu'on pivote, une DFC en a deux imprimées. Le corpus les sépare correctement
  (`magic/Future/flip cards` vs `magic/new style/double faced`) ; c'est `classify` qui les
  mélange.
- **Un fourre-tout de 69 cadres sur 109** — le regroupement principal ne regroupe rien.

`kind` n'est lu que par le studio (vérifié : aucun consommateur ailleurs) et ne pilote
aucun rendu — la géométrie vient de `geometry`. Il est donc remplacé, pas migré.

**Un point d'attention au retrait** : `layoutForTemplate` / `layoutForMseTemplate` lisent
`kind` pour dériver `layoutId`, qui sert encore à savoir qu'un planeswalker saisit une
loyauté plutôt qu'une force/endurance (`DirectEditingLayer`). Ces deux fonctions doivent
lire `is_planeswalker` / `is_token` à la place. C'est le seul comportement fonctionnel qui
dépende encore de `kind`, et il doit être re-vérifié dans le navigateur.

### Ce qui le remplace

| Colonne           | Type      | Contenu                                                         |
| ----------------- | --------- | --------------------------------------------------------------- |
| `installer_group` | `text`    | Le chemin BRUT, tel que déclaré : `magic/m15 style/split cards` |
| `position_hint`   | `text`    | L'ordre déclaré : `010`, `301`, `907`                           |
| `is_*` (36)       | `boolean` | Une par mot-clé **documenté** (cf. ci-dessous)                  |
| `tags`            | `text[]`  | Les mots-clés non documentés                                    |

**Une colonne par mot-clé documenté.** Un mot-clé est « documenté » quand une source du
corpus l'atteste — le chemin déclaré **ou** l'id du style. Les deux sont de la donnée
source ; n'en retenir qu'une perd des cadres, ce qui a été vérifié :

| Cadre                                 | Chemin déclaré | Sauvé par l'id    |
| ------------------------------------- | -------------- | ----------------- |
| `magic-m15-token-invention`           | `devoid cards` | `is_token`        |
| `magic-m15-scroll-demon-planeswalker` | `normal cards` | `is_planeswalker` |
| `magic-m15-outlaws-planeswalker`      | `normal cards` | `is_planeswalker` |

`magic-m15-token-invention` porte alors `is_token` **et** `is_devoid` — les deux sources
s'ajoutent au lieu de s'écraser. Un cadre à la fois planeswalker et double-face porte les
deux colonnes, ce que `kind`, mono-valué, rendait impossible.

Les 36 colonnes vont de `is_planeswalker` (21 cadres) à `is_greater_morphling` (1). Pas de
`is_oversized` ni `is_packaging` : ces catégories n'existent que par les deux faux
positifs ci-dessus.

### Pourquoi le chemin brut est conservé en plus

`installer_group` est stocké **entier et non découpé**, en plus des colonnes qu'on en
dérive. La famille est une projection de ce chemin, calculée à la lecture. Le découper à
l'ingestion perdrait la hiérarchie (`magic/m15 style/planeswalkers/planeshifted` a 4
niveaux, un autre en a 2) et rendrait toute correction dépendante d'un nouveau passage
`card-assets`. C'est le filet : tout est re-dérivable.

### Ce qui n'est PAS stocké

- **« Compatible créature »** — dérivé de `geometry.boxes.pt`, déjà en base. Le stocker
  créerait deux vérités susceptibles de diverger.
- **`origin` (officiel/custom)** — dérivé du 2e segment. Une famille est « officielle »
  quand elle reproduit un cadre Wizards (`old style`, `new style`, `m15 style`, `Future`,
  `Planeshifted`, `Classicshifted`, `tenth edition packaging style`, `4th edition style`),
  « custom » sinon. C'est le seul jugement de valeur du design ; il reste en code, dans
  une table explicite, pour être corrigeable en un commit sans toucher la prod.

### Normalisation des mots-clés

Les segments déclarés comportent des doublons d'écriture : `token`/`tokens`,
`promotional`/`promo cards`/`promo style`, `gods`/`god cards`,
`planeswalkers`/`planeswalker cards`. Sans normalisation on créerait trois colonnes pour
« promo ».

Règle : minuscules, suppression du suffixe ` cards`, singularisation, puis table de
synonymes explicite. Le segment `normal cards` (22 occurrences) est **écarté** : il ne
distingue rien.

`flip` et `double_faced` restent **distincts** — mécaniques différentes, cf. ci-dessus.

## Facettes exposées

Six `<select>` dans une modale de filtres, alignée sur le `FilterModal` existant de
l'app.

| Champ               | Source                        | Cardinalité           |
| ------------------- | ----------------------------- | --------------------- |
| Famille             | `installer_group`, 2e segment | 30 valeurs            |
| Mot-clé             | les 36 colonnes `is_*`        | 36 valeurs            |
| Origine             | dérivé de la famille          | 2 valeurs (78 / 31)   |
| Orientation         | `orientation`                 | 2 valeurs (91 / 18)   |
| Compatible créature | `geometry.boxes.pt`           | 2 valeurs (74 / 35)   |
| Tag                 | `tags`                        | traîne non documentée |

Il n'y a plus de champ « Type » : `kind` étant retiré, le type de carte est porté par les
colonnes `is_planeswalker`, `is_split`, `is_token`, `is_double_faced`, `is_flip`, qui
figurent parmi les 36 mots-clés. Un cadre peut donc apparaître sous plusieurs types à la
fois — ce que le champ mono-valué interdisait.

**Les 30 familles sont listées à plat**, sans regroupement, telles que déclarées. 24
d'entre elles ne comptent qu'un ou deux cadres ; chaque option porte son compte
(« FKiH style (1) ») pour rester lisible, et un `<select>` reste parcourable au clavier
là où 30 cases à cocher ne le seraient pas.

Les options à zéro résultat sont masquées : c'est ce qui empêche un select de 30 entrées
de devenir une impasse quand d'autres filtres sont actifs. Le champ Trait en compte 39,
soit davantage que les familles — le masquage y est donc encore plus déterminant.

## Tri

`position_hint` croissant, puis libellé en départage.

C'est l'ordre déclaré par les auteurs du corpus. Le tri alphabétique actuel le jetait ;
la règle « CardConjurer d'abord » qui le précède ne trie rien (les 109 sont `mse`) et est
supprimée.

## Liste

- **Scroll infini** par tranches de 30, via `IntersectionObserver` sur une sentinelle, en
  remplacement du bouton « Afficher 30 de plus ».
- **Vignettes agrandies** en grille. Sur une bibliothèque de cadres, l'aperçu _est_
  l'information : « Buttock1234 style » ne dit rien, son image dit tout.
- **Badges** sur la vignette : famille · mots-clés actifs.
- **Libellés d'origine conservés**, avec `short_name` en sous-titre — c'est lui qui
  distingue les 4 « After 8th edition ».
- **Recherche élargie** à `name` + `short_name` + `id` + mots-clés + `tags` +
  `installer_group`.
  Taper « m15 » doit sortir les 22 cadres M15 ; aujourd'hui la recherche ne porte que sur
  le libellé affiché et n'en sort presque aucun.

### Sections ou grille plate

Sections par famille quand **aucun filtre n'est actif** ; grille plate dès qu'un filtre
l'est. Un en-tête unique au-dessus de résultats déjà filtrés n'apporte rien et coûte une
hauteur d'écran.

## Découpage

| Fichier                                      | Rôle                                           |
| -------------------------------------------- | ---------------------------------------------- |
| `supabase/migrations/2026…_frame_facets.sql` | Les 3 colonnes + index                         |
| `scripts/card-assets/frame-facets.ts`        | Parse `style`, normalise les mots-clés (pur)   |
| `scripts/card-assets/generate-manifests.mjs` | `classify()` supprimé (remplacé par ci-dessus) |
| `scripts/card-assets/upload-templates.ts`    | Remplit les colonnes à l'ingestion             |
| `src/lib/card-editor/frame-facets.ts`        | Projections lecture : famille, origine         |
| `src/lib/card-editor/frame-choices.ts`       | Tri par `position_hint`, filtrage              |
| `…/MseTemplatePicker/FrameFilterModal.tsx`   | La modale de filtres                           |
| `…/MseTemplatePicker/MseTemplatePicker.tsx`  | Grille, badges, scroll infini                  |

Les deux `frame-facets.ts` sont distincts et le restent : celui de `scripts/` lit le
système de fichiers à l'ingestion, celui de `src/` projette des colonnes déjà chargées.
Les fusionner ferait entrer du code Node dans un module client — le piège
`server-only import boundary` déjà rencontré sur ce dépôt.

## Coût de déploiement

Ce design ajoute **une 4e migration** à la liste de déploiement prod (après
`20260726120000`, `20260726130000`, `20260727120000`) **et un passage
`npm run card-assets`**, qui écrit en production.

## Vérification

Pas de framework de test dans ce dépôt. Les portes :

- `npm run check` — aucun NOUVEAU problème (base ~60 dans des fichiers sans rapport)
- `npm run build`
- `npm run sb:verify` après migration
- Navigateur : les 6 filtres, le scroll infini, la recherche « m15 », et le tri conforme
  à `position_hint`

## Hors périmètre

- Réécriture des libellés MSE (écartée : les noms d'origine sont conservés)
- Licences des cadres — bloquant distinct, non traité ici
- Les 3 autres points ouverts du studio (redirect après sauvegarde, rollout prod, sort de
  la branche)
