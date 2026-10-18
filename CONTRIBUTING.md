# Contributing

1. **Open or claim an issue first.** Every change is tracked by an issue (see [docs/workflow/github-project.md](docs/workflow/github-project.md)).
2. **Branch** from `main` as `type/<N>-slug`, where `type` is one of `feat`, `fix`, `chore`, `docs`, `refactor`, `perf` and `<N>` is the issue number (e.g. `fix/42-login-redirect`).
3. **Run `npm run check`** (TypeScript + ESLint + Prettier) before opening the PR; it must pass.
4. **Open a PR to `main`** whose description contains a closing keyword: `Closes #N` (also `Fixes` / `Resolves`).
5. PRs are **squash-merged** once the required checks (`check-build`, `pr-policy`) are green. No approval is required.

## From a fork

Fork PRs may use any branch name, but still need `Closes #N` in the description and a passing `npm run check`.

## Releases

Maintainers only: see [docs/workflow/release.md](docs/workflow/release.md). Never push to `deploy`.
