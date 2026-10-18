# GitHub Project: Wizcard board

Board: https://github.com/users/Elnop/projects/2 (user-owned Project v2, linked to `Elnop/Wizcard`).

## Statuses

| Status      | Meaning                                                       |
| ----------- | ------------------------------------------------------------- |
| Backlog     | New or reopened item, not started                             |
| In progress | Being worked on                                               |
| In review   | A pull request linked to the issue is open                    |
| Done (main) | Closed / merged into `main`, not yet deployed                 |
| Deployed    | Live in production (set by a future GitHub Action, see below) |

`Deployed` is not automated yet: it will be set by an Action delivered by sub-project 2 (epic #11).

## Labels

`epic` (groups user stories), `story` (user story), plus the standard type labels. Source of truth: `scripts/github/project-config.ts`.

## Hierarchy

Epic -> sub-issues (native GitHub sub-issues). The "Par epic" view uses this hierarchy; the Kanban hides epics (`-label:epic`) and the Roadmap shows only epics (`label:epic`).

## Views

| View       | Layout  | Filter                 |
| ---------- | ------- | ---------------------- |
| Kanban     | Board   | `-label:epic`          |
| Par epic   | Table   | none (hierarchy)       |
| À déployer | Table   | `status:"Done (main)"` |
| Roadmap    | Roadmap | `label:epic`           |

## Scripts

```bash
npm run gh:setup              # converge labels, project, Status, fields, views and view filters
npm run gh:setup -- --dry-run # show what would change
npm run gh:epics              # create missing epics and sub-issues
npm run gh:epics -- --dry-run
```

Both are idempotent and never delete anything. `gh:setup` ends with `✔ already up to date` when nothing is left to do.

## Manual-only configuration (UI, not available via API)

Project -> Settings -> Workflows:

- [x] Auto-add sub-issues to project: ON
- [x] Auto-add to project: ON (repo Wizcard, filter `is:issue,pr is:open`)
- [x] Item added to project -> Backlog
- [x] Item reopened -> Backlog
- [x] Item closed -> Done (main)
- [x] Pull request merged -> Done (main)
- [x] Pull request linked to issue -> In review
- [ ] Auto-close issue: OFF

Roadmap view: date fields `Début` (start) and `Échéance` (target), zoom Month.
