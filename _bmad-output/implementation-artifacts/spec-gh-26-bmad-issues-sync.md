---
title: 'gh-26 — Synchro BMAD → issues GitHub'
type: 'feature'
created: '2026-10-18'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les epics/stories produits par BMAD (`_bmad-output/planning-artifacts/epics.md`) n'arrivent pas sur le board GitHub ; AGENTS.md prévoit une poussée à sens unique vers les issues, sans outil pour la faire (issue #26).

**Approach:** Un script `npm run gh:bmad` (avec `--dry-run`) lit `epics.md` seul, et crée de façon idempotente une issue `epic` par epic et une issue `story` par story (sous-issue native de son epic), ajoutées au Project « Wizcard ».

Décisions validées par l'humain :

- Appariement par marqueur caché dans le corps de l'issue : `<!-- bmad:epic:N -->` / `<!-- bmad:story:N.M -->`, cherché comme sous-chaîne (résiste aux renommages sur GitHub ; ne modifie pas `epics.md`).
- Création seule : une issue existante n'est jamais modifiée (GitHub fait foi après la poussée).
- Source : `epics.md` seul (pas de `sprint-status.yaml`).
- Une story est rendue selon le formulaire `story.yml` : En tant que / Je veux / Afin de / Critères d'acceptation (Given/When/Then repris tels quels) / Notes techniques ; une epic selon `epic.yml` (Objectif = texte de l'epic).

</frozen-after-approval>

## Implementation Notes

</content>
</invoke>
- `scripts/github/bmad.ts` (nouveau, pur) : `parseEpics` (gabarit bmad-create-epics-and-stories, en-têtes EN ou FR, gras toléré, « afin d' » élidé), `renderEpicBody`/`renderStoryBody` (formulaires epic.yml/story.yml, `_No response_` pour un champ vide comme GitHub), `markerOf`, `planBmadSync`. Lève sur clé dupliquée, story hors de son epic, story sans « Je veux » ou sans critères (dérive du gabarit détectée bruyamment plutôt qu'une issue vide).
- `scripts/github/sync-bmad.ts` (nouveau) + `npm run gh:bmad` (`--dry-run`, chemin optionnel). Liste TOUTES les issues (sans filtre de label) pour retrouver les marqueurs.
- `scripts/github/lib/issues.ts` : `createIssue`/`linkSubIssue` extraits de `file-epics.ts` (partagés, comportement inchangé).
- Regex écrites sans `.+?…\s*$` (règle `sonarjs/super-linear-regex`) : capture gourmande puis `clean()`.
- Docs : `docs/workflow/github-project.md` (Scripts + règles du marqueur), ligne AGENTS.md § BMAD.
- Vérifié : `bmad.test.ts` 6 tests (suite scripts 46/46), `npm run check` vert, dry-run réel contre GitHub sur un epics.md d'essai (3 créations prévues), message clair + sortie 1 si epics.md absent.

## Review Triage Log

- Couche Blind Hunter (sous-agent) non lancée ; relecture inline.
- medium — filtre par label `epic`/`story` : un label retiré sur GitHub ⇒ doublon au lancement suivant. Corrigé (liste de toutes les issues).
- low (rejeté) — si `linkSubIssue` échoue après la création, la story reste orpheline et n'est pas reliée au lancement suivant (création seule). Rare, réparable à la main dans l'UI.
- low (rejeté) — en dry-run le message final dit « converged » ; même convention que `gh:epics`.
