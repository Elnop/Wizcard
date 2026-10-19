- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-catalog-seed-action.md`
  summary: L'entrée de CLAUDE.md pour catalog-seed est un chemin de workflow placé parmi des commandes npm ; remplacer par `gh workflow run catalog-seed.yml --ref main`.
  evidence: Section « Development Commands » de CLAUDE.md ; fichier de contexte agent, donc hors patch automatique.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-catalog-seed-action.md`
  summary: Le CLI scripts/github/catalog-seed-step.ts (sortie 1 sur secrets manquants, fichier time absent → null) n'est couvert par aucun test.
  evidence: Seules les fonctions pures de catalog-seed.ts sont testées ; filet existant : resolveSupabaseEnv sort en 1 sans clé service.
