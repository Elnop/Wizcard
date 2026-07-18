# Logo Wizcard (W or, White on Black) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Doter Wizcard d'un W or (`#c9a84c`) sur fond sombre (`#0a0a0a`) rendu dans la police de marque « White on Black », décliné en icône PWA/navigateur, favicon multi-résolution, SVG autonome vectorisé et image Open Graph.

**Architecture:** Un module de constantes de marque partagé alimente trois routes Next.js (`icon`, `apple-icon`, `opengraph-image`) qui rendent le W via `next/og` `ImageResponse` en chargeant la police en buffer (option `fonts`). Un script `tsx` autonome (`scripts/generate-logo.ts`) extrait le contour du glyphe `W` avec `opentype.js`, produit `public/logo.svg` (vectorisé) et empile des PNG `sharp` dans un `favicon.ico` écrit à la main.

**Tech Stack:** Next.js (App Router, `next/og`), `next/font/local` (déjà en place), `opentype.js` (nouvelle dép dev), `sharp` (promu en dép directe), `tsx` (runner déjà présent).

## Global Constraints

- Or (glyphe) : `#c9a84c` — verbatim, = `theme_color` du manifest existant.
- Fond sombre : `#0a0a0a` — verbatim, = `background_color` du manifest.
- Police : `src/fonts/brand/white-on-black.ttf` (déjà dans le repo).
- Pas de nouvelle couleur de marque ; pas de variante claire/monochrome.
- `npm run check` = TS + ESLint + Prettier. Baseline ROUGE connue (~60 problèmes pré-existants) : le critère est **aucun NOUVEAU problème** sur les fichiers touchés (vérifier via `npx eslint <fichier>` + `npx tsc --noEmit`). Pas de framework de test — vérification runtime.
- Scripts Node du repo = `.ts` lancés via `tsx` (cf. `scripts/verify-schema.ts`, `sb:verify`). Suivre cette convention.
- `ImageResponse(element, { ...size, fonts: [{ name, data, weight, style }] })` : `data` est un `ArrayBuffer`/`Buffer` de la police ; `next/og` NE lit PAS les variables CSS de `next/font`.

---

### Task 1: Module de constantes de marque + police en buffer

Extrait les littéraux dupliqués (couleurs, chargement police) dans un module partagé serveur, consommé ensuite par icon/apple-icon/opengraph-image.

**Files:**

- Create: `src/app/_brand/logo-assets.ts`

**Interfaces:**

- Produces:
  - `export const LOGO_GOLD = '#c9a84c'`
  - `export const LOGO_BG = '#0a0a0a'`
  - `export const BRAND_TAGLINE = 'Search every Magic: The Gathering card, build decks, and track your collection.'`
  - `export function loadWhiteOnBlack(): { name: string; data: Buffer; weight: 400; style: 'normal' }` — lit `src/fonts/brand/white-on-black.ttf` via `readFileSync` (chemin résolu depuis `process.cwd()`), renvoie l'objet prêt pour `ImageResponse`'s `fonts`. `name: 'White on Black'`.

- [ ] **Step 1: Créer le module**

```ts
// src/app/_brand/logo-assets.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Or de marque (= theme_color du manifest). */
export const LOGO_GOLD = '#c9a84c';
/** Fond sombre de marque (= background_color du manifest). */
export const LOGO_BG = '#0a0a0a';
/** Tagline courte pour l'image Open Graph. */
export const BRAND_TAGLINE =
	'Search every Magic: The Gathering card, build decks, and track your collection.';

/** Nom de font-family exposé aux rendus next/og. */
export const WHITE_ON_BLACK_FAMILY = 'White on Black';

/**
 * Charge la police de marque White on Black en buffer, prête pour l'option
 * `fonts` de `ImageResponse`. next/og ne lit pas les variables CSS de next/font,
 * il faut lui passer le buffer directement.
 */
export function loadWhiteOnBlack(): {
	name: string;
	data: Buffer;
	weight: 400;
	style: 'normal';
} {
	const data = readFileSync(join(process.cwd(), 'src/fonts/brand/white-on-black.ttf'));
	return { name: WHITE_ON_BLACK_FAMILY, data, weight: 400, style: 'normal' };
}
```

- [ ] **Step 2: Vérifier lint + types sur le nouveau fichier**

Run: `cd /home/elthinkbuntu/Documents/Wizcard && npx eslint src/app/_brand/logo-assets.ts && npx tsc --noEmit`
Expected: aucune erreur imputable à ce fichier.

- [ ] **Step 3: Commit**

```bash
git add src/app/_brand/logo-assets.ts
git commit -m "feat(logo): shared brand constants + White on Black font loader"
```

---

### Task 2: Icône PWA/navigateur en police White on Black

Remplace le rendu font-système actuel de `icon.tsx` et `apple-icon.tsx` par la police de marque, via le module de la Task 1.

**Files:**

- Modify: `src/app/icon.tsx` (réécriture complète)
- Modify: `src/app/apple-icon.tsx` (réécriture complète)

**Interfaces:**

- Consumes (Task 1): `LOGO_GOLD`, `LOGO_BG`, `WHITE_ON_BLACK_FAMILY`, `loadWhiteOnBlack`.

- [ ] **Step 1: Réécrire `src/app/icon.tsx`**

```tsx
import { ImageResponse } from 'next/og';
import { LOGO_BG, LOGO_GOLD, WHITE_ON_BLACK_FAMILY, loadWhiteOnBlack } from './_brand/logo-assets';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
	return new ImageResponse(
		<div
			style={{
				width: '100%',
				height: '100%',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				background: LOGO_BG,
				color: LOGO_GOLD,
				fontFamily: WHITE_ON_BLACK_FAMILY,
				fontSize: 340,
			}}
		>
			W
		</div>,
		{ ...size, fonts: [loadWhiteOnBlack()] }
	);
}
```

- [ ] **Step 2: Réécrire `src/app/apple-icon.tsx`** (identique sauf tailles)

```tsx
import { ImageResponse } from 'next/og';
import { LOGO_BG, LOGO_GOLD, WHITE_ON_BLACK_FAMILY, loadWhiteOnBlack } from './_brand/logo-assets';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
	return new ImageResponse(
		<div
			style={{
				width: '100%',
				height: '100%',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				background: LOGO_BG,
				color: LOGO_GOLD,
				fontFamily: WHITE_ON_BLACK_FAMILY,
				fontSize: 120,
			}}
		>
			W
		</div>,
		{ ...size, fonts: [loadWhiteOnBlack()] }
	);
}
```

- [ ] **Step 3: Vérifier lint + types**

Run: `cd /home/elthinkbuntu/Documents/Wizcard && npx eslint src/app/icon.tsx src/app/apple-icon.tsx && npx tsc --noEmit`
Expected: aucune erreur imputable à ces fichiers.

- [ ] **Step 4: Vérifier le rendu runtime**

Run: `cd /home/elthinkbuntu/Documents/Wizcard && npm run dev` (dans un terminal), puis dans un autre : `curl -sS -o /tmp/icon.png http://localhost:3000/icon && file /tmp/icon.png`
Expected: `PNG image data, 512 x 512`. Ouvrir `/tmp/icon.png` : W or en police White on Black (galbe distinct du font système) sur fond sombre. Idem `curl .../apple-icon` → `180 x 180`. Arrêter le dev server.

- [ ] **Step 5: Commit**

```bash
git add src/app/icon.tsx src/app/apple-icon.tsx
git commit -m "feat(logo): render PWA icons in White on Black brand font"
```

---

### Task 3: Image Open Graph 1200×630

Nouvelle route `opengraph-image.tsx` : W or + « Wizcard » + tagline, auto-injectée par Next.js dans les balises `og:image`/`twitter:image`.

**Files:**

- Create: `src/app/opengraph-image.tsx`

**Interfaces:**

- Consumes (Task 1): `LOGO_GOLD`, `LOGO_BG`, `WHITE_ON_BLACK_FAMILY`, `BRAND_TAGLINE`, `loadWhiteOnBlack`.

- [ ] **Step 1: Créer `src/app/opengraph-image.tsx`**

```tsx
import { ImageResponse } from 'next/og';
import {
	BRAND_TAGLINE,
	LOGO_BG,
	LOGO_GOLD,
	WHITE_ON_BLACK_FAMILY,
	loadWhiteOnBlack,
} from './_brand/logo-assets';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Wizcard — Magic: The Gathering Card Search';

export default function OpengraphImage() {
	return new ImageResponse(
		<div
			style={{
				width: '100%',
				height: '100%',
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				gap: 24,
				background: LOGO_BG,
				color: LOGO_GOLD,
				fontFamily: WHITE_ON_BLACK_FAMILY,
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
				<span style={{ fontSize: 200, lineHeight: 1 }}>W</span>
				<span style={{ fontSize: 140, lineHeight: 1 }}>Wizcard</span>
			</div>
			<div style={{ fontSize: 34, color: '#e5e5e5', maxWidth: 900, textAlign: 'center' }}>
				{BRAND_TAGLINE}
			</div>
		</div>,
		{ ...size, fonts: [loadWhiteOnBlack()] }
	);
}
```

- [ ] **Step 2: Vérifier lint + types**

Run: `cd /home/elthinkbuntu/Documents/Wizcard && npx eslint src/app/opengraph-image.tsx && npx tsc --noEmit`
Expected: aucune erreur imputable à ce fichier.

- [ ] **Step 3: Vérifier le rendu runtime**

Run: `npm run dev`, puis `curl -sS -o /tmp/og.png http://localhost:3000/opengraph-image && file /tmp/og.png`
Expected: `PNG image data, 1200 x 630`. Ouvrir `/tmp/og.png` : W or + « Wizcard » en White on Black + tagline grise centrée sur fond sombre. Arrêter le dev server.

- [ ] **Step 4: Commit**

```bash
git add src/app/opengraph-image.tsx
git commit -m "feat(logo): add Open Graph share image"
```

---

### Task 4: Dépendances du script de génération

Ajoute `opentype.js` (dev) et promeut `sharp` en dépendance directe (aujourd'hui transitive), + le script npm `logo:generate`.

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Installer les dépendances**

Run:

```bash
cd /home/elthinkbuntu/Documents/Wizcard
npm install --save-dev opentype.js @types/opentype.js
npm install sharp
```

Expected: install OK, `package.json` + `package-lock.json` mis à jour. NE PAS éditer `package-lock.json` à la main (cf. mémoire `project_deploy_npm_ci_lockfile`).

- [ ] **Step 2: Ajouter le script npm**

Modifier `package.json`, section `scripts`, ajouter après `"ingest"` :

```json
		"logo:generate": "tsx scripts/generate-logo.ts",
```

- [ ] **Step 3: Vérifier**

Run: `cd /home/elthinkbuntu/Documents/Wizcard && node -e "require('opentype.js'); require('sharp'); console.log('deps OK')"`
Expected: `deps OK`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(logo): add opentype.js + sharp deps and logo:generate script"
```

---

### Task 5: Script de génération — `logo.svg` vectorisé

Le script extrait le contour du glyphe `W` de la police et écrit `public/logo.svg` (W en `<path>`, fond sombre carré).

**Files:**

- Create: `scripts/generate-logo.ts`
- Create (généré): `public/logo.svg`

**Interfaces:**

- Consumes: police `src/fonts/brand/white-on-black.ttf`, constantes `#c9a84c` / `#0a0a0a`.
- Produces (utilisé par Task 6, même fichier) : fonction interne `buildGlyphSvg(px: number): string` renvoyant un SVG carré `px`×`px` (fond `LOGO_BG`, W `LOGO_GOLD`) avec le glyphe centré ; constante `W_PATH` (données de path). Task 6 réutilise `buildGlyphSvg` pour rasteriser.

- [ ] **Step 1: Écrire le script (partie SVG)**

```ts
/**
 * generate-logo.ts — Génère les artefacts binaires du logo Wizcard.
 *
 * Lancé via `npm run logo:generate`. Extrait le contour du glyphe « W » de la
 * police de marque White on Black (opentype.js) et produit :
 *   - public/logo.svg      (W vectorisé en <path>, or sur fond sombre)
 *   - src/app/favicon.ico  (multi-résolution 16/32/48, via sharp — Task 6)
 *
 * Rendu identique partout : le W est figé en <path>, indépendant de la police
 * installée chez le lecteur.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import opentype from 'opentype.js';

const GOLD = '#c9a84c';
const BG = '#0a0a0a';
const FONT_PATH = join(process.cwd(), 'src/fonts/brand/white-on-black.ttf');

const font = opentype.loadSync(FONT_PATH);

/**
 * Construit un SVG carré px×px : fond sombre + glyphe « W » or centré.
 * Le glyphe est dessiné à une taille de police qui le fait tenir dans ~72% du
 * canevas, puis recentré via sa bounding box réelle.
 */
function buildGlyphSvg(px: number): string {
	const fontSize = px * 0.8;
	// getPath(text, x, y, fontSize) : y est la ligne de base.
	const probe = font.getPath('W', 0, 0, fontSize);
	const bb = probe.getBoundingBox(); // {x1,y1,x2,y2}
	const glyphW = bb.x2 - bb.x1;
	const glyphH = bb.y2 - bb.y1;
	const x = (px - glyphW) / 2 - bb.x1;
	const y = (px - glyphH) / 2 - bb.y1;
	const path = font.getPath('W', x, y, fontSize);
	const d = path.toPathData(2);
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">`,
		`<rect width="${px}" height="${px}" fill="${BG}"/>`,
		`<path d="${d}" fill="${GOLD}"/>`,
		`</svg>`,
	].join('');
}

function writeLogoSvg(): void {
	const svg = buildGlyphSvg(512);
	writeFileSync(join(process.cwd(), 'public/logo.svg'), svg + '\n');
	console.log('✓ public/logo.svg');
}

writeLogoSvg();

export { buildGlyphSvg };
```

- [ ] **Step 2: Lancer le script**

Run: `cd /home/elthinkbuntu/Documents/Wizcard && npm run logo:generate`
Expected: `✓ public/logo.svg`, fichier créé.

- [ ] **Step 3: Vérifier le SVG**

Run: `cd /home/elthinkbuntu/Documents/Wizcard && head -c 200 public/logo.svg && echo && grep -c '<path' public/logo.svg`
Expected: commence par `<svg ... 512 512>`, contient un `<rect fill="#0a0a0a">` et exactement `1` `<path fill="#c9a84c">`. Ouvrir `public/logo.svg` dans un navigateur : W or centré, net, sur fond sombre carré. Vérifier que le W n'est pas rogné ni décentré.

- [ ] **Step 4: Vérifier lint sur le script**

Run: `cd /home/elthinkbuntu/Documents/Wizcard && npx eslint scripts/generate-logo.ts`
Expected: aucune erreur imputable à ce fichier (ajouter un `eslint-disable` ciblé en tête seulement si une règle repo l'exige, à l'image de `verify-schema.ts`).

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-logo.ts public/logo.svg
git commit -m "feat(logo): generate vectorized logo.svg from W glyph"
```

---

### Task 6: Script de génération — `favicon.ico` multi-résolution

Étend le script pour rasteriser le SVG du W aux tailles 16/32/48 (sharp) et les empiler dans un conteneur `.ico` écrit à la main, remplaçant `src/app/favicon.ico`.

**Files:**

- Modify: `scripts/generate-logo.ts`
- Modify (remplacé, binaire): `src/app/favicon.ico`

**Interfaces:**

- Consumes (Task 5, même fichier): `buildGlyphSvg(px)`.

- [ ] **Step 1: Ajouter l'empaquetage ICO au script**

Ajouter en haut l'import sharp, et remplacer la ligne `writeLogoSvg();` par un `main()` qui écrit les deux artefacts.

```ts
import sharp from 'sharp';
```

Ajouter avant l'appel final :

```ts
/**
 * Empile des PNG carrés (déjà encodés) dans un unique conteneur .ico.
 * Format ICO : header 6 o + N entrées de 16 o + les PNG bruts concaténés.
 * On stocke les PNG tels quels (ICO accepte du PNG embarqué depuis Vista).
 */
function buildIco(images: { size: number; png: Buffer }[]): Buffer {
	const header = Buffer.alloc(6);
	header.writeUInt16LE(0, 0); // reserved
	header.writeUInt16LE(1, 2); // type 1 = icon
	header.writeUInt16LE(images.length, 4);

	const entries: Buffer[] = [];
	const pngs: Buffer[] = [];
	let offset = 6 + images.length * 16;
	for (const { size, png } of images) {
		const entry = Buffer.alloc(16);
		entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
		entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
		entry.writeUInt8(0, 2); // palette count
		entry.writeUInt8(0, 3); // reserved
		entry.writeUInt16LE(1, 4); // color planes
		entry.writeUInt16LE(32, 6); // bits per pixel
		entry.writeUInt32LE(png.length, 8); // data size
		entry.writeUInt32LE(offset, 12); // data offset
		offset += png.length;
		entries.push(entry);
		pngs.push(png);
	}
	return Buffer.concat([header, ...entries, ...pngs]);
}

async function writeFaviconIco(): Promise<void> {
	const sizes = [16, 32, 48];
	const images = await Promise.all(
		sizes.map(async (size) => ({
			size,
			png: await sharp(Buffer.from(buildGlyphSvg(size)))
				.png()
				.toBuffer(),
		}))
	);
	const ico = buildIco(images);
	writeFileSync(join(process.cwd(), 'src/app/favicon.ico'), ico);
	console.log('✓ src/app/favicon.ico');
}
```

Remplacer `writeLogoSvg();` (fin du fichier) par :

```ts
async function main(): Promise<void> {
	writeLogoSvg();
	await writeFaviconIco();
}

void main();
```

- [ ] **Step 2: Régénérer**

Run: `cd /home/elthinkbuntu/Documents/Wizcard && npm run logo:generate`
Expected: `✓ public/logo.svg` puis `✓ src/app/favicon.ico`.

- [ ] **Step 3: Vérifier l'ICO**

Run: `cd /home/elthinkbuntu/Documents/Wizcard && file src/app/favicon.ico`
Expected: `MS Windows icon resource - 3 icons, 16x16 ... 48x48 ...`. Si `file` ne détaille pas, vérifier à l'œil en dev (Step 4).

- [ ] **Step 4: Vérifier le favicon en navigateur**

Run: `npm run dev`, ouvrir `http://localhost:3000` dans un navigateur, regarder l'onglet.
Expected: le W or (White on Black) apparaît comme favicon de l'onglet (au lieu du favicon Next par défaut). Vider le cache si besoin. Arrêter le dev server.

- [ ] **Step 5: Vérifier lint + types du script**

Run: `cd /home/elthinkbuntu/Documents/Wizcard && npx eslint scripts/generate-logo.ts && npx tsc --noEmit`
Expected: aucune erreur imputable à ce fichier.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-logo.ts src/app/favicon.ico
git commit -m "feat(logo): generate multi-resolution favicon.ico from W glyph"
```

---

### Task 7: Vérification finale d'ensemble

- [ ] **Step 1: `npm run check` — pas de nouveau problème**

Run: `cd /home/elthinkbuntu/Documents/Wizcard && npm run check 2>&1 | tail -30`
Expected: baseline rouge connue tolérée ; AUCUN nouveau problème pointant vers `src/app/_brand/logo-assets.ts`, `icon.tsx`, `apple-icon.tsx`, `opengraph-image.tsx`, `scripts/generate-logo.ts`. En cas de doute, `npx eslint <chacun de ces fichiers>` → propre.

- [ ] **Step 2: Revue visuelle finale**

Ouvrir côte à côte : `/tmp/icon.png`, `/tmp/og.png`, `public/logo.svg`, et l'onglet navigateur (favicon). Confirmer cohérence : même W or `#c9a84c`, même police White on Black, même fond `#0a0a0a` partout.

- [ ] **Step 3: Rien à committer ici** (vérification seule). Si un ajustement s'impose, revenir à la task concernée.
