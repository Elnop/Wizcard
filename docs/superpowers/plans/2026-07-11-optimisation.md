# Optimisation / Core Web Vitals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire passer les Core Web Vitals au vert (Perf 90+, LCP < 2,5 s, CLS < 0,1) sur landing / search / deck, en corrigeant les causes mesurées (Hero above-the-fold bloqué par JS, CLS deck) sans casser l'esthétique.

**Architecture:** Chantier **piloté par la mesure** — chaque lot suit un cycle diagnose → fix → re-mesure Lighthouse. Fix 1 : le Hero passe d'une animation pilotée par JS (`opacity:0` + `useInView` → `.visible`) à une animation **CSS-first** (keyframes au chargement, état final visible) pour que le texte LCP soit peint immédiatement. Fix 2 : réserver les dimensions du contenu deck (aspect-ratio / min-height) pour éliminer le CLS. Lot 3 (gains JS/images/fonts) seulement si le vert n'est pas atteint.

**Tech Stack:** Next.js 16, CSS Modules, `next/image`. Lighthouse via `npx` (hors deps). Chrome `/usr/bin/google-chrome`.

## Global Constraints

- **Mesure = le test.** Lighthouse mobile, `--only-categories=performance`, sur un **build de production local** (`npm run build && npm run start`, port 3000) pour itérer sans déployer. Chrome path `/usr/bin/google-chrome`, flags `--headless --no-sandbox`.
- **Cibles** : Perf 90+, LCP < 2,5 s, CLS < 0,1.
- **Baseline prod (2026-07-11)** : landing perf 76 / LCP 7,1 s ; search 70 / 9,4 s ; deck 51 / LCP 8,4 s / **CLS 0,475**.
- **Animations conservées** — juste rendues non bloquantes above-the-fold. Le Hero doit rester visuellement agréable (le texte visible immédiatement, l'entrée peut jouer via transform).
- **Ne PAS toucher** aux 3 composants landing plus bas (Features, CardShowcase, CallToAction) — ils gardent `useInView` (animation au scroll légitime, hors LCP).
- Pas de nouvelle dépendance npm runtime. CSS Modules + `next/image` (conventions existantes).
- Pas de framework de test — `npm run check` + Lighthouse + runtime navigateur (rendu préservé).
- Commit trailer : `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

| Fichier                                                                              | Responsabilité                                       | Task |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------- | ---- |
| `src/app/(landing)/components/Hero/Hero.module.css`                                  | Animation CSS-first (état final visible)             | 1    |
| `src/app/(landing)/components/Hero/Hero.tsx`                                         | Retirer la dépendance visibilité→useInView           | 1    |
| `src/lib/card/components/CardImage/CardImage.module.css` (+ éventuel conteneur deck) | Réserver l'espace image (aspect-ratio sur container) | 2    |
| (à confirmer par diagnostic) zone de transition spinner→deck                         | min-height / squelette                               | 2    |
| `src/app/(landing)/components/CardShowcase/*`, root layout, fonts                    | Gains secondaires (conditionnels)                    | 4    |

---

## Task 0: Établir la mesure locale (build prod + baseline Lighthouse)

**Files:** aucun (outillage).

**Interfaces:**

- Produces: une commande Lighthouse reproductible et une **baseline locale** (les scores localhost, souvent meilleurs que la prod — c'est l'écart AVANT/APRÈS local qui compte, pas la valeur absolue).

**Contexte :** On mesure sur un build de production local pour itérer sans déployer. Le dev server (`npm run dev`) n'est PAS représentatif (pas de minification, HMR) — il faut `build` + `start`. Un serveur dev utilisateur peut occuper le port 3000 : le build prod local a besoin du 3000 aussi, donc on lance sur un port dédié (`PORT=3001 npm run start`) et on mesure là.

- [ ] **Step 1: Build de production**

Run: `npm run build`
Expected: build réussi, pas d'erreur TypeScript/compilation. Noter tout warning.

- [ ] **Step 2: Lancer le serveur prod local sur un port dédié**

Run (en arrière-plan): `PORT=3001 npm run start`
Attendre le log « Ready ». Ne PAS tuer un éventuel serveur dev utilisateur sur 3000.

- [ ] **Step 3: Baseline Lighthouse locale (3 pages)**

Run (remplacer `<DECK>` par un deck public réel, ex. `ccad0487-ddac-44bd-9fe8-6a2228533ae2`) :

```bash
SCRATCH="$(git rev-parse --show-toplevel)/.superpowers/sdd"
export CHROME_PATH=/usr/bin/google-chrome
for p in "landing:/" "search:/search" "deck:/decks/<DECK>"; do
  name="${p%%:*}"; path="${p#*:}"
  npx --yes lighthouse "http://localhost:3001$path" --quiet \
    --chrome-flags="--headless --no-sandbox" --only-categories=performance \
    --form-factor=mobile --screenEmulation.mobile \
    --output=json --output-path="$SCRATCH/lh-base-$name.json" >/dev/null 2>&1
  node -e 'const r=require(process.argv[1]);const a=r.audits;const g=k=>a[k]?a[k].displayValue:"?";console.log(process.argv[2].padEnd(9),"perf="+Math.round(r.categories.performance.score*100),"LCP="+g("largest-contentful-paint"),"CLS="+g("cumulative-layout-shift"),"TBT="+g("total-blocking-time"))' "$SCRATCH/lh-base-$name.json" "$name"
done
```

Expected: 3 lignes de scores. **Enregistrer ces valeurs dans le rapport** — c'est la baseline locale de référence pour comparer après chaque fix.

- [ ] **Step 4: Arrêter le serveur (le laisser prêt à relancer)**

Tuer le `PORT=3001 npm run start` par son PID (ne pas toucher un serveur dev utilisateur). Documenter la baseline dans le rapport.

Pas de commit (outillage/mesure uniquement).

---

## Task 1: Fix LCP Hero (animation CSS-first)

**Files:**

- Modify: `src/app/(landing)/components/Hero/Hero.module.css`
- Modify: `src/app/(landing)/components/Hero/Hero.tsx`

**Interfaces:**

- Consumes: baseline Task 0.
- Produces: Hero dont le contenu (title/tagline = élément LCP) est **peint dès le rendu**, sans attendre l'hydratation.

**Contexte :** Aujourd'hui `.hero .content { opacity: 0 }` et l'affichage n'arrive que quand `useInView` ajoute `.visible` (JS client), + transition 1,2 s. Le Hero étant tout en haut, il est immédiatement dans le viewport → l'effet est un simple retard bloquant sur le LCP. Fix : remplacer le pattern `opacity:0 → .visible` par une **animation CSS `@keyframes`** qui démarre au chargement de la page (sans JS) et **finit à l'état visible**. Ainsi, même sans `.visible` ni JS, le texte est visible (l'animation ne fait que l'amener en douceur). On retire l'usage de `useInView` pour piloter la visibilité du Hero.

Les sélecteurs concernés dans `Hero.module.css` : `.hero .content`, `.hero.visible .content`, `.hero .diamondOrnament`/`.hero.visible .diamondOrnament`, `.hero .title`/`.hero.visible .title`, `.hero .titleRule`/`.hero.visible .titleRule`, `.hero .tagline`/`.hero.visible .tagline`, `.hero .description`, `.hero .cta` (mêmes paires). Les remplacer par des animations `@keyframes` appliquées directement (pas de dépendance `.visible`).

- [ ] **Step 1: Réécrire les animations d'entrée du Hero en CSS-first**

Dans `src/app/(landing)/components/Hero/Hero.module.css`, remplacer le bloc « Entrance animations » (paires `.hero .X { opacity:0 } .hero.visible .X { opacity:1 }`) par des `@keyframes` appliquées directement à chaque élément. Modèle pour `.content` :

```css
/* === Entrance animations (CSS-first: visible even without JS) === */
@keyframes heroRise {
	from {
		opacity: 0;
		transform: translateY(30px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

.hero .content {
	/* Final state is visible; the animation only eases it in. No dependency on
	   a JS-added .visible class, so the LCP text paints on first render. */
	opacity: 1;
	animation: heroRise 1.2s cubic-bezier(0.16, 1, 0.3, 1) both;
}
```

Appliquer le même principe (une `@keyframes` dédiée + `animation: ... both` avec état final visible) à `diamondOrnament` (garder son delay 0.3s : `animation: heroDiamond 0.6s ... 0.3s both`), `title` (delay 0.5s), `titleRule` (`scaleX(0)→scaleX(1)`, delay 0.7s), `tagline`, `description`, `cta` — en conservant leurs delays/timings actuels dans la partie `animation`. **Supprimer toutes les paires `.hero.visible .X`** (la classe `.visible` ne pilote plus rien).

Important : `animation-fill-mode: both` (ou `forwards`) garantit que l'élément reste à l'état final (`to`) après l'anim. L'état de base `opacity: 1` garantit la visibilité si l'animation ne se joue jamais (JS off, prefers-reduced-motion).

Ajouter un respect de `prefers-reduced-motion` (bonne pratique perf + accessibilité) :

```css
@media (prefers-reduced-motion: reduce) {
	.hero .content,
	.hero .diamondOrnament,
	.hero .title,
	.hero .titleRule,
	.hero .tagline,
	.hero .description,
	.hero .cta {
		animation: none;
	}
}
```

- [ ] **Step 2: Retirer la dépendance visibilité→useInView dans Hero.tsx**

Dans `src/app/(landing)/components/Hero/Hero.tsx`, la classe `.visible` conditionnelle (`${inView ? styles.visible : ''}`) ne sert plus. Retirer `useInView` du Hero :

```tsx
export function Hero() {
	return (
		<section className={styles.hero}>
```

(Supprimer l'import `useInView`, le `const [ref, inView] = useInView(...)`, le `ref={ref}` et la classe `${inView ? styles.visible : ''}`.) Le reste du JSX est inchangé.

- [ ] **Step 3: Typecheck + lint**

Run: `npm run check`
Expected: PASS (pas d'import inutilisé `useInView`).

- [ ] **Step 4: Rebuild + re-mesure Lighthouse landing**

Run:

```bash
npm run build
PORT=3001 npm run start &   # attendre "Ready", puis :
SCRATCH="$(git rev-parse --show-toplevel)/.superpowers/sdd"; export CHROME_PATH=/usr/bin/google-chrome
npx --yes lighthouse "http://localhost:3001/" --quiet --chrome-flags="--headless --no-sandbox" --only-categories=performance --form-factor=mobile --screenEmulation.mobile --output=json --output-path="$SCRATCH/lh-after1-landing.json" >/dev/null 2>&1
node -e 'const r=require(process.argv[1]);const a=r.audits;console.log("landing AFTER1 perf="+Math.round(r.categories.performance.score*100),"LCP="+a["largest-contentful-paint"].displayValue,"| LCP element:",(a["largest-contentful-paint-element"]?.details?.items?.[0]?.items?.[0]?.node?.snippet||"?").slice(0,80))' "$SCRATCH/lh-after1-landing.json"
```

Expected: **LCP nettement réduit** vs baseline (cible < 2,5 s local). Arrêter le serveur par PID ensuite.

- [ ] **Step 5: Vérif visuelle (navigateur)**

Charger `http://localhost:3001/` : le Hero (titre WIZCARD + tagline) est **visible immédiatement**, l'animation d'entrée reste agréable (rise+fade). Pas de flash de contenu invisible.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(landing)/components/Hero/Hero.module.css" "src/app/(landing)/components/Hero/Hero.tsx"
git commit -m "perf(hero): CSS-first entrance animation so LCP text paints immediately

The Hero content was opacity:0 until useInView (client JS) added .visible,
delaying the LCP tagline to ~7s. Replace the JS-gated transitions with CSS
keyframes whose base/final state is visible (animation-fill-mode both),
plus prefers-reduced-motion. The above-the-fold text now paints on first
render; the entrance still eases in. Removed useInView from Hero.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Fix CLS deck (réserver les dimensions)

**Files:**

- Modify: `src/lib/card/components/CardImage/CardImage.module.css`
- (à confirmer par diagnostic) conteneur de transition spinner→deck

**Interfaces:**

- Consumes: baseline Task 0.
- Produces: page deck dont le contenu ne « saute » plus (CLS < 0,1).

**Contexte :** CLS 0,475 sur `/decks/[id]`. Le `<h1>` SEO est innocenté (`position:absolute`). Suspects : (a) `CardImage` — son `.container` est `display: inline-block` **sans dimensions réservées**, et le `<Image>` est `width:100%; height:auto` : tant que l'image n'est pas chargée / tant que `isVisible` est false, la hauteur peut être ~0 puis sauter ; (b) la transition `<Spinner/>` → contenu deck qui s'insère d'un coup. **Diagnostiquer d'abord** l'élément qui shifte via Lighthouse, puis réserver l'espace.

- [ ] **Step 1: Diagnostic — quels éléments shiftent ?**

Run (build prod déjà dispo, sinon rebuild ; serveur sur 3001) :

```bash
SCRATCH="$(git rev-parse --show-toplevel)/.superpowers/sdd"; export CHROME_PATH=/usr/bin/google-chrome
npx --yes lighthouse "http://localhost:3001/decks/<DECK>" --quiet --chrome-flags="--headless --no-sandbox" --only-categories=performance --form-factor=mobile --screenEmulation.mobile --output=json --output-path="$SCRATCH/lh-cls-deck.json" >/dev/null 2>&1
node -e 'const r=require(process.argv[1]);const it=r.audits["layout-shift-elements"]?.details?.items||[];console.log("CLS elements:");for(const i of it.slice(0,6))console.log("  score",i.score,"-",(i.node?.snippet||"").slice(0,100))' "$SCRATCH/lh-cls-deck.json"
```

Expected: la liste des nœuds qui shiftent, triés. **C'est ça qui dicte le fix** — si ce sont les `CardImage`, appliquer Step 2 ; si c'est le conteneur spinner→contenu, appliquer Step 3 ; probablement les deux.

- [ ] **Step 2: Réserver l'espace sur CardImage (aspect-ratio sur le container)**

Dans `src/lib/card/components/CardImage/CardImage.module.css`, donner au `.container` (et/ou `.imageWrapper`) un `aspect-ratio` de carte pour réserver la place **avant** le chargement de l'image (le ratio carte MTG utilisé ailleurs dans ce fichier est `63 / 88`) :

```css
.container {
	position: relative;
	display: inline-block;
	aspect-ratio: 63 / 88;
}
```

Vérifier que ça ne casse pas les cas où le container doit s'adapter (le `.image` est `width:100%; height:auto`, la localizedPlaceholder/placeholder ont déjà `aspect-ratio: 63/88`). Si `inline-block` + `aspect-ratio` pose souci de largeur, réserver plutôt sur `.imageWrapper` (qui contient l'image). L'objectif : la boîte a sa hauteur finale dès le premier paint.

- [ ] **Step 3: Réserver l'espace sur la transition spinner→contenu (si le diagnostic le montre)**

Si Step 1 pointe le conteneur qui passe du `<Spinner/>` au deck : donner au conteneur de chargement la même `min-height` que le contenu (ex. `min-height: calc(100vh - var(--navbar-height))` sur le wrapper `.page`/loading), pour que le spinner occupe déjà la hauteur du contenu et que le remplacement ne pousse rien. Cibler le fichier CSS exact révélé par le diagnostic (probablement `src/app/decks/[id]/page.module.css` `.loading`/`.page`). N'appliquer que si le diagnostic le confirme (YAGNI).

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Rebuild + re-mesure CLS deck**

Run:

```bash
npm run build && (PORT=3001 npm run start &)   # attendre "Ready"
SCRATCH="$(git rev-parse --show-toplevel)/.superpowers/sdd"; export CHROME_PATH=/usr/bin/google-chrome
npx --yes lighthouse "http://localhost:3001/decks/<DECK>" --quiet --chrome-flags="--headless --no-sandbox" --only-categories=performance --form-factor=mobile --screenEmulation.mobile --output=json --output-path="$SCRATCH/lh-after2-deck.json" >/dev/null 2>&1
node -e 'const r=require(process.argv[1]);console.log("deck AFTER2 perf="+Math.round(r.categories.performance.score*100),"CLS="+r.audits["cumulative-layout-shift"].displayValue,"LCP="+r.audits["largest-contentful-paint"].displayValue)' "$SCRATCH/lh-after2-deck.json"
```

Expected: **CLS < 0,1**. Arrêter le serveur par PID.

- [ ] **Step 6: Vérif visuelle**

Charger `http://localhost:3001/decks/<DECK>` : plus de saut visible pendant le chargement ; les cartes gardent leur place. Vérifier aussi une autre page utilisant `CardImage` (ex. `/search`) pour non-régression visuelle (le `aspect-ratio` ne doit pas déformer les cartes).

- [ ] **Step 7: Commit**

```bash
git add src/lib/card/components/CardImage/CardImage.module.css
# + le fichier CSS de la zone spinner si modifié au Step 3
git commit -m "perf(deck): reserve card/image dimensions to kill layout shift

Deck CLS was 0.475 — CardImage's container had no reserved height, so cards
jumped as images loaded. Reserve the MTG card aspect-ratio (63/88) up front
so the box has its final size on first paint.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Diagnostic + fix LCP search/deck

**Files:** à déterminer par le diagnostic (probablement CSS/composant du contenu principal search & deck).

**Interfaces:**

- Consumes: mesures après Tasks 1-2.
- Produces: LCP search & deck réduits vers < 2,5 s.

**Contexte :** search (9,4 s) et deck (8,4 s) ont un LCP lent hors Hero. Il faut identifier l'élément LCP exact de chaque page (le fix du Hero ne les concerne pas). Ces pages sont `'use client'` — le contenu principal peut attendre l'hydratation. Diagnostic d'abord, fix ciblé ensuite.

- [ ] **Step 1: Identifier l'élément LCP de search et deck**

Run (serveur 3001 up) :

```bash
SCRATCH="$(git rev-parse --show-toplevel)/.superpowers/sdd"; export CHROME_PATH=/usr/bin/google-chrome
for p in "search:/search" "deck:/decks/<DECK>"; do
  name="${p%%:*}"; path="${p#*:}"
  npx --yes lighthouse "http://localhost:3001$path" --quiet --chrome-flags="--headless --no-sandbox" --only-categories=performance --form-factor=mobile --screenEmulation.mobile --output=json --output-path="$SCRATCH/lh-lcp-$name.json" >/dev/null 2>&1
  node -e 'const r=require(process.argv[1]);const a=r.audits;console.log(process.argv[2],"LCP="+a["largest-contentful-paint"].displayValue,"element:",(a["largest-contentful-paint-element"]?.details?.items?.[0]?.items?.[0]?.node?.snippet||"?").slice(0,90));const opp=Object.entries(a).filter(([,v])=>v.details?.overallSavingsMs>150).map(([,v])=>"+"+Math.round(v.details.overallSavingsMs)+"ms "+v.title);console.log("  opportunités:",opp.join(" | ")||"—")' "$SCRATCH/lh-lcp-$name.json" "$name"
done
```

Expected: l'élément LCP exact + les opportunités par page. **Ce diagnostic dicte le fix.** Documenter dans le rapport et **présenter au contrôleur** (le fix dépend de ce qu'on trouve — ne pas deviner).

- [ ] **Step 2: Appliquer le fix ciblé selon le diagnostic**

Selon l'élément LCP trouvé :

- Si c'est une **image** (ex. cover art deck, première carte) : ajouter `priority` sur le `next/image` correspondant (`CardImage priority` prop existe déjà) pour la charger en avance ; réserver ses dimensions.
- Si c'est un **texte/titre** rendu après hydratation : rendre ce contenu principal côté serveur (comme le `<h1>` SEO) OU retirer un `opacity:0`/animation bloquant équivalent au Hero.
- Si c'est du **JS bloquant** (opportunité `unused javascript` dominante) : voir Task 4 (code splitting).

Le contrôleur choisira le fix précis à partir du diagnostic Step 1 (ce Step est intentionnellement dépendant de la mesure — pas de code figé ici car la cause n'est pas encore connue).

- [ ] **Step 3: Rebuild + re-mesure**

Même procédure de mesure (build → start 3001 → lighthouse search & deck). Cible LCP < 2,5 s.

- [ ] **Step 4: Typecheck + commit**

Run: `npm run check` (PASS), puis commit avec un message décrivant le fix appliqué + les gains LCP mesurés.

---

## Task 4: Gains secondaires (CONDITIONNEL — seulement si < 90 après Tasks 1-3)

**Files:** `src/app/(landing)/components/CardShowcase/CardShowcase.tsx` (lazy), root `layout.tsx` (preconnect/fonts), éventuels `dynamic()` imports.

**Interfaces:**

- Consumes: mesures après Tasks 1-3.

**Contexte :** **Ne PAS exécuter si le vert (90+) est déjà atteint** sur les 3 pages après Tasks 1-3 (YAGNI). Sinon, traiter les opportunités par gain décroissant.

- [ ] **Step 1: Décider si nécessaire**

Comparer les scores après Task 3 aux cibles (90+/LCP<2,5/CLS<0,1). Si atteint sur les 3 pages → **sauter Task 4 entièrement**, documenter et passer à la vérif finale. Sinon continuer.

- [ ] **Step 2: preconnect (gain ~228 ms, sans risque)**

Dans `src/app/layout.tsx`, ajouter dans le `<head>` (via l'API metadata ou des `<link>` dans le layout) des preconnect vers les origines images :

```tsx
// dans le <head> du root layout
<link rel="preconnect" href="https://cards.scryfall.io" />
```

(Utiliser la forme supportée par Next : soit des `<link>` dans le layout body head, soit `export const metadata` ne couvre pas preconnect → utiliser un `<link>` explicite.)

- [ ] **Step 3: lazy images CardShowcase (sous la ligne de flottaison)**

Dans `CardShowcase.tsx`, s'assurer que les `<Image>` ont `loading="lazy"` (ou pas de `priority`) puisqu'elles sont sous le fold. Envisager la résolution `small` au lieu de `normal` si le gain le justifie.

- [ ] **Step 4: code splitting JS (gain ~940 ms — le plus gros mais le plus délicat)**

Identifier les composants lourds non-critiques chargés au 1er rendu et les passer en `dynamic(() => import(...), { ssr: false })` si adapté (modales, panneaux). Cibler via le diagnostic bundle. Mesurer l'impact — ne garder que ce qui améliore réellement.

- [ ] **Step 5: Rebuild + re-mesure finale + commit**

Mesurer les 3 pages. Commit avec les gains. Si le vert est atteint, s'arrêter (ne pas sur-optimiser).

---

## Note dev/prod server (toutes les tasks)

Ne PAS tuer un serveur (dev ou prod) que vous n'avez pas lancé. Le build prod local tourne sur `PORT=3001` (le 3000 peut être occupé par un dev server utilisateur). Tuer uniquement votre `PORT=3001 npm run start` par son PID après chaque mesure. Turbopack/Next peut laisser un process enfant — vérifier avec `lsof -i :3001`.

## Ordre d'exécution

0 (baseline) → 1 (Hero LCP) → mesure → 2 (CLS deck) → mesure → 3 (LCP search/deck, diagnostic-dépendant) → mesure → 4 (conditionnel). **Chaque task se termine par une mesure Lighthouse qui EST son critère de succès.**

## Action ops (post-implémentation)

Déployer en prod, puis re-mesurer via **PageSpeed Insights** (pagespeed.web.dev) sur les URLs réelles pour confirmer les gains sur la vraie infra (Cloudflare inclus). Les scores localhost sont une borne haute ; la prod peut être un peu en dessous.

## Self-Review — couverture spec

- Mesure Lighthouse build-prod-local → Task 0 + steps de mesure de chaque task ✅
- Lot 1 LCP Hero (CSS-first, animations conservées, prefers-reduced-motion) → Task 1 ✅
- Lot 2 CLS deck (aspect-ratio + min-height, diagnostic d'abord) → Task 2 ✅
- Diagnostic LCP search/deck → Task 3 ✅
- Lot 3 gains secondaires conditionnels (preconnect/lazy/splitting/fonts) → Task 4 ✅
- Ne pas toucher Features/CardShowcase/CallToAction animations → Global Constraints + Task 1 scope ✅
- Approche itérative mesure-après-chaque-lot → structure de tout le plan ✅
