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
