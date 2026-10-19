# Epic 2 Context: Catalogue toujours à jour

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Les joueurs trouvent les cartes et sets récents, avec des images en pleine définition, sans intervention manuelle. Une GitHub Action met à jour le catalogue Scryfall de prod chaque semaine (et à la demande), mais seulement si le contenu Scryfall a changé. Elle marque les prints retirés sans les supprimer et rattache automatiquement les cartes des utilisateurs touchées par une fusion Scryfall. Aujourd'hui, le catalogue prod date du dernier seed manuel (2026-07-25) et dépend du poste du propriétaire. L'epic est indépendant de l'epic 1 (modèle `Card`). Projet brownfield sans PRD, architecture ni document UX : ce contexte vient uniquement du découpage en epics (issu du brainstorm du 2026-10-19, issue #29).

## Stories

- Story 2.1 : Action GitHub de seed du catalogue prod
- Story 2.2 : Seed seulement si le catalogue Scryfall a changé
- Story 2.3 : Prints retirés marqués removed_at
- Story 2.4 : Remappage des cartes utilisateur via /migrations

## Requirements & Constraints

- **Déclenchement :** `workflow_dispatch` et cron hebdomadaire. Le workflow seede les sets, puis le catalogue, avec les scripts existants.
- **Image png réelle :** le seed alimente le palier `png` avec la vraie image, au lieu de la dériver de `large`.
- **Empreinte de changement :** elle se calcule à partir de la liste des sets et du nombre de prints, ou d'un hash. Ne jamais utiliser le `updated_at` du bulk, régénéré chaque jour. Si l'empreinte n'a pas changé, le job s'arrête en succès sans seeder et le résumé l'indique.
- **État du seed :** la date et l'empreinte du dernier seed réussi sont stockées en base et écrites **uniquement en cas de succès**. Un seed interrompu à mi-chemin laisse l'état inchangé, et le run suivant reseede. Chaque run affiche la date du dernier seed réussi dans le résumé du job.
- **Prints retirés :** ils reçoivent `card_prints.removed_at`, jamais de suppression. Les retraits se déduisent de `/migrations` (anciens ids des `delete` et des `merge`), sans comparer la base au bulk. Un print retiré n'apparaît plus dans la recherche ni dans la navigation par set. Il reste résolvable et s'affiche normalement dans une collection, une wishlist ou un deck. Le marquage est idempotent.
- **Remappage :** il a lieu après un seed réussi seulement. Les `merge` s'appliquent dans l'ordre de `performed_at`, donc une fusion en chaîne A→B→C aboutit à C. Chaque migration Scryfall n'est appliquée qu'une fois : si elle figure déjà au journal, elle est ignorée.
- **Échec :** un échec ouvre automatiquement une issue avec le lien du run, une seule issue ouverte à la fois pour ce motif. L'email d'échec ne suffit pas.
- **Dépôt PUBLIC :** aucun artefact et aucun log ne contient de données de la base. Il n'y a pas de backup exporté : le retour arrière d'un remappage passe uniquement par le journal par ligne.
- **Premier run réel :** consigner sa durée et son pic mémoire dans la PR ou l'issue (limites du runner : 6 h, 7 Go). Vérifier que les sets et cartes sortis depuis le 2026-07-25 sont présents.
- **Vérification :** `npm run check` reste vert à chaque story.
- **Hors périmètre :** les prix et les langues absentes du catalogue (de/es/it/ja).

## Technical Decisions

- **Réutilisation :** `scripts/seed/seed-sets.ts`, `scripts/seed/seed-catalog.ts`, `scripts/seed/normalize-catalog-card.ts` et `npm run backup:prod`.
- **Branche exécutée :** l'Action fait un checkout de la branche `deploy`, jamais de `main`, pour ne jamais écrire en prod avec un schéma pas encore migré.
- **Pas d'accès direct à Postgres prod :** toutes les écritures passent par PostgREST avec la clé service, comme le fait `seed-catalog.ts`.
- **Secrets :** l'URL Supabase et la clé service sont des secrets de l'Environment GitHub `prod`, limité aux branches `main` et `deploy`. Jamais de secrets de dépôt. Rien n'est planifié côté Coolify, auquel seul le propriétaire a accès.
- **Migrations SQL :** idempotentes, avec des GRANT explicites et le label `needs-migration` sur la PR. Le propriétaire les applique en prod avant le déploiement. Les tables d'état du seed et du journal n'ont aucun accès en écriture pour `anon` ni `authenticated`. Le RPC de remappage n'a aucun accès pour ces rôles.
- **Modèle de données :**
  - `card_entries.scryfall_id` est la seule colonne utilisateur qui porte un `scryfall_id` (collection, wishlist et decks sont unifiés). Elle n'a pas de FK vers `card_prints`.
  - Le journal de remappage stocke une ligne par entrée : `card_entry_id`, ancien id, nouvel id, id de migration Scryfall, date.
  - Une fonction SQL (RPC) transactionnelle par migration réécrit `card_entries.scryfall_id` et écrit au journal ensemble, ou rien.

## Cross-Story Dependencies

- La 2.1 pose le workflow, les secrets et l'ouverture d'issue sur lesquels reposent les 2.2, 2.3 et 2.4.
- La 2.2 conditionne le seed à l'empreinte et définit la notion de « seed réussi ». Les 2.3 et 2.4 ne s'exécutent qu'après un seed réussi.
- Les 2.3 et 2.4 lisent toutes deux `/migrations` de Scryfall : la 2.3 marque les anciens ids (`delete` et `merge`), la 2.4 remappe les `merge`. Elles devraient partager la lecture et l'ordre de traitement.
- Chaque migration SQL (état du seed, `removed_at`, journal et RPC) doit être appliquée en prod puis la branche `deploy` avancée avant que l'Action n'exécute le code qui en dépend.
