---
title: 'Directives enrichies dans les articles (cartes, sets)'
type: 'feature'
created: '2026-10-20'
status: 'done'
baseline_commit: '6e3bf58f4fdba20153f8a5ef6f52ae6be61efd9b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-4-article-pages.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un article ne peut pas montrer les cartes ou les sets dont il parle : le Markdown de #63 affiche les directives telles quelles. Le digest (#62) doit pourtant citer des cartes. Issue #70, découpée de #63 (critère « cartes citées affichées comme cartes »), epic #59.

**Approach:** On ajoute `remark-directive` au rendu Markdown des articles et on mappe trois directives sur des composants du site. Avant le rendu, la page extrait du corps tous les ids de cartes et tous les codes de sets cités, puis les résout en un seul lot chacun. Tout ce qui est introuvable ou inconnu retombe en texte brut.

**Décisions (propriétaire, 2026-10-20) :**

- `::cards{ids="<print id>,<print id>"}` (bloc) : grille de `CardImage`, chaque carte liée à `/card/<id>`.
- `:card[texte]{id=<print id>}` (inline) : lien vers `/card/<id>`.
- `:set[texte]{code=<code>}` (inline) : lien vers `/sets/<code>` précédé de l'icône du set (`card_sets.icon_svg_uri`).
- **Id ou code mal formé (revue, 2026-10-20) :** `:card[Bolt]{id=zzz}` et `:set[X]{code=…invalide}` affichent leur libellé seul (`Bolt`, `X`), comme un id ou un code inconnu. Le texte source reste réservé aux directives inconnues et à celles qui n'ont pas de libellé.
- Pas de symboles de mana. Le HTML brut n'est toujours jamais rendu.

## Boundaries & Constraints

**Always :**

- Résolution en un seul lot par article : `byPrintIds` (`src/lib/card/catalog-db`) pour les cartes, et une requête `card_sets` par codes, dans `src/lib/supabase/queries/` (jamais de client Supabase ailleurs). Une erreur de résolution dégrade en texte brut, sans casser la page.
- L'extraction des ids et des codes est une fonction pure, testée avec `node:test`. Elle utilise le même parseur que le rendu (`remark-parse` + `remark-directive`), pour que rendu et extraction soient d'accord.
- Une directive inconnue, ou mal formée (attribut manquant ou vide, id non-UUID), est rendue avec son texte source, sans erreur.
- `markdownExcerpt` (meta description) ne garde que le libellé des directives inline, retire les directives de bloc, et ne laisse jamais de syntaxe `::`/`:x[...]{...}`.
- Les dépendances s'installent par `npm install` avec npm 11.21.1. Ne jamais éditer `package-lock.json` à la main.

**Never :**

- Pas de symboles de mana, pas d'autres directives.
- Pas de rendu de HTML brut (`rehype-raw` interdit).
- Pas de lecture par carte (pas de N+1).

## I/O & Edge-Case Matrix

| Scénario           | Entrée                                     | Rendu attendu                                              |
| ------------------ | ------------------------------------------ | ---------------------------------------------------------- |
| Grille             | `::cards{ids="A,B"}`, A et B connues       | 2 `CardImage` liées à `/card/A` et `/card/B`, dans l'ordre |
| Grille partielle   | `::cards{ids="A,zzz,C"}`, C inconnue       | seule A est affichée ; une grille vide n'est pas rendue    |
| Lien carte         | `:card[Bolt]{id=A}`                        | `<a href="/<locale>/card/A">Bolt</a>`                      |
| Carte inconnue     | `:card[Bolt]{id=zzz}`                      | texte `Bolt`                                               |
| Lien set           | `:set[Foundations]{code=fdn}`              | lien `/<locale>/sets/fdn` avec l'icône du set              |
| Set inconnu        | `:set[X]{code=zzz}`                        | texte `X`                                                  |
| Directive inconnue | `::video{src=x}` / `:foo[bar]`             | texte source, sans erreur                                  |
| Faux positif       | `Ratio 2:1`, `12:30`, `https://x.y`        | inchangé                                                   |
| Lot unique         | 3 directives qui citent 5 cartes et 2 sets | 1 appel `byPrintIds` + 1 requête `card_sets`               |
| Meta description   | corps avec directives                      | libellés seuls, sans syntaxe de directive                  |

</frozen-after-approval>

## Code Map

- `src/lib/articles/ArticleBody/ArticleBody.tsx` -- rendu react-markdown + `remark-gfm` ; override `a` (le `Link` i18n pour les `/…`) à réutiliser pour `:card`/`:set` ; `h1` → `h2`.
- `src/lib/articles/article.ts` + `article.test.ts` -- module pur (`markdownExcerpt`, `filterArticles`…) : y mettre l'extraction et les tests.
- `src/app/[locale]/articles/[slug]/page.tsx` -- page ISR qui rend `<ArticleBody markdown=… />` : c'est là qu'on résout les lots avant le rendu.
- `src/lib/card/catalog-db/index.ts` `byPrintIds(ids)` → `Map<string, Card>` (filtre déjà les non-UUID, découpe en lots, résiste aux erreurs de sous-requête).
- `src/lib/card/components/CardImage/CardImage.tsx` -- client, prop `card` ; vérifier qu'un `Card` lui est assignable.
- `src/app/[locale]/sets/components/SetCard/SetCard.tsx` -- modèle d'affichage d'icône de set (`<img src={icon_svg_uri}>`) ; `svgs.scryfall.io` est déjà autorisé par la CSP et les `remotePatterns`.
- `src/lib/supabase/catalog.ts` `createCatalogClient` ; modèle de requête : `src/lib/supabase/queries/articles.server.ts`.

## Tasks & Acceptance

**Execution:**

- [x] `package.json` -- `remark-directive` ; plus `unified` et `remark-parse` en dépendances directes si l'extraction les importe.
- [x] `src/lib/articles/directives.ts` (pur) -- noms et attributs des 3 directives, validation (UUID, code de set), `extractCitations(markdown) → { printIds, setCodes }` dédupliqués ; plugin remark qui transforme les directives connues et valides en nœuds rendables (`hName`/`hProperties`) et les autres en texte source.
- [x] `src/lib/supabase/queries/card-sets.server.ts` -- `fetchSetsByCodes(codes)` → `{ code, name, icon_svg_uri }[]` via `createCatalogClient`.
- [x] `src/lib/articles/articles.server.ts` -- `resolveCitations(bodyMarkdown)` : extraction, puis `byPrintIds` et `fetchSetsByCodes` en parallèle, avec repli sur des maps vides en cas d'erreur.
- [x] `src/lib/articles/ArticleBody/` -- reçoit les maps résolues et rend la grille (`CardImage` + `Link`), le lien de carte et le lien de set avec son icône ; CSS de la grille, responsive.
- [x] `src/app/[locale]/articles/[slug]/page.tsx` -- résout les citations du corps localisé et les passe à `ArticleBody`.
- [x] `src/lib/articles/article.ts` -- `markdownExcerpt` gère les directives (voir Boundaries).
- [x] `src/lib/articles/*.test.ts` -- couvre chaque ligne de la matrice qui ne demande pas de rendu React : extraction, validation, repli texte, faux positifs, excerpt.

**Acceptance Criteria:**

- Given un article local dont le corps couvre toutes les lignes de la matrice, when on ouvre `/fr/articles/<slug>` sur un build de prod, then chaque ligne est respectée, et le log réseau ou SQL montre une seule lecture de prints et une seule de sets.
- Given `npm run check`, `npm run build` et `npm run test:scripts`, then tous sortent en 0.

## Verification

**Commands:**

- `npm run test:scripts` -- expected : 0 fail.
- `npm run check && npm run build` -- expected : exit 0.

**Manual checks:**

- `npx next start -p 3100` après le build, sur un article de test inséré en local (le supprimer ensuite). Vérifier d'abord que le port 3100 est libre et arrêter le serveur à la fin. Utiliser le conteneur `supabase_db_scute_swarm` et aucun autre.

## Implementation Notes

- **`:card`/`:set` étiquetés mais mal formés** (id non-UUID, code invalide, attribut absent) : rendus par leur seul libellé, comme un id/code inconnu (décision propriétaire). Texte source réservé aux noms inconnus et aux directives sans libellé.
- **Pas de `<a>` imbriqué** : dans un lien (ou le libellé d'un `:card`/`:set`), `:card`/`:set` rendent leur libellé et les liens sont aplatis en texte.
- **Projection `ArticleCard`** : la grille ne transmet au `CardImage` client que les champs qu'il lit (`toArticleCard`). Les ids/codes non résolus sont signalés par `console.warn`.
- **Faux positifs de remark-directive** : `2:1` et `12:30` sont parsés comme directives texte nommées `1` / `30`. Ils retombent en texte source et les nœuds texte adjacents sont fusionnés : rendu strictement inchangé.
- `::cards` : ids non-UUID ignorés, dédupliqués ; aucun id valide → texte source.
- **Lot unique vérifié** au log Kong (`next start`) : 1 `card_sets?code=in.(…)` pour les citations + 1 `card_prints?id=in.(…)` ; les requêtes `card_definitions`/faces/`card_sets` qui suivent sont les jointures internes de `byPrintIds`.
- `markdownExcerpt` reste en regex (module atteignable côté client, pas de parseur dans le bundle client).
- `CardImage` est `inline-block` et dimensionné par son consommateur : la grille lui passe une classe `width: 100%`.

## Spec Change Log

## Review Triage Log

| #   | Source       | Constat                                                                                                              | Verdict     | Preuve                                                                                                               | Route                       |
| --- | ------------ | -------------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| 1   | blind, edge  | `:card`/`:set` dans le texte d'un lien Markdown, ou un lien dans leur libellé : `<a>` imbriqués                      | medium      | HTML invalide et erreur d'hydratation                                                                                | patch                       |
| 2   | —            | Contradiction de la spec sur `:card[Bolt]{id=zzz}` (matrice ou Boundaries)                                           | —           | Décision du propriétaire : libellé seul                                                                              | patch                       |
| 3   | verif, blind | Le plugin dans le vrai pipeline (lecture de `file.value`) n'est pas testé ; les tests passent par `parseArticleBody` | medium      | Un `file.value` vide viderait le texte source de repli                                                               | patch                       |
| 4   | edge, blind  | Extrait : `std::vector` est tronqué, une directive dans du code inline est retirée alors que la page l'affiche       | low         | Corrections directes : ancrer la regex de bloc en début de ligne, retirer le code inline avant                       | patch                       |
| 5   | blind        | `ArticleSetRef.name` lu mais jamais utilisé                                                                          | low         | Correction directe : s'en servir pour le `title` du lien et l'`alt` de l'icône                                       | patch                       |
| 6   | blind        | Les citations non résolues disparaissent sans trace dans les logs                                                    | low         | Un `console.warn` suffit                                                                                             | patch                       |
| 7   | blind        | Chaque carte de la grille envoie tout l'objet `Card` au client (payload RSC)                                         | medium      | `CardImage` est un composant client ; un digest cite des dizaines de cartes                                          | patch (projection minimale) |
| 8   | blind        | Commentaire de `markdownExcerpt` non replié                                                                          | low         | Cosmétique, correction directe                                                                                       | patch                       |
| 9   | edge         | Erreur passagère pendant une revalidation : la page de repli reste en cache 1 h                                      | low         | Se résorbe à la revalidation suivante ; `byPrintIds` ne lève jamais                                                  | rejeté                      |
| 10  | edge         | Clôture `:::` d'un conteneur inconnu dans une citation ou une liste                                                  | low         | Cas rare (directive inconnue imbriquée)                                                                              | rejeté                      |
| 11  | edge         | Faux positif avec un libellé (`2:1[^1]`) : le libellé est rendu en Markdown brut                                     | low         | Cas rare                                                                                                             | rejeté                      |
| 12  | edge         | Un lecteur qui lève de façon synchrone casse le contrat                                                              | false       | Les deux lecteurs sont des fonctions `async`, donc ils rejettent une promesse et ne lèvent jamais de façon synchrone | rejeté                      |
| 13  | edge         | `::cards[Titre]{…}` : le libellé est ignoré                                                                          | low         | Forme non documentée                                                                                                 | rejeté                      |
| 14  | edge         | Plus de 150 cartes citées font plusieurs requêtes `card_prints`                                                      | low         | Découpage interne de `byPrintIds` ; un seul appel côté article                                                       | rejeté                      |
| 15  | edge         | `\:card[x]{…}` échappé laisse des fragments dans l'extrait                                                           | low         | Cas rare, ne touche que la meta                                                                                      | rejeté                      |
| 16  | blind        | Type `MdNode` écrit à la main au lieu des types mdast                                                                | low         | Pas de bug constaté                                                                                                  | rejeté                      |
| 17  | blind        | La règle `.body img` atteint l'image de `CardImage`                                                                  | maybe-false | Le navigateur montre des images de 488 px affichées à 173 px, correctement                                           | rejeté                      |
| 18  | blind        | Le filtre de l'icône de set suppose un fond sombre ; routes codées en dur                                            | low         | Le site n'a qu'un thème sombre ; il n'existe pas de helper de routes                                                 | rejeté                      |
| 19  | verif, blind | Pas de test de rendu React d'`ArticleBody`                                                                           | medium      | Le dépôt n'a pas de harnais de rendu (même report qu'en 3.4)                                                         | defer                       |
| 20  | blind        | Accessibilité de la grille : pas de libellé de groupe, `alt` en anglais                                              | low         | Amélioration                                                                                                         | defer                       |
