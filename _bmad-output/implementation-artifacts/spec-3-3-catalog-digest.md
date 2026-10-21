---
title: 'Digest « Catalogue » publié après chaque seed'
type: 'feature'
created: '2026-10-20'
status: 'done'
baseline_commit: '789655f4b77c2b02b265a524ca0c4f47c003bc12'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-1-catalog-change-journal.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-gh-70-article-directives.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le journal (`catalog_changes`) et les migrations Scryfall (`scryfall_migrations`) se remplissent chaque semaine, mais personne ne les lit. Issue #62, story 3.3 de l'epic #59.

**Approach:** Après `Seed migrations`, le workflow `catalog-seed` lance un script `catalog-digest.ts`. Le script lit tout ce qui a été journalisé depuis le dernier digest (repère stocké en base), classe les changements et rédige un article « Catalogue » en fr et en en à partir de gabarits traduits (`messages/*.json`, ICU). Il n'utilise jamais de LLM. Les cartes et les sets sont cités avec les directives de #70. Le script publie l'article et avance le repère **dans une seule transaction**. S'il n'y a rien de nouveau, il ne publie rien et le résumé du job le dit.

**Décisions (propriétaire, 2026-10-20) :**

- Formats annoncés : **tous les formats Scryfall sauf `oldschool`**, tant que #66 n'est pas résolu.
- Pas de revalidation à la demande : la page de l'article est immédiate, la liste `/articles` suit en moins d'1 h (ISR).
- **Revue (propriétaire, 2026-10-21) :**
  - les prints ajoutés à un set qui existait déjà s'annoncent « N nouvelles cartes dans X » (« set complété » est abandonné : un set sort en plusieurs semaines) ;
  - une fenêtre qui ne contient que des « autres corrections » publie quand même un article ;
  - `npm run digest:catalog -- --baseline` pose le repère au maximum actuel du journal et des migrations, **sans rien publier**. À lancer une fois en prod (#64), et après un seed local d'une base vide ;
  - le digest reste en fin de `npm run seed` (donc aussi de `seed:prod`).
- **Premier run (propriétaire, 2026-10-21) :** le premier seed ne publie jamais d'article. Tant que `catalog_digests` est vide, le digest se comporte comme `--baseline` : il pose le repère au maximum actuel et ne publie rien. Cela remplace « sans digest précédent, elle couvre tout » et la baseline manuelle en prod.
- Grandes sections : une grille de **12 cartes au plus** par bloc, puis « et N autres » avec un lien vers le set quand il y en a un.

## Boundaries & Constraints

**Always :**

- **Fenêtre et reprise :** une table `catalog_digests` (article_id FK, `last_change_id` bigint, `last_migration_recorded_at` timestamptz, `created_at`) garde le repère. La fenêtre couvre `catalog_changes.id > max(last_change_id)` et `scryfall_migrations.recorded_at > max(last_migration_recorded_at)`. Sans digest précédent, elle couvre tout. Un seed raté qui a journalisé une partie des changements est donc couvert une seule fois par le digest suivant.
- **Atomicité :** une fonction SQL `publish_catalog_digest(...)` en SECURITY DEFINER, exécutable par `service_role` seul, insère l'article et le repère dans la même transaction. Migration idempotente ; `catalog_digests` est réservée à `service_role` (RLS sans policy, revoke `anon`/`authenticated`).
- **Classement**, par ordre de priorité pour le titre : nouveau set (tous ses prints actuels ont été ajoutés dans la fenêtre) > set complété (prints ajoutés à un set qui existait déjà) > traductions FR (prints `fr` ajoutés, ou `printed_*` modifiés sur un print `fr`) > images HD (`image_status` qui passe à `highres_scan`) > le reste. Le titre reprend l'événement le plus fort, et chaque autre type forme une section.
- **Le reste** comprend :
  - errata d'oracle (champs de `card_definitions` et de `card_definition_faces` hors `legalities`) ;
  - légalités par format, hors `oldschool` ;
  - prints retirés ;
  - migrations Scryfall ;
  - un compte des autres corrections.
- **Rotation Standard :** au-delà de 20 cartes qui quittent `standard` dans la fenêtre, une seule ligne (« N cartes quittent le Standard »). Les autres changements de légalité sont listés carte par carte.
- **Drift :** un `removed` et un `added` sur le même triplet (set, numéro, langue) dans la fenêtre forment un id réémis. Ils sont exclus des deux listes.
- **Migrations :** `merge` → « ancien (nom, set, numéro, tirés de `metadata`) → :card[nouveau] » + note ; `delete` → ancien nom + note. Aucune donnée utilisateur.
- **Contenu :** blocs de 12 cartes au plus, et 10 sets au plus par section (puis « et N autres sets »). Slug `catalogue-AAAA-MM-JJ` (UTC), suffixé `-2`, `-3`… s'il est déjà pris. `source = 'catalog-digest'`, `published_at = now()`. Le Markdown produit commence ses sections à `##`.
- **Code :** la construction de l'article est une fonction pure (entrée : changements + données de référence, sortie : `{ title_fr, title_en, body_fr, body_en }`), testée avec `node:test`. Les lectures passent par la clé service, par pages. Le résumé du job (`GITHUB_STEP_SUMMARY`) indique « article publié : <slug> » ou « aucun changement, pas d'article ».

**Never :**

- Pas de LLM, pas de texte libre hors gabarits.
- Aucune donnée utilisateur (collections, decks, comptes).
- Ne rien lancer contre la prod.

## I/O & Edge-Case Matrix

| Scénario         | Fenêtre                                       | Résultat                                                                             |
| ---------------- | --------------------------------------------- | ------------------------------------------------------------------------------------ |
| Rien de nouveau  | aucune ligne au-delà du repère                | pas d'article, repère inchangé, résumé « aucun changement »                          |
| Nouveau set      | 300 prints `fdn` ajoutés, aucun avant         | titre « Nouveau set : Foundations » ; grille de 12 + « et 288 autres » + lien `:set` |
| Plusieurs types  | set complété + 40 images HD + 1 ban Modern    | titre = set complété ; sections images HD et légalités                               |
| Rotation         | 150 cartes `standard` legal → not_legal       | une ligne « 150 cartes quittent le Standard »                                        |
| Old School       | seuls des changements `legalities.oldschool`  | traités comme « aucun changement annonçable » : pas d'article, repère avancé         |
| Drift            | `removed` + `added` sur le même triplet       | n'apparaît nulle part                                                                |
| Migration merge  | 1 ligne `scryfall_migrations`                 | ancien nom (set n°) → `:card[nouveau]{id=…}` + note                                  |
| Reprise          | seed N-1 raté après avoir journalisé          | ses lignes sont dans l'article du seed N, une seule fois                             |
| Double run       | le script relancé juste après une publication | pas de second article                                                                |
| Échec d'écriture | l'appel RPC échoue                            | exit 1 (issue d'alerte), ni article ni repère                                        |

</frozen-after-approval>

## Code Map

- `.github/workflows/catalog-seed.yml` -- ajouter `Digest` après `Seed migrations` (mêmes env, `/usr/bin/time`, étape `Summary (catalog-digest)`).
- `scripts/seed/seed-migrations.ts` + `scryfall-migrations.ts` -- modèle : script mince + module pur testé, `resolveSupabaseEnv`, logger, `run complete`.
- `supabase/migrations/20261020120000_create_catalog_changes.sql` -- forme des lignes du journal (`entity`, `change`, `field`, `old_value`/`new_value` jsonb ; `removed` porte la ligne complète).
- `supabase/migrations/20261020130000_create_scryfall_migrations.sql` -- colonnes, dont `metadata` (name, set_code, collector_number).
- `supabase/migrations/20261021120000_create_articles.sql` -- CHECK sur le slug (`^[a-z0-9]+(-[a-z0-9]+)*$`) et sur les textes non vides.
- `src/lib/articles/directives.ts` -- syntaxe exacte des directives `::cards{ids="…"}`, `:card[…]{id=…}`, `:set[…]{code=…}`.
- `card_sets` (`code`, `name`, `card_count`, `released_at`) ; `card_prints` → `card_definitions` (embed PostgREST sur la FK `oracle_id`) pour les noms.
- `messages/fr.json` + `en.json` -- ICU (`{count, plural, …}`) ; `createTranslator` de `next-intl` fonctionne hors React.
- `supabase/verify_schema.sql` -- blocs à imiter pour la table, la fonction et les grants.

## Tasks & Acceptance

**Execution:**

- [x] `supabase/migrations/20261022120000_create_catalog_digests.sql` -- table `catalog_digests`, fonction `publish_catalog_digest`, grants.
- [x] `messages/fr.json` + `en.json` -- namespace `catalogDigest` : titres par type, intitulés de section, lignes (ban, rotation, migration, « et N autres »).
- [x] `scripts/seed/catalog-digest-build.ts` (pur) -- classement, drift, rotation, filtre `oldschool`, plafonds, génération du Markdown fr et en via `createTranslator`, slug.
- [x] `scripts/seed/catalog-digest-build.test.ts` -- chaque ligne de la matrice qui ne demande pas de base de données.
- [x] `scripts/seed/catalog-digest.ts` -- lecture du repère, lecture paginée de la fenêtre et des données de référence, construction, RPC ou sortie « aucun changement », résumé du job.
- [x] `package.json` -- `digest:catalog`, ajouté en fin de `seed`.
- [x] `.github/workflows/catalog-seed.yml` -- étapes `Digest` et `Summary`.
- [x] `supabase/verify_schema.sql` -- table, fonction (SECURITY DEFINER, `search_path` figé), grants.
- [x] `docs/guides/catalog-seed.md` -- section « Catalogue digest » : fenêtre, reprise, ce qui fait échouer l'étape, ordre de mise en prod.

**Acceptance Criteria:**

- Given la base locale (journal rempli par les seeds précédents), when `npm run digest:catalog` tourne deux fois, then le 1er run publie un article dont la page `/fr/articles/<slug>` s'affiche correctement (titre, sections, grilles), et le 2ᵉ run ne publie rien.
- Given `npm run check`, `npm run build`, `npm run test:scripts` et `npm run sb:verify`, then tous sortent en 0.

## Verification

**Commands:**

- `npm run sb:migrate && npm run sb:verify` -- expected : exit 0.
- `npm run test:scripts` -- expected : 0 fail.
- `npm run check && npm run build` -- expected : exit 0.

**Manual checks:**

- Vérifier d'abord que la cible des seeds est bien `127.0.0.1` (`.env.seed`). Utiliser le conteneur `supabase_db_scute_swarm` et aucun autre. Vérifier la page sur `npx next start -p 3100` (port libre avant, arrêté après). Supprimer les articles de test, ou les laisser et le signaler.

## Implementation Notes

- **Repère sans article :** `catalog_digests.article_id` est nullable. Une fenêtre non vide mais sans rien d'annonçable (seulement `oldschool`, drift) appelle `publish_catalog_digest` avec des titres `null` : le repère avance, aucun article (cas « Old School » de la matrice). `article_id` est `on delete set null` : supprimer un article ne rembobine pas le repère.
- **Double publication :** la fonction reçoit le repère lu (`p_from_*`) et lève une exception s'il a bougé entre-temps (`lock table … exclusive` puis comparaison), et refuse un repère qui recule. Le slug est suffixé `-2`, `-3`… dans la fonction.
- **Fenêtre bornée :** le script fige au départ le max de `catalog_changes.id` et de `recorded_at` ; `recorded_at` reste une chaîne (précision microseconde, jamais convertie en `Date`).
- **Classement :** dans un set qui existait déjà, les prints `en` ajoutés vont dans « set complété » et les `fr` dans « traductions FR ». Les mises à jour d'un print ajouté dans la fenêtre sont absorbées ; un print ajouté puis retiré dans la fenêtre n'apparaît nulle part. Tout autre changement (identifiants, URL d'images, passage hors `highres_scan`, `printed_*` d'un print `en`, face retirée) va dans le compte « autres corrections » ; seul ce compte suffit à publier un article (« pas de seuil »).
- **Plafond des listes (non fixé par la spec) :** 50 lignes par liste (errata, légalités, prints retirés, migrations), puis « Et N autres. ». Les grilles et les sets suivent la spec (12 / 10).
- **Grilles :** prints `en` d'abord, puis numéro de collection. Nouveaux sets triés par date de sortie décroissante (le titre cite le premier), autres sections par nombre de cartes.
- **Liens d'oracle :** errata et légalités pointent vers un print représentatif de l'oracle (`en` d'abord, puis sortie la plus récente).
- **Échappement :** les textes issus des données (noms, notes Scryfall) sont échappés en Markdown, et un `:` suivi d'une lettre devient `\:` pour ne jamais ouvrir de directive.
- **Vérifié en local :** 1er run sur le journal local complet (199 374 lignes, 2 806 migrations) en 3,9 s → `catalogue-2026-10-20` « 926 nouveaux sets, dont Marvel: Darkhold Destiny » ; 2ᵉ run → « aucun changement, pas d'article ». Cas Old School (bascule `oldschool` aller-retour) → repère avancé, pas d'article. Ban Modern + passage HD → `catalogue-2026-10-20-2` « 1 nouvelle image HD » avec sections Images HD, Légalités, Autres corrections. Pages `/fr/articles/catalogue-2026-10-20` et `/en/articles/catalogue-2026-10-20-2` rendues sur `next start -p 3100` (titres, sections, grilles, liens cartes/sets, aucune directive résiduelle, aucune citation non résolue). Fonction : fenêtre périmée refusée, `anon` sans `EXECUTE`, `authenticated` sans accès à la table. Articles, repères et lignes de journal de test supprimés ensuite (catalogue local inchangé).
- **Prod :** le premier digest couvre tout le journal prod et les 2 806 migrations déjà enregistrées (liste plafonnée à 50 lignes). `npm run seed:prod` lance désormais aussi le digest contre la prod.

- **Revue 2026-10-21 :** « set complété » → « N nouvelles cartes dans X » ; `--baseline` (repère au max, sans article) ; gabarits déplacés dans `messages/catalog-digest/{fr,en}.json` (hors bundle client) ; changements nets par (entité, champ) ; formats apparus/retirés résumés en une ligne par format ; `ORACLE_FIELDS` explicites ; autres corrections comptées par entité distincte ; `image_uris` d'un passage HD absorbé ; cible de merge absente du catalogue → texte sans lien ; sauts de ligne des notes aplatis ; prints représentatifs lus seulement pour les lignes affichées ; test SQL `supabase/tests/catalog_digests.sql` (lancé par `npm run sb:test`).

## Spec Change Log

## Review Triage Log

| #   | Source             | Constat                                                                                               | Verdict | Preuve                                                                   | Route                                                                              |
| --- | ------------------ | ----------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 1   | blind              | « Set complété » chaque semaine pendant les previews                                                  | medium  | `splitAdded` : tout set préexistant est dit « complété »                 | décision : « nouvelles cartes dans X » → patch                                     |
| 2   | blind, edge, verif | Un article qui ne contient que « N autres corrections »                                               | —       | Comportement voulu, confirmé par le propriétaire                         | patch (test seulement)                                                             |
| 3   | blind              | Pas de repère initial : le premier digest annonce tout le journal et les 2 806 migrations historiques | high    | Fenêtre « tout » sans digest précédent                                   | décision : `--baseline` → patch                                                    |
| 4   | blind              | `seed` et `seed:prod` publient un article                                                             | —       | Le propriétaire garde ce comportement                                    | patch (avertissement dans le guide)                                                |
| 5   | blind, edge        | Un nouveau format de légalité (clé ajoutée ou retirée partout) inonde l'article et les lectures       | medium  | `legalityDiff` sort une ligne par carte avec `from: null`                | patch (une ligne par format)                                                       |
| 6   | edge               | Fenêtre de plusieurs seeds : un même champ change 2 fois (legal→banned→legal)                         | medium  | Changements contradictoires ou nuls annoncés                             | patch (fusion premier ancien / dernier nouveau ; un changement net nul est retiré) |
| 7   | edge               | Un passage en HD compte aussi `image_uris` dans les autres corrections                                | low     | Double comptage                                                          | patch (compter par print, ignorer `image_uris` d'un print passé en HD)             |
| 8   | edge               | `layout`, `reserved`, `keywords`… publiés comme « errata d'oracle »                                   | medium  | Pas de liste blanche des champs                                          | patch (`ORACLE_FIELDS`)                                                            |
| 9   | edge               | Cible de fusion absente du catalogue : lien `:card` non résolu                                        | low     | Correction directe                                                       | patch                                                                              |
| 10  | edge               | Note de migration avec un saut de ligne : la liste casse                                              | medium  | `escapeMarkdown` ne gère pas `                                           |
| `   | patch              |
| 11  | blind, verif       | `assertDirectivesValid` passe dès qu'une seule directive est valide                                   | medium  | Test trop faible                                                         | patch                                                                              |
| 12  | verif, blind       | `publish_catalog_digest` sans test exécutable (fenêtre périmée, recul, suffixe de slug, repère seul)  | medium  | Seulement vérifié à la main                                              | patch (`supabase/tests/catalog_digests.sql` + `sb:test`)                           |
| 13  | verif, blind       | Tri des nouveaux sets dans le titre et plafond de 50 lignes non testés                                | medium  | Aucune entrée n'atteint ces branches                                     | patch                                                                              |
| 14  | blind              | Le namespace `catalogDigest` (~85 clés) part dans chaque page côté client                             | medium  | `NextIntlClientProvider` sans filtre de `messages`                       | patch (fichiers dédiés `messages/catalog-digest/{fr,en}.json`)                     |
| 15  | blind              | `verify_schema` ne vérifie ni la séquence ni le NOT NULL de `last_change_id`                          | low     | Corrections directes                                                     | patch                                                                              |
| 16  | blind, edge        | Des transactions concurrentes peuvent passer sous le repère (id ou `recorded_at` hors ordre)          | low     | Le workflow est séquentiel ; seul un run manuel qui chevauche est exposé | patch (avertissement dans le guide)                                                |
| 17  | blind              | Supprimer un article raté ne rembobine pas le repère                                                  | low     | Comportement voulu, à documenter                                         | patch (guide)                                                                      |
| 18  | edge               | Deux runs simultanés : le second lève « stale window » et ouvre une alerte                            | low     | Course rare ; l'alerte est un signal acceptable                          | rejeté                                                                             |
| 19  | edge               | Slug inséré en concurrence                                                                            | low     | Course rare ; le run suivant réessaie                                    | rejeté                                                                             |
| 20  | edge               | Un nouveau set qui contient un drift est annoncé comme existant                                       | low     | Cas rare                                                                 | rejeté                                                                             |
| 21  | blind              | Print représentatif fr ou ja non déterministe ; langues autres que en/fr                              | false   | Le catalogue ne contient que `en` et `fr` (`card_prints_lang_check`)     | rejeté                                                                             |
