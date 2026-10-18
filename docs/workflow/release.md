# Release procedure

Audience: whoever operates production (Coolify and prod migrations).

Production deploys from the `deploy` branch: Coolify auto-deploys on every push to it. `deploy` only changes by merging the release PR.

## The release PR

On every push to `main`, the `release-pr` workflow creates or updates a single open PR `main` -> `deploy` titled `Release YYYY-MM-DD`. Its (French) body lists the shipped PRs (marked with a warning sign when labeled `needs-migration`), direct commits, the migrations to apply BEFORE merging, and this checklist.

## Procedure

1. Open the release PR and read the list of migrations to apply.
2. Apply each pending migration to prod as an idempotent, transactional script, then insert its version into `schema_migrations`. Details: `AGENTS.md` § Schema Verification.
3. Run `npm run sb:verify:prod` and confirm no FAIL.
4. Merge the release PR with **"Create a merge commit"**, always. Never squash or rebase the release PR: it would break release tracking. (Until the `deploy` ruleset is live — follow-up PR, issue #23 — nothing enforces this.) `deploy-guard` must be green.
5. Coolify deploys automatically.
6. The `mark-deployed` workflow then moves the board items from `Done (main)` to `Deployed`.

## Migration compatibility

Migrations run before the new code is live, so they must be backward-compatible with the app currently deployed (expand-then-contract: add first, remove in a later release). If a change cannot be, the feature PR says so (label `needs-migration`, shown as ⚠️ in the release PR body, which is regenerated on every push) and it ships alone.

## Setup: `WIZCARD_BOT_TOKEN`

The release PR is created with the repository secret `WIZCARD_BOT_TOKEN` so its checks run (events created by `GITHUB_TOKEN` do not trigger workflows). It is the owner's classic PAT with scopes `repo` and `project`. The workflow fails loudly if it is missing, and the token is only exposed to the script step.

To rotate: create a new classic PAT with the same scopes, run `gh secret set WIZCARD_BOT_TOKEN`, then revoke the old token. Never echo or commit it.
