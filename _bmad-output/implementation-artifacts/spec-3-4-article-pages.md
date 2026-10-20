---
title: 'Pages articles'
type: 'feature'
created: '2026-10-20'
status: 'done'
baseline_commit: '50aae5ad3187b00422cdc12affccb187cfca477c'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le site n'a aucun endroit pour publier des articles. Le digest « Catalogue » (story 3.3, #62) n'a donc ni table où écrire ni page où être lu. Issue #63, story 3.4 de l'epic #59, faite **avant** la 3.3 sur décision du propriétaire.

**Approach:** Une migration crée une table `articles` générique, lisible publiquement et modifiable seulement par `service_role`. Deux pages publiques server-rendered et en ISR la lisent : `/[locale]/articles` (liste du plus récent au plus ancien, filtre par catégorie) et `/[locale]/articles/[slug]` (titre et corps Markdown dans la langue du visiteur). Les deux pages sont indexables, avec canonical et hreflang, entrent dans le sitemap, et un lien « Articles » apparaît dans la navigation.

**Décisions (propriétaire, 2026-10-20) :**

- **Corps en Markdown** (`body_fr`/`body_en` en `text`), rendu avec `react-markdown`. Le HTML brut n'est jamais rendu.
- **Découpage :** les directives enrichies qui affichent des composants du site (`::cards`, `:card`, `:set`) font l'objet d'une story séparée. Dans cette story, une directive apparaît telle quelle, en texte.
- **Lien « Articles »** dans la navbar et le tiroir mobile dès maintenant.

## Boundaries & Constraints

**Always :**

- Migration idempotente. RLS avec une policy SELECT limitée aux articles publiés (`published_at <= now()`). `grant select` à `anon`/`authenticated` et aucune écriture pour eux (revoke explicite, à cause de la default ACL). `service_role` : SELECT/INSERT/UPDATE/DELETE.
- Colonnes : `id` uuid PK default `gen_random_uuid()`, `slug` text unique, `category` text check in (`catalogue`, `magic`, `site`), `title_fr`/`title_en`/`body_fr`/`body_en` text not null, `published_at` timestamptz not null, `source` text not null (ex. `catalog-digest`, `manual`), `created_at` timestamptz default now(). Index sur (`category`, `published_at` desc).
- Lecture via `createCatalogClient` (sans cookie, compatible ISR) dans `src/lib/supabase/queries/articles.server.ts`, avec mapping vers un type domaine dans `src/lib/articles/`. Jamais de client Supabase hors de `src/lib/supabase/`.
- Tous les libellés passent par `messages/fr.json` et `messages/en.json` (namespaces `articles`, `seo.articles`, `seo.article`, plus `nav`).
- Assertions ajoutées dans `supabase/verify_schema.sql` dans le même changement.

**Never :**

- Pas de digest ni d'écriture d'article par le code applicatif (story 3.3).
- Pas de directives enrichies (story séparée), pas d'interface d'administration.
- Aucune donnée utilisateur dans un article.

## I/O & Edge-Case Matrix

| Scénario                | Entrée / état                                  | Comportement attendu                                                            |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| Liste vide              | aucun article publié                           | `/articles` affiche un état vide traduit, sans erreur                           |
| Liste triée             | 3 articles publiés                             | ordre `published_at` décroissant                                                |
| Filtre                  | `?category=catalogue`                          | seulement cette catégorie ; une catégorie inconnue est ignorée (liste complète) |
| Article futur           | `published_at` > maintenant                    | absent de la liste et de la page (404), y compris pour `anon` via PostgREST     |
| Langue                  | visiteur `fr`                                  | `title_fr`/`body_fr` ; visiteur `en` → `_en`                                    |
| Slug inconnu            | `/articles/nope`                               | 404                                                                             |
| Markdown                | titres, listes, liens, gras                    | rendus en HTML sémantique                                                       |
| HTML brut dans le corps | `<script>…</script>`                           | jamais exécuté ni rendu comme HTML                                              |
| Écriture client         | `anon`/`authenticated` en INSERT/UPDATE/DELETE | 42501                                                                           |

</frozen-after-approval>

## Code Map

- `src/app/[locale]/(legal)/cgu/page.tsx` -- modèle de page publique server : `generateMetadata` (`getTranslations({locale, namespace:'seo.x'})`, `buildAlternates(locale, path)`, `robots: {index:true}`), `setRequestLocale`.
- `src/app/[locale]/card/[id]/page.tsx` -- modèle ISR : `revalidate`, `generateStaticParams` → `[]`, client sans cookie.
- `src/app/[locale]/decks/[id]/page.tsx` -- `notFound()` et métadonnées d'une page dynamique.
- `src/lib/seo/alternates.ts` `buildAlternates` ; `src/app/sitemap.ts` `localizedEntries` + `staticRoutes`, et le modèle dynamique `deckRoutes` ; `src/app/robots.ts` (`/articles` déjà autorisé).
- `src/lib/supabase/catalog.ts` `createCatalogClient` ; modèle de requête : `src/lib/supabase/queries/custom-cards.server.ts`, avec son mapping `src/lib/mpc/db/custom-cards.server.ts`. Pas de types générés : le type de ligne s'écrit à la main.
- `messages/fr.json` + `messages/en.json` : namespaces à plat. `src/global.d.ts` type les clés depuis `fr.json`.
- `src/components/Navbar/Navbar.tsx` + `NavbarDrawer.tsx` -- liens (namespace `nav`).
- `supabase/verify_schema.sql` -- blocs `catalog_changes` / `scryfall_migrations` à imiter.

## Tasks & Acceptance

**Execution:**

- [ ] `supabase/migrations/20261021120000_create_articles.sql` -- table, index, RLS + policy `articles_select_published`, revoke et grants.
- [ ] `package.json` -- `react-markdown` via `npm install` (ne jamais éditer `package-lock.json` à la main).
- [ ] `src/lib/supabase/queries/articles.server.ts` -- `fetchPublishedArticles(category?)` et `fetchPublishedArticleBySlug(slug)` via `createCatalogClient`, avec filtre explicite `published_at <= now()` en plus de la RLS.
- [ ] `src/lib/articles/` -- type domaine, liste des catégories et garde de type, mapping des lignes et choix de la langue (pur) ; composant `ArticleBody` (react-markdown, sans `rehype-raw`).
- [ ] `src/app/[locale]/articles/page.tsx` -- liste ISR (`revalidate = 3600`), filtre par catégorie (liens `?category=`), état vide.
- [ ] `src/app/[locale]/articles/[slug]/page.tsx` -- article ISR, `notFound()`, métadonnées, `buildAlternates(locale, 'articles/' + slug)`.
- [ ] `src/app/sitemap.ts` -- `articles` en statique, et un article par slug publié.
- [ ] `messages/fr.json`, `messages/en.json` -- `articles`, `seo.articles`, `seo.article`, libellés des catégories, `nav.articles`.
- [ ] `src/components/Navbar/Navbar.tsx` + `NavbarDrawer.tsx` -- lien « Articles ».
- [ ] `supabase/verify_schema.sql` -- table, colonnes, CHECK, index, RLS, policy, grants (`anon`/`authenticated` en SELECT seulement).
- [ ] Tests `node:test` du choix de langue et de la garde de catégorie. Étendre le glob de `test:scripts` à `src/lib/articles/**/*.test.ts` si nécessaire.

**Acceptance Criteria:**

- Given une base locale migrée, when `npm run sb:verify` est lancé, then il sort en 0.
- Given deux articles insérés en local (un `catalogue` publié avec du Markdown varié et un `<script>` brut ; un `site` futur), when on ouvre `/fr/articles`, `/en/articles?category=catalogue` et `/fr/articles/<slug>` dans le navigateur, then la matrice I/O est respectée et le lien « Articles » de la navbar y mène.
- Given la page d'un article, when on lit son `<head>`, then le canonical vaut `/<locale>/articles/<slug>` avec les hreflang fr, en et x-default, sans noindex.

## Verification

**Commands:**

- `npm run sb:migrate && npm run sb:verify` -- expected : exit 0.
- `npm run test:scripts` -- expected : 0 fail.
- `npm run check && npm run build` -- expected : exit 0.

**Manual checks:**

- `npm run dev` (port 3100) puis navigateur sur les URLs de l'AC, en fr et en en.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| #   | Source             | Constat                                                                                                                                                  | Verdict | Preuve                                                                                                                      | Route                               |
| --- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1   | edge               | Le build échoue si la base est injoignable ou si la table n'est pas encore migrée, car la liste est pré-rendue au build et `fetchPublishedArticles` lève | high    | Page ISR sans paramètre, donc rendue pendant `next build` ; c'est le cas d'un déploiement prod avant la migration           | patch                               |
| 2   | blind, edge, verif | Un slug mal encodé (`%E0%A4%A`) provoque un `URIError` et une erreur 500 au lieu d'un 404                                                                | medium  | `decodeURIComponent` sans garde, dans la page et dans les métadonnées                                                       | patch                               |
| 3   | blind, edge        | Aucune règle sur le format du slug, ni sur les titres et corps vides                                                                                     | medium  | Un slug vide donne un lien vers la liste elle-même, un titre vide donne un `<h1>` vide sur une page indexée                 | patch (CHECK SQL)                   |
| 4   | blind              | Pas de `remark-gfm` : tableaux et autoliens restent en texte brut, alors que le digest en aura besoin                                                    | medium  | react-markdown n'applique que CommonMark par défaut                                                                         | patch, avec styles `img` et `table` |
| 5   | blind              | Les liens internes du corps perdent la locale                                                                                                            | low     | `<a href="/sets/x">` au lieu du `Link` next-intl ; correction directe                                                       | patch                               |
| 6   | blind              | Carte Twitter `summary_large_image` sans image                                                                                                           | low     | Pas d'`og:image` ; passer à `summary` est une correction directe                                                            | patch                               |
| 7   | blind, edge        | `verify_schema` : TRUNCATE de `service_role` non vérifié, check « une seule policy » validé à vide si la table manque, rôles de la policy non vérifiés   | low     | Corrections directes                                                                                                        | patch                               |
| 8   | blind              | `article.ts`, importé par un composant client, importe des types d'un module `.server`                                                                   | low     | Import de type effacé aujourd'hui, mais c'est déjà arrivé une fois dans ce projet (voir la mémoire de la frontière serveur) | patch (déplacer les types)          |
| 9   | verif              | Le filtre par catégorie et le choix du message vide ne sont pas testés                                                                                   | medium  | Aucun test n'appelle `ArticleListView`                                                                                      | patch (helper pur + test)           |
| 10  | blind              | Paramètre `category` serveur jamais utilisé                                                                                                              | low     | Code mort, suppression directe                                                                                              | patch                               |
| 11  | blind, edge        | Filtre côté client : flash de la liste complète, et liste non filtrée sans JavaScript                                                                    | low     | Compromis assumé pour garder l'ISR ; le canonical reste `/articles`                                                         | rejeté                              |
| 12  | blind              | Aucune revalidation à la publication : jusqu'à 1 h de délai                                                                                              | low     | Besoin propre au digest                                                                                                     | defer (story 3.3)                   |
| 13  | verif              | Le rendu sûr d'`ArticleBody` (pas de HTML brut) n'est pas testé                                                                                          | medium  | Le dépôt ne sait pas rendre de composant dans `node:test` (imports CSS)                                                     | defer                               |
| 14  | verif              | Le sitemap n'est pas testé                                                                                                                               | low     | Mapping fin, jamais testé dans ce dépôt                                                                                     | defer                               |
| 15  | verif              | Des tests de `src/**` sont hors du glob CI                                                                                                               | medium  | Problème qui existait déjà                                                                                                  | defer                               |
| 16  | blind              | Pas d'`updated_at`, de JSON-LD, d'`og:url` ni de CHECK sur `source` ; index non aligné avec la requête                                                   | low     | Pas de besoin aujourd'hui, table minuscule                                                                                  | rejeté                              |
| 17  | edge               | Extrait de meta : liens avec titre ou parenthèses, autoliens, emoji coupé                                                                                | low     | Ne touche que la meta description ; complexité de regex                                                                     | rejeté                              |
| 18  | edge               | Plus de 500 articles : les plus anciens disparaissent                                                                                                    | low     | Un digest par semaine, soit environ 10 ans avant d'y arriver                                                                | rejeté                              |
| 19  | edge               | Une erreur réseau sur une page article donne une erreur 500                                                                                              | low     | L'ISR ne met pas l'erreur en cache, la visite suivante réessaie                                                             | rejeté                              |
