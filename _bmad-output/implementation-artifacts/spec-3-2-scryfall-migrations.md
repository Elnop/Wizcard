---
title: 'Migrations Scryfall stockées en base'
type: 'feature'
created: '2026-10-20'
status: 'done'
baseline_commit: '71ef5b54f31c46296fbe2290ab17139456e60cd3'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/docs/guides/catalog-seed.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les migrations Scryfall (`/migrations` : un print fusionné dans un autre, ou supprimé) ne sont copiées nulle part. Or le digest « Catalogue » (story 3.3) doit les citer, et le remappage des cartes utilisateur (story 2.4, #53) doit s'y appuyer. Issue #61, story 3.2 de l'epic #59.

**Approach:** Une migration SQL crée `scryfall_migrations`, une table réservée à `service_role`. Un nouveau script `seed-migrations.ts` lit toutes les pages de `/migrations` et valide chaque objet. Si l'ensemble est complet, il upserte toutes les migrations par leur id ; sinon il échoue sans rien écrire. Le workflow `catalog-seed` l'exécute après un seed du catalogue réussi.

## Boundaries & Constraints

**Always :**

- Migration SQL idempotente, sur le modèle de `catalog_changes` : RLS sans policy, `revoke all` à `public`/`anon`/`authenticated` sur la table, `grant select, insert, update` à `service_role` (le script écrit en upsert), aucun DELETE ni TRUNCATE.
- Le script récupère **toutes** les pages avant d'écrire quoi que ce soit. Tout échec annule le run (exit 1, donc issue d'alerte) sans aucune écriture : HTTP non-ok, `has_more` sans `next_page`, objet invalide, total sous le plancher.
- Upsert par `id` : rejouer la même liste ne change aucune donnée. `recorded_at` est posé à la première insertion et n'est jamais envoyé par le script, donc jamais réécrit. Il donnera au digest la fenêtre « vue depuis le dernier article ».
- Mêmes conventions que `seed-sets.ts` : `fetchWithRetry`, logger ndjson, `resolveSupabaseEnv`, User-Agent, événement terminal `run complete`.
- Assertions ajoutées dans `supabase/verify_schema.sql` dans le même changement.

**Never :**

- Pas de remappage des cartes utilisateur (#53), pas de digest (#62).
- Pas de suppression des migrations déjà stockées.
- Ne rien lancer contre la prod.

## I/O & Edge-Case Matrix

| Scénario                    | Entrée / état                                                              | Comportement attendu                           |
| --------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------- |
| Premier run                 | 9 pages, ~2 800 migrations valides                                         | toutes insérées ; `recorded_at` = maintenant   |
| Re-run identique            | même liste                                                                 | aucune donnée modifiée, `recorded_at` inchangé |
| Nouvelle migration          | une migration de plus en page 1                                            | 1 ligne insérée, les autres inchangées         |
| Note corrigée chez Scryfall | même id, `note` différente                                                 | `note` mise à jour, `recorded_at` conservé     |
| Erreur HTTP sur une page    | page 4 en 500 après les retries                                            | exit 1, 0 écriture                             |
| Pagination incohérente      | `has_more: true` sans `next_page`                                          | exit 1, 0 écriture                             |
| Objet invalide              | `migration_strategy` inconnue, id non-UUID, `merge` sans `new_scryfall_id` | exit 1, 0 écriture, l'id fautif dans le log    |
| Liste tronquée              | total < plancher (2 000)                                                   | exit 1, 0 écriture                             |

</frozen-after-approval>

## Code Map

- `scripts/seed/seed-sets.ts` -- modèle à suivre : pagination `/sets`, plancher `MIN_EXPECTED_SETS`, `fetchWithRetry`, `sb()` paresseux, `main().then/catch` qui sort en exit 1.
- `scripts/seed/catalog-sync.ts` + `catalog-sync.test.ts` -- modèle de module pur (sans effet de bord) testé par `node:test`, pris par `npm run test:scripts`.
- `.github/workflows/catalog-seed.yml` -- job `seed` : chaque script tourne depuis le checkout `deploy` sous `/usr/bin/time -v`, suivi d'une étape `Summary (<script>)` via `.tooling/scripts/github/catalog-seed-step.ts --summary`. Le job `alert` se déclenche déjà sur tout échec.
- `supabase/migrations/20261020120000_create_catalog_changes.sql` -- modèle de revoke, grants et RLS, et de commentaire d'en-tête.
- `supabase/verify_schema.sql` -- bloc « JOURNAL DES CHANGEMENTS DU CATALOGUE » à imiter (table, colonnes, CHECK, RLS sans policy, privilèges).
- `package.json` -- `seed`, `seed:sets`, `seed:catalog`.
- API Scryfall `/migrations`, constatée le 2026-10-20 : 9 pages, 2 806 objets avec `object: 'migration'`, `id`, `uri`, `performed_at` (date), `migration_strategy` (`merge`|`delete`), `old_scryfall_id`, `new_scryfall_id` (null pour `delete`), `note`, `metadata` (optionnel : nom, set, numéro et `oracle_id` de l'ancien print).

## Tasks & Acceptance

**Execution:**

- [ ] `supabase/migrations/20261020130000_create_scryfall_migrations.sql` -- table `public.scryfall_migrations` : `id` uuid PK, `strategy` text not null check in (`merge`, `delete`), `old_scryfall_id` uuid not null, `new_scryfall_id` uuid, check (`strategy <> 'merge' or new_scryfall_id is not null`), `note` text, `performed_at` date not null, `metadata` jsonb, `recorded_at` timestamptz not null default now(). Index sur `old_scryfall_id` (remappage) et sur `recorded_at` (digest). RLS, revoke et grants comme dans Boundaries.
- [ ] `scripts/seed/scryfall-migrations.ts` -- module pur : type de ligne, `toMigrationRow(obj)` (valide et mappe ; lève une erreur citant l'id fautif), `nextPageUrl(list)` (lève si `has_more` sans `next_page`), constante `MIN_EXPECTED_MIGRATIONS = 2000`, `assertComplete(rows)`.
- [ ] `scripts/seed/scryfall-migrations.test.ts` -- `node:test` sur les lignes « objet invalide », « pagination incohérente », « liste tronquée » de la matrice, plus un objet `merge` et un objet `delete` valides.
- [ ] `scripts/seed/seed-migrations.ts` -- pagination de `/migrations` jusqu'au bout, validation de tout, puis upsert `onConflict: 'id'` par lots de 500. Log `run complete` avec le total.
- [ ] `package.json` -- `seed:migrations`, et ajout en fin de `seed`.
- [ ] `.github/workflows/catalog-seed.yml` -- étape `Seed migrations` après `Seed catalog` (mêmes env et `/usr/bin/time`), plus son étape `Summary (seed-migrations)`.
- [ ] `supabase/verify_schema.sql` -- table, colonnes, les 2 CHECK, les index, RLS sans policy, `anon`/`authenticated` sans aucun privilège, `service_role` avec SELECT/INSERT/UPDATE et sans DELETE/TRUNCATE.
- [ ] `docs/guides/catalog-seed.md` -- section « Scryfall migrations » : ce qui est stocké, quand, et ce qui fait échouer l'étape. Ajouter l'ordre de mise en prod (voir Design Notes).

**Acceptance Criteria:**

- Given une base locale migrée, when `npm run sb:verify` est lancé, then il sort en 0.
- Given `npm run seed:migrations` lancé deux fois contre la base locale, when on compare les lignes avant et après le 2ᵉ run (`count(*)`, `max(recorded_at)`, hash de `to_jsonb(t)` agrégé), then ils sont identiques.
- Given `anon` ou `authenticated`, when ils accèdent à `scryfall_migrations` via PostgREST, then ils sont refusés (42501).

## Design Notes

**Mise en prod :** le workflow vit sur `main` mais exécute les scripts du checkout `deploy`. Dès la fusion, l'étape `Seed migrations` échouerait donc tant que `deploy` n'a pas `scripts/seed/seed-migrations.ts`. Ordre à documenter dans le guide et la PR : appliquer la migration SQL, fusionner, puis faire passer la release sur `deploy` avant le cron du lundi. On garde l'échec franc plutôt qu'un saut silencieux : une issue d'alerte est le bon signal si l'ordre n'est pas respecté.

Plancher fixé à 2 000 (2 806 constatées) sur le modèle de `MIN_EXPECTED_SETS`. On ne compare pas au nombre déjà stocké, car une migration supprimée chez Scryfall bloquerait sinon le job pour toujours.

## Verification

**Commands:**

- `npm run sb:migrate && npm run sb:verify` -- expected : exit 0.
- `npm run test:scripts` -- expected : 0 fail.
- `npm run seed:migrations` deux fois, en local -- expected : exit 0, aucune ligne modifiée au 2ᵉ run.
- `npm run check && npm run build` -- expected : exit 0.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| #   | Source       | Constat                                                                                                                                               | Verdict     | Preuve                                                                                            | Route             |
| --- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------- | ----------------- |
| 1   | edge, verif  | Une date impossible (`2026-02-30`) passe la regex, puis Postgres la rejette en plein upsert, après l'écriture des premiers lots                       | medium      | `DATE_RE` ne vérifie que le format ; le cast `date` échoue côté base                              | patch             |
| 2   | edge, blind  | Un `next_page` qui boucle ou sort de Scryfall : boucle jusqu'au timeout de 345 min, ou ingestion d'un autre hôte                                      | low         | Aucun garde-fou de pagination ; la correction tient en quelques lignes                            | patch             |
| 3   | edge, blind  | Pas de pause entre les pages, alors que Scryfall demande 50 à 100 ms                                                                                  | low         | `fetchWithRetry` n'attend qu'en cas de retry                                                      | patch             |
| 4   | edge         | Une migration retirée pendant la pagination décale les pages et en fait sauter une                                                                    | low         | Le run suivant converge                                                                           | rejeté            |
| 5   | verif        | L'ordre « tout valider, puis écrire » de `seed-migrations.ts` n'est pas testé                                                                         | medium      | Aucun test n'exécute la boucle de pagination                                                      | patch             |
| 6   | verif        | Les contraintes et grants ne sont vérifiés que par `sb:verify`, lancé à la main                                                                       | low         | Choix assumé du dépôt (pas de base en CI)                                                         | defer             |
| 7   | verif, blind | Plusieurs branches de validation ne sont pas testées : minuscules, metadata, note, `has_more` non booléen, `new_scryfall_id` invalide, id non textuel | low         | Correction directe : ajouter les cas                                                              | patch             |
| 8   | blind        | Une correction de migration par Scryfall écrase la ligne sans trace, et `recorded_at` reste figé                                                      | false       | La matrice gelée fixe ce comportement (« note mise à jour, `recorded_at` conservé »)              | rejeté            |
| 9   | blind        | Une migration retirée par Scryfall ressemble à une migration active (pas de `last_seen_at`)                                                           | maybe-false | Il faudrait savoir si Scryfall retire vraiment des migrations                                     | defer (story 2.4) |
| 10  | blind        | Un `delete` avec cible, ou un `merge` vers lui-même, est accepté                                                                                      | low         | Ajouter un CHECK strict pourrait bloquer le job chaque semaine sur une donnée Scryfall imparfaite | rejeté            |
| 11  | blind        | Les tests ne tournent jamais en CI                                                                                                                    | false       | `.github/workflows/ci.yml:34` lance `npm run test:scripts`                                        | rejeté            |
| 12  | blind        | L'étape migrations dépend de la réussite du seed du catalogue                                                                                         | false       | Le critère d'acceptation le demande (« termine un seed réussi »)                                  | rejeté            |
| 13  | blind        | La fusion casse le run hebdo jusqu'à la release                                                                                                       | false       | Choix documenté dans les Design Notes (échec franc plutôt que saut silencieux)                    | rejeté            |
| 14  | blind        | Pas d'index sur `new_scryfall_id` pour suivre les chaînes de fusion                                                                                   | low         | Besoin propre à la story 2.4                                                                      | defer (story 2.4) |
| 15  | blind        | `init_schema.sql` et un type TS partagé ne sont pas mis à jour                                                                                        | false       | AGENTS.md : le bootstrap peut prendre du retard ; les lecteurs viendront en 3.3 et 2.4            | rejeté            |
| 16  | blind        | Ligne orpheline dans l'en-tête du workflow, exemple de résumé inventé présenté comme réel                                                             | low         | Corrections directes                                                                              | patch             |
