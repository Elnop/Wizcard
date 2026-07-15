# Brand Fonts Random Logo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Charger 12 fonts custom, afficher le logo « Wizcard » (navbar + hero landing) dans une font tirée au hasard une fois par session (re-roll au clic sur le titre landing), et ajouter une page cachée `/brand-test/logo` montrant chaque font en situation navbar / hero / icône favicon.

**Architecture:** Fonts self-hostées via `next/font/local` regroupées dans un registre unique (`src/fonts/brand.ts`). Un context client (`BrandFontProvider`) tire une font au hasard au montage (persistée en `sessionStorage`), partagée par navbar et hero via `useBrandFont()`. La font démarre à `null` au SSR/premier render pour éviter tout mismatch d'hydratation, puis est résolue en `useEffect`. La page brand-test est un server component autonome qui lit le registre en dur.

**Tech Stack:** Next.js App Router (RSC + client components), `next/font/local`, React context, CSS Modules, TypeScript strict.

## Global Constraints

- Pas de framework de test dans ce projet. La vérification de chaque tâche = `npm run check` (TypeScript + ESLint + Prettier) qui doit passer, + vérification runtime en dev quand indiqué. Ne jamais écrire de test unitaire (vitest/jest absents).
- `npm run check` doit passer avant chaque commit.
- Toute nouvelle route vit sous `src/app/[locale]/` (i18n par locale). Ne pas créer de route hors `[locale]`.
- La page brand-test doit être `noindex` et n'être liée nulle part dans la navigation.
- Couleur or du thème = variable CSS `--gold` (`#c9a84c`), déjà définie dans `src/app/globals.css`.
- Une seule variante regular par font (ignorer shadow/italic/autres fichiers des zips).
- Le logo navbar utilise un dégradé or via `background-clip: text` (`.logo` dans `Navbar.module.css`) : on ne change QUE `font-family` en inline, le dégradé reste.

---

## File Structure

**Nouveaux :**

- `src/fonts/brand/<id>.(ttf|otf)` × 12 — fichiers de fonts extraits des zips, renommés sans espaces.
- `src/fonts/brand.ts` — déclarations `next/font/local` + registre `BRAND_FONTS` + `BRAND_FONT_VARIABLES`. Source unique de vérité.
- `src/contexts/BrandFontProvider.tsx` — context client + hook `useBrandFont()`.
- `src/app/[locale]/brand-test/logo/page.tsx` — page de test (server component).
- `src/app/[locale]/brand-test/logo/page.module.css` — styles des maquettes navbar/hero/favicon.

**Modifiés :**

- `src/app/[locale]/layout.tsx` — ajout de `BRAND_FONT_VARIABLES` au `<body>`.
- `src/contexts/Providers.tsx` — wrap avec `BrandFontProvider`.
- `src/components/Navbar/Navbar.tsx` — logo consomme `useBrandFont()`.
- `src/app/[locale]/(landing)/components/Hero/Hero.tsx` — titre consomme `useBrandFont()` + reroll au clic.
- `src/app/[locale]/(landing)/components/Hero/Hero.module.css` — `cursor: pointer` sur le titre.

---

## Task 1: Extraire et installer les fichiers de fonts

**Files:**

- Create: `src/fonts/brand/augusta.ttf`, `beech.ttf`, `beside-horizon.otf`, `godofwar.ttf`, `one-slice.otf`, `roman-antique.ttf`, `seagram-tfb.ttf`, `sherwood.ttf`, `stranger-through.otf`, `vampire-wars.ttf`, `vengeance-at-sea.otf`, `white-on-black.ttf`

**Interfaces:**

- Consumes: les zips dans `tmp/fonts/`.
- Produces: 12 fichiers de fonts au chemin `src/fonts/brand/<id>.<ext>`, consommés par la Task 2.

- [ ] **Step 1: Créer le dossier cible et extraire chaque font regular renommée**

Chaque zip contient parfois plusieurs fichiers ; on n'extrait que le fichier regular listé, renommé vers `<id>.<ext>` (id kebab-case). Les noms de fichiers sources contiennent des espaces → guillemets obligatoires.

```bash
cd /home/elthinkbuntu/Documents/Wizcard
mkdir -p src/fonts/brand
unzip -p tmp/fonts/augusta.zip "Augusta.ttf" > src/fonts/brand/augusta.ttf
unzip -p tmp/fonts/beech.zip "BEECH___.TTF" > src/fonts/brand/beech.ttf
unzip -p tmp/fonts/beside_horizon.zip "Beside Horizon.otf" > src/fonts/brand/beside-horizon.otf
unzip -p tmp/fonts/godofwar.zip "GODOFWAR.TTF" > src/fonts/brand/godofwar.ttf
unzip -p tmp/fonts/one_slice.zip "One Slice.otf" > src/fonts/brand/one-slice.otf
unzip -p tmp/fonts/roman_antique.zip "RomanAntique.ttf" > src/fonts/brand/roman-antique.ttf
unzip -p tmp/fonts/seagram_tfb.zip "Seagram tfb.ttf" > src/fonts/brand/seagram-tfb.ttf
unzip -p tmp/fonts/sherwood.zip "SHERWOOD.TTF" > src/fonts/brand/sherwood.ttf
unzip -p tmp/fonts/stranger_through.zip "Stranger Through.otf" > src/fonts/brand/stranger-through.otf
unzip -p tmp/fonts/vampire_wars.zip "Vampire Wars.ttf" > src/fonts/brand/vampire-wars.ttf
unzip -p tmp/fonts/vengeance_at_sea.zip "Vengeance at Sea.otf" > src/fonts/brand/vengeance-at-sea.otf
unzip -p tmp/fonts/white_on_black.zip "White On Black.ttf" > src/fonts/brand/white-on-black.ttf
```

- [ ] **Step 2: Vérifier que les 12 fichiers existent et ne sont pas vides**

Run:

```bash
cd /home/elthinkbuntu/Documents/Wizcard && ls -l src/fonts/brand/ && find src/fonts/brand -size 0
```

Expected: 12 fichiers listés, chacun avec une taille > 0 ; la commande `find -size 0` ne retourne **rien** (aucun fichier vide → toutes les extractions ont réussi).

- [ ] **Step 3: Commit**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
git add src/fonts/brand/
git commit -m "feat: add 12 custom brand font files"
```

---

## Task 2: Registre des fonts (`src/fonts/brand.ts`)

**Files:**

- Create: `src/fonts/brand.ts`

**Interfaces:**

- Consumes: les 12 fichiers de la Task 1.
- Produces:
  - `type BrandFont = { id: string; label: string; cssVar: string }`
  - `const BRAND_FONTS: BrandFont[]` (12 entrées, ordre = celui du tableau ci-dessous)
  - `const BRAND_FONT_VARIABLES: string` (chaîne de classes variable à mettre sur `<body>`)
  - `function getBrandFontById(id: string): BrandFont | undefined`

- [ ] **Step 1: Écrire le fichier registre**

`next/font/local` doit être appelé au niveau module (contrainte Next). On déclare 12 constantes puis on construit le registre. `cssVar` référence la variable CSS (`var(--font-brand-<id>)`), pas la className.

```typescript
import localFont from 'next/font/local';

const augusta = localFont({
	src: './brand/augusta.ttf',
	variable: '--font-brand-augusta',
	display: 'swap',
});
const beech = localFont({
	src: './brand/beech.ttf',
	variable: '--font-brand-beech',
	display: 'swap',
});
const besideHorizon = localFont({
	src: './brand/beside-horizon.otf',
	variable: '--font-brand-beside-horizon',
	display: 'swap',
});
const godofwar = localFont({
	src: './brand/godofwar.ttf',
	variable: '--font-brand-godofwar',
	display: 'swap',
});
const oneSlice = localFont({
	src: './brand/one-slice.otf',
	variable: '--font-brand-one-slice',
	display: 'swap',
});
const romanAntique = localFont({
	src: './brand/roman-antique.ttf',
	variable: '--font-brand-roman-antique',
	display: 'swap',
});
const seagramTfb = localFont({
	src: './brand/seagram-tfb.ttf',
	variable: '--font-brand-seagram-tfb',
	display: 'swap',
});
const sherwood = localFont({
	src: './brand/sherwood.ttf',
	variable: '--font-brand-sherwood',
	display: 'swap',
});
const strangerThrough = localFont({
	src: './brand/stranger-through.otf',
	variable: '--font-brand-stranger-through',
	display: 'swap',
});
const vampireWars = localFont({
	src: './brand/vampire-wars.ttf',
	variable: '--font-brand-vampire-wars',
	display: 'swap',
});
const vengeanceAtSea = localFont({
	src: './brand/vengeance-at-sea.otf',
	variable: '--font-brand-vengeance-at-sea',
	display: 'swap',
});
const whiteOnBlack = localFont({
	src: './brand/white-on-black.ttf',
	variable: '--font-brand-white-on-black',
	display: 'swap',
});

export type BrandFont = {
	/** Identifiant stable, kebab-case. Persisté en sessionStorage. */
	id: string;
	/** Nom lisible pour la page brand-test. */
	label: string;
	/** Valeur font-family à appliquer inline, ex. 'var(--font-brand-augusta)'. */
	cssVar: string;
};

/** Chaque font locale, avec la className variable produite par next/font/local. */
const FONT_DEFS = [
	{ id: 'augusta', label: 'Augusta', font: augusta },
	{ id: 'beech', label: 'Beech', font: beech },
	{ id: 'beside-horizon', label: 'Beside Horizon', font: besideHorizon },
	{ id: 'godofwar', label: 'God of War', font: godofwar },
	{ id: 'one-slice', label: 'One Slice', font: oneSlice },
	{ id: 'roman-antique', label: 'Roman Antique', font: romanAntique },
	{ id: 'seagram-tfb', label: 'Seagram tfb', font: seagramTfb },
	{ id: 'sherwood', label: 'Sherwood', font: sherwood },
	{ id: 'stranger-through', label: 'Stranger Through', font: strangerThrough },
	{ id: 'vampire-wars', label: 'Vampire Wars', font: vampireWars },
	{ id: 'vengeance-at-sea', label: 'Vengeance at Sea', font: vengeanceAtSea },
	{ id: 'white-on-black', label: 'White on Black', font: whiteOnBlack },
] as const;

export const BRAND_FONTS: BrandFont[] = FONT_DEFS.map(({ id, label }) => ({
	id,
	label,
	cssVar: `var(--font-brand-${id})`,
}));

/** À concaténer dans le className du <body> pour exposer toutes les variables CSS. */
export const BRAND_FONT_VARIABLES: string = FONT_DEFS.map(({ font }) => font.variable).join(' ');

export function getBrandFontById(id: string): BrandFont | undefined {
	return BRAND_FONTS.find((f) => f.id === id);
}
```

- [ ] **Step 2: Vérifier le typecheck/lint**

Run: `cd /home/elthinkbuntu/Documents/Wizcard && npm run check`
Expected: PASS (aucune erreur TypeScript/ESLint/Prettier). Si Prettier reformate, relancer jusqu'à PASS.

- [ ] **Step 3: Commit**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
git add src/fonts/brand.ts
git commit -m "feat: brand font registry via next/font/local"
```

---

## Task 3: Exposer les variables de fonts sur le `<body>`

**Files:**

- Modify: `src/app/[locale]/layout.tsx`

**Interfaces:**

- Consumes: `BRAND_FONT_VARIABLES` de la Task 2.
- Produces: les variables CSS `--font-brand-*` disponibles globalement sur `document.body`.

- [ ] **Step 1: Importer le registre**

Ajouter l'import près des autres imports de fonts (après la ligne `import { Geist, Geist_Mono, Cinzel } from 'next/font/google';`) :

```typescript
import { BRAND_FONT_VARIABLES } from '@/fonts/brand';
```

- [ ] **Step 2: Ajouter les variables au className du `<body>`**

Remplacer :

```tsx
<body className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable}`}>
```

par :

```tsx
<body className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} ${BRAND_FONT_VARIABLES}`}>
```

- [ ] **Step 3: Vérifier**

Run: `cd /home/elthinkbuntu/Documents/Wizcard && npm run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
git add "src/app/[locale]/layout.tsx"
git commit -m "feat: expose brand font CSS variables on body"
```

---

## Task 4: `BrandFontProvider` + hook `useBrandFont`

**Files:**

- Create: `src/contexts/BrandFontProvider.tsx`

**Interfaces:**

- Consumes: `BRAND_FONTS`, `BrandFont`, `getBrandFontById` de la Task 2.
- Produces:
  - `<BrandFontProvider>` (composant client wrapper)
  - `function useBrandFont(): { font: BrandFont | null; reroll: () => void }`

- [ ] **Step 1: Écrire le provider et le hook**

Points clés : état initial `null` (identique SSR/premier render → pas de mismatch) ; résolution en `useEffect` ; lecture/écriture `sessionStorage` sous `try/catch` ; reroll tire un id différent de l'actuel si possible.

```tsx
'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BRAND_FONTS, getBrandFontById, type BrandFont } from '@/fonts/brand';

const STORAGE_KEY = 'wizcard-brand-font';

type BrandFontContextValue = {
	font: BrandFont | null;
	reroll: () => void;
};

const BrandFontContext = createContext<BrandFontContextValue | null>(null);

/** Tire un id de font au hasard, en évitant `exclude` si possible. */
function pickRandomId(exclude?: string): string {
	const pool = BRAND_FONTS.filter((f) => f.id !== exclude);
	const source = pool.length > 0 ? pool : BRAND_FONTS;
	return source[Math.floor(Math.random() * source.length)].id;
}

function readStoredId(): string | null {
	try {
		return sessionStorage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}
}

function writeStoredId(id: string): void {
	try {
		sessionStorage.setItem(STORAGE_KEY, id);
	} catch {
		// sessionStorage indisponible (mode privé strict) : dégradation silencieuse.
	}
}

export function BrandFontProvider({ children }: { children: React.ReactNode }) {
	// null au SSR et au premier render client → aucun mismatch d'hydratation.
	const [fontId, setFontId] = useState<string | null>(null);

	useEffect(() => {
		const stored = readStoredId();
		if (stored && getBrandFontById(stored)) {
			setFontId(stored);
			return;
		}
		const next = pickRandomId();
		writeStoredId(next);
		setFontId(next);
	}, []);

	const reroll = useCallback(() => {
		setFontId((current) => {
			const next = pickRandomId(current ?? undefined);
			writeStoredId(next);
			return next;
		});
	}, []);

	const value = useMemo<BrandFontContextValue>(
		() => ({ font: fontId ? (getBrandFontById(fontId) ?? null) : null, reroll }),
		[fontId, reroll]
	);

	return <BrandFontContext.Provider value={value}>{children}</BrandFontContext.Provider>;
}

export function useBrandFont(): BrandFontContextValue {
	const ctx = useContext(BrandFontContext);
	if (!ctx) {
		throw new Error('useBrandFont must be used within a BrandFontProvider');
	}
	return ctx;
}
```

- [ ] **Step 2: Vérifier**

Run: `cd /home/elthinkbuntu/Documents/Wizcard && npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
git add src/contexts/BrandFontProvider.tsx
git commit -m "feat: BrandFontProvider with per-session random font + reroll"
```

---

## Task 5: Monter le provider dans `Providers`

**Files:**

- Modify: `src/contexts/Providers.tsx`

**Interfaces:**

- Consumes: `BrandFontProvider` de la Task 4.
- Produces: `useBrandFont()` utilisable partout dans l'arbre client (navbar, hero).

- [ ] **Step 1: Importer et wrapper**

Ajouter l'import avec les autres providers `@/contexts/*` :

```typescript
import { BrandFontProvider } from '@/contexts/BrandFontProvider';
```

Wrapper le contenu existant. Le provider n'a aucune dépendance sur les autres contexts, donc on le place tout en haut, juste sous `AuthProvider` — remplacer :

```tsx
	return (
		<AuthProvider>
			<SyncQueueRunner>
```

par :

```tsx
	return (
		<AuthProvider>
			<BrandFontProvider>
				<SyncQueueRunner>
```

et fermer la balise : remplacer la fin

```tsx
				</SyncQueueRunner>
		</AuthProvider>
	);
```

par :

```tsx
				</SyncQueueRunner>
			</BrandFontProvider>
		</AuthProvider>
	);
```

- [ ] **Step 2: Vérifier**

Run: `cd /home/elthinkbuntu/Documents/Wizcard && npm run check`
Expected: PASS (indentation reformatée par Prettier au besoin).

- [ ] **Step 3: Commit**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
git add src/contexts/Providers.tsx
git commit -m "feat: mount BrandFontProvider in Providers tree"
```

---

## Task 6: Appliquer la font au logo de la navbar

**Files:**

- Modify: `src/components/Navbar/Navbar.tsx`

**Interfaces:**

- Consumes: `useBrandFont()` de la Task 4.
- Produces: rien pour d'autres tâches.

- [ ] **Step 1: Importer le hook**

Ajouter en haut avec les autres imports (`Navbar.tsx` est déjà un composant client) :

```typescript
import { useBrandFont } from '@/contexts/BrandFontProvider';
```

- [ ] **Step 2: Lire la font dans le composant**

Dans le corps du composant `Navbar`, à côté des autres hooks (près de `const t = ...`), ajouter :

```typescript
const { font } = useBrandFont();
```

- [ ] **Step 3: Appliquer `font-family` en inline sur le logo**

Le logo est à `src/components/Navbar/Navbar.tsx:62-64`. Le dégradé or vient de `.logo` (CSS) et ne bouge pas ; on ajoute seulement `fontFamily`. Quand `font` est `null` (avant montage), `undefined` laisse la font CSS par défaut. Remplacer :

```tsx
<Link href="/" className={styles.logo}>
	Wizcard
</Link>
```

par :

```tsx
<Link href="/" className={styles.logo} style={{ fontFamily: font?.cssVar }}>
	Wizcard
</Link>
```

- [ ] **Step 4: Vérifier**

Run: `cd /home/elthinkbuntu/Documents/Wizcard && npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
git add src/components/Navbar/Navbar.tsx
git commit -m "feat: navbar logo uses random brand font"
```

---

## Task 7: Titre hero — font partagée + reroll au clic

**Files:**

- Modify: `src/app/[locale]/(landing)/components/Hero/Hero.tsx`
- Modify: `src/app/[locale]/(landing)/components/Hero/Hero.module.css`

**Interfaces:**

- Consumes: `useBrandFont()` de la Task 4.
- Produces: rien pour d'autres tâches.

- [ ] **Step 1: Importer le hook**

`Hero.tsx` est déjà `'use client'`. Ajouter avec les imports existants :

```typescript
import { useBrandFont } from '@/contexts/BrandFontProvider';
```

- [ ] **Step 2: Lire font + reroll**

Dans le corps de `Hero`, après `const t = useTranslations('landing.hero');`, ajouter :

```typescript
const { font, reroll } = useBrandFont();
```

- [ ] **Step 3: Rendre le titre cliquable et accessible**

Remplacer `src/app/[locale]/(landing)/components/Hero/Hero.tsx:31` :

```tsx
<h1 className={styles.title}>WIZCARD</h1>
```

par :

```tsx
<h1
	className={styles.title}
	style={{ fontFamily: font?.cssVar }}
	role="button"
	tabIndex={0}
	onClick={reroll}
	onKeyDown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			reroll();
		}
	}}
>
	WIZCARD
</h1>
```

- [ ] **Step 4: Ajouter `cursor: pointer` sur le titre**

Dans `Hero.module.css`, la règle `.hero .title` existe (ligne ~57). Ajouter `cursor: pointer;` et `user-select: none;` à l'intérieur de ce bloc :

```css
.hero .title {
	opacity: 1;
	animation: heroTitle 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.5s both;
	cursor: pointer;
	user-select: none;
}
```

- [ ] **Step 5: Vérifier (typecheck/lint)**

Run: `cd /home/elthinkbuntu/Documents/Wizcard && npm run check`
Expected: PASS.

- [ ] **Step 6: Vérification runtime**

Run (démarrer le dev si pas déjà lancé) : `cd /home/elthinkbuntu/Documents/Wizcard && npm run dev` puis ouvrir `http://localhost:3000/fr`.
Expected :

- Après chargement, « WIZCARD » (hero) et « Wizcard » (navbar) s'affichent dans **la même** font custom.
- Cliquer sur le titre hero change la font **aux deux** endroits simultanément.
- Recharger l'onglet conserve la même font ; aucune erreur d'hydratation en console.

- [ ] **Step 7: Commit**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
git add "src/app/[locale]/(landing)/components/Hero/Hero.tsx" "src/app/[locale]/(landing)/components/Hero/Hero.module.css"
git commit -m "feat: hero title uses shared brand font, reroll on click"
```

---

## Task 8: Page brand-test `/brand-test/logo`

**Files:**

- Create: `src/app/[locale]/brand-test/logo/page.tsx`
- Create: `src/app/[locale]/brand-test/logo/page.module.css`

**Interfaces:**

- Consumes: `BRAND_FONTS` de la Task 2 ; variable CSS `--gold` (globals).
- Produces: rien pour d'autres tâches.

- [ ] **Step 1: Écrire le CSS module des maquettes**

`src/app/[locale]/brand-test/logo/page.module.css` — maquettes autonomes (n'importe aucun vrai composant) :

```css
.page {
	max-width: 960px;
	margin: 0 auto;
	padding: 2rem 1.5rem 6rem;
	display: flex;
	flex-direction: column;
	gap: 3rem;
}

.intro {
	font-family: var(--font-body);
	opacity: 0.7;
}

.row {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
	border-top: 1px solid rgba(201, 168, 76, 0.25);
	padding-top: 1.5rem;
}

.label {
	font-family: var(--font-body);
	font-size: 0.85rem;
	letter-spacing: 0.05em;
	text-transform: uppercase;
	opacity: 0.6;
}

/* Maquette navbar */
.navbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	background: #0d0d10;
	border: 1px solid rgba(201, 168, 76, 0.2);
	border-radius: 8px;
	padding: 0.75rem 1.25rem;
}

.navbarLogo {
	font-size: 1.5rem;
	letter-spacing: 0.15em;
	text-transform: uppercase;
	color: var(--gold);
}

.navbarLinks {
	display: flex;
	gap: 1.25rem;
	font-family: var(--font-body);
	font-size: 0.9rem;
	opacity: 0.45;
}

/* Maquette hero + icône côte à côte */
.showcase {
	display: flex;
	align-items: center;
	gap: 2rem;
	flex-wrap: wrap;
	background: #0d0d10;
	border: 1px solid rgba(201, 168, 76, 0.2);
	border-radius: 8px;
	padding: 2.5rem 1.5rem;
}

.heroTitle {
	flex: 1 1 auto;
	min-width: 0;
	font-size: clamp(2.5rem, 8vw, 5rem);
	letter-spacing: 0.1em;
	text-transform: uppercase;
	color: #e8d5a0;
	line-height: 1;
}

/* Icône type favicon : disque sombre, W doré */
.favicon {
	flex: 0 0 auto;
	width: 48px;
	height: 48px;
	border-radius: 50%;
	background: #0d0d10;
	border: 1px solid rgba(201, 168, 76, 0.35);
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 1.75rem;
	line-height: 1;
	color: var(--gold);
}
```

- [ ] **Step 2: Écrire la page (server component)**

`src/app/[locale]/brand-test/logo/page.tsx` — lit `BRAND_FONTS` en dur, `noindex`, non liée dans la nav. Pas de dépendance au provider.

```tsx
import type { Metadata } from 'next';
import { BRAND_FONTS } from '@/fonts/brand';
import styles from './page.module.css';

export const metadata: Metadata = {
	title: 'Brand test — Logo fonts',
	robots: { index: false, follow: false },
};

export default function BrandTestLogoPage() {
	return (
		<div className={styles.page}>
			<p className={styles.intro}>Chaque font en situation : navbar, hero, et icône (favicon).</p>

			{BRAND_FONTS.map((font) => (
				<section key={font.id} className={styles.row}>
					<span className={styles.label}>{font.label}</span>

					{/* Maquette navbar */}
					<div className={styles.navbar}>
						<span className={styles.navbarLogo} style={{ fontFamily: font.cssVar }}>
							Wizcard
						</span>
						<span className={styles.navbarLinks}>
							<span>Recherche</span>
							<span>Sets</span>
							<span>Decks</span>
						</span>
					</div>

					{/* Maquette hero + icône favicon */}
					<div className={styles.showcase}>
						<span className={styles.heroTitle} style={{ fontFamily: font.cssVar }}>
							Wizcard
						</span>
						<span className={styles.favicon} style={{ fontFamily: font.cssVar }}>
							W
						</span>
					</div>
				</section>
			))}
		</div>
	);
}
```

- [ ] **Step 3: Vérifier (typecheck/lint)**

Run: `cd /home/elthinkbuntu/Documents/Wizcard && npm run check`
Expected: PASS.

- [ ] **Step 4: Vérification runtime**

Ouvrir `http://localhost:3000/fr/brand-test/logo`.
Expected :

- 12 sections, une par font, chacune avec son label.
- Chaque section montre : une barre navbar (« Wizcard » doré à gauche + liens grisés), un grand « Wizcard » (hero), et un disque sombre avec « W » doré (favicon).
- Chaque bloc utilise bien une font différente d'une section à l'autre.

- [ ] **Step 5: Commit**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
git add "src/app/[locale]/brand-test/logo/page.tsx" "src/app/[locale]/brand-test/logo/page.module.css"
git commit -m "feat: brand-test page with navbar/hero/favicon mockups per font"
```

---

## Task 9: Vérification finale de bout en bout

**Files:** aucun (vérification seulement).

- [ ] **Step 1: `npm run check` global**

Run: `cd /home/elthinkbuntu/Documents/Wizcard && npm run check`
Expected: PASS complet.

- [ ] **Step 2: Parcours runtime complet**

Avec `npm run dev` :

1. `/fr` → navbar + hero même font custom, pas d'erreur d'hydratation en console.
2. Clic sur le titre hero → font change aux deux endroits.
3. Reload → font conservée (session).
4. Naviguer vers `/fr/search` puis revenir → la font de session reste identique (navbar cohérente).
5. `/fr/brand-test/logo` → 12 fonts en situation navbar/hero/favicon.

Expected: tous les points OK.

- [ ] **Step 3: (Optionnel) Vérifier le build de prod**

Run: `cd /home/elthinkbuntu/Documents/Wizcard && npm run build`
Expected: build réussi, la route `/[locale]/brand-test/logo` apparaît dans la sortie, aucune erreur de font.
