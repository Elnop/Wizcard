# Fenêtre d'illustration — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre l'illustration visible sous tous les cadres en creusant sa fenêtre dans le cadre — par le masque déclaré par le corpus quand il existe, par la géométrie mesurée sinon.

**Architecture:** Le parseur de style existant apprend à lire la ligne `mask:` du bloc `image:` ; l'ingestion la stocke sous la clé `image` de `blend_masks` ; `CardCanvas` applique au cadre un masque qui rend tout visible sauf la fenêtre. Sans masque déclaré, le même masque est construit à partir de `geometry.art` — un rectangle noir au lieu d'une image.

**Tech Stack:** TypeScript, React 19, SVG (`<mask>`), Supabase (Postgres + Storage), Next.js 15.

## Global Constraints

- **Aucun framework de test dans ce dépôt.** Ne pas ajouter vitest/jest ; ne pas écrire de fichier `*.test.ts`. Les vérifications se font par script Node jetable dans le scratchpad, requête SQL, et navigateur.
- **`npm run check` n'est PAS vert à la base** (~60 problèmes préexistants dans des fichiers sans rapport). Le critère est **aucun NOUVEAU problème** — vérifier avec `npx eslint <fichiers modifiés>`.
- **`npm run build` est obligatoire** avant de déclarer le rendu terminé.
- **`npm run card-assets` écrit en PRODUCTION** tant que `.env.seed` est présent — il le charge après `.env.local` et cette cible l'emporte. Ne jamais le lancer tel quel. La Task 2 en a besoin pour écrire la colonne en local : elle passe par le retrait temporaire de `.env.seed` documenté dans `upload-templates.ts` (lignes 11-13), avec contrôle de l'URL loggée avant toute écriture, et restauration systématique. Le simple téléversement de fichiers, lui, se fait par `npm run card-assets:seed`, qui lit `.env.local` et refuse toute cible non locale.
- **Polarité du masque : blanc = la fenêtre**, noir = le cadre conservé.
- **`image_mask_inv.png` et toute variante `_inv` sont EXCLUS** : leur polarité est inversée (centre 0, coin 255, mesuré sur `magic-m15-Kaladesh` et `magic-m15-devoid`). Les traiter comme les autres effacerait le cadre et ne garderait que la fenêtre. Ces gabarits prennent le repli géométrique.
- **`maskUnits="userSpaceOnUse"` explicite** sur le masque, avec les dimensions du gabarit. Le défaut `objectBoundingBox` recadrerait sur la boîte de l'élément masqué.
- **Règle « pas de fallback » du projet :** ne jamais inventer une valeur. Un masque non résolu ⇒ repli géométrique explicite, jamais un chemin deviné.
- Le repli géométrique n'a **besoin d'aucune donnée nouvelle** : `boxes.image` est déjà mappé sur `geometry.art` (`template-geometry.ts:48`) et déjà utilisé par le `clipPath` de l'illustration (`CardCanvas.tsx:466`).

---

## Structure des fichiers

| Fichier                                                    | Rôle après ce chantier                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `scripts/mse-geometry/style-file.ts`                       | `StyleFile` porte en plus le masque déclaré du champ `image`       |
| `scripts/card-assets/generate-manifests.mjs`               | Écrit ce masque sous `blendMasks.image`                            |
| `src/lib/card-editor/mse-assets.ts`                        | `resolveArtWindowMask(template)` résout l'URL du masque, ou `null` |
| `src/lib/card-editor/components/CardCanvas/CardCanvas.tsx` | Le `<mask>` de fenêtre et son application au cadre                 |

Aucune migration : `blend_masks` est déjà une colonne `jsonb` d'objets de masques nommés, une clé de plus n'en demande pas.

---

### Task 1 : Le parseur lit le masque du champ image

**Files:**

- Modify: `scripts/mse-geometry/style-file.ts` (interface `StyleFile`, boucle de parsing)

**Interfaces:**

- Consumes: rien de nouveau.
- Produces: `StyleFile.imageMask?: string` — le nom de fichier déclaré par `mask:` dans le bloc `image:`, ou absent. Task 2 le consomme.

- [ ] **Step 1 : Lire le parseur pour trouver où se branche la lecture**

Lire `scripts/mse-geometry/style-file.ts` en entier. Repérer en particulier :

- l'interface `StyleFile` (~ligne 85) et `RawBox` (~ligne 63) ;
- `readStyleFile` (~ligne 377) ;
- la boucle qui reconnaît un bloc de champ et remplit `fields[...]` — c'est là que la ligne `mask:` doit être captée, dans le même passage.

Format à reconnaître, relevé dans `magic-m15-commander.mse-style/style` (lignes 220-227) : le bloc s'ouvre par `image:` précédé d'UNE tabulation, ses champs sont précédés de DEUX tabulations.

```
	image:
		left: 29
		top: 60
		width: 316
		height:	231
		z index: 1
		default: {default_image(card.card_color)}
		mask: image_mask.png
```

- [ ] **Step 2 : Écrire le script de vérification et constater l'échec**

```bash
cat > /tmp/claude-1000/-home-elthinkbuntu-Documents-Wizcard/fcade87f-2b5d-4554-baa3-129f3ee2368f/scratchpad/check-mask.ts <<'EOF'
import { readStyleFile } from '/home/elthinkbuntu/Documents/Wizcard/scripts/mse-geometry/style-file';

const ROOT = '/home/elthinkbuntu/Documents/Wizcard/assets/card-templates/card-assets/v/bcdf4190b4bf/full-magic-pack/data';

let failed = 0;
function eq(label: string, actual: unknown, expected: unknown) {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (!ok) failed += 1;
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} — attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`);
}

const read = (pkg: string) => readStyleFile(`${ROOT}/${pkg}.mse-style/style`, ROOT);

// Déclaration littérale.
eq('commander', read('magic-m15-commander')?.imageMask, 'image_mask.png');
// Aucun masque déclaré sur le champ image : m15 ne porte que border/foil.
eq('m15 (aucun)', read('magic-m15')?.imageMask, undefined);
// Déclaration pilotée par script : on retient la branche `else` (= standard).
eq('leveler (script)', read('magic-classicshifted-leveler')?.imageMask, 'imagemask_standard.png');
// Polarité inversée : exclu.
eq('Kaladesh (_inv exclu)', read('magic-m15-Kaladesh')?.imageMask, undefined);

console.log(failed === 0 ? '\nTOUT PASSE' : `\n${failed} ÉCHEC(S)`);
process.exit(failed === 0 ? 0 : 1);
EOF
cd /home/elthinkbuntu/Documents/Wizcard
npx tsx /tmp/claude-1000/-home-elthinkbuntu-Documents-Wizcard/fcade87f-2b5d-4554-baa3-129f3ee2368f/scratchpad/check-mask.ts
```

Attendu : **des FAIL** (le champ `imageMask` n'existe pas encore, donc `undefined` partout — les deux cas attendant `undefined` passeront, les deux autres échoueront). Si les quatre passent déjà, s'arrêter et le signaler : le script ne teste pas ce qu'il croit.

La signature `readStyleFile(path: string, corpusRoot: string): StyleFile | null` (ligne 377) a été vérifiée : l'appel du script est correct tel quel.

- [ ] **Step 3 : Ajouter le champ à l'interface**

Dans `StyleFile` :

```ts
	/**
	 * Nom du fichier de masque déclaré par `mask:` dans le bloc `image:`, s'il
	 * y en a un. Sert à creuser la fenêtre d'illustration dans un cadre opaque.
	 * Absent quand le style n'en déclare pas — le rendu retombe alors sur la
	 * géométrie mesurée.
	 */
	imageMask?: string;
```

- [ ] **Step 4 : Capter la ligne `mask:` du bloc image**

Dans la boucle de parsing, là où le bloc `image` est reconnu et son `RawBox` rempli, capter aussi `mask:`. La valeur est soit un nom de fichier littéral, soit un script.

```ts
/**
 * Masque déclaré par un champ. Deux formes dans le corpus :
 *
 *   mask: image_mask.png
 *   mask:
 *     script: if styling.image_size == "extended" then "imagemask_extended.png"
 *             else "imagemask_standard.png"
 *
 * Le studio n'expose pas l'option `image_size` de MSE : on retient la branche
 * `else`, qui est le défaut de MSE lui-même. Un script dont on ne sait pas
 * extraire une constante ne donne AUCUN masque — le rendu retombe alors sur la
 * géométrie, plutôt que d'inventer un nom de fichier.
 *
 * Les variantes `_inv` sont écartées : leur polarité est inversée (centre noir,
 * coins blancs), les appliquer effacerait le cadre au lieu de la fenêtre.
 */
function maskFileFrom(raw: string): string | undefined {
	const literal = /^\s*([\w.-]+\.png)\s*$/i.exec(raw);
	const candidate = literal
		? literal[1]
		: (/else\s+"([\w.-]+\.png)"/i.exec(raw)?.[1] ?? /"([\w.-]+\.png)"/i.exec(raw)?.[1]);
	if (!candidate) return undefined;
	if (/_inv\d*\.png$/i.test(candidate)) return undefined;
	return candidate;
}
```

Brancher `maskFileFrom` sur la valeur lue pour la clé `mask` du bloc `image`, et n'affecter `imageMask` que si le résultat est défini. Ne pas capter `mask:` pour les autres blocs — `border_mask` et `foil_mask` répondent à d'autres besoins et sont hors périmètre.

- [ ] **Step 5 : Ré-exécuter le script**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
npx tsx /tmp/claude-1000/-home-elthinkbuntu-Documents-Wizcard/fcade87f-2b5d-4554-baa3-129f3ee2368f/scratchpad/check-mask.ts
```

Attendu : **TOUT PASSE**.

- [ ] **Step 6 : Mesurer la couverture réelle**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
cat > /tmp/claude-1000/-home-elthinkbuntu-Documents-Wizcard/fcade87f-2b5d-4554-baa3-129f3ee2368f/scratchpad/coverage.ts <<'EOF'
import { readStyleFile } from '/home/elthinkbuntu/Documents/Wizcard/scripts/mse-geometry/style-file';
import fs from 'node:fs';
const ROOT = '/home/elthinkbuntu/Documents/Wizcard/assets/card-templates/card-assets/v/bcdf4190b4bf/full-magic-pack/data';
let withMask = 0, without = 0;
const names = new Map<string, number>();
for (const d of fs.readdirSync(ROOT).filter((n) => n.endsWith('.mse-style'))) {
	const s = readStyleFile(`${ROOT}/${d}/style`, ROOT);
	if (!s) continue;
	if (s.imageMask) { withMask += 1; names.set(s.imageMask, (names.get(s.imageMask) ?? 0) + 1); }
	else without += 1;
}
console.log('avec masque:', withMask, ' sans:', without);
console.log([...names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));
EOF
npx tsx /tmp/claude-1000/-home-elthinkbuntu-Documents-Wizcard/fcade87f-2b5d-4554-baa3-129f3ee2368f/scratchpad/coverage.ts
```

Attendu : un nombre substantiel de styles avec masque (le spec en mesurait 68 sur les 109 rendus, ici on balaie les 376 paquets donc le total sera plus élevé), et **aucun nom en `_inv`** dans la liste. Si un `_inv` apparaît, le filtre ne fonctionne pas — corriger avant de continuer.

- [ ] **Step 7 : Types, lint, commit**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -F 'style-file.ts'
npx eslint scripts/mse-geometry/style-file.ts
git add scripts/mse-geometry/style-file.ts
git commit -m "feat(mse-geometry): read the image field's mask declaration

The corpus hides the artwork mask behind at least eight filenames, so
matching on the name would be guesswork — and would swallow the _inv
variants, whose polarity is reversed. The declaration is the source of
truth. Script-driven declarations resolve to their else branch, which is
MSE's own default; anything less legible yields no mask at all.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015hF7jdXAcFnXF2uDLwBr4q"
```

---

### Task 2 : L'ingestion stocke le masque

**Files:**

- Modify: `scripts/card-assets/generate-manifests.mjs` (`resolveBlendMasks`, ~ligne 188, et son appelant `buildTemplate` ~ligne 269)

**Interfaces:**

- Consumes: `StyleFile.imageMask?: string` (Task 1).
- Produces: `blendMasks.image` — chemin relatif à `assets/card-templates`, dans le manifeste puis la colonne `blend_masks`. Task 3 le lit.

- [ ] **Step 1 : Lire l'existant**

Lire `scripts/card-assets/generate-manifests.mjs`, en particulier :

- `BLEND_MASK_FILES` (~ligne 182) et `resolveBlendMasks` (~ligne 188) — la mécanique actuelle cherche des noms **figés** (`hybrid_blend_card.png`, etc.) parmi les fichiers disponibles ;
- `buildTemplate` (~ligne 199) — il lit déjà le fichier `style` dans `source` et appelle `resolveBlendMasks(source, styleDirectory)` ;
- `listCandidateImages` — le balayage partagé des images candidates.

Le masque d'illustration ne peut PAS passer par `BLEND_MASK_FILES` : son nom varie d'un paquet à l'autre. Il vient du nom que Task 1 a extrait.

- [ ] **Step 2 : Résoudre le masque déclaré**

Ajouter dans `generate-manifests.mjs`, à côté de `resolveBlendMasks` :

```js
/**
 * Masque de la fenêtre d'illustration.
 *
 * Contrairement aux masques de fondu, son nom de fichier n'est pas stable dans
 * le corpus (`image_mask.png`, `imagemask.png`, `mask_image.png`, …) : on ne
 * peut pas le deviner. Le nom vient de la DÉCLARATION `mask:` du bloc `image:`,
 * lue par le parseur de style, et on ne fait ici que le localiser sur le
 * disque. Introuvable ⇒ pas de masque, et le rendu retombe sur la géométrie.
 */
async function resolveImageMask(styleDirectory, imageMask) {
	if (!imageMask) return null;
	const candidate = path.join(styleDirectory, imageMask);
	try {
		await fs.access(candidate);
	} catch {
		return null;
	}
	return normalize(path.relative(PUBLIC_ROOT, candidate));
}
```

- [ ] **Step 3 : Brancher sur `buildTemplate`**

Dans `buildTemplate`, là où `blendMasks` est calculé (~ligne 269), fusionner la clé `image`. Le nom déclaré vient du `StyleFile` correspondant ; si `buildTemplate` n'a pas déjà accès au `StyleFile` parsé, extraire le nom directement du `source` déjà lu, avec la même règle que Task 1 :

```js
const blendMasks = await resolveBlendMasks(source, styleDirectory);
const imageMaskPath = await resolveImageMask(styleDirectory, imageMaskNameFrom(source));
const masks = imageMaskPath ? { ...(blendMasks ?? {}), image: imageMaskPath } : blendMasks;
```

et remplacer `blendMasks: await resolveBlendMasks(...)` par `blendMasks: masks` dans l'objet retourné.

`imageMaskNameFrom(source)` doit appliquer exactement la règle de Task 1 : trouver le bloc `image:` (une tabulation), y lire `mask:` (deux tabulations), retenir un littéral `*.png` ou la branche `else` d'un script, exclure `_inv`. **Ne pas dupliquer la logique** : si `scripts/mse-geometry/style-file.ts` peut être importé depuis ce script `.mjs`, importer `maskFileFrom` et le bloc de lecture plutôt que de les réécrire. Si l'import n'est pas possible (ESM/TS), extraire la règle dans un petit module `.mjs` partagé, importé par les deux — comme `crown-compat.mjs` et `frame-keywords.mjs` le font déjà pour d'autres règles d'ingestion.

- [ ] **Step 4 : Régénérer les manifestes et vérifier**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
node scripts/card-assets/generate-manifests.mjs
grep -c '"image"' assets/card-templates/manifests/*.json | head -3
```

Attendu : la clé `image` apparaît dans les manifestes. Vérifier qu'aucun chemin ne contient `_inv` :

```bash
grep -o '"image": "[^"]*"' assets/card-templates/manifests/*.json | grep -c "_inv"
```

Attendu : **0**.

- [ ] **Step 5 : Peupler la base et le stockage LOCAUX**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
npm run card-assets:seed
```

**Ne PAS lancer `npm run card-assets`** — il vise la production.

`card-assets:seed` téléverse les fichiers mais **n'écrit pas** la colonne `blend_masks`. C'est `upload-templates.ts` qui fait l'upsert de la table — et il choisit sa cible via `resolveSupabaseEnv`, qui lit `.env.local` **puis** `.env.seed`, ce dernier gagnant et pointant sur la PRODUCTION.

Le fichier documente lui-même (lignes 11-13) la seule façon sûre de viser le local : **retirer temporairement `.env.seed`**, jamais un flag.

```bash
cd /home/elthinkbuntu/Documents/Wizcard
mv .env.seed .env.seed.off
npm run card-assets          # vise le LOCAL tant que .env.seed est absent
mv .env.seed.off .env.seed   # À FAIRE IMPÉRATIVEMENT, même en cas d'échec
```

**Vérifier l'URL loggée avant de laisser le script écrire** : il journalise sa cible au démarrage. Si elle n'est pas `127.0.0.1`, interrompre immédiatement et restaurer `.env.seed`.

Puis contrôler :

```bash
docker exec $(docker ps --format '{{.Names}}' | grep -i supabase_db | head -1) \
  psql -U postgres -d postgres -c "
select count(*) filter (where blend_masks ? 'image') as avec_masque_image,
       count(*) as total
from card_templates where geometry is not null;"
```

Attendu : `avec_masque_image` nettement supérieur à 0 (le spec en mesurait 68 sur les 109 rendus). Si le compte vaut 0, ne pas poursuivre : Task 3 lirait une colonne vide et Task 4 ne pourrait rien constater.

- [ ] **Step 6 : Lint et commit**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
npx eslint scripts/card-assets/generate-manifests.mjs
git add scripts/card-assets/ assets/card-templates/manifests/
git commit -m "feat(card-assets): ingest the artwork window mask

Its filename is not stable across the corpus, so it cannot join the fixed
BLEND_MASK_FILES list: the name comes from the style declaration and this
step only locates the file. Missing file means no mask, and the render
falls back to the measured geometry.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015hF7jdXAcFnXF2uDLwBr4q"
```

---

### Task 3 : Creuser la fenêtre dans le cadre

**Files:**

- Modify: `src/lib/card-editor/mse-assets.ts` (ajouter `resolveArtWindowMask`)
- Modify: `src/lib/card-editor/components/CardCanvas/CardCanvas.tsx` (prop, `<mask>`, application au cadre)

**Interfaces:**

- Consumes: `blendMasks.image` (Task 2), `geometry.art: { x: number; y: number; width: number; height: number }` (existant).
- Produces: `resolveArtWindowMask(template: MseTemplate | undefined): string | null` et le prop `artWindowMask?: string | null` sur `CardCanvas`.

- [ ] **Step 1 : Résoudre l'URL du masque**

Dans `src/lib/card-editor/mse-assets.ts`, à côté de `resolveMseBlend`, ajouter :

```ts
/**
 * Masque de la fenêtre d'illustration.
 *
 * Les cadres du corpus sont des JPEG OPAQUES qui peignent la zone
 * d'illustration en noir : peints par-dessus l'illustration, ils la
 * recouvrent. Ce masque sert à y creuser la fenêtre.
 *
 * `null` quand le gabarit n'en déclare pas — l'appelant retombe alors sur la
 * géométrie mesurée, qui ouvre une fenêtre rectangulaire. C'est ce que fait
 * MSE lui-même pour ces styles : `magic-m15.mse-style` ne déclare aucun masque
 * sur son champ image.
 */
export function resolveArtWindowMask(template: MseTemplate | undefined): string | null {
	const maskPath = template?.blendMasks?.image;
	if (!maskPath) return null;
	return cardAssetUrl(maskPath) ?? null;
}
```

Vérifier le nom exact du helper d'URL utilisé par `resolveMseBlend` dans ce fichier (`cardAssetUrl`) et l'employer à l'identique.

- [ ] **Step 2 : Passer le masque au canvas**

Dans `CardCanvas.tsx`, ajouter le prop à côté de `mseFramePath` (~ligne 39) :

```ts
	artWindowMask?: string | null;
```

C'est le seul site de déclaration — le composant interne réutilise ce type via `Omit<CardCanvasProps, …>`. Le déstructurer là où `mseFramePath` l'est (~ligne 424 et ~ligne 858), et le passer au composant interne (~ligne 892), en suivant exactement le chemin de `mseFramePath`.

Côté studio, `CardEditorStudio.tsx` porte **trois** instances de canvas (aperçu + deux cachées pour l'export PNG et la sauvegarde), aux lignes **363, 383 et 401** — vérifié. Chacune reçoit `mseFramePath={resolveMseFramePath(selectedMseTemplate, …)}` ; ajouter à côté, sur les trois :

```tsx
artWindowMask={resolveArtWindowMask(selectedMseTemplate)}
```

Le masque ne dépend que du gabarit, pas de la face — le même appel convient aux trois. Ajouter `resolveArtWindowMask` à l'import depuis `@/lib/card-editor/mse-assets` (ligne 14 y importe déjà `resolveMseFramePath`).

- [ ] **Step 3 : Peindre le masque**

Dans `CardSvg` (le composant interne de `CardCanvas.tsx`), juste AVANT le bloc qui peint le cadre (`{mseBlend ? … : mseFramePath && …}`, ~ligne 493), insérer la définition du masque :

```tsx
{
	/*
	 * Fenêtre d'illustration. Les cadres du corpus sont opaques et
	 * peignent la zone d'illustration en noir : sans ce masque, le cadre
	 * recouvre l'illustration peinte juste avant lui.
	 *
	 * Le <rect> blanc rend tout le cadre visible ; le masque, blanc dans
	 * sa fenêtre, y creuse le trou. Sans masque déclaré, un rectangle
	 * noir aux dimensions de la zone mesurée fait le même office — c'est
	 * ce que MSE fait pour ces styles, qui ne déclarent aucun masque.
	 *
	 * `maskUnits="userSpaceOnUse"` est explicite : le défaut
	 * `objectBoundingBox` recadrerait le masque sur la boîte de
	 * l'élément masqué au lieu de la carte.
	 */
}
<mask
	id={`${clipId}-artwin`}
	maskUnits="userSpaceOnUse"
	x="0"
	y="0"
	width={geometry.width}
	height={geometry.height}
>
	<rect x="0" y="0" width={geometry.width} height={geometry.height} fill="white" />
	{artWindowMask ? (
		<image
			href={artWindowMask}
			x={geometry.art.x}
			y={geometry.art.y}
			width={geometry.art.width}
			height={geometry.art.height}
			preserveAspectRatio="none"
		/>
	) : (
		<rect
			x={geometry.art.x}
			y={geometry.art.y}
			width={geometry.art.width}
			height={geometry.art.height}
			fill="black"
		/>
	)}
</mask>;
```

Les noms de champs ont été vérifiés : `template-geometry.ts:38-43` mappe chaque boîte vers `{ x, y, width, height }` (type `CardRect`), déjà mis à l'échelle de la carte. Le code ci-dessus convient tel quel.

- [ ] **Step 4 : Appliquer le masque au cadre**

Deux branches à couvrir, car un hybride peint trois couches et un cadre ordinaire une seule.

**Branche ordinaire** (`mseFramePath &&`, ~ligne 588) : ajouter `mask={`url(#${clipId}-artwin)`}` sur le `<image>` du cadre.

**Branche hybride** : envelopper l'ENSEMBLE des couches (la plaque grise et le `<g>` des couleurs) dans un `<g mask={...}>`, et non chaque couche séparément — une seule fenêtre, creusée une fois :

```tsx
				<g mask={`url(#${clipId}-artwin)`}>
					<image href={mseBlend.plate} … />
					<g mask={`url(#${clipId}-hyplate)`}>
						<image href={mseBlend.base} … />
						<image href={mseBlend.overlay} mask={`url(#${clipId}-hygrad-mask)`} … />
					</g>
				</g>
```

Les `<linearGradient>` et les deux `<mask>` du fondu restent où ils sont — ce ne sont pas des éléments peints.

**Ne pas masquer la couronne légendaire** (`mseCrownPath`, ~ligne 542) : elle mord sur la barre de titre, loin de la fenêtre, et la masquer n'aurait aucun effet visible tout en brouillant l'intention.

- [ ] **Step 5 : Types, lint, build**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E 'CardCanvas|mse-assets|CardEditorStudio'
npx eslint src/lib/card-editor/mse-assets.ts src/lib/card-editor/components/CardCanvas/CardCanvas.tsx "src/app/[locale]/studio/components/CardEditorStudio/CardEditorStudio.tsx"
npm run build
```

Attendu : les trois propres.

- [ ] **Step 6 : Commit**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
git add src/lib/card-editor/ "src/app/[locale]/studio/components/CardEditorStudio/CardEditorStudio.tsx"
git commit -m "fix(studio): cut the artwork window out of the frame

The corpus frames are opaque JPEGs that paint the artwork area pure black,
so painting one over the artwork hid it entirely. A mask now carves the
window back out — from the corpus mask where one is declared, from the
measured geometry otherwise, which is what MSE does for those styles.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015hF7jdXAcFnXF2uDLwBr4q"
```

---

### Task 4 : Vérification navigateur

**Files:** aucun (vérification seule ; si elle échoue, corriger dans les fichiers des tâches 1-3).

**Interfaces:**

- Consumes: le rendu livré par les tâches 1 à 3.
- Produces: rien.

C'est la porte qui compte : le bug a été signalé visuellement, il doit être constaté résolu visuellement.

- [ ] **Step 1 : Serveur de dev**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
curl -s -o /dev/null -w '%{http_code}\n' --max-time 5 http://localhost:3000/fr/studio
```

Si ce n'est pas `200`/`307`, lancer `npm run dev` en tâche de fond et attendre.

- [ ] **Step 2 : Ouvrir le studio et importer une illustration**

Charger les outils Chrome en UN seul appel :

```
ToolSearch query "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__browser_batch"
```

Puis `tabs_context_mcp`, un nouvel onglet, `http://localhost:3000/fr/studio`. Le brouillon local porte déjà une illustration importée ; sinon en importer une par l'onglet **Illustration**.

Deux pièges relevés sur ce projet : l'action `zoom` fige le renderer de cet onglet — pour grossir, cloner le SVG dans la page et prendre une capture normale. Et une illustration en data URI de plusieurs centaines de Ko peut faire échouer les captures ; dans ce cas, mesurer par le DOM plutôt que par l'image.

- [ ] **Step 3 : Le cas qui a révélé le bug**

Sur `magic-m15-commander` (masque déclaré) : l'illustration doit être **visible**, et la fenêtre épouser la forme du cadre.

Contrôle DOM :

```js
const s = [...document.querySelectorAll('svg')].filter((x) => x.querySelector('image'))[0];
const r = s.getBoundingClientRect(),
	vb = s.viewBox.baseVal;
const [cx, cy] = [r.left + 0.5 * r.width, r.top + 0.34 * r.height]; // centre de la zone d'art
console.log(
	'[ART] au sommet :',
	document
		.elementsFromPoint(cx, cy)
		.slice(0, 3)
		.map(
			(e) =>
				e.tagName +
				(e.getAttribute && (e.getAttribute('href') || '').startsWith('data:') ? '[data-uri]' : '')
		)
		.join(' | ')
);
console.log(
	'[ART] masque sur le cadre :',
	s.querySelector('image[href^="http"]')?.getAttribute('mask')
);
console.log('[ART] masques :', [...s.querySelectorAll('mask')].map((m) => m.id).join(', '));
```

Attendu : `image[data-uri]` au sommet à ce point, un `mask="url(#…-artwin)"` sur le cadre, et `-artwin` parmi les masques.

- [ ] **Step 4 : Le repli géométrique**

Basculer sur `magic-m15` (aucun masque déclaré). Attendu : l'illustration est **visible** dans une fenêtre rectangulaire, et le même contrôle DOM montre `-artwin` présent — mais le `<mask>` contient alors un `<rect>` et non un `<image>` :

```js
const s = [...document.querySelectorAll('svg')].filter((x) => x.querySelector('image'))[0];
const m = [...s.querySelectorAll('mask')].find((m) => m.id.endsWith('-artwin'));
console.log('[ART] contenu du masque :', [...m.children].map((c) => c.tagName).join(', '));
```

Attendu : `rect, rect` (le blanc plein + le noir de la fenêtre).

- [ ] **Step 5 : Non-régression du fondu hybride**

Saisir un coût `{G/U}` sur un gabarit hybride (`magic-m15`). Attendu :

- l'illustration reste **visible** ;
- le dégradé vert→bleu et les plaques grises sont **inchangés**.

C'est le contrôle qui prouve que l'enveloppe `<g mask>` n'a pas cassé la composition à trois couches.

- [ ] **Step 6 : Export PNG**

Déclencher l'export PNG et ouvrir le fichier. Attendu : l'illustration y est visible, la fenêtre découpée comme à l'écran.

- [ ] **Step 7 : Consigner**

Si tout passe, rien à committer. Sinon corriger et committer avec un message `fix(studio): …`.

---

## Ce que ce plan ne fait pas

Repris du spec, § Hors périmètre :

- les masques `_inv` — exclus, repli géométrique pour ces gabarits ;
- l'option `image_size` de MSE (`extended`) — le studio n'a pas de champ pour la choisir ;
- les masques `border_mask` et `foil_mask`, qui répondent à d'autres besoins ;
- le recadrage de l'illustration (zoom, décalage) — déjà en place et inchangé ;
- les licences des cadres — bloquant distinct.
