- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-catalog-seed-action.md`
  summary: L'entrée de CLAUDE.md pour catalog-seed est un chemin de workflow placé parmi des commandes npm ; remplacer par `gh workflow run catalog-seed.yml --ref main`.
  evidence: Section « Development Commands » de CLAUDE.md ; fichier de contexte agent, donc hors patch automatique.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-catalog-seed-action.md`
  summary: Le CLI scripts/github/catalog-seed-step.ts (sortie 1 sur secrets manquants, fichier time absent → null) n'est couvert par aucun test.
  evidence: Seules les fonctions pures de catalog-seed.ts sont testées ; filet existant : resolveSupabaseEnv sort en 1 sans clé service.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-catalog-change-journal.md`
  summary: Le seed ne supprime jamais les faces de définition devenues obsolètes (un oracle qui passe de 2 faces à 1), et leur retrait n'est pas journalisé.
  evidence: `flushDefinitionFaces` ne fait que des upserts, depuis avant #60, et `card_definition_faces` n'a pas de trigger DELETE.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-catalog-change-journal.md`
  summary: Le digest (story 3.3) doit apparier un `removed` et un `added` de print sur le même triplet (set, collector_number, lang) : c'est un id réémis par Scryfall, pas une carte retirée.
  evidence: `deleteDriftedPrints` supprime l'ancien id puis l'upsert insère le nouveau ; la ligne `removed` porte la ligne complète, triplet compris.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-catalog-change-journal.md`
  summary: Mentionner `npm run sb:test` à côté de `sb:verify` dans CLAUDE.md et AGENTS.md (§ Schema Verification).
  evidence: Le test SQL des triggers ne tourne que si on le lance ; ces fichiers de contexte d'agent ne sont pas modifiés par une story.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-2-scryfall-migrations.md`
  summary: La story 2.4 (remappage) doit suivre les chaînes de fusion (A→B→C), indexer `scryfall_migrations.new_scryfall_id`, et décider quoi faire d'une migration retirée par Scryfall (par exemple avec une colonne `last_seen_at`).
  evidence: Seuls `old_scryfall_id` et `recorded_at` sont indexés ; une ligne qui disparaît de `/migrations` reste en base sans marque.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-2-scryfall-migrations.md`
  summary: Les migrations SQL et `verify_schema.sql` ne tournent pas en CI ; une dérive de grants n'est détectée que par un `sb:verify` lancé à la main.
  evidence: `.github/workflows/ci.yml` lance check, test:scripts et build, sans base de données.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-4-article-pages.md`
  summary: Directives Markdown enrichies pour les articles (`::cards{ids=…}` grille de CardImage liées, `:card[texte]{id=…}` lien inline, `:set[texte]{code=…}` lien de set avec icône) via remark-directive, résolues par lots (byPrintIds, card_sets), avec repli en texte brut.
  evidence: Découpé de la story 3.4 à la demande du propriétaire (taille de spec) ; c'est le critère « cartes citées affichées comme cartes » de #63.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-4-article-pages.md`
  summary: Le digest (story 3.3) doit déclencher une revalidation à la demande de `/articles` et de la page du slug, sinon un article publié attend jusqu'à 1 h (ISR `revalidate = 3600`).
  evidence: Aucun `revalidatePath` ni `revalidateTag` ; le 404 du slug est aussi mis en cache.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-4-article-pages.md`
  summary: Tester le rendu sûr d'`ArticleBody` (HTML brut échappé, `javascript:` retiré, `rel` sur les liens externes) et les entrées d'articles du sitemap.
  evidence: `node:test` ne sait pas charger les imports `.module.css` ; ces garanties ne reposent aujourd'hui que sur la revue.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-4-article-pages.md`
  summary: Plusieurs tests de `src/**` ne tournent pas en CI, car le glob de `test:scripts` ne couvre que `scripts/**` et `src/lib/articles/**`.
  evidence: `src/lib/collection/bulk-plans.test.ts`, `src/lib/card/**/*.test.ts`, `src/app/[locale]/decks/[id]/deck-card-sections.test.ts`, etc.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-4-article-pages.md`
  summary: Une URL au percent-encoding invalide (ex. `/fr/card/%E0%A4%A`) renvoie une erreur 500 sur toutes les routes dynamiques, avant d'atteindre le code de la page.
  evidence: Constaté sur un build de prod le 2026-10-20 sur `/articles/[slug]`, `/card/[id]` et `/decks/[id]` ; le garde `decodeSlug` de #63 ne s'exécute pas. Piste : le proxy (`src/proxy.ts`) ou le décodage interne de Next 16.
