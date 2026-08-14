# Fondu hybride fidèle — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Peindre un cadre hybride bicolore comme MSE le compose — dégradé horizontal entre les deux couleurs sur la bordure, plaques de titre et de type en gris neutre.

**Architecture:** `resolveMseBlend` (lecture, client-safe) gagne un quatrième champ `plate`, l'URL du cadre gris (`land-colorless` → `colorless`, jamais une autre couleur). `CardCanvas` remplace ses deux couches par quatre : le gris en fond, puis les deux couleurs groupées sous le masque hybride, la seconde estompée par un `<linearGradient>` 45 %→55 %. Aucune migration, aucune ré-ingestion, aucun nouvel asset.

**Tech Stack:** TypeScript, React 19 (React Compiler ESLint), SVG (`<mask>`, `<linearGradient>`), Next.js 15 App Router.

## Global Constraints

- **Aucun framework de test dans ce dépôt.** Les portes sont `npm run check`, `npm run build` et la vérification navigateur. Ne pas ajouter vitest/jest ; ne pas écrire de fichier `*.test.ts`.
- **`npm run check` n'est PAS vert à la base** (~60 problèmes préexistants dans des fichiers sans rapport). Le critère est **aucun NOUVEAU problème** — vérifier avec `npx eslint <fichiers modifiés>`.
- **Règle « pas de fallback » du projet :** ne jamais inventer une valeur fausse. Dégrader vers moins spécifique **au sein du gris** est permis (`land-colorless` → `colorless`) ; basculer vers une autre couleur ne l'est pas. Faute de gris, on ne fond pas du tout et le cadre or s'applique.
- **Les valeurs 45 % / 55 % sont codées en dur** dans le JSX, avec un commentaire citant `magic-m15-showcase-capenna-art-deco.mse-style` / `card_hybrid_2`. Pas de colonne, pas de passage `card-assets` pour une donnée unique.
- **`maskUnits="userSpaceOnUse"` explicite** sur les deux masques, avec `x="0" y="0" width={geometry.width} height={geometry.height}`. Le défaut `objectBoundingBox` recadrerait sur la boîte de l'élément masqué.
- **`linearGradient` reste en pourcentages** (son défaut `objectBoundingBox` est ici voulu : 45 %/55 % de la largeur quel que soit le gabarit, les 27 cadres en paysage compris).
- **Ne jamais lancer `npm run card-assets`** : `.env.seed` est chargé avec `override: true`, ce script écrit en PRODUCTION. Ce chantier n'en a aucun besoin.
- **`src/lib/card-editor/mse-assets.ts` est client-safe** : il ne doit jamais importer depuis `scripts/`.

---

## Structure des fichiers

| Fichier                                                    | Rôle après ce chantier                                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/lib/card-editor/mse-assets.ts`                        | `resolveMseBlend` résout aussi le fond de plaques gris et le renvoie dans `plate`   |
| `src/lib/card-editor/components/CardCanvas/CardCanvas.tsx` | Type du prop `mseBlend` élargi ; le bloc de peinture passe de deux à quatre couches |

Rien d'autre ne change. `CardEditorStudio` passe déjà `mseBlend` en bloc opaque (`mseBlend={mseBlend}`), donc l'ajout d'un champ ne l'oblige à rien.

---

### Task 1 : `resolveMseBlend` résout le fond de plaques

**Files:**

- Modify: `src/lib/card-editor/mse-assets.ts` (fonction `resolveMseBlend`, en fin de fichier)

**Interfaces:**

- Consumes: `frameDegradationChain(frame: MseFrameKey): MseFrameKey[]` et `COLOR_TO_FRAME`, `faceColors`, `hasHybridCost`, `cardAssetUrl` — tous déjà présents dans ce fichier.
- Produces: `resolveMseBlend(template: MseTemplate | undefined, face: CardFaceDraft): { base: string; overlay: string; mask: string; plate: string } | null`. Task 2 consomme les quatre champs.

- [ ] **Step 1 : Lire la fonction actuelle**

Lire `src/lib/card-editor/mse-assets.ts` en entier, et repérer en particulier :

- `frameDegradationChain` — la chaîne de dégradation partagée par les trois résolveurs
- `resolveMseFramePath` — pour voir comment elle parcourt cette chaîne (`for (const key of [frame, ...frameDegradationChain(frame)])`)
- `resolveMseBlend` en fin de fichier — c'est la seule fonction que cette tâche modifie

- [ ] **Step 2 : Élargir le type de retour et résoudre le gris**

Remplacer la signature et le corps de `resolveMseBlend`. Le commentaire existant sur `use gradient multicolor` est à **conserver mot pour mot** — il documente pourquoi une bicolore ordinaire reste or. Le résultat complet :

```ts
export function resolveMseBlend(
	template: MseTemplate | undefined,
	face: CardFaceDraft
): { base: string; overlay: string; mask: string; plate: string } | null {
	if (!template?.blendMasks) return null;
	if (face.frameStyle !== 'auto') return null;
	const colors = faceColors(face);
	if (colors.length !== 2) return null;
	// SEUL l'hybride est fondu. Une carte bicolore ORDINAIRE porte le cadre or,
	// exactement comme une tricolore — c'est ce qu'imprime Wizards.
	//
	// MSE fond les bicolores par défaut, mais c'est une facilité de l'éditeur et
	// non l'imprimé : le réglage `use gradient multicolor` (magic.mse-game/
	// set_fields) existe précisément pour la désactiver, et sa description dit
	// « Use gradients on multicolor cards BY DEFAULT », pas « comme les vraies
	// cartes ». On suit l'imprimé, donc `multicolor` n'est jamais peint et
	// `resolveAutomaticFrame` renvoie `prismatic` pour les bicolores.
	if (!hasHybridCost(face)) return null;
	const maskPath = template.blendMasks.hybrid;
	if (!maskPath) return null;
	const first = template.framePaths[COLOR_TO_FRAME[colors[0]]];
	const second = template.framePaths[COLOR_TO_FRAME[colors[1]]];
	if (!first || !second) return null;
	// Les plaques (titre, ligne de type) d'un hybride sont grises, pas colorées.
	// MSE les prend dans le cadre TERRAIN : `color_combination` fait
	// `mode := "hybrid" ; dark := land_template` (magic-blends.mse-include/
	// new-blends). On suit la même chaîne de dégradation que le reste du module :
	// on descend vers moins spécifique AU SEIN DU GRIS, jamais vers une autre
	// couleur — sans gris disponible on ne fond pas, et le cadre or s'applique.
	const plateKey = (['land-colorless', ...frameDegradationChain('land-colorless')] as const).find(
		(key) => template.framePaths[key]
	);
	if (!plateKey) return null;
	const platePath = template.framePaths[plateKey];
	if (!platePath) return null;
	const base = cardAssetUrl(first);
	const overlay = cardAssetUrl(second);
	const mask = cardAssetUrl(maskPath);
	const plate = cardAssetUrl(platePath);
	if (!base || !overlay || !mask || !plate) return null;
	return { base, overlay, mask, plate };
}
```

Note sur le `as const` : `frameDegradationChain('land-colorless')` renvoie `['colorless', 'artifact']` — la chaîne complète est donc `land-colorless → colorless → artifact`. `artifact` est gris lui aussi (`acard`), donc il reste dans le gris et ne viole pas la règle. Si tsc se plaint du `as const` sur un tableau contenant un appel de fonction, l'écrire sans :

```ts
const plateChain: MseFrameKey[] = ['land-colorless', ...frameDegradationChain('land-colorless')];
const plateKey = plateChain.find((key) => template.framePaths[key]);
```

- [ ] **Step 3 : Vérifier types et lint sur le fichier modifié**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -F 'mse-assets.ts'
npx eslint src/lib/card-editor/mse-assets.ts
```

Attendu : `tsc` ne signale **rien** pour ce fichier — sauf, possiblement, une erreur dans `CardCanvas.tsx` disant que `{ base; overlay; mask; plate }` n'est pas assignable au prop `mseBlend` (typé sans `plate`). C'est normal à ce stade : Task 2 la corrige. `eslint` doit sortir vide.

- [ ] **Step 4 : Vérifier à la main que la chaîne trouve bien un gris**

Ce dépôt n'a pas de framework de test ; on interroge donc directement la DB locale, qui porte les 140 gabarits mesurés (`geometry is not null` est le seul filtre de `buildFrameChoices`). Vérifier que la répartition correspond à celle du spec : 66 avec `land-colorless`, 17 avec `colorless` seul, 2 avec `artifact` seul, 55 sans masque `hybrid`.

Il n'y a pas de `psql` sur l'hôte : passer par le conteneur, dont le nom est généré (`docker ps --format '{{.Names}}' | grep supabase_db`).

```bash
cd /home/elthinkbuntu/Documents/Wizcard
DB=$(docker ps --format '{{.Names}}' | grep -i supabase_db | head -1)
docker exec "$DB" psql -U postgres -d postgres -c "
select
  case
    when blend_masks->>'hybrid' is null then 'pas de masque hybrid'
    when frame_paths ? 'land-colorless' then 'masque + land-colorless'
    when frame_paths ? 'colorless'      then 'masque + colorless seul'
    when frame_paths ? 'artifact'       then 'masque + artifact seul'
    else 'masque, aucun gris'
  end as situation,
  count(*)
from card_templates
where geometry is not null
group by 1 order by 2 desc;"
```

Attendu : `land-colorless` 66, `pas de masque hybrid` 55, `colorless seul` 17, `artifact seul` 2 — et **zéro** ligne « masque, aucun gris ». Si Supabase local n'est pas démarré, `npm run sb:start` d'abord. Si une ligne « masque, aucun gris » apparaît, ce n'est pas un blocage : ces cadres-là ne fondront pas et porteront le cadre or, ce que le code gère déjà par son `return null`. Si les nombres diffèrent largement, le signaler dans le rapport mais **poursuivre** — la répartition documente le comportement, elle ne le conditionne pas.

- [ ] **Step 5 : Commit**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
git add src/lib/card-editor/mse-assets.ts
git commit -m "feat(studio): resolve the grey plate frame for hybrid blends

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015hF7jdXAcFnXF2uDLwBr4q"
```

---

### Task 2 : Le dégradé horizontal dans `CardCanvas`

**Files:**

- Modify: `src/lib/card-editor/components/CardCanvas/CardCanvas.tsx:40` (type du prop `mseBlend`)
- Modify: `src/lib/card-editor/components/CardCanvas/CardCanvas.tsx:493-522` (le bloc de peinture `{mseBlend ? … }`)

**Interfaces:**

- Consumes: `resolveMseBlend(...): { base: string; overlay: string; mask: string; plate: string } | null` (Task 1).
- Produces: rien de nouveau à l'extérieur. `CardEditorStudio` passe `mseBlend` en bloc et n'a pas à changer.

- [ ] **Step 1 : Élargir le type du prop**

Ligne 40 de `src/lib/card-editor/components/CardCanvas/CardCanvas.tsx`, remplacer :

```ts
	mseBlend?: { base: string; overlay: string; mask: string } | null;
```

par :

```ts
	mseBlend?: { base: string; overlay: string; mask: string; plate: string } | null;
```

C'est le **seul** site de déclaration : le composant interne à la ligne 431 réutilise ce type via `Omit<CardCanvasProps, …>`. Ne pas chercher un second endroit à modifier ; `grep -n "overlay: string" src/lib/card-editor/components/CardCanvas/CardCanvas.tsx` doit ne renvoyer qu'une ligne.

- [ ] **Step 2 : Remplacer le bloc de peinture par les quatre couches**

Le bloc actuel (lignes ~493-522) est :

```tsx
			{mseBlend ? (
				<>
					<mask id={`${clipId}-blend`}>
						<image
							href={mseBlend.mask}
							x="0"
							y="0"
							width={geometry.width}
							height={geometry.height}
							preserveAspectRatio="none"
						/>
					</mask>
					<image
						href={mseBlend.base}
						x="0"
						y="0"
						width={geometry.width}
						height={geometry.height}
						preserveAspectRatio="none"
					/>
					<image
						href={mseBlend.overlay}
						x="0"
						y="0"
						width={geometry.width}
						height={geometry.height}
						preserveAspectRatio="none"
						mask={`url(#${clipId}-blend)`}
					/>
				</>
			) : (
```

Le remplacer intégralement par :

```tsx
			{mseBlend ? (
				<>
					{/*
					 * Dégradé horizontal de la première couleur vers la seconde. Les
					 * bornes 45 % / 55 % viennent de `card_hybrid_2` dans
					 * magic-m15-showcase-capenna-art-deco.mse-style, le seul style du
					 * corpus qui les déclare :
					 *   linear_blend(couleur₁, couleur₂, x1: 0.45, y1: 0, x2: 0.55, y2: 0)
					 * `y1 = y2 = 0` — la transition est horizontale, sur une bande de
					 * 10 % centrée. On garde les pourcentages : `linearGradient` est en
					 * `objectBoundingBox` par défaut, donc les bornes suivent la largeur
					 * du gabarit, les 27 cadres en paysage compris.
					 */}
					<linearGradient id={`${clipId}-hygrad`} x1="45%" y1="0%" x2="55%" y2="0%">
						<stop offset="0" stopColor="black" />
						<stop offset="1" stopColor="white" />
					</linearGradient>
					{/*
					 * `maskUnits="userSpaceOnUse"` explicite sur les deux masques : le
					 * défaut est `objectBoundingBox`, qui recadrerait le masque sur la
					 * boîte de l'élément masqué au lieu de la carte.
					 */}
					<mask
						id={`${clipId}-hygrad-mask`}
						maskUnits="userSpaceOnUse"
						x="0"
						y="0"
						width={geometry.width}
						height={geometry.height}
					>
						<rect
							x="0"
							y="0"
							width={geometry.width}
							height={geometry.height}
							fill={`url(#${clipId}-hygrad)`}
						/>
					</mask>
					<mask
						id={`${clipId}-hyplate`}
						maskUnits="userSpaceOnUse"
						x="0"
						y="0"
						width={geometry.width}
						height={geometry.height}
					>
						<image
							href={mseBlend.mask}
							x="0"
							y="0"
							width={geometry.width}
							height={geometry.height}
							preserveAspectRatio="none"
						/>
					</mask>
					{/*
					 * MSE compose `masked_blend(mask: hybrid_blend_card, light:
					 * linear_blend(c₁, c₂), dark: clcard)`. Les parties SOMBRES du masque
					 * — les plaques de titre et de ligne de type — prennent le cadre gris,
					 * ce qui donne les plaques neutres d'un hybride imprimé. Il est donc
					 * peint en fond, sans masque, et les couleurs viennent par-dessus
					 * seulement là où le masque est clair.
					 */}
					<image
						href={mseBlend.plate}
						x="0"
						y="0"
						width={geometry.width}
						height={geometry.height}
						preserveAspectRatio="none"
					/>
					<g mask={`url(#${clipId}-hyplate)`}>
						<image
							href={mseBlend.base}
							x="0"
							y="0"
							width={geometry.width}
							height={geometry.height}
							preserveAspectRatio="none"
						/>
						<image
							href={mseBlend.overlay}
							x="0"
							y="0"
							width={geometry.width}
							height={geometry.height}
							preserveAspectRatio="none"
							mask={`url(#${clipId}-hygrad-mask)`}
						/>
					</g>
				</>
			) : (
```

Ne toucher ni à la branche `: (mseFramePath && …)` qui suit, ni au bloc `{mseCrownPath && …}` d'après.

- [ ] **Step 3 : Ajuster le commentaire qui précède le bloc**

Le commentaire au-dessus (lignes ~480-492) décrit encore l'ancien montage à deux couches, et dit notamment que le masque est « quasi-binaire, donc la découpe est franche ». Le lire, puis remplacer sa description du montage par celle des quatre couches, en gardant sa dernière phrase sur l'export PNG telle quelle :

```tsx
{
	/*
	 * Cadre hybride bicolore, composé comme MSE : trois entrées superposées.
	 * Le fond gris porte les plaques, le masque `hybrid_blend_card` découpe la
	 * bordure, et le dégradé fait passer la bordure d'une couleur à l'autre de
	 * gauche à droite. Le masque étant quasi-binaire (0,17 % de pixels
	 * intermédiaires), c'est bien le dégradé — et non lui — qui produit la
	 * transition.
	 *
	 * L'export PNG suit sans modification : `inlineSvgImages` parcourt
	 * `querySelectorAll('image')`, ce qui inclut les images DANS les <mask>.
	 * Le <linearGradient> n'est pas une image et n'a rien à inliner.
	 */
}
```

- [ ] **Step 4 : Vérifier types et lint**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E 'CardCanvas|mse-assets'
npx eslint src/lib/card-editor/components/CardCanvas/CardCanvas.tsx src/lib/card-editor/mse-assets.ts
```

Attendu : les deux commandes muettes. L'erreur d'assignabilité vue en Task 1 doit avoir disparu.

- [ ] **Step 5 : Vérifier le build complet**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
npm run build
```

Attendu : succès. `npm run build` est la seule porte qui attrape certaines classes de problèmes dans ce dépôt (frontières server-only, TS2589) — ne pas la sauter même si `tsc` est vert.

- [ ] **Step 6 : Commit**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
git add src/lib/card-editor/components/CardCanvas/CardCanvas.tsx
git commit -m "feat(studio): paint hybrid frames with a horizontal gradient and grey plates

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015hF7jdXAcFnXF2uDLwBr4q"
```

---

### Task 3 : Vérification navigateur

**Files:** aucun (vérification seule ; si elle échoue, corriger dans les fichiers de Task 1 ou 2).

**Interfaces:**

- Consumes: le rendu livré par Tasks 1 et 2.
- Produces: rien.

C'est la porte la plus importante de ce chantier. Le rendu est visuel et l'utilisateur a demandé « une reproduction le plus fidèle possible » — `tsc` et `eslint` ne peuvent rien en dire.

- [ ] **Step 1 : Démarrer le serveur de dev**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
npm run dev
```

Le lancer en tâche de fond et attendre que le port réponde. Supabase local doit tourner (`npm run sb:start` si besoin).

- [ ] **Step 2 : Ouvrir le studio et choisir un gabarit m15**

Charger les outils Chrome en UN seul appel :

```
ToolSearch query "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__read_page"
```

Puis `tabs_context_mcp`, un nouvel onglet, et naviguer vers `http://localhost:3000/fr/studio`. Dans le sélecteur de gabarit, choisir un cadre **`magic-m15`** (il porte le masque `hybrid` et un `land-colorless` — c'est le cas fidèle).

- [ ] **Step 3 : Saisir un coût hybride et regarder**

Saisir `{G/U}` dans le champ de coût de mana. Attendu à l'œil :

- la **bordure** est verte à gauche et devient bleue à droite, avec une transition douce au centre — pas une coupure franche ;
- la **barre de titre** et la **ligne de type** sont **grises**, pas colorées.

- [ ] **Step 4 : Vérifier la structure DOM**

Avec `javascript_tool`, sur le canvas de prévisualisation :

```js
const svg =
	document.querySelector('svg[data-card-canvas], .cardCanvas svg') ?? document.querySelector('svg');
console.log('[HYBRID] images:', svg.querySelectorAll('image').length);
console.log('[HYBRID] masks:', svg.querySelectorAll('mask').length);
console.log('[HYBRID] gradients:', svg.querySelectorAll('linearGradient').length);
console.log(
	'[HYBRID] hrefs:',
	[...svg.querySelectorAll('image')].map((i) => i.getAttribute('href')).join('\n')
);
```

Attendu : **4 `<image>`** (plaque grise, couleur₁, couleur₂, masque hybride) et **au moins 2 `<mask>`** (`-hygrad-mask`, `-hyplate` ; le `clipPath` de l'illustration n'est pas un mask). Parmi les `href`, un pointant vers un fichier gris (`clcard`/`ccard`), un vers un cadre vert, un vers un cadre bleu, un vers `hybrid_blend_card`.

Lire les `href` du DOM plutôt que le trafic réseau : les assets sont mis en cache et n'apparaissent pas forcément dans les requêtes.

- [ ] **Step 5 : Vérifier la non-régression bicolore ordinaire**

Remplacer le coût par `{G}{U}` (deux symboles séparés, pas d'hybride). Attendu : cadre **or** uni, aucun dégradé, aucune plaque grise. Le même contrôle DOM doit montrer une seule `<image>` de cadre et **zéro** `linearGradient` nommé `-hygrad`.

- [ ] **Step 6 : Vérifier l'export PNG**

Revenir à `{G/U}`, déclencher l'export PNG depuis le studio, et ouvrir le fichier obtenu. Attendu : le dégradé et les plaques grises sont présents dans le PNG, identiques à la prévisualisation. C'est le contrôle qui prouve que `inlineSvgImages` a bien inliné les images des masques.

- [ ] **Step 7 : Vérifier un gabarit du tiers dégradé**

Choisir un gabarit qui n'a **que** `colorless` (sans `land-colorless`) — la requête SQL du Step 4 de Task 1 permet d'en nommer un, en remplaçant le `group by` par `select id`. Attendu : même rendu, plaques grises issues de `ccard`. Puis un des 55 gabarits **sans masque `hybrid`** : attendu, cadre or uni, aucun fondu — et surtout **pas** de carte cassée ou de zone transparente.

- [ ] **Step 8 : Consigner le résultat**

Si tout passe, rien à committer. Si un écart apparaît, le corriger dans `mse-assets.ts` ou `CardCanvas.tsx` puis committer le correctif avec un message `fix(studio): …`.

---

## Ce que ce plan ne fait pas

Repris du spec, § Hors périmètre — à ne pas traiter par zèle :

- hybride à trois couleurs ou plus ;
- les modes `artifact` et `multicolor` de `color_combination` ;
- les terrains bicolores (mode `multicolor` + `land`) ;
- les formes `radial`, `vertical`, `overlay` — le studio n'a pas de champ pour les choisir ;
- les chaînages de blends (un artefact hybride enchaîne deux compositions) ;
- les licences des cadres — bloquant distinct, suivi à part.
