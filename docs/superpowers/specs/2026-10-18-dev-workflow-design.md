# Dev workflow: tickets, mandatory PRs, GitHub Project, BMAD

Date: 2026-10-18 · Status: design approved in chat, builder check done

## Intent

Wizcard has grown into many parallel chantiers (Scryfall catalog, studio, bulk
edit…) tracked only in memory files, specs and local branches. Three pains:

- **Visibility** — no single place says what is done, in progress, waiting, or
  merged-but-not-deployed.
- **Traceability** — no ticket → PR → commit chain explaining why a change exists.
- **Discipline** — nothing enforces review, CI or checks before code lands.

There is a second person: a collaborator (GitHub `DaadfroGG`, `write` role) who
is the **only one with Coolify access** and therefore does every prod deploy
(app + SQL migrations). The workflow must give them an unambiguous view of what
is about to go to prod.

The repo (`Elnop/Wizcard`) is public, solo-developed with Claude, and should be
open to outside contributions.

## Goals

1. Every change on `main` comes from a PR linked to an issue (owner bypass kept
   for exceptions).
2. `deploy` only ever moves by merging `main` into it, through a release PR.
3. Work is organised as **Epic → User Story** (plus bugs/chores) on GitHub, with
   a Project dashboard.
4. BMAD replaces superpowers as the planning/dev process **on this project
   only**, and its epics/stories land on GitHub as issues.
5. Existing work (open issues, stale branches, in-flight specs) is brought into
   the new system.

## Non-goals

- No third ticket level (Task). Technical tasks stay as checklists inside the US
  (or inside the BMAD story file).
- No bidirectional sync between BMAD markdown and GitHub.
- No change to how Coolify deploys; the collaborator's deploy procedure stays
  (see memory/AGENTS.md prod migration workflow), only its trigger is formalised.
- Superpowers is not uninstalled globally.

## Anti-goals (failure even if it "works")

- A required CI that is red on day one and therefore gets bypassed by habit.
- A board that drifts from reality because updating it is manual busywork —
  status moves must be automated wherever GitHub allows.
- Owner locked out of an emergency hotfix on `main`.
- Anything other than a `main` merge reaching `deploy`.

## Decisions (made by the user)

| Topic              | Decision                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main` protection  | Blocking ruleset: PR required, required CI, linked issue checked by an Action. **Owner (`Elnop`) bypass allowed** for exceptional direct pushes. Claude always goes through PRs.                              |
| `deploy`           | Only via a **release PR `main` → `deploy`**, reviewed/merged by the collaborator, who then runs migrations + Coolify deploy. An Action fails any PR into `deploy` whose head is not `main`. No direct pushes. |
| Hierarchy          | Epic issue → native **sub-issues** (US / bug / chore).                                                                                                                                                        |
| Board views        | Kanban by status, view by Epic, "To deploy", Roadmap.                                                                                                                                                         |
| Conventions        | Branch name carries the issue number; PR body must contain `Closes #N`; **squash merge only**; label `needs-migration`.                                                                                       |
| CI vs red baseline | **Clean first**: make `npm run check` green, then require `check` + `build` on PRs.                                                                                                                           |
| BMAD               | **Replaces superpowers on Wizcard only** (project-level disable).                                                                                                                                             |
| Source of truth    | **GitHub issues**. BMAD output is pushed one-way into issues, then edited on GitHub.                                                                                                                          |
| Language           | Tickets and PRs in **French**. Code, commits and repo docs stay English, **except BMAD planning docs (PRD, epics, stories), which are written in French** so the sync copies them verbatim into issues.       |
| Review             | **"Depending on context"**: no approval required by the `main` ruleset in general; a review-gate check requires the collaborator's approval only on risky PRs (see ②).                                        |
| Coolify            | **Auto-deploys on push to `deploy`.** Migrations are therefore applied **before** the release PR is merged.                                                                                                   |
| Automation token   | **Classic PAT** of the owner (`project` + `repo` scopes) stored as a repo secret, used only by workflows on `push` / `workflow_dispatch` / merged-PR events of this repo — never on fork-triggered events.    |
| Existing work      | Triage the 4 open issues, clean the ~18 local branches, turn in-flight specs into epics.                                                                                                                      |
| Order              | ③ Project → ① check green → ② rules/Actions → ④ BMAD → ⑤ triage.                                                                                                                                              |

## Sub-projects

Each sub-project, from ③ onward, is itself tracked as an Epic on the new board
(bootstrapping: ③ creates the board, then immediately files epics for ①②④⑤ and
for ③ itself).

### ③ GitHub Project + labels + templates

- New user-level Project "Wizcard" (the existing "Music Room – Validation"
  project is unrelated, leave it). Link it to the repo.
- Status field: `Backlog → Ready → In progress → In review → Done (main) → Deployed`.
- Custom fields: `Epic` (derived from parent, or the native "Parent issue"
  field if available), `Iteration` or start/target dates for the Roadmap.
- Views: Kanban (by status), Table grouped by parent epic with sub-issue
  progress, "To deploy" (status = Done (main)), Roadmap.
- Labels (personal accounts have no issue _types_ — _Claude's call_):
  `epic`, `story`, `bug`, `chore`, `needs-migration`.
- Issue forms in `.github/ISSUE_TEMPLATE/` (French): Epic, User Story (As a…
  I want… so that… + acceptance criteria), Bug. PR template with `Closes #`
  and a migration checklist.
- Automation: built-in Project workflows (item added → Backlog, PR opened →
  In review, issue closed → Done (main)). `Deployed` is set by an Action on
  merge of the release PR (sub-project ②), since no built-in trigger exists.

### ① `npm run check` green

~60 pre-existing problems (see memory "check RED baseline"). Fix them (prefer
`check:fix`, then manual) without behaviour change. Also confirm `npm run build`
is green. This is a prerequisite for making CI required.

### ② Rulesets + Actions

- CI workflow on PRs: `npm ci`, `npm run check`, `npm run build`. Build needs
  env (Supabase URL/anon key etc.) — use placeholder public values or repo
  secrets; _builder's call_ which, as long as build passes without real prod
  credentials.
- PR-policy Action: branch name matches `^(feat|fix|chore|docs|refactor|perf)/\d+-`
  and body contains `(Closes|Fixes|Resolves) #\d+`. Fails otherwise. Skipped for
  release PRs into `deploy`. **Fork PRs are exempt from the branch-name rule but
  still need `Closes #N`** (_Claude's call_; documented in CONTRIBUTING.md).
- Review-gate Action (_Claude's interpretation of "depending on context" —
  user to confirm_): required check that passes unless the PR touches
  `supabase/migrations/**` or RLS/auth code, or carries label `needs-review`; in
  those cases it requires an approving review from the collaborator. Claude's PRs
  are authored by the owner's account, so the owner cannot self-approve — the
  owner bypass remains the escape hatch.
- Deploy-guard Action: on PRs targeting `deploy`, fail unless head ref is `main`
  (and head repo is this repo). When the release PR is opened/synchronised,
  comment the list of pending migrations computed by **tree diff**
  (`git diff origin/deploy main --name-only -- supabase/migrations`, not
  `main..deploy` ancestry — see below) plus the `needs-migration` PRs.
  On merge (= Coolify auto-deploy): set every item at `Done (main)` that is
  contained in the release to `Deployed`.
- Release procedure (AGENTS.md, for the collaborator), because Coolify
  auto-deploys on push to `deploy`: open/read release PR → apply the listed
  migrations on prod (idempotent scripts, sync `schema_migrations`) → run
  `sb:verify:prod` → merge the release PR → Coolify deploys. Migrations must
  therefore be **backward-compatible with the currently deployed app**
  (expand-then-contract); a PR whose migration is not, must say so and is
  released alone.
- Rulesets: `main` — require PR, required checks (CI + PR-policy), squash only
  (repo setting: disable merge commits & rebase merging), block force-push and
  deletion, bypass list = repository admin (owner). `deploy` — require PR,
  required check deploy-guard, block force-push/deletion, **no bypass**.
  Merge methods: repo allows squash + merge commit; ruleset
  `allowed_merge_methods` = squash on `main`, merge commit on `deploy`.
  Consequence: after the first release `deploy` is no longer an ancestor of
  `main` (merge commits live only on `deploy`). Nothing may rely on that
  ancestry — migration diffs use tree diff, and the existing prod-migration
  memory/procedure is updated accordingly. No back-merge into `main`.
- Docs: AGENTS.md section "Workflow" (branch/PR/issue rules, release
  procedure for the collaborator).

### ④ BMAD on Wizcard

- Install BMAD (`npx bmad-method@<pinned> install`, module `bmm`, tool
  `claude-code`) at a **pinned version**, committed. The project is moving
  fast (6.12 renamed skills, open bug #2885 where the epics skill can't find
  PRD/architecture files, v7 announced) — pick the latest stable at build time,
  verify its actual skill list, record the version in AGENTS.md.
- Disable superpowers for this project in `.claude/settings.json`
  (`enabledPlugins`). Update CLAUDE.md/AGENTS.md references to superpowers
  (specs dir convention, process). Existing `docs/superpowers/` stays as
  history.
- Sync script (`scripts/bmad-to-github.*`, _builder's call_ on language —
  match existing scripts): reads BMAD epic/story files, creates the Epic issue,
  creates stories as sub-issues, applies labels, adds them to the Project.
  Idempotent (records the created issue number back into the story file's
  front-matter or a mapping file so reruns don't duplicate). One-way only.
- BMAD dev agents must follow ② (branch with issue number, PR with `Closes #N`).

### ⑤ Triage existing work

- 4 open issues (#4–#7): label, attach to epics, add to Project.
- ~18 local branches: for each, determine merged / abandoned / still relevant;
  delete merged, list the rest for the user to decide (never delete unmerged
  work without confirmation).
- In-flight chantiers from memory/specs (Scryfall catalog waves 1c-n + sub-project
  2, card domain model, user profiles, localized cards prod seed, collection
  index prod migration, card stacking / bulk edit prod migration, studio prod
  seeds) → one Epic each with known remaining stories.
- Pending prod migrations become `needs-migration` items in "To deploy".

## Left to the builder

- Exact Project field configuration and view filters (UI or `gh project` /
  GraphQL — whatever is reproducible).
- PAT secret name and rotation note in AGENTS.md.
- Action implementation (`actions/github-script` vs shell + `gh`).
- CI env strategy for `next build`.
- BMAD version choice (latest stable at build time) and sync script internals.
