# GitHub Project: Wizcard board

Board: https://github.com/users/Elnop/projects/2 (user-owned Project v2, linked to `Elnop/Wizcard`).

## Statuses

| Status      | Meaning                                                       |
| ----------- | ------------------------------------------------------------- |
| Backlog     | New or reopened item, not started                             |
| Ready       | Refined and ready to be picked up                             |
| In progress | Being worked on                                               |
| In review   | A pull request linked to the issue is open                    |
| Done (main) | Closed / merged into `main`, not yet deployed                 |
| Deployed    | Live in production (set by a future GitHub Action, see below) |

`Deployed` is not automated yet: it will be set by an Action delivered by sub-project 2 (epic #11).

## Labels

`epic` (groups user stories), `story` (user story), plus the standard type labels. Source of truth: `scripts/github/project-config.ts`.

## Hierarchy

Epic -> sub-issues (native GitHub sub-issues). The "Par epic" view uses this hierarchy; the Kanban shows issues only and hides epics (`is:issue -label:epic`; PRs are represented by the issues they close, which move to In review) and the Roadmap shows only epics (`label:epic`).

## Views

| View       | Layout  | Filter                 |
| ---------- | ------- | ---------------------- |
| Kanban     | Board   | `is:issue -label:epic` |
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

Leave "Auto-close issue" OFF.

## View layout settings (UI only)

View filters ARE converged by `gh:setup`; only grouping, columns, date fields and workflows are manual:

- Kanban: grouped by Status.
- Par epic: GitHub's native sub-issue hierarchy table, with the "Sub-issues progress" field visible (no grouping).
- À déployer: show the Labels column so `needs-migration` is visible.
- Roadmap: date fields `Début` (start) and `Échéance` (target), zoom Month.

## Related docs

- [Release procedure](release.md) (deploying `main` to prod)
- [Contributing guide](../../CONTRIBUTING.md)
