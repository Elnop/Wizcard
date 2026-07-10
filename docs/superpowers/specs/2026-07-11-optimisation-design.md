# Optimisation / Core Web Vitals — Design (wizcard.xyz)

**Date** : 2026-07-11
**Contexte** : Quatrième et dernier des chantiers « mise en production propre »
(sécurité ✅ → légal ✅ → SEO ✅ → **optimisation**). Objectif : faire passer les
Core Web Vitals au vert (90+) sur les pages clés.

## Objectif

Corriger les problèmes de performance mesurés (LCP catastrophique, CLS deck) pour
atteindre des scores Lighthouse 90+ sur landing / search / deck / profil, en
préservant l'esthétique (animations conservées mais rendues non bloquantes).

## Audit initial (Lighthouse mobile, prod, 2026-07-11)

| Page    | Perf  | LCP      | CLS          | TBT       |
| ------- | ----- | -------- | ------------ | --------- |
| Landing | 🟠 76 | 🔴 7,1 s | 🟢 0         | 🟢 40 ms  |
| Search  | 🟠 70 | 🔴 9,4 s | 🟢 0,034     | 🟠 240 ms |
| Deck    | 🔴 51 | 🔴 8,4 s | 🔴 **0,475** | 🟢 120 ms |

Seuils Core Web Vitals : LCP < 2,5 s | CLS < 0,1 | INP/TBT bas.

### Causes identifiées (données réelles)

- **LCP landing** : l'élément LCP est `<p class="tagline">` (Hero). Le Hero
  démarre en `opacity: 0` (CSS `.hero .content`) et n'est révélé que par
  `useInView` (hook **client**) ajoutant `.visible`, + transition 1,2 s + delays.
  Pour un contenu above-the-fold, l'affichage attend hydratation JS + animation →
  LCP 7 s.
- **LCP search/deck** : pages `'use client'`, contenu principal attend
  l'hydratation. `+940 ms` de JS inutilisé sur la landing (bundle/splitting).
- **CLS deck 0,475** : le `<h1>` SEO off-screen est innocenté (`position:absolute`
  - `clip`). Cause réelle : images de cartes sans dimensions réservées et/ou
    transition spinner→contenu sans espace réservé.
- **Pattern animation** : `useInView` + `opacity:0` + `.visible` utilisé dans 4
  composants landing : Hero, Features, CardShowcase, CallToAction. La page
  `(landing)/page.tsx` est un **server component** ; ces 4 enfants sont clients.

## Décisions actées

- **Mesure** : Lighthouse local (Chrome `/usr/bin/google-chrome`) sur la **prod**,
  mobile, `--only-categories=performance`. `npx lighthouse` (pas de dépendance
  ajoutée au projet).
- **Ambition** : viser 90+ partout, sans sur-optimiser (YAGNI si le vert est
  atteint plus tôt).
- **Animations** : **conservées** mais rendues non bloquantes. Le Hero
  (above-the-fold) s'affiche **instantanément** via animation **CSS-first** (plus
  de dépendance à `useInView` pour la visibilité initiale). Les 3 composants plus
  bas (Features, CardShowcase, CallToAction) **gardent** `useInView` (animation au
  scroll légitime, hors LCP).
- **CLS deck** : priorité haute — réserver les dimensions en amont.
- **Approche itérative** : corriger un lot → **re-mesurer Lighthouse** → ajuster.
  Le plan aura des étapes de mesure entre les lots.

## Lot 1 — Fix LCP Hero (above-the-fold, CSS-first)

**Problème** : `.hero .content { opacity: 0 }` révélé par la classe `.visible`
ajoutée par `useInView` (JS client). Le texte LCP attend hydratation + transition.

**Fix** : rendre l'affichage initial du Hero indépendant du JS.

- Le contenu du Hero est **visible dès le rendu serveur** (pas d'`opacity: 0`
  bloquant).
- L'animation d'entrée joue via **CSS `@keyframes` / `animation`** (déclenchée au
  chargement, sans JS) plutôt que via `opacity:0 → .visible` piloté par
  `useInView`. Option : `animation` avec état final visible, ou l'anim ne modifie
  que `transform` (pas l'opacité) pour que le texte soit peint immédiatement.
- Retirer la dépendance de la **visibilité** du Hero à `useInView` (le hook peut
  rester pour un effet non bloquant, ou être retiré du Hero si inutile).
- **Contrainte** : préserver l'aspect visuel (l'apparition doit rester agréable —
  transform/subtil, mais le texte visible immédiatement).

**Mesure** : re-Lighthouse landing → LCP doit chuter nettement (cible < 2,5 s).

## Lot 2 — Fix CLS deck (réserver les dimensions)

**Problème** : CLS 0,475 sur `/decks/[id]` — contenu qui saute au chargement.

**Fix** : réserver l'espace avant l'arrivée du contenu.

- **Images de cartes** : fixer un `aspect-ratio` constant (carte MTG ≈ 745×1040,
  ratio ≈ 0,716) sur le conteneur d'image, pour que la place soit réservée dès le
  rendu (avant chargement de l'image). Localiser le composant d'image de carte
  utilisé sur la page deck (probablement un composant partagé sous
  `DeckDetailReadOnlyView`/`DeckDetailOwnerView`).
- **Transition spinner → contenu** : réserver une `min-height` sur le conteneur
  principal (ou squelette de dimension équivalente) pour que le passage
  spinner→deck ne provoque pas de saut.

**Diagnostic à l'implémentation** : Lighthouse `layout-shift-elements` liste les
nœuds qui shiftent — cibler précisément.

**Mesure** : re-Lighthouse deck → CLS < 0,1.

## Lot 3 — Gains secondaires (après mesure des Lots 1-2)

À traiter **seulement si** le vert n'est pas déjà atteint après Lots 1-2 (YAGNI).
Opportunités Lighthouse (landing), par gain estimé :

- **`+940 ms` JS inutilisé** : code splitting via `dynamic()` pour composants
  non-critiques (modales, panneaux lourds) ; vérifier qu'aucune grosse lib n'est
  importée en entier. Cibler via analyse du bundle.
- **`+392 ms` ressources bloquantes** + **`+190 ms` CSS inutilisé**.
- **`+228 ms` preconnect** : `<link rel="preconnect">` vers `cards.scryfall.io` +
  origine Supabase.
- **Images CardShowcase** (~8 × ~90 Ko Scryfall `normal`, sous la ligne de
  flottaison) : `loading="lazy"` + envisager résolution `small`.
- **Fonts** : `Cinzel` a `display: swap` ✅ ; vérifier/ajouter pour Geist ;
  `preload` de la font du LCP si utile.

## Ordre d'exécution

1. **Lot 1** (LCP Hero) → mesure.
2. **Lot 2** (CLS deck) → mesure.
3. **Diagnostic LCP search/deck** (élément LCP exact) → fix ciblé → mesure.
4. **Lot 3** (gains secondaires) seulement si nécessaire pour atteindre 90+.

## Contraintes

- Préserver l'esthétique (animations conservées, juste non bloquantes above-the-fold).
- Pas de nouvelle dépendance npm runtime (Lighthouse en `npx`, hors deps projet).
- Suivre les conventions (CSS Modules, `next/image`, composants existants).
- Ne pas réécrire la logique métier — optimisations ciblées.
- Pas de framework de test — vérif via `npm run check` + **Lighthouse** (le
  « test » de ce chantier = les scores mesurés) + runtime navigateur (rendu
  visuel préservé).

## Vérification

- `npm run check` (tsc + eslint + prettier).
- **Lighthouse mobile prod** avant/après chaque lot : LCP, CLS, TBT, Perf global.
  Cible : Perf 90+, LCP < 2,5 s, CLS < 0,1 sur landing / search / deck.
- Runtime navigateur : le Hero s'affiche immédiatement ET l'animation reste
  agréable ; pas de saut visible sur la page deck ; aucune régression visuelle.

## Note (mesure vs prod)

Lighthouse mesure la **prod déployée**. Les fixes doivent être **déployés** pour
que la re-mesure reflète le changement — OU mesurés en local via un build de
production (`npm run build && npm run start`) sur `localhost` pour itérer sans
déployer. Le plan précisera : itérer en local sur un build prod, déployer une fois
le vert atteint, re-mesurer en prod pour confirmer.
