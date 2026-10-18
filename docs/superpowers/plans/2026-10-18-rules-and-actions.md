# Rulesets + Actions (sub-project ②, epic #11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CI and PR-policy checks required on `main`, an auto-maintained release PR `main` → `deploy` guarded by deploy-guard, "Deployed" status set on release merge, rulesets replacing the classic protection, and the workflow documented.

**Architecture:** Every decision a workflow makes lives in a pure TypeScript function under `scripts/github/` (unit-tested with `node:test`, like `plan.ts`); each workflow is a thin YAML shell that runs `npx tsx scripts/github/<cli>.ts` with inputs from the event (env vars) and `gh`. Rulesets are converged by an idempotent script, like `gh:setup`.

**Tech Stack:** GitHub Actions (`actions/checkout@v4`, `actions/setup-node@v4`), `gh` CLI in runners, TypeScript via `tsx`, `node:test`, GitHub REST rulesets API.

**Spec:** `docs/superpowers/specs/2026-10-18-dev-workflow-design.md` § ② (amended 2026-10-18)

## Global Constraints

- Required check names (job names, used verbatim by the rulesets): `check-build`, `pr-policy`, `deploy-guard`.
- Branch regex: `^(feat|fix|chore|docs|refactor|perf)/\d+-`; body regex (case-insensitive): `(close[sd]?|fix(e[sd])?|resolve[sd]?) #\d+`.
- Fork PRs (head repo ≠ base repo): exempt from the branch rule, still need the closing keyword.
- PRs into `deploy`: `pr-policy` passes immediately (skip); `deploy-guard` requires head ref `main` from this repo.
- No required approvals anywhere (Jo only runs Coolify). Review-gate is dropped (#21 closed).
- `main` ruleset: PR required, 0 approvals, required checks `check-build` + `pr-policy`, allowed merge method squash only, block force-push + deletion, bypass = repository admin role (always). `deploy` ruleset: PR required, 0 approvals, required check `deploy-guard`, merge method merge-commit only, block force-push + deletion, **no bypass**.
- Repo settings: squash + merge commit allowed, rebase disallowed, delete branch on merge.
- Classic protection on `main` is deleted only AFTER both rulesets are verified active.
- Pending migrations = tree diff `git diff --name-only --diff-filter=A origin/deploy origin/main -- supabase/migrations` (never `main..deploy` ancestry).
- Release PR: one open PR head `main` base `deploy`, title `Release YYYY-MM-DD`, French body; created/updated with secret `WIZCARD_BOT_TOKEN` (owner's classic PAT, scopes `repo` + `project`) so its checks run; never with `GITHUB_TOKEN` events from forks.
- CI: Node 22, npm 11 (`npm i -g npm@11` before `npm ci`, see lockfile memory), placeholder env: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-placeholder`, `NEXT_PUBLIC_SITE_URL=http://localhost:3000`. No Supabase job.
- User-facing GitHub text (PR bodies, comments) in French; code, commits, docs in English.
- Never run anything against prod; never store or echo tokens.

## Review Focus

- **Secret missing** (`WIZCARD_BOT_TOKEN` not set yet): release-pr and deployed-status workflows must fail loudly with a clear message, not silently fall back to `GITHUB_TOKEN` (whose PRs never get `deploy-guard`). → Task 3 test `releaseTokenError`.
- **Release PR already open**: second push to `main` updates the same PR body, never opens a second one. → Task 3 test on `planReleasePr` (existing PR number → `update`).
- **Nothing to release** (`deploy` tree == `main` tree): no PR opened; an open stale one is left alone. → Task 3 test (`no-op`).
- **PR body edited after opening** (user adds `Closes #N` later): pr-policy reruns on `edited`. → Task 2 workflow `types` includes `edited`; test on `checkPrPolicy` with keyword variants (`Fixes #3`, `closes #12`, `Resolved #4`).
- **Classic protection removal ordering**: script refuses to delete it unless both rulesets read back `enforcement: active`. → Task 4 test `canRemoveClassicProtection`.

---

## File Structure

- `scripts/github/policy.ts` — pure: `checkPrPolicy`, `checkDeployGuard`.
- `scripts/github/release.ts` — pure: `parsePendingMigrations`, `extractPrNumbers`, `renderReleaseBody`, `planReleasePr`, `releaseTokenError`.
- `scripts/github/rulesets-config.ts` — declarative ruleset payloads + repo settings.
- `scripts/github/rulesets.ts` — pure: `planRulesets`, `canRemoveClassicProtection`.
- `scripts/github/*.test.ts` — node:test for each pure module (existing `npm run test:scripts` picks them up).
- CLIs: `scripts/github/pr-policy-check.ts`, `deploy-guard-check.ts`, `release-pr.ts`, `mark-deployed.ts`, `setup-rulesets.ts`.
- Workflows: `.github/workflows/ci.yml`, `pr-policy.yml`, `deploy-guard.yml`, `release-pr.yml`, `mark-deployed.yml`.
- Docs: `AGENTS.md` (new "Workflow" section), `CONTRIBUTING.md`, `docs/workflow/release.md`.
- `package.json`: `gh:rules`.

---

### Task 1: CI workflow + script tests in CI

**Files:** Create `.github/workflows/ci.yml`.

**Interfaces:** Produces job `check-build` (name used by Task 4).

- [ ] **Step 1:** `ci.yml`: `on: pull_request` (branches `main`) and `push` (branches `main`); concurrency group per ref with cancel-in-progress; one job with `name: check-build`, `runs-on: ubuntu-latest`, steps: checkout, setup-node 22 with npm cache, `npm i -g npm@11`, `npm ci`, `npm run check`, `npm run test:scripts`, `npm run build` with the Global Constraints placeholder env at job level. `permissions: contents: read`.
- [ ] **Step 2:** Validate locally: `npx prettier --check .github/workflows` and run the same commands with the placeholder env in a clean shell: `env -i PATH=$PATH HOME=$HOME NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-placeholder NEXT_PUBLIC_SITE_URL=http://localhost:3000 npm run build` → exit 0. If the build needs another variable, add a placeholder and note which.
- [ ] **Step 3:** Commit `ci: check, script tests and build on PRs`.

### Task 2: pr-policy + deploy-guard checks

**Files:** Create `scripts/github/policy.ts`, `policy.test.ts`, `pr-policy-check.ts`, `deploy-guard-check.ts`, `.github/workflows/pr-policy.yml`, `deploy-guard.yml`.

**Interfaces:**

- `type PrContext = { headRef: string; baseRef: string; body: string | null; isFork: boolean }`
- `checkPrPolicy(pr: PrContext): { ok: boolean; reasons: string[] }` — French reasons (shown in the job log/summary).
- `checkDeployGuard(pr: PrContext): { ok: boolean; reasons: string[] }`
- CLIs read `PR_HEAD_REF`, `PR_BASE_REF`, `PR_BODY`, `PR_IS_FORK` (`'true'|'false'`) from env, print reasons, append them to `$GITHUB_STEP_SUMMARY` when set, exit 1 when not ok.

- [ ] **Step 1: Failing tests** in `policy.test.ts`:
  - `chore/17-check-green` + `Closes #17` → ok.
  - `feature/foo` + `Closes #1` → not ok, one reason mentioning the branch pattern.
  - `fix/3-x` + body `null` → not ok (missing closing keyword).
  - keywords `Fixes #3`, `closes #12`, `Resolved #4` → ok; `Refs #4` → not ok.
  - fork with branch `patch-1` + `Closes #9` → ok; fork without keyword → not ok.
  - base `deploy` → `checkPrPolicy` ok with no reasons (skipped).
  - `checkDeployGuard`: head `main`, not fork → ok; head `chore/1-x` → not ok; head `main` from a fork → not ok; base `main` → ok (not applicable).
- [ ] **Step 2:** `npx tsx --test scripts/github/policy.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `policy.ts` with the Global Constraints regexes, then the two CLIs (same header/style as `setup-project.ts`).
- [ ] **Step 4:** Tests → PASS.
- [ ] **Step 5: Workflows.** `pr-policy.yml`: `on: pull_request: types [opened, edited, synchronize, reopened]` (all bases); job `name: pr-policy`; env from `github.event.pull_request` (`head.ref`, `base.ref`, `body`, fork = `head.repo.full_name != github.repository`); steps checkout + setup-node 22 + `npm i -g npm@11` + `npm ci --ignore-scripts` + `npx tsx scripts/github/pr-policy-check.ts`. `permissions: contents: read`. **Pass the body via `env:`, never interpolate `${{ }}` into `run:`** (script injection). `deploy-guard.yml`: same shape, `on: pull_request: branches [deploy]`, job `name: deploy-guard`.
- [ ] **Step 6:** eslint/prettier on changed files; commit `ci: pr-policy and deploy-guard checks`.

### Task 3: Release PR + Deployed status

**Files:** Create `scripts/github/release.ts`, `release.test.ts`, `release-pr.ts`, `mark-deployed.ts`, `.github/workflows/release-pr.yml`, `mark-deployed.yml`.

**Interfaces:**

- `parsePendingMigrations(diffNameOnly: string): string[]` — keeps `supabase/migrations/*.sql` lines, sorted.
- `extractPrNumbers(commitSubjects: string[]): number[]` — squash subjects end with `(#N)`; unique, ascending.
- `type ShippedPr = { number: number; title: string; closes: number[]; labels: string[] }`
- `renderReleaseBody(input: { prs: ShippedPr[]; migrations: string[] }): string` — French; sections `## Contenu` (one line per PR: `- #N titre (ferme #a, #b)`, `⚠️ migration` marker when label `needs-migration`), `## Migrations à appliquer AVANT le merge` (file list, or `Aucune migration.`), `## Procédure` checklist: appliquer les migrations listées (script idempotent + transactionnel) → insérer dans `supabase_migrations.schema_migrations` → `npm run sb:verify:prod` → merger cette PR (Coolify déploie automatiquement).
- `planReleasePr(input: { openReleasePr: number | null; aheadCommits: number }): { action: 'create' | 'update' | 'none'; number?: number }` — `none` when `aheadCommits === 0`.
- `releaseTokenError(token: string | undefined): string | null` — French message naming secret `WIZCARD_BOT_TOKEN` and the command `gh secret set WIZCARD_BOT_TOKEN` when empty.
- `release-pr.ts`: uses `gh` with `GH_TOKEN` = bot token; `git fetch origin deploy main`; ahead = `git rev-list --count origin/deploy..origin/main` excluding nothing; subjects from `git log --format=%s origin/deploy..origin/main` (after the first release, merge commits on deploy make this include already-shipped commits? No: main commits are ancestors of deploy after a merge-commit release, so `deploy..main` is exactly the unreleased ones — keep this); PR details via `gh pr view N --json title,labels,closingIssuesReferences`; migrations via the Global Constraints tree diff; create (`gh pr create --base deploy --head main --title "Release <date>" --body-file`) or edit body.
- `mark-deployed.ts`: on a merged release PR, for every Project #2 item with status `Done (main)`: resolve its merge commit (PR → `mergeCommit.oid`; issue → closing PR's merge commit via `closedByPullRequestsReferences`), and if `git merge-base --is-ancestor <oid> origin/deploy` → set status `Deployed`. Reuses `ghGraphql` / project ids helpers from `lib/gh.ts` / `setup-project.ts` (extract a shared helper if needed rather than duplicating the Status-field lookup).

- [ ] **Step 1: Failing tests** in `release.test.ts` covering every interface above, including: duplicate `(#12)` subjects → `[12]`; subject without `(#N)` ignored; non-sql and non-migration paths dropped; `renderReleaseBody` with zero migrations contains `Aucune migration.`; `needs-migration` PR line contains `⚠️`; `planReleasePr` `{null, 3}` → create, `{57, 3}` → update 57, `{57, 0}` → none; `releaseTokenError('')` mentions `WIZCARD_BOT_TOKEN`, `releaseTokenError('x')` → null.
- [ ] **Step 2:** RED, implement, GREEN.
- [ ] **Step 3: Workflows.** `release-pr.yml`: `on: push: branches [main]` + `workflow_dispatch`; concurrency `release-pr` (no cancel); `fetch-depth: 0`; env `GH_TOKEN: ${{ secrets.WIZCARD_BOT_TOKEN }}`; first step fails via `releaseTokenError` when empty. `mark-deployed.yml`: `on: pull_request: types [closed], branches [deploy]` with `if: github.event.pull_request.merged == true && github.event.pull_request.head.repo.full_name == github.repository`, plus `workflow_dispatch`; same token.
- [ ] **Step 4:** Dry-run locally: `GH_TOKEN=$(gh auth token) npx tsx scripts/github/release-pr.ts --dry-run` prints the body it would post (expected: the pending prod migrations listed in memory — collection index, stacking, bulk edit — and the PRs since the last deploy) without creating anything; `npx tsx scripts/github/mark-deployed.ts --dry-run` lists items it would move (expected: none, since nothing new is on deploy).
- [ ] **Step 5:** eslint/prettier; commit `ci: auto-maintained release PR and Deployed status`.

### Task 4: Rulesets (applied after Tasks 1–3 are on `main`)

**Files:** Create `scripts/github/rulesets-config.ts`, `rulesets.ts`, `rulesets.test.ts`, `setup-rulesets.ts`; modify `package.json` (`"gh:rules": "tsx scripts/github/setup-rulesets.ts"`).

**Interfaces:**

- `RULESETS: { name: 'main' | 'deploy'; payload: object }[]` — REST payloads per Global Constraints (`target: 'branch'`, `conditions.ref_name.include: ['refs/heads/main']` / `['refs/heads/deploy']`, rules `pull_request` with `required_approving_review_count: 0` and `allowed_merge_methods`, `required_status_checks` with the check contexts, `non_fast_forward`, `deletion`; `bypass_actors` `[{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }]` on main only).
- `REPO_SETTINGS = { allow_squash_merge: true, allow_merge_commit: true, allow_rebase_merge: false, delete_branch_on_merge: true }`.
- `planRulesets(existing: { id: number; name: string }[], desired): { create: string[]; update: { id: number; name: string }[] }` — match by name; always update existing (PUT is idempotent).
- `canRemoveClassicProtection(rulesets: { name: string; enforcement: string }[]): boolean` — true only if `main` and `deploy` are both `active`.
- `setup-rulesets.ts`: repo settings PATCH → rulesets create/PUT → read back → if `--remove-classic` and `canRemoveClassicProtection` → `DELETE repos/{repo}/branches/main/protection` (ignore 404). `--dry-run` supported.

- [ ] **Step 1:** Failing tests: `planRulesets` create/update by name; `canRemoveClassicProtection` false when deploy missing, false when main `evaluate`, true when both active.
- [ ] **Step 2:** RED → implement → GREEN.
- [ ] **Step 3:** `npm run gh:rules -- --dry-run`, then `npm run gh:rules` (rulesets + settings), verify `gh api repos/Elnop/Wizcard/rulesets --jq '.[]|{name,enforcement}'` shows both active, then `npm run gh:rules -- --remove-classic`, verify `gh api repos/Elnop/Wizcard/branches/main/protection` → 404.
- [ ] **Step 4:** Commit `ci: rulesets for main and deploy`. This task's PR is the first one gated by the new rules — it must go green without `--admin`.

### Task 5: Docs

**Files:** Modify `AGENTS.md` (new `## Workflow` section after `## Development Commands`); create `CONTRIBUTING.md`, `docs/workflow/release.md`; link both from `docs/workflow/github-project.md`.

- [ ] **Step 1:** `AGENTS.md` Workflow: every change = issue → branch `type/<N>-slug` → PR with `Closes #N` → squash; checks `check-build` + `pr-policy`; owner bypass only for emergencies; agents (Claude) never use `--admin` without the owner's explicit OK; never push to `deploy`.
- [ ] **Step 2:** `docs/workflow/release.md` (for Jo): the release PR is opened automatically; procedure = apply listed migrations (idempotent + transactional script, see AGENTS.md § Schema Verification) → `schema_migrations` insert → `npm run sb:verify:prod` → merge the release PR (merge commit) → Coolify deploys → board items move to Deployed automatically. Migrations must be backward-compatible with the deployed app (expand-then-contract); otherwise the PR says so and ships alone. Setup note: secret `WIZCARD_BOT_TOKEN` (owner's classic PAT, `repo` + `project`) and how to rotate it.
- [ ] **Step 3:** `CONTRIBUTING.md`: open/claim an issue first; fork PRs need `Closes #N`, any branch name; `npm run check` must pass.
- [ ] **Step 4:** prettier; commit `docs: workflow, release procedure and contributing guide`.

## Execution order note

Tasks 1, 2, 3, 5 ship in one PR (`chore/11-rules-actions`, `Closes #19`, `#20`, `#22`, `#24`), merged with `--admin` under the classic protection (owner OK required). Before merging it, the owner sets the secret (`! gh secret set WIZCARD_BOT_TOKEN`). Task 4 then ships in a second PR (`chore/23-rulesets`, `Closes #23`, `#11`) that must pass the new rules on its own.
