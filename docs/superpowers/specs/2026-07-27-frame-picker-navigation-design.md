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

- **Faux positifs.** `magic-m15-bigtext` est classé `packaging` parce que `/box/` matche
  la **sous-chaîne** de « After M15 with Taller Text**box** ». `magic-planeshifted` est
  classé `oversized` parce que `/planar/` matche son nom « Planar Chaos Timeshifts » —
  un mot entier cette fois, mais un mauvais indice : c'est un nom d'extension, et son
  chemin déclaré dit `magic/Planeshifted/Normal Cards`. Ces deux catégories ne comptent
  qu'un cadre chacune, et **les deux sont des erreurs**.
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
tester les mots-clés `planeswalker` / `token` de `tags` à la place. C'est le seul
comportement fonctionnel qui
dépende encore de `kind`, et il doit être re-vérifié dans le navigateur.

### Ce qui le remplace

| Colonne           | Type     | Contenu                                                         |
| ----------------- | -------- | --------------------------------------------------------------- |
| `installer_group` | `text`   | Le chemin BRUT, tel que déclaré : `magic/m15 style/split cards` |
| `position_hint`   | `text`   | L'ordre déclaré : `010`, `301`, `907`                           |
| `tags`            | `text[]` | **Tous** les mots-clés, toutes sources confondues               |

**Tout est stocké, rien n'est arbitré.** `tags` reçoit l'union des mots-clés de l'id, du
nom, du `short_name` et du chemin déclaré : **200 mots-clés distincts** sur les 109 cadres.

Aucune colonne booléenne n'est créée à ce stade. Une version antérieure de ce spec en
prévoyait 36, choisies sur une liste que l'auteur du spec avait décidée — ce qui était à
la fois de la sur-interprétation (le seuil était arbitraire) et une perte : `textless`,
`fullart`, `commander`, `kaladesh`, `japanese`, `russian`, `nyx`, `hires`, `keyword`,
`snow` en étaient absents alors que ce sont exactement des critères de recherche.

Des colonnes pourront être extraites plus tard, par une migration dédiée, **quand l'UI en
démontrera le besoin**. Le choix sera alors guidé par un usage constaté et non par un
seuil supposé, et `tags` restant la source, l'extraction sera un simple recalcul.

**Les deux sources s'ajoutent, elles ne s'écrasent pas.** Le chemin seul perdrait trois
cadres, vérifié :

| Cadre                                 | Chemin déclaré | Rattrapé par l'id |
| ------------------------------------- | -------------- | ----------------- |
| `magic-m15-token-invention`           | `devoid cards` | `token`           |
| `magic-m15-scroll-demon-planeswalker` | `normal cards` | `planeswalker`    |
| `magic-m15-outlaws-planeswalker`      | `normal cards` | `planeswalker`    |

`magic-m15-token-invention` porte donc `token` **et** `devoid`. Un cadre à la fois
planeswalker et double-face porte les deux — ce que `kind`, mono-valué, rendait
impossible.

### Ce qui est écarté de `tags`

Le seul filtrage est celui des jetons sans pouvoir discriminant, mesuré et non supposé :

- `magic` — présent sur 107 des 109 cadres ;
- `card` / `cards` / `style` / `normal` — mots de structure du chemin ;
- les jetons d'un seul caractère et purement numériques (`1`, `2`, `4`, `d`, `n`, `s`,
  `w`).

Restent **188 mots-clés**. Les mots de phrase (`after`, `edition`, `frame`, `template`)
sont **conservés** : les écarter demanderait de juger ce qui est un mot-clé, exactement
l'arbitrage qu'on veut éviter. Ils sont inoffensifs dans un champ cherchable, et
n'apparaîtront pas en badge (cf. § Liste).

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

### Découpage en mots entiers

**Le parsing compare des mots entiers, jamais des sous-chaînes.** Les chaînes sources
(id, nom, chemin) sont découpées sur tout ce qui n'est pas alphanumérique — `-`, `_`, `/`,
espace — et chaque jeton est comparé en entier.

C'est ce qui distingue un vrai indice d'une collision : `box` ne doit pas matcher
« Text**box** », ni `pack` matcher « **pack**aging » dans un mot qui ne parle pas
d'emballage. La cascade `classify()` actuelle teste des sous-chaînes, d'où le faux positif
`packaging` ci-dessus.

Vérifié sur les 109 cadres : le passage aux mots entiers ne fait perdre **aucun** rattrapage
pour `token`, `planeswalker`, `split`, `flip`, `promo`, `god`, `tapped`, `leveler`. Un seul
cas change — `doublefaced`, écrit collé dans deux id (`magic-new-doublefaced-sacrificer`,
`…-sparker`), n'est plus atteint par le mot `double`. Ces deux cadres restent couverts par
leur chemin déclaré, où « double faced » est bien en deux mots. Aucune sous-chaîne n'est
donc réintroduite.

Corollaire à ne pas manquer : ces deux cadres se nomment « Planeswalker -> Creature » et
« Creature -> Planeswalker » — des DFC qui se transforment entre planeswalker et créature.
Ils portent donc **`double_faced` (par le chemin) ET `planeswalker` (par le nom)**,
ce qui est exact. `kind`, mono-valué, en choisissait un et jetait l'autre.

### Normalisation des mots-clés

Les sources écrivent la même notion de plusieurs façons : `token`/`tokens`,
`promo`/`promotional`, `god`/`gods`, `planeswalker`/`planeswalkers`/`walkers`,
`fpm`/`firepenguinmaster`, `split`/`splits`. Sans fusion, le champ Mot-clé afficherait
trois entrées « promo » renvoyant à des sous-ensembles différents.

Règle : minuscules, suppression du suffixe ` cards`, singularisation, puis **table de
synonymes explicite** — une table lisible et éditable, pas une heuristique. Le segment
`normal cards` (22 occurrences) est écarté : il ne distingue rien.

La fusion est **conservatrice** : elle ne rapproche que des variantes d'écriture d'une
même notion, jamais deux notions voisines. `flip` et `double_faced` restent donc
**distincts** — un flip a une seule face imprimée qu'on pivote, une DFC en a deux.

Un segment de chemin est pris **en entier** comme mot-clé (`double faced` est un mot-clé,
pas deux). Le découpage en mots entiers de la section précédente s'applique à la détection
dans l'id et le nom, qui sont du texte libre — pas aux segments du chemin, qui sont déjà
des unités déclarées.

Cette normalisation ne fait perdre aucune information : la forme brute reste disponible
dans `installer_group`, le `name` et l'`id`, tous conservés.

## Facettes exposées

Cinq champs dans une modale de filtres, alignée sur le `FilterModal` existant de l'app :
quatre `<select>` et une liste filtrable pour les mots-clés (cf. plus bas).

| Champ               | Source                        | Cardinalité         |
| ------------------- | ----------------------------- | ------------------- |
| Famille             | `installer_group`, 2e segment | 30 valeurs          |
| Mot-clé             | `tags`                        | 188 valeurs         |
| Origine             | dérivé de la famille          | 2 valeurs (78 / 31) |
| Orientation         | `orientation`                 | 2 valeurs (91 / 18) |
| Compatible créature | `geometry.boxes.pt`           | 2 valeurs (74 / 35) |

Il n'y a plus de champ « Type » : `kind` étant retiré, le type de carte est porté par les
mots-clés `planeswalker`, `split`, `token`, `double_faced`, `flip`. Un cadre peut donc
apparaître sous plusieurs types à la fois — ce que le champ mono-valué interdisait.

### Le champ Mot-clé expose les 188

Un `<select>` de 188 options serait aussi impraticable que la liste qu'on corrige. Le
champ est donc une **liste filtrable** : une saisie qui réduit les options à mesure, la
sélection s'ajoutant comme une puce retirable (plusieurs mots-clés cumulables en ET).

Trois règles rendent les 188 parcourables sans en cacher aucun :

1. **Tri par nombre de cadres décroissant** — `planeswalker` (21) avant `nyx` (1).
2. **Compte sur chaque option** — « planeswalker (21) », « textless (1) ».
3. **Options à zéro résultat masquées** quand d'autres filtres sont actifs.

Aucun mot-clé n'est retiré de la liste : les 127 qui ne concernent qu'un seul cadre
restent atteignables, ce sont même souvent les plus discriminants quand on sait ce qu'on
cherche (`nyx`, `kaladesh`, `outlaws`).

**Les 30 familles sont listées à plat**, sans regroupement, telles que déclarées. 24
d'entre elles ne comptent qu'un ou deux cadres ; chaque option porte son compte
(« FKiH style (1) ») pour rester lisible, et un `<select>` reste parcourable au clavier
là où 30 cases à cocher ne le seraient pas.

Les options à zéro résultat sont masquées : c'est ce qui empêche un select de 30 entrées
de devenir une impasse quand d'autres filtres sont actifs.

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
- **Badges** sur la vignette : la famille, puis les mots-clés du cadre. Un cadre en porte
  jusqu'à une dizaine, ce qui ne tient pas sous une vignette : on affiche les plus
  **rares** d'abord (un mot-clé porté par 1 cadre le caractérise, `planeswalker` porté par
  21 beaucoup moins), plafonnés à 3, le reste au survol. Les mots de phrase (`after`,
  `edition`, `frame`, `template`) sont exclus de l'affichage — ils restent dans `tags`
  pour la recherche, mais ne caractérisent aucun cadre.
- **Libellés d'origine conservés**, avec `short_name` en sous-titre — c'est lui qui
  distingue les 4 « After 8th edition ».
- **Recherche élargie** à `name` + `short_name` + `id` + mots-clés + `tags` +
  `installer_group`. Elle reste en **préfixe de mot**, et non en mot entier : on cherche
  pendant la frappe, donc « plan » doit remonter « planeswalker ». La règle du mot entier
  vaut pour la CLASSIFICATION (qui décide d'une colonne et doit être exacte), pas pour la
  recherche (qui propose et doit être permissive). Ancrer sur le début du mot suffit à
  écarter le cas « box » / « Textbox ».
  Taper « m15 » doit sortir 24 cadres (les 22 de la famille `m15 style`, plus 2 qui la
  citent sans y appartenir) ; aujourd'hui la recherche ne porte que sur
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
- Navigateur : les 5 filtres, le scroll infini, la recherche « m15 » (24 résultats), le
  tri conforme à `position_hint`, et la saisie de loyauté sur un planeswalker — seul
  comportement fonctionnel touché par le retrait de `kind`

## Hors périmètre

- Réécriture des libellés MSE (écartée : les noms d'origine sont conservés)
- Licences des cadres — bloquant distinct, non traité ici
- Les 3 autres points ouverts du studio (redirect après sauvegarde, rollout prod, sort de
  la branche)
