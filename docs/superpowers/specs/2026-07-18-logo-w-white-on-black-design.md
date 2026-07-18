# Logo Wizcard — W or en typo « White on Black »

**Date:** 2026-07-18
**Statut:** design validé, prêt pour plan d'implémentation

## Objectif

Doter Wizcard d'un logo cohérent — un **W or sur fond sombre** rendu dans la
police de marque **White on Black** — décliné en icône navigateur/PWA, favicon,
SVG autonome et image de partage social.

Aujourd'hui `src/app/icon.tsx` et `src/app/apple-icon.tsx` rendent déjà un « W »
or `#c9a84c` sur fond `#0a0a0a`, **mais avec la police système** (`fontWeight:700`),
pas la police de marque. `favicon.ico` est le fichier Next.js par défaut. Aucun
SVG autonome ni image Open Graph n'existe.

## Identité visuelle (constantes partagées)

| Token       | Valeur         | Origine                                                  |
| ----------- | -------------- | -------------------------------------------------------- |
| Or (glyphe) | `#c9a84c`      | `theme_color` du manifest existant                       |
| Fond sombre | `#0a0a0a`      | `background_color` du manifest existant                  |
| Police      | White on Black | `src/fonts/brand/white-on-black.ttf` (déjà dans le repo) |

## Livrables

### 1. Icône PWA / navigateur — `src/app/icon.tsx` + `src/app/apple-icon.tsx`

- Conserver la convention Next.js (`ImageResponse` de `next/og`, `size` exporté).
- Charger la police White on Black via `readFileSync('src/fonts/brand/white-on-black.ttf')`
  et la passer à `ImageResponse(..., { fonts: [{ name, data, style, weight }] })`,
  puis appliquer `fontFamily` sur le `<div>`.
  **Raison :** `next/og` ne lit pas les variables CSS de `next/font`; seule
  l'option `fonts` (buffer) fonctionne côté rendu OG.
- Couleurs et tailles inchangées : 512×512 (icon), 180×180 (apple-icon).

### Dépendance & source du tracé (livrables 2 et 3)

- **Nouvelle dépendance dev :** `opentype.js` (JS pur, léger). satori n'est **pas**
  importable seul (compilé dans `@vercel/og`), d'où ce choix validé.
- `opentype.js` charge `white-on-black.ttf`, extrait le contour du glyphe `W`
  (`font.getPath('W', …)`) → un `<path>` SVG unique. Ce tracé sert **à la fois**
  au `logo.svg` vectorisé (livrable 3) et, rasterisé par `sharp`, aux PNG du
  `favicon.ico` (livrable 2).

### 2. `src/app/favicon.ico` — multi-résolution 16/32/48

- Généré par un script Node commité (`scripts/generate-favicon.mjs`), lancé
  manuellement, sortie binaire commitée. **Pas** de génération au build.
- Chaîne : `<path>` du W (via `opentype.js`) composé dans un SVG (W `#c9a84c`,
  fond `#0a0a0a`) → rastérisation `sharp` aux tailles 16/32/48 → empilage dans un
  conteneur `.ico` écrit à la main.
  **Raison :** `sharp` ne sait pas _écrire_ le format ICO (`format.ico.output === false`),
  mais le conteneur ICO est trivial (header 6 o + entrées 16 o + PNG bruts).

### 3. `public/logo.svg` — SVG autonome vectorisé

- Le W est **converti en tracé** (`<path>`), pas en `<text>`.
  **Raison (décision utilisateur validée) :** un `<path>` figé rend à l'identique
  partout sans dépendre de la police installée chez le lecteur.
- Source du tracé : le `<path>` extrait par `opentype.js` ci-dessus, placé sur un
  fond `#0a0a0a`, W `#c9a84c`, viewBox carré.

### 4. `src/app/opengraph-image.tsx` — image de partage 1200×630

- Convention Next.js (`ImageResponse`), auto-injectée dans `<head>` par le
  framework (balises `og:image` / `twitter:image`).
- Contenu : W or (White on Black) + mot « Wizcard » (White on Black) + tagline
  « Search every Magic: The Gathering card, build decks, and track your
  collection. » sur fond `#0a0a0a`.
- Même mécanisme de chargement police (buffer via `fonts`) que le livrable 1.

## Composants & frontières

- **Constantes de marque** (`#c9a84c`, `#0a0a0a`, chemin police) : extraites dans
  un module partagé léger réutilisé par icon/apple-icon/opengraph — évite la
  triplication actuelle des littéraux de couleur.
- **Script de génération** (`scripts/generate-favicon.mjs`) : autonome, unique
  producteur des artefacts binaires (`favicon.ico`, `public/logo.svg`) via
  `opentype.js` + `sharp`. Ne touche pas au runtime de l'app.
- **Routes OG/icône** (`icon.tsx`, `apple-icon.tsx`, `opengraph-image.tsx`) :
  runtime Next.js, ne dépendent que du module de constantes + de la police.

## Vérification

Projet sans framework de test (cf. mémoire `project_no_test_framework`) :

- `npm run check` (TS + ESLint + Prettier) — pas de nouveau problème sur les
  fichiers modifiés (baseline rouge connue, cf. `project_check_red_baseline`).
- Runtime : `npm run dev`, ouvrir `/icon`, `/apple-icon`, `/opengraph-image` →
  vérifier visuellement le W en police White on Black, or sur fond sombre.
- `favicon.ico` : ouvrir le fichier généré (aperçu 16/32/48) et vérifier l'onglet
  navigateur en dev.
- `public/logo.svg` : ouvrir dans un navigateur, vérifier le rendu vectoriel net.

## Hors périmètre

- Pas de refonte du header applicatif ni de la page brand-test.
- Pas de nouvelle couleur de marque (l'or `#c9a84c` existant est conservé).
- Pas de variantes claires/monochromes du logo.
