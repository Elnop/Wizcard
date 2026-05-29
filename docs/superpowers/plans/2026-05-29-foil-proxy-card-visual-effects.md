# Foil / Proxy Card Visual Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter des effets visuels foil (shimmer arc-en-ciel au hover) et proxy (filigrane PROXY) sur les images de cartes dans `CardImage`, couvrant tous les modes d'affichage de l'app.

**Architecture:** `CardImageProps` est étendu avec des props optionnels `isFoil`, `foilType` et `isProxy`. Deux overlays CSS absolus sont insérés dans `.imageWrapper` — l'un pour le shimmer foil (activé au hover du `.container`), l'autre pour le filigrane proxy (toujours visible). Aucun appelant n'est modifié : les composants qui ont accès à `card.entry` (comme `CardListGrid`) peuvent passer les props, les autres fonctionnent comme avant.

**Tech Stack:** React, CSS Modules, Next.js Image

---

## Fichiers modifiés

| Fichier                                                  | Rôle                                                                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/lib/card/components/CardImage/CardImage.tsx`        | Ajout des props `isFoil`, `foilType`, `isProxy` + rendu des overlays                                       |
| `src/lib/card/components/CardImage/CardImage.module.css` | Nouveaux styles `.foilOverlay`, `.etchedOverlay`, `.proxyOverlay`, `@keyframes foilShimmer`, hover trigger |

---

## Task 1 : Ajouter les props et les overlays dans CardImage.tsx

**Files:**

- Modify: `src/lib/card/components/CardImage/CardImage.tsx`

- [ ] **Step 1 : Étendre l'interface CardImageProps**

Dans `CardImage.tsx`, modifier `CardImageProps` pour ajouter les trois nouveaux props optionnels :

```typescript
export interface CardImageProps {
	card: CardImageCard;
	size?: 'small' | 'normal' | 'large';
	priority?: boolean;
	className?: string;
	onClick?: () => void;
	isFoil?: boolean;
	foilType?: 'foil' | 'etched';
	isProxy?: boolean;
}
```

- [ ] **Step 2 : Destructurer les nouveaux props dans la fonction**

Modifier la signature de la fonction `CardImage` :

```typescript
export function CardImage({
	card,
	size = 'normal',
	priority = false,
	className,
	onClick,
	isFoil = false,
	foilType = 'foil',
	isProxy = false,
}: CardImageProps) {
```

- [ ] **Step 3 : Insérer les overlays dans le JSX**

Dans le `return`, à l'intérieur de `<div className={styles.imageWrapper}>`, ajouter les deux overlays **après** le `{isLoading && !error && <div className={styles.skeleton} />}` existant :

```tsx
<div className={styles.imageWrapper}>
	{!error && imageUri ? (
		<Image
			src={imageUri}
			alt={card.name}
			width={width}
			height={height}
			priority={priority}
			className={`${styles.image} ${isLoading ? styles.loading : ''}`}
			onLoad={() => setIsLoading(false)}
			onError={() => setError(true)}
		/>
	) : (
		<div className={styles.placeholder} style={{ width, height }}>
			<span className={styles.placeholderText}>{card.name}</span>
		</div>
	)}
	{isLoading && !error && <div className={styles.skeleton} />}
	{isFoil && (
		<div
			className={foilType === 'etched' ? styles.etchedOverlay : styles.foilOverlay}
			aria-hidden="true"
		/>
	)}
	{isProxy && (
		<div className={styles.proxyOverlay} aria-hidden="true">
			PROXY
		</div>
	)}
</div>
```

- [ ] **Step 4 : Vérifier TypeScript**

```bash
cd /home/elthinkbuntu/Documents/Wizcard && npx tsc --noEmit 2>&1 | head -30
```

Attendu : aucune erreur liée à `CardImage`.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/card/components/CardImage/CardImage.tsx
git commit -m "feat: add isFoil, foilType, isProxy props and overlay divs to CardImage"
```

---

## Task 2 : Ajouter les styles CSS pour les effets

**Files:**

- Modify: `src/lib/card/components/CardImage/CardImage.module.css`

- [ ] **Step 1 : Ajouter le keyframe foilShimmer**

Ajouter après le `@keyframes shimmer` existant (ligne 49) :

```css
@keyframes foilShimmer {
	0% {
		background-position: 0% 50%;
	}
	50% {
		background-position: 100% 50%;
	}
	100% {
		background-position: 0% 50%;
	}
}
```

- [ ] **Step 2 : Ajouter le style de l'overlay foil standard**

Ajouter après le keyframe :

```css
.foilOverlay {
	position: absolute;
	inset: 0;
	border-radius: 4.75% / 3.4%;
	pointer-events: none;
	opacity: 0;
	background: linear-gradient(
		125deg,
		#ff0000 0%,
		#ff7700 14%,
		#ffff00 28%,
		#00ff00 42%,
		#0000ff 57%,
		#8b00ff 71%,
		#ff0000 85%,
		#ff7700 100%
	);
	background-size: 300% 300%;
	mix-blend-mode: color-dodge;
	transition: opacity 0.3s ease;
}

.container:hover .foilOverlay {
	opacity: 0.35;
	animation: foilShimmer 1.2s ease-in-out infinite;
}
```

- [ ] **Step 3 : Ajouter le style de l'overlay foil etched**

```css
.etchedOverlay {
	position: absolute;
	inset: 0;
	border-radius: 4.75% / 3.4%;
	pointer-events: none;
	opacity: 0;
	background: linear-gradient(
		125deg,
		#ffffff 0%,
		#d0d0d0 25%,
		#f8f8f8 50%,
		#c0c0c0 75%,
		#ffffff 100%
	);
	background-size: 300% 300%;
	mix-blend-mode: color-dodge;
	transition: opacity 0.3s ease;
}

.container:hover .etchedOverlay {
	opacity: 0.25;
	animation: foilShimmer 1.4s ease-in-out infinite;
}
```

- [ ] **Step 4 : Ajouter le style du filigrane proxy**

```css
.proxyOverlay {
	position: absolute;
	inset: 0;
	border-radius: 4.75% / 3.4%;
	pointer-events: none;
	display: flex;
	align-items: center;
	justify-content: center;
	color: white;
	font-size: clamp(0.9rem, 8cqw, 2rem);
	font-weight: 900;
	letter-spacing: 0.15em;
	opacity: 0.13;
	transform: rotate(-30deg);
	overflow: hidden;
}
```

- [ ] **Step 5 : Vérifier le rendu visuel**

```bash
cd /home/elthinkbuntu/Documents/Wizcard && npm run check 2>&1 | tail -20
```

Attendu : `✓ No errors found` ou similaire.

- [ ] **Step 6 : Commit**

```bash
git add src/lib/card/components/CardImage/CardImage.module.css
git commit -m "feat: add foil shimmer and proxy watermark CSS effects to CardImage"
```

---

## Task 3 : Passer les props foil/proxy depuis CardListGrid

**Context :** `CardListGrid` rend les cartes en mode grid. La carte peut être de type `Card` (avec `entry`) ou `ScryfallCard` (sans `entry`). Il faut passer `isFoil`, `foilType`, `isProxy` à `CardImage` quand `entry` est disponible.

**Files:**

- Modify: `src/lib/card/components/CardListGrid/CardListGrid.tsx`

- [ ] **Step 1 : Trouver la ligne qui rend `<CardImage>`**

```bash
grep -n "CardImage" /home/elthinkbuntu/Documents/Wizcard/src/lib/card/components/CardListGrid/CardListGrid.tsx
```

Attendu : une ligne du type `<CardImage card={c} size="normal" ... />`

- [ ] **Step 2 : Vérifier le type de la carte dans CardListGrid**

```bash
grep -n "card\|Card\|entry" /home/elthinkbuntu/Documents/Wizcard/src/lib/card/components/CardListGrid/CardListGrid.tsx | head -30
```

Identifier comment la variable de carte est typée (ex: `Card`, `ScryfallCard`, ou union).

- [ ] **Step 3 : Passer les props entry à CardImage**

Modifier l'appel `<CardImage>` dans `CardListGrid.tsx` pour inclure les props foil/proxy. Exemple (adapter selon le nom de variable exact trouvé à l'étape précédente, supposons `c`) :

```tsx
<CardImage
	card={c}
	size="normal"
	priority={priorityOffset + i < 4}
	isFoil={'entry' in c ? c.entry?.isFoil : undefined}
	foilType={'entry' in c ? c.entry?.foilType : undefined}
	isProxy={'entry' in c ? c.entry?.proxy : undefined}
/>
```

- [ ] **Step 4 : Vérifier TypeScript**

```bash
cd /home/elthinkbuntu/Documents/Wizcard && npx tsc --noEmit 2>&1 | head -30
```

Attendu : aucune erreur.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/card/components/CardListGrid/CardListGrid.tsx
git commit -m "feat: pass isFoil, foilType, isProxy from card entry to CardImage in CardListGrid"
```

---

## Task 4 : Vérification end-to-end

- [ ] **Step 1 : Lancer le check complet**

```bash
cd /home/elthinkbuntu/Documents/Wizcard && npm run check
```

Attendu : aucune erreur TypeScript, ESLint, Prettier.

- [ ] **Step 2 : Lancer Storybook ou l'app pour vérifier visuellement**

```bash
cd /home/elthinkbuntu/Documents/Wizcard && npm run cosmos
```

Ou lancer l'app principale et naviguer vers une collection/deck contenant des cartes foil et proxy.

- [ ] **Step 3 : Checklist visuelle**

Vérifier dans le navigateur :

- [ ] Carte foil → hover → shimmer arc-en-ciel visible sur l'image
- [ ] Carte foil etched → hover → shimmer argenté plus subtil
- [ ] Carte proxy → filigrane "PROXY" en diagonale visible au repos
- [ ] Carte foil + proxy → filigrane au repos, shimmer au hover superposé
- [ ] Carte normale → aucun effet
- [ ] Les effets respectent les bords arrondis de la carte (pas de débordement)
- [ ] En mode fluid-grid et grid, les effets fonctionnent identiquement
