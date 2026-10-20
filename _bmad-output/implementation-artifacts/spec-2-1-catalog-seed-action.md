---
title: 'Action GitHub de seed du catalogue prod'
type: 'feature'
created: '2026-10-19'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '3cdb0d319284542c879499c8f87bc47e67fd13c4'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le catalogue Scryfall de prod n'a pas été seedé depuis le 2026-07-25. Il dépend d'un `npm run seed:prod` lancé à la main depuis le poste du propriétaire, si bien que les sets récents manquent et que le palier `png` reste dérivé de `large`. Issue #50, story 2.1 de l'epic #44.

**Approach:** Un workflow GitHub Actions, déclenché à la main (`workflow_dispatch`) et chaque semaine (cron), fait un checkout de `deploy` et lance les scripts existants `seed-sets.ts` puis `seed-catalog.ts` contre la prod. Les secrets viennent de l'Environment `prod`. Un échec ouvre une issue dédupliquée, et chaque run consigne sa durée et son pic mémoire dans le résumé du job.

## Boundaries & Constraints

**Always:**

- Le code exécuté est celui de `deploy` (`actions/checkout` avec `ref: deploy`). Le fichier de workflow vit sur `main`, branche par défaut, ce que le cron et `workflow_dispatch` exigent.
- `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` viennent uniquement des secrets de l'Environment `prod`, injectés en variables d'environnement. Jamais de secret de dépôt, jamais de fichier `.env` écrit sur le runner.
- Le job de seed n'a que `contents: read`. Seul le job d'alerte a `issues: write`.
- Les logs restent en ndjson (stdout non-TTY). Aucun `actions/upload-artifact`, aucun dump de données de la base dans le résumé.
- Un seul run à la fois (`concurrency`, sans annulation du run en cours). Le timeout du job reste sous la limite de 6 h du runner.

**Never:**

- Pas de modification des scripts de seed ni du schéma : pas de migration SQL dans cette story.
- Pas d'empreinte de changement, d'état de seed, de `removed_at` ni de remappage (stories 2.2 à 2.4).
- Pas de `npm run seed` dans le workflow : il appelle `systemd-inhibit`, inutile et risqué sur un runner.
- Aucun déclenchement du workflow contre la prod pendant le développement de la story.

## I/O & Edge-Case Matrix

| Scenario              | Input / State                                | Expected Output / Behavior                                                                   | Error Handling                                                    |
| --------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Run nominal           | cron ou dispatch, secrets présents           | sets puis catalogue seedés ; le résumé du job affiche la durée et le pic RSS de chaque étape | N/A                                                               |
| Secrets absents       | Environment `prod` vide ou absent            | le job échoue avant tout seed, avec un message qui nomme les secrets attendus                | issue d'échec ouverte                                             |
| Échec du seed         | `seed-sets` ou `seed-catalog` sort en code 1 | le catalogue n'est pas seedé si les sets ont échoué ; le job échoue                          | issue d'échec ouverte avec le lien du run                         |
| Timeout ou annulation | job arrêté (limite atteinte)                 | le job n'est pas un succès                                                                   | issue d'échec ouverte                                             |
| Échec répété          | une issue d'échec est déjà ouverte           | aucune nouvelle issue                                                                        | un commentaire avec le lien du run est ajouté à l'issue existante |

</frozen-after-approval>

## Code Map

- `scripts/seed/seed-sets.ts` -- seed `card_sets` depuis `/sets` ; garde-fou `MIN_EXPECTED_SETS` ; sort en code 1 en cas d'échec. À réutiliser tel quel.
- `scripts/seed/seed-catalog.ts` -- seed en deux passes, en streaming, depuis le bulk `all_cards` (jsonl.gz) ; garde-fou `MIN_EXPECTED_LINES` ; écritures en upsert idempotent. À réutiliser tel quel.
- `scripts/seed/normalize-catalog-card.ts:14-22` -- écrit déjà `image_uris.png` réel : un reseed suffit pour le palier `png`, sans changement de code.
- `scripts/lib/load-env.ts` -- `resolveSupabaseEnv` lit `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` depuis `process.env` ; les fichiers `.env*` absents sont ignorés. Ne pas définir `SEED_TARGET=prod` (sinon le script exige `.env.supabase.prod`).
- `scripts/lib/logger.ts` -- émet du ndjson quand stdout n'est pas un TTY ; le niveau ERROR va sur stderr.
- `package.json:36-39` -- les scripts `seed*` fixent `NODE_ENV=production` sur l'appel tsx. Ce `NODE_ENV` ne doit pas s'appliquer à `npm ci`, qui sauterait alors les devDependencies (`tsx`).
- `.github/workflows/ci.yml` -- modèle à suivre : `actions/checkout@v4`, `setup-node@v4` en node 22 avec cache npm, `npm i -g npm@11.21.1`, `npm ci`.
- Labels existants : `bug`, `chore`, etc. Le label dédié `catalog-seed` n'existe pas encore : le créer de façon idempotente (`gh label create --force`).
- `scripts/github/policy.ts` + `pr-policy-check.ts` + `policy.test.ts` -- patron à suivre : logique pure testée via `npm run test:scripts` (`tsx --test`, `node:test`), CLI mince qui lit l'env et écrit dans `$GITHUB_STEP_SUMMARY`.
- `scripts/github/lib/gh.ts` -- wrapper `gh` (spawnSync) à réutiliser dans le CLI d'alerte.

## Tasks & Acceptance

**Execution:**

- [x] `scripts/github/catalog-seed.ts` -- logique pure, AUCUN import (ni npm, ni alias `@/`, ni autre fichier du dépôt) : `missingSecrets(env)` (noms des secrets requis absents ou vides), `formatStepSummary(step, timeVerboseOutput)` (ligne markdown : étape, durée « Elapsed (wall clock) », pic « Maximum resident set size » converti en Mo), `alertAction(openIssueNumbers)` (`{kind:'create'}` si aucune, sinon `{kind:'comment', issue}` sur la plus ancienne), `alertBody(runUrl)` -- rend la matrice testable.
- [x] `scripts/github/catalog-seed.test.ts` -- un test par ligne de la matrice (nominal → résumé formaté ; secrets absents → noms retournés ; échec/timeout → corps d'issue contenant le lien du run ; échec répété → `comment` sur l'issue existante) -- couverture de la matrice.
- [x] `scripts/github/catalog-seed-step.ts` -- CLI du job de seed, n'importe que `./catalog-seed` et `node:*` : `--check-secrets` (sort en 1 en nommant les secrets manquants) et `--summary <step> <timeFile>` (ajoute la ligne au `$GITHUB_STEP_SUMMARY`) -- exécuté depuis un second checkout de l'outillage.
- [x] `scripts/github/catalog-seed-alert.ts` -- CLI du job d'alerte : crée le label `catalog-seed` (`--force`), liste les issues ouvertes portant ce label, puis commente ou crée (labels `bug` + `catalog-seed`) selon `alertAction`, avec le lien du run (`GITHUB_SERVER_URL/GITHUB_REPOSITORY/actions/runs/GITHUB_RUN_ID`) -- dédoublonnage.
- [x] `.github/workflows/catalog-seed.yml` -- déclencheurs `workflow_dispatch` + `schedule` (lundi 04:00 UTC) ; `concurrency: catalog-seed` sans annulation ; job `seed` (`environment: prod`, `timeout-minutes: 345`, `permissions: contents: read`) : checkout `ref: deploy` à la racine + checkout `ref: ${{ github.sha }}` dans `.tooling` ; setup-node 22 + npm 11.21.1 + `npm ci` (sans `NODE_ENV`) ; `npx tsx .tooling/scripts/github/catalog-seed-step.ts --check-secrets` ; puis pour chaque script (`seed-sets` puis `seed-catalog`) `NODE_ENV=production /usr/bin/time -v -o <fichier> npx tsx scripts/seed/<script>.ts` suivi de `--summary` (étape de résumé en `if: always()`) ; job `alert` (`needs: seed`, `if: always() && needs.seed.result != 'success'`, `permissions: contents: read` + `issues: write`) : checkout par défaut, `npm ci --ignore-scripts`, `npx tsx scripts/github/catalog-seed-alert.ts` avec `GH_TOKEN: ${{ github.token }}` -- cœur de la story.
- [x] `docs/guides/catalog-seed.md` -- documenter la mise en place de l'Environment `prod` (deux secrets, branches autorisées `main` et `deploy`) à faire AVANT le merge, le lancement manuel, la lecture du résumé et le traitement d'une issue d'échec -- le propriétaire doit configurer GitHub avant le premier run.
- [x] `CLAUDE.md` -- ajouter une ligne qui pointe vers le workflow et le guide, à côté de `seed:prod` -- découvrabilité.

**Acceptance Criteria:**

- Given le workflow mergé sur `main`, when on regarde l'onglet Actions, then « catalog-seed » propose « Run workflow » et une exécution planifiée hebdomadaire.
- Given un run quelconque, when on inspecte ses logs et ses artefacts, then aucun artefact n'existe et l'URL comme la clé apparaissent masquées (`***`).
- Given le premier run réel lancé par le propriétaire après la configuration de l'Environment et l'avancée de `deploy`, when il se termine, then sa durée et son pic mémoire sont reportés dans la PR ou dans #50, les sets sortis depuis le 2026-07-25 sont présents en prod et `card_prints.image_uris->>'png'` n'est plus une URL `large`. Vérification post-merge, faite par le propriétaire.

## Design Notes

Le cron et `workflow_dispatch` lisent le workflow depuis `main`, mais le code exécuté vient de `deploy`. Ainsi, aucun script plus récent que le schéma prod n'écrit en prod.

L'outillage du job de seed (`catalog-seed-step.ts`) vient d'un second checkout du commit du workflow (`.tooling`), pas de `deploy` : il n'a pas à attendre une release, et `deploy` reste la seule source du code qui écrit en prod. Comme `.tooling` n'a pas de `node_modules`, ces deux fichiers n'importent rien d'autre que `node:*` et eux-mêmes. Ils sont exécutés avec le `tsx` installé à la racine.

Le pic mémoire est mesuré avec `/usr/bin/time -v -o <fichier>` (« Maximum resident set size »), puis réécrit dans le résumé. Le fichier reste sur le runner et n'est pas uploadé.

Un timeout apparaît comme `cancelled` et non comme `failure`. C'est pourquoi l'alerte se déclenche sur `result != 'success'` : une annulation manuelle ouvre donc aussi une issue, ce qui est acceptable.

## Verification

**Commands:**

- `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/catalog-seed.yml'))"` -- expected: le YAML se charge sans erreur.
- `npx --yes actionlint@latest .github/workflows/catalog-seed.yml` (ou le binaire `actionlint` s'il est disponible) -- expected: aucune erreur. À sauter si l'outil est introuvable, en le signalant.
- `npm run test:scripts` -- expected: les tests de `catalog-seed.test.ts` passent.
- `npm run check` -- expected: exit 0.

**Manual checks (if no CLI):**

- Relire le workflow : `NODE_ENV=production` n'est posé que sur les étapes de seed, aucun `upload-artifact`, `ref: deploy` présent, `permissions` minimales par job.

## Review Triage Log

| #   | Source             | Constat                                                                                                                                   | Verdict | Preuve / route                                                                                                       |
| --- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | blind + edge + gap | Un seed tué (timeout/annulation) est rapporté « succès » (fichier `time` vide, car GNU time ouvre `-o` avant le fork) ou « non exécutée » | medium  | `formatStepSummary` vaut `succès` par défaut sans ligne `Exit status` → patch : succès seulement si `Exit status: 0` |
| 2   | blind              | Le SHA de `deploy` exécuté n'est consigné nulle part                                                                                      | low     | une ligne de résumé suffit → patch                                                                                   |
| 3   | blind              | Le guide autorise `deploy` dans l'Environment sans besoin                                                                                 | false   | aucun workflow sur `deploy` ne déclare `environment: prod` ; l'AC de l'epic exige `main` + `deploy`                  |
| 4   | blind              | Aucune fermeture automatique de l'issue après rétablissement                                                                              | low     | ajout d'un job, le guide documente la fermeture manuelle → rejeté                                                    |
| 5   | blind              | L'issue ne dit pas quelle étape a échoué                                                                                                  | low     | le lien du run y mène ; ajout de sorties de job → rejeté                                                             |
| 6   | blind              | Une annulation manuelle ouvre une issue `bug`                                                                                             | false   | choix documenté en Design Notes (le timeout apparaît comme `cancelled`)                                              |
| 7   | blind              | Le dédoublonnage prend toute issue portant le label                                                                                       | low     | improbable (label dédié), filtre supplémentaire → rejeté                                                             |
| 8   | blind              | Le label `bug` est supposé exister                                                                                                        | low     | `bug` existe (labels par défaut), improbable → rejeté                                                                |
| 9   | blind              | Le guide omet qu'un 3e déclenchement annule le run en attente                                                                             | low     | correction directe d'une phrase → patch                                                                              |
| 10  | blind              | Le job d'alerte fait un `npm ci` complet                                                                                                  | low     | performance seulement, même patron que les autres workflows → rejeté                                                 |
| 11  | blind              | Entrée `CLAUDE.md` = chemin de workflow parmi des commandes                                                                               | low     | fichier de contexte agent → defer                                                                                    |
| 12  | gap                | Les arguments `gh` (label à la création, liste limitée à `open`) ne sont pas testés                                                       | medium  | gap pré-vérifié → patch : builders purs + tests                                                                      |
| 13  | gap                | Le CLI step (`--check-secrets`, fichier absent) n'est pas testé                                                                           | low     | gap pré-vérifié, disposition defer (filet : `resolveSupabaseEnv` sort sans clé) → defer                              |
| 14  | edge               | Secret avec espaces : `trim()` passe, le script échoue                                                                                    | low     | l'échec remonte quand même en alerte, improbable → rejeté                                                            |
| 15  | edge               | Un échec de `gh label create` empêche l'alerte                                                                                            | false   | `issues: write` couvre la création de label ; sans le label, la création d'issue échouerait de toute façon           |
| 16  | edge               | `GITHUB_RUN_ID` absent → lien cassé                                                                                                       | false   | toujours défini par GitHub Actions                                                                                   |
