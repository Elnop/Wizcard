# Brand fonts aléatoires + page brand-test

**Date**: 2026-07-15
**Statut**: Design validé

## Objectif

1. Ajouter 12 fonts custom (récupérées sur DaFont, présentes en `.zip` dans `tmp/fonts/`) au projet.
2. Afficher le logo « Wizcard » (navbar + titre de la landing) avec une font tirée **au hasard**, la **même** aux deux endroits, choisie **une fois par session** ; un clic sur le titre de la landing **re-tire** une nouvelle font.
3. Ajouter une page cachée `/brand-test/logo` qui liste « Wizcard » écrit avec chacune des 12 fonts, pour comparaison visuelle.

## Contexte existant

- Fonts actuelles chargées via `next/font/google` dans `src/app/[locale]/layout.tsx` (Geist, Geist_Mono, Cinzel), exposées en variables CSS sur `<body>`.
- Logo navbar : `src/components/Navbar/Navbar.tsx:63` — `<Link className={styles.logo}>Wizcard</Link>`.
- Titre landing : `src/app/[locale]/(landing)/components/Hero/Hero.tsx:31` — `<h1 className={styles.title}>WIZCARD</h1>`.
- Providers client : `src/contexts/Providers.tsx` (point de montage des contexts).
- Précédent de randomisation client-only sur la landing : `RandomBackdrop` dans `Hero`.
- Pas de framework de test : vérification via `npm run check` + runtime (dev).

## Fonts sources

Fichiers dans `tmp/fonts/*.zip`. On extrait **un seul fichier regular par font** (on ignore shadow/italic/variantes) :

| id (kebab)       | zip                  | fichier retenu       |
| ---------------- | -------------------- | -------------------- |
| augusta          | augusta.zip          | Augusta.ttf          |
| beech            | beech.zip            | BEECH___.TTF         |
| beside-horizon   | beside_horizon.zip   | Beside Horizon.otf   |
| godofwar         | godofwar.zip         | GODOFWAR.TTF         |
| one-slice        | one_slice.zip        | One Slice.otf        |
| roman-antique    | roman_antique.zip    | RomanAntique.ttf     |
| seagram-tfb      | seagram_tfb.zip      | Seagram tfb.ttf      |
| sherwood         | sherwood.zip         | SHERWOOD.TTF         |
| stranger-through | stranger_through.zip | Stranger Through.otf |
| vampire-wars     | vampire_wars.zip     | Vampire Wars.ttf     |
| vengeance-at-sea | vengeance_at_sea.zip | Vengeance at Sea.otf |
| white-on-black   | white_on_black.zip   | White On Black.ttf   |

Les fichiers sont extraits puis **rencommés sans espaces** vers `src/fonts/brand/<id>.<ext>` (ex. `augusta.ttf`, `beside-horizon.otf`). `next/font/local` accepte `.ttf` et `.otf`.

## Architecture

### 1. Registre + chargement — `src/fonts/brand.ts`

- Déclare les 12 fonts via `next/font/local`, chacune avec `variable: '--font-brand-<id>'`, `display: 'swap'`.
- Exporte `BRAND_FONTS: BrandFont[]` où
  `BrandFont = { id: string; label: string; className: string; cssVar: string }`.
  - `cssVar` = la valeur de la variable CSS, ex. `'var(--font-brand-augusta)'`.
  - `label` = nom lisible pour la page brand-test (ex. « Augusta »).
- Exporte `BRAND_FONT_VARIABLES: string` = concat des `.variable` de tous les objets `next/font/local`, à coller sur le `<body>`.
- Source unique de vérité, consommée par l'affichage aléatoire ET la page brand-test.

### 2. Layout — `src/app/[locale]/layout.tsx`

- Importer `BRAND_FONT_VARIABLES` et l'ajouter au `className` du `<body>` à la suite des variables existantes.

### 3. Sélection aléatoire partagée — `src/contexts/BrandFontProvider.tsx`

- Context client `BrandFontProvider` monté dans `Providers`.
- État : `fontId: string | null`, initialisé à `null` (→ SSR et premier render client identiques, **pas de mismatch d'hydratation**).
- `useEffect` au montage :
  - lit `sessionStorage['wizcard-brand-font']` ;
  - si présent **et** correspond à un id connu du registre → l'utilise ;
  - sinon → tire un id au hasard dans `BRAND_FONTS`, le persiste dans `sessionStorage`, l'applique.
- Expose via hook `useBrandFont()` : `{ font: BrandFont | null, reroll: () => void }`.
  - `font` = l'objet `BrandFont` résolu depuis le registre (ou `null` avant montage).
  - `reroll()` = tire un id au hasard **différent de l'actuel si possible**, le persiste, met à jour l'état. Comme le context est partagé, navbar et landing changent ensemble.

### 4. Consommation navbar — `src/components/Navbar/Navbar.tsx`

- `const { font } = useBrandFont();`
- Appliquer `style={{ fontFamily: font?.cssVar }}` sur le `<Link>` du logo.
  Quand `font` est `null` (avant montage), pas de `fontFamily` inline → la font par défaut du `styles.logo` s'applique.

### 5. Consommation + reroll landing — `Hero.tsx`

- `const { font, reroll } = useBrandFont();`
- `<h1 style={{ fontFamily: font?.cssVar }} onClick={reroll}>WIZCARD</h1>`.
- Ajouter `cursor: pointer` (via style ou module) pour signaler que c'est cliquable.
- Accessibilité : le `<h1>` reste un heading ; on ajoute `role="button"` + `tabIndex={0}` + `onKeyDown` (Enter/Espace → reroll) pour rester activable au clavier.

### 6. Page brand-test — `src/app/[locale]/brand-test/logo/page.tsx`

- Route `noindex` : `export const metadata = { robots: { index: false, follow: false } }`.
- Server component simple ; map sur `BRAND_FONTS` ; pour chaque font, rendre un bloc :
  - le `label` de la font (petit, en font par défaut) ;
  - « Wizcard » en grand avec `style={{ fontFamily: font.cssVar }}`.
- Liste verticale lisible, pas de dépendance au provider (affiche les 12 en dur).
- Non liée dans la navigation.

## Data flow

```
sessionStorage ──┐
                 ▼
        BrandFontProvider (client, dans Providers)
          fontId: null → (mount) → random/stored id
                 │
        useBrandFont() → { font, reroll }
           ┌─────┴──────┐
           ▼            ▼
    Navbar logo    Hero <h1> (onClick → reroll → réécrit sessionStorage → tous re-render)
```

La page brand-test ne passe **pas** par le provider : elle lit `BRAND_FONTS` directement (rendu statique des 12).

## Gestion des erreurs / cas limites

- **Hydration mismatch** : évité car `fontId` démarre à `null` (identique SSR/client) et n'est résolu qu'en `useEffect`.
- **sessionStorage indisponible** (SSR, mode privé strict) : tout accès entouré d'un `try/catch` ; en cas d'échec on tire quand même une font en mémoire (pas de persistance, dégradation gracieuse).
- **id persisté obsolète** (font retirée du registre plus tard) : on valide l'id lu contre `BRAND_FONTS` ; si inconnu → re-tirage.
- **reroll avec 1 seule font** : `BRAND_FONTS` en a 12 ; le « différent de l'actuel » retombe sur n'importe lequel si l'ensemble ≤ 1.

## Vérification

- `npm run check` (TS + ESLint + Prettier) passe.
- Runtime dev :
  - landing + navbar affichent « Wizcard » dans une font custom identique après chargement ;
  - clic sur le titre landing → change la font aux deux endroits ;
  - reload de l'onglet (même session) → font conservée ; nouvel onglet → possible nouvelle font ;
  - `/fr/brand-test/logo` liste les 12 échantillons ;
  - aucune erreur d'hydratation en console.

## Fichiers

**Nouveaux**

- `src/fonts/brand/<id>.(ttf|otf)` × 12
- `src/fonts/brand.ts`
- `src/contexts/BrandFontProvider.tsx`
- `src/app/[locale]/brand-test/logo/page.tsx`

**Modifiés**

- `src/app/[locale]/layout.tsx` (variables body)
- `src/contexts/Providers.tsx` (wrap provider)
- `src/components/Navbar/Navbar.tsx` (font logo)
- `src/app/[locale]/(landing)/components/Hero/Hero.tsx` (font titre + reroll)
- `Hero.module.css` (cursor pointer sur le titre, éventuel)

## Hors scope (YAGNI)

- Pas de variantes shadow/italic des fonts.
- Pas de re-tirage temporisé ni persistance longue (localStorage).
- Pas de subsetting manuel des glyphes.
- Pas de lien vers brand-test dans la nav.
