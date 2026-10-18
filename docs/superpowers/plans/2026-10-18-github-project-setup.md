# GitHub Project setup (sub-project ③) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Wizcard" GitHub Project with the status workflow, four views, labels, French issue forms + PR template, and the bootstrap epics for sub-projects ①–⑤ filed on it.

**Architecture:** One idempotent TypeScript script (`npm run gh:setup`) drives `gh` (CLI + GraphQL) to converge labels, project, fields and views to a declared config; pure diff functions are unit-tested with `node:test`. What the API cannot do (view filters/grouping, built-in Project workflows) is a documented manual UI checklist. Templates are plain files under `.github/`. Epics are filed by a second small script from a declarative list so they're reviewable before creation.

**Tech Stack:** TypeScript via `tsx` (repo convention for `scripts/`), `gh` 2.99 (scopes `repo`, `project`), GitHub GraphQL (`createProjectV2View`, `updateProjectV2Field`, `addSubIssue`), `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-18-dev-workflow-design.md` (§ ③ and § ⑤ for epic contents)

## Global Constraints

- Project owner: user `Elnop`; repo `Elnop/Wizcard`; project title `Wizcard`. Leave project "Music Room – Validation" untouched.
- Status options, in order: `Backlog`, `Ready`, `In progress`, `In review`, `Done (main)`, `Deployed`.
- Labels: `epic`, `story`, `bug`, `chore`, `needs-migration`, `needs-review` (the last one is used by ②'s review-gate; created now so the label set is complete).
- Hierarchy: Epic issue → native sub-issues (story / bug / chore). No third level.
- Tickets, issue forms and PR template text in **French**; code, commits, script comments style = match `scripts/verify-schema.ts` (French header doc-comment is the existing convention there).
- Scripts must be idempotent: a second run makes zero changes and says so.
- Never delete or rename existing labels/issues; only add/update. Existing labels not in the config are left as-is.
- Work happens on a branch named with the ③ epic's issue number (`chore/<N>-github-project`) and lands via a PR with `Closes #<N>` — the workflow eats its own dog food, even though rules (②) aren't enforced yet.

## Review Focus

- **Rerun after partial failure** (e.g. network error after project created, before views): rerun must converge, not duplicate the project/views/fields. → test in Task 1 (`planViews` / `planFields` skip existing by name).
- **Default Status options being replaced** when items already carry a status: `updateProjectV2Field` with new option list drops values of removed options. Expected: on first setup the project is empty, so safe; on rerun, existing option IDs must be preserved (send options matching by name). → test in Task 1 (`planStatusOptions` keeps names already present, in configured order).
- **Label colour/description drift**: rerun updates description/colour of configured labels but never touches others. → test in Task 1 (`planLabels`).
- **Bootstrap epics rerun**: must not file duplicate epics. Expected: match by exact title among open+closed issues labelled `epic`. → test in Task 3 (`planEpics`).
- **Sub-issue already attached**: `addSubIssue` errors if already a child; script must skip. → covered by `planEpics` returning only missing children.

---

## File Structure

- Create `scripts/github/lib/gh.ts` — thin wrappers: `ghJson<T>(args: string[]): T`, `ghGraphql<T>(query: string, vars: Record<string, unknown>): T` (spawnSync `gh`, throw with stderr on non-zero).
- Create `scripts/github/project-config.ts` — declarative config (labels, status options, fields, views) — the single source of truth for ③.
- Create `scripts/github/plan.ts` — pure diff functions (no I/O).
- Create `scripts/github/plan.test.ts` — `node:test` tests for `plan.ts`.
- Create `scripts/github/setup-project.ts` — CLI: reads current state via `gh`, applies plans, prints summary; `--dry-run` flag.
- Create `scripts/github/epics.ts` — declarative bootstrap epics + stories (French).
- Create `scripts/github/file-epics.ts` — CLI: files missing epics/stories, links sub-issues, adds to project; `--dry-run`.
- Create `.github/ISSUE_TEMPLATE/epic.yml`, `story.yml`, `bug.yml`, `config.yml`; `.github/pull_request_template.md`.
- Create `docs/workflow/github-project.md` — manual UI checklist + how to rerun scripts.
- Modify `package.json` scripts: `gh:setup`, `gh:epics`, `test:scripts`.

---

### Task 1: Config + pure planners + setup script (labels, project, fields, views)

**Files:**

- Create: `scripts/github/lib/gh.ts`, `scripts/github/project-config.ts`, `scripts/github/plan.ts`, `scripts/github/plan.test.ts`, `scripts/github/setup-project.ts`
- Modify: `package.json` (add `"gh:setup": "tsx scripts/github/setup-project.ts"`, `"test:scripts": "tsx --test scripts/**/*.test.ts"`)

**Interfaces:**

- Produces (`project-config.ts`):
  - `type LabelSpec = { name: string; color: string; description: string }`
  - `type FieldSpec = { name: string; kind: 'DATE' | 'ITERATION' }`
  - `type ViewSpec = { name: string; layout: 'BOARD_LAYOUT' | 'TABLE_LAYOUT' | 'ROADMAP_LAYOUT' }`
  - `export const PROJECT = { owner: 'Elnop', repo: 'Elnop/Wizcard', title: 'Wizcard' }`
  - `export const LABELS: LabelSpec[]`, `STATUS_OPTIONS: string[]`, `FIELDS: FieldSpec[]`, `VIEWS: ViewSpec[]`
  - Values: FIELDS = `Début` (DATE), `Échéance` (DATE), `Itération` (ITERATION, 14 days). VIEWS = `Kanban` (BOARD), `Par epic` (TABLE), `À déployer` (TABLE), `Roadmap` (ROADMAP). Label colours: builder's call, distinct.
- Produces (`plan.ts`):
  - `planLabels(existing: LabelSpec[], desired: LabelSpec[]): { create: LabelSpec[]; update: LabelSpec[] }`
  - `planStatusOptions(existing: { id: string; name: string }[], desired: string[]): { id?: string; name: string }[] | null` — `null` when names already equal desired in order (no-op); otherwise the full ordered list, carrying `id` for names that already exist.
  - `planFields(existingNames: string[], desired: FieldSpec[]): FieldSpec[]` — missing only.
  - `planViews(existingNames: string[], desired: ViewSpec[]): ViewSpec[]` — missing only.
- Produces (`lib/gh.ts`): `ghJson<T>(args: string[]): T`, `ghGraphql<T>(query: string, vars?: Record<string, unknown>): T`, `gh(args: string[]): string`.

- [ ] **Step 1: Write failing tests in `scripts/github/plan.test.ts`**

```ts
test('planLabels creates missing, updates drifted, ignores unknown', () => {
	const r = planLabels(
		[
			{ name: 'bug', color: 'ff0000', description: 'old' },
			{ name: 'wontfix', color: '000000', description: '' },
		],
		[
			{ name: 'bug', color: 'd73a4a', description: 'Bug' },
			{ name: 'epic', color: '5319e7', description: 'Epic' },
		]
	);
	assert.deepEqual(
		r.create.map((l) => l.name),
		['epic']
	);
	assert.deepEqual(
		r.update.map((l) => l.name),
		['bug']
	);
});
test('planLabels is a no-op when equal', () => {
	/* create=[] update=[] */
});
test('planStatusOptions keeps existing ids and configured order', () => {
	const r = planStatusOptions(
		[
			{ id: 'a', name: 'Done (main)' },
			{ id: 'b', name: 'Todo' },
		],
		['Backlog', 'Done (main)']
	);
	assert.deepEqual(r, [{ name: 'Backlog' }, { id: 'a', name: 'Done (main)' }]);
});
test('planStatusOptions returns null when already converged', () => {
	/* same names same order → null */
});
test('planFields / planViews return only missing by name', () => {
	/* existing ['Kanban'] → 3 views */
});
```

- [ ] **Step 2: Run** `npx tsx --test scripts/github/plan.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `plan.ts` and `project-config.ts`** per Interfaces. Label comparison is case-insensitive on name, colour compared lowercase without `#`.

- [ ] **Step 4: Run** `npx tsx --test scripts/github/plan.test.ts` — Expected: all PASS.

- [ ] **Step 5: Implement `lib/gh.ts` and `setup-project.ts`.** Sequence: labels (`gh label list --json name,color,description`, `gh label create|edit`) → find project by title (`gh project list --owner Elnop --format json`), else `gh project create` → `gh project link --repo Elnop/Wizcard` (ignore "already linked") → Status field via GraphQL (`node(id:$project){... on ProjectV2{field(name:"Status"){... on ProjectV2SingleSelectField{id options{id name}}}}}`) then `updateProjectV2Field(singleSelectOptions:…)` when plan non-null; option colour builder's call → missing fields (`gh project field-create --data-type DATE|ITERATION`; iteration duration via `updateProjectV2Field.iterationConfiguration` duration 14) → missing views via `createProjectV2View`. `--dry-run` prints plans without mutating. Final line: `✔ converged (N changes)` or `✔ already up to date`.

- [ ] **Step 6: Dry-run then real run**

Run: `npm run gh:setup -- --dry-run` → lists everything as to-create.
Run: `npm run gh:setup` → creates.
Run: `npm run gh:setup` again → Expected last line `✔ already up to date`.
Verify: `gh project field-list <n> --owner Elnop --format json | jq '.fields[]|select(.name=="Status").options[].name'` prints the 6 statuses in order; `gh label list | grep -E 'epic|story|needs-migration|needs-review'` shows 4 lines.

- [ ] **Step 7: Run `npx eslint scripts/github && npx prettier --check scripts/github`** — Expected: clean (baseline red elsewhere is known; gate on these files only). Do not commit yet: the branch name needs the ③ epic number, which only exists after Task 3 Step 4. Tasks 1–3 files are committed together in Task 3 Step 5.

### Task 2: Issue forms + PR template (French)

**Files:**

- Create: `.github/ISSUE_TEMPLATE/epic.yml`, `story.yml`, `bug.yml`, `config.yml`, `.github/pull_request_template.md`

**Interfaces:**

- Consumes: label names from Task 1 (`epic`, `story`, `bug`).
- Produces: section headings the BMAD sync (④) will fill — keep exactly: Epic → `Objectif`, `Valeur / pourquoi`, `Hors périmètre`, `Critères de fin`; Story → `En tant que`, `Je veux`, `Afin de`, `Critères d'acceptation`, `Notes techniques`; Bug → `Comportement observé`, `Comportement attendu`, `Étapes pour reproduire`, `Environnement` (dropdown: local / prod).

- [ ] **Step 1: Write the forms.** Each form sets `labels:` to its label and `projects: ["Elnop/<project-number>"]` (number from Task 1) so new issues land on the board. Title prefixes: `[Epic] `, `[US] `, `[Bug] `. `config.yml`: `blank_issues_enabled: false`.
- [ ] **Step 2: PR template** with: `Closes #` line, `## Quoi / pourquoi`, `## Comment tester`, checklist `- [ ] npm run check vert sur les fichiers modifiés`, `- [ ] Migration SQL ? → ajouter le label needs-migration et vérifier qu'elle est compatible avec la version en prod (expand-then-contract)`, `- [ ] Touche RLS/auth/migrations → label needs-review`.
- [ ] **Step 3: Validate YAML:** `npx prettier --check .github` and `node -e "for (const f of require('fs').readdirSync('.github/ISSUE_TEMPLATE')) require('yaml')"` — if `yaml` isn't a dep, use `python3 -c "import yaml,sys,glob;[yaml.safe_load(open(f)) for f in glob.glob('.github/ISSUE_TEMPLATE/*.yml')]"`. Expected: no error. Real validation happens after push (GitHub shows form errors on the "New issue" page) — Task 4.

### Task 3: Bootstrap epics + branch + PR

**Files:**

- Create: `scripts/github/epics.ts`, `scripts/github/file-epics.ts`, extend `scripts/github/plan.test.ts`
- Modify: `package.json` (add `"gh:epics": "tsx scripts/github/file-epics.ts"`)

**Interfaces:**

- Consumes: `ghJson`, `ghGraphql`, `PROJECT` (Task 1).
- Produces:
  - `type StorySpec = { title: string; label: 'story' | 'bug' | 'chore'; body: string }`
  - `type EpicSpec = { title: string; body: string; children: StorySpec[] }`
  - `export const EPICS: EpicSpec[]` (`epics.ts`)
  - `planEpics(existing: { number: number; title: string; subIssueTitles: string[] }[], desired: EpicSpec[]): { createEpics: EpicSpec[]; createChildren: { epicTitle: string; child: StorySpec }[] }` in `plan.ts` — match by exact title.

- [ ] **Step 1: Failing test** `planEpics skips existing epic and existing children`: existing `[{number:1,title:'[Epic] A',subIssueTitles:['[US] x']}]`, desired A{x,y} + B{z} → `createEpics` = [B], `createChildren` = [{A,y},{B,z}]. Run `npx tsx --test scripts/github/plan.test.ts` → FAIL; implement; → PASS.

- [ ] **Step 2: Write `epics.ts`** (French bodies following Task 2 headings). Epics and children:
  - `[Epic] Workflow ③ — Board GitHub Project` — `[US] Créer le Project, les labels et les vues`, `[US] Formulaires d'issue et template de PR`, `[US] Configurer les vues et automatisations dans l'UI`
  - `[Epic] Workflow ① — npm run check au vert` — `[Chore] Corriger les problèmes ESLint/Prettier/TS préexistants`, `[Chore] Vérifier npm run build`
  - `[Epic] Workflow ② — Règles de branche et Actions` — `[US] CI check + build sur les PR`, `[US] Action pr-policy (branche + Closes #N)`, `[US] Action review-gate`, `[US] Action deploy-guard + liste des migrations + statut Deployed`, `[US] Rulesets main/deploy et méthodes de merge`, `[US] Procédure de release dans AGENTS.md`
  - `[Epic] Workflow ④ — BMAD sur Wizcard` — `[US] Installer BMAD (version figée) et désactiver superpowers pour le projet`, `[US] Script de synchro BMAD → issues`
  - `[Epic] Workflow ⑤ — Tri de l'existant` — `[Chore] Rattacher les issues #4–#7`, `[Chore] Trier les branches locales`, `[Chore] Epics des chantiers en cours` (body lists the chantiers from spec § ⑤)

- [ ] **Step 3: Implement `file-epics.ts`.** Read existing: `gh issue list --label epic --state all --json number,title` + sub-issues via GraphQL `issue(number:){subIssues(first:50){nodes{title}}}`. Create with `gh issue create --label … --title … --body …` (and `--project Wizcard`), link with `addSubIssue(issueId, subIssueId)`. Children also added to project. `--dry-run` prints the plan.

- [ ] **Step 4: Run** `npm run gh:epics -- --dry-run`, then `npm run gh:epics`, then again → Expected `✔ already up to date`. Note the issue number `<N>` of `[Epic] Workflow ③`.

- [ ] **Step 5: Branch, commit, PR.**

```bash
git switch -c chore/<N>-github-project
git add scripts/github .github package.json docs/superpowers/plans/2026-10-18-github-project-setup.md
git commit -m "chore(github): project board, labels, issue forms and bootstrap epics"   # + Co-Authored-By trailer
git push -u origin chore/<N>-github-project
gh pr create --title "chore(github): board Project, labels, formulaires et epics" --body "…"  # French body from template, with one Closes line per US of epic ③ AND Closes #<N>
```

Expected: PR appears; `gh pr view --json closingIssuesReferences` lists `<N>`.

### Task 4: Manual UI configuration + checklist doc

**Files:**

- Create: `docs/workflow/github-project.md` (English, per repo-doc rule; commit on the same branch before merge)

The API cannot set view filters/grouping nor enable built-in workflows. Document then perform (user or Claude-in-Chrome, user's choice at execution):

- [ ] **Step 1: Views.** `Kanban`: group by Status, hide `epic`-labelled items (`-label:epic`). `Par epic`: table, group by **Parent issue**, show Sub-issues progress field, filter `-label:epic`. `À déployer`: filter `status:"Done (main)"`, show labels column (needs-migration visible). `Roadmap`: dates `Début`/`Échéance`, zoom month, filter `label:epic`.
- [ ] **Step 2: Built-in workflows** (Project → ⋯ → Workflows): enable _Item added → Backlog_, _Item reopened → Backlog_, _Pull request opened → In review_, _Item closed → Done (main)_, _Pull request merged → Done (main)_, _Auto-add to project_ for repo `Elnop/Wizcard` with filter `is:issue,pr is:open`. Leave `Deployed` unset (② sets it).
- [ ] **Step 3: Verify forms render:** open `https://github.com/Elnop/Wizcard/issues/new/choose` — three forms, no blank issue; open Epic form → label + project preset.
- [ ] **Step 4: Verify automation end-to-end:** the PR from Task 3 shows `In review` on the board; after merge, epic `<N>`'s US issues closed by the PR show `Done (main)`. (US closes via `Closes #` lines for each US in the PR body.)
- [ ] **Step 5: Write `docs/workflow/github-project.md`** with Steps 1–2 as the reproducible checklist + "rerun `npm run gh:setup` / `gh:epics`" instructions; commit, push, merge the PR (squash).
