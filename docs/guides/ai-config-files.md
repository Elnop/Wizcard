# Organisation des fichiers de configuration IA

## Principe : une source de verite unique

Ce projet suit la best practice recommandee par la communaute et la [specification AGENTS.md](https://agents.md/) :

> **`AGENTS.md` est la source de verite unique.** Les fichiers tool-specific sont des pointeurs vers `AGENTS.md`.

Cette approche evite la duplication, reduit le risque de divergence, et simplifie la maintenance.

## Pourquoi AGENTS.md ?

AGENTS.md est un standard ouvert cree par OpenAI pour Codex CLI, puis donne a l'[Agentic AI Foundation](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation) (Linux Foundation) en decembre 2025. Membres fondateurs : AWS, Anthropic, Block, Bloomberg, Cloudflare, Google, Microsoft, OpenAI.

- **60 000+ projets** l'ont adopte sur GitHub ([source](https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/))
- **Support natif** par : Codex, GitHub Copilot, Cursor, Windsurf, Gemini CLI, Jules, Zed, Warp, Devin, Amp, Aider, Junie, et d'autres ([liste complete](https://agents.md/))
- **Claude Code** ne lit pas AGENTS.md nativement, mais supporte l'import via `@AGENTS.md` dans CLAUDE.md ([feature request #6235](https://github.com/anthropics/claude-code/issues/6235))

## Structure des fichiers

```
.
├── AGENTS.md                        ← source de verite (architecture, pitfalls, data model, key files)
├── CLAUDE.md                        ← pointeur @AGENTS.md + commandes dev supplementaires
├── .windsurfrules                   ← pointeur vers AGENTS.md
├── .cursor/rules/project.mdc       ← pointeur vers AGENTS.md
└── .github/copilot-instructions.md ← pointeur vers AGENTS.md
```

### Contenu de chaque fichier

| Fichier                           | Contenu                                                                                                              | Pourquoi                                                                                                                                                                                                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                       | Pitfalls, architecture, provider nesting, key files, data model, code style, commandes dev essentielles, liens docs/ | Lu nativement par Copilot, Cursor, Windsurf, Codex. Copilot et Codex recommandent d'y lister les commandes ([Copilot docs](https://docs.github.com/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot), [Codex docs](https://developers.openai.com/codex/guides/agents-md)) |
| `CLAUDE.md`                       | `@AGENTS.md` import + commandes dev supplementaires (`sb:restart`, `sb:status`, etc.)                                | Claude Code n'a pas AGENTS.md en contexte natif — l'import `@AGENTS.md` l'injecte ([docs](https://code.claude.com/docs/en/memory))                                                                                                                                                                 |
| `.windsurfrules`                  | Pointeur texte vers AGENTS.md                                                                                        | Windsurf lit aussi AGENTS.md nativement, ce fichier est un fallback ([docs](https://docs.windsurf.com/windsurf/cascade/agents-md))                                                                                                                                                                 |
| `.cursor/rules/project.mdc`       | Pointeur avec frontmatter `alwaysApply: true`                                                                        | Format .mdc specifique a Cursor ([docs](https://cursor.com/docs/context/rules))                                                                                                                                                                                                                    |
| `.github/copilot-instructions.md` | Pointeur texte vers AGENTS.md                                                                                        | Copilot lit AGENTS.md nativement, ce fichier est un fallback ([docs](https://docs.github.com/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot))                                                                                                                           |

### Ce qu'on ne duplique PAS dans les fichiers tool-specific

- Common Pitfalls → uniquement dans AGENTS.md
- Architecture / Stack → uniquement dans AGENTS.md
- Data Model → uniquement dans AGENTS.md
- Key Files → uniquement dans AGENTS.md
- Provider Nesting Order → uniquement dans AGENTS.md

## Maintenance

### Ajouter une regle projet

Modifier **uniquement `AGENTS.md`**. Tous les outils la verront automatiquement.

### Ajouter une commande dev

Ajouter dans **`AGENTS.md`** (section Development Commands). Copilot et Codex recommandent explicitement de lister les commandes build/test/lint dans le fichier d'instructions ([Copilot docs](https://docs.github.com/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot), [Codex docs](https://developers.openai.com/codex/guides/agents-md)). Cursor deconseille de lister les commandes courantes (`npm`, `git`) car son agent les connait deja ([Cursor docs](https://cursor.com/docs/context/rules)), mais les commandes specifiques au projet (comme `sb:reset`, `sb:migrate`) restent utiles.

`CLAUDE.md` peut lister des commandes supplementaires non presentes dans AGENTS.md si necessaire.

### Ajouter un outil IA

1. Verifier si l'outil supporte AGENTS.md nativement → rien a faire
2. Sinon, creer un fichier pointeur minimal vers AGENTS.md

## Sources

- Spec AGENTS.md : <https://agents.md/> | [GitHub](https://github.com/agentsmd/agents.md)
- Linux Foundation / AAIF : <https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation>
- GitHub blog (adoption) : <https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/>
- Claude Code memory docs : <https://code.claude.com/docs/en/memory>
- Cursor rules docs : <https://cursor.com/docs/context/rules>
- Copilot instructions docs : <https://docs.github.com/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot>
- Windsurf AGENTS.md docs : <https://docs.windsurf.com/windsurf/cascade/agents-md>
- Codex AGENTS.md docs : <https://developers.openai.com/codex/guides/agents-md>
