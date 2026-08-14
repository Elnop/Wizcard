# Lecture de la ligne de type — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `parseTypeLine` cesse de couper sur le trait d'union (qui casse `Assembly-Worker` et `Power-Plant`) et ventile par vocabulaire les lignes sans tiret, pour que des sous-types saisis seuls reviennent dans leur champ.

**Architecture:** Trois changements dans un seul module pur, `type-line.ts` : la classe de séparateur passe de `[—-]` à `[—–]` ; sans tiret, un mot inconnu du vocabulaire part en `subtypes` au lieu de `types` ; `hasCardType` élargit sa recherche aux sous-types quand la ligne n'a pas de tiret, ce qui empêche une régression sur le cadre terrain. Le vocabulaire arrive par un resolver injecté, jamais par un import de store — `type-line.ts` est atteignable côté serveur.

**Tech Stack:** TypeScript, React 19, Zustand (lu via `getState()`), Next.js 15 App Router.

## Global Constraints

- **Aucun framework de test dans ce dépôt.** Ne pas ajouter vitest/jest ; ne pas écrire de fichier `*.test.ts`. Les vérifications se font par un script Node jetable dans le scratchpad, puis dans le navigateur.
- **`npm run check` n'est PAS vert à la base** (~60 problèmes préexistants dans des fichiers sans rapport). Le critère est **aucun NOUVEAU problème** — vérifier avec `npx eslint <fichiers modifiés>`.
- **`npm run build` est obligatoire** : c'est la seule porte qui attrape une violation de frontière client/serveur. `tsc` et ESLint ne la voient pas.
- **Aucun import de store Zustand au niveau module dans `type-line.ts`.** Le fichier est atteint côté serveur (`db/custom-card-editor.ts` → `draft.ts` → `isTokenTypeLine`), et un tel import casse le build Turbopack.
- **Le trait d'union n'est jamais un séparateur.** Vérifié sur l'API Scryfall : le vocabulaire officiel ne contient que deux entrées à trait d'union, `Assembly-Worker` (type de créature) et `Power-Plant` (type de terrain), et aucune dans `card-types` ni `supertypes`.
- **Ne jamais lancer `npm run card-assets`** : `.env.seed` est chargé avec `override: true`, ce script écrit en PRODUCTION. Ce chantier n'en a aucun besoin.
- Le studio sert aussi à **inventer** des types : une valeur hors vocabulaire doit toujours être acceptée telle quelle, jamais rejetée ni corrigée.

---

## Structure des fichiers

| Fichier                                          | Rôle après ce chantier                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `src/lib/card-editor/type-line.ts`               | Séparateur corrigé, ventilation par vocabulaire, resolver injectable, `hasCardType` sensible au tiret |
| `src/lib/card-editor/useTypeVocabularyBridge.ts` | **Créé** — branche le store Zustand sur le resolver, côté client uniquement                           |
| `src/app/[locale]/studio/useCardEditor.ts`       | Appelle le hook de branchement une fois pour le studio                                                |

`TypeLineField.tsx` et `CardEditorStudio.tsx` ne changent pas : ils passent déjà le vocabulaire explicitement à `parseTypeLine`.

---

### Task 1 : Corriger le séparateur et la ventilation

**Files:**

- Modify: `src/lib/card-editor/type-line.ts` (fonction `parseTypeLine`, ~lignes 100-124)

**Interfaces:**

- Consumes: rien de nouveau.
- Produces: `parseTypeLine(typeLine: string, vocabulary: { supertypes: string[]; types: string[] } | null): TypeLineParts` — signature **inchangée**, comportement corrigé. Task 3 s'appuie dessus.

- [ ] **Step 1 : Écrire le script de vérification et constater l'échec**

Ce dépôt n'a pas de framework de test. Créer un script jetable qui importe la vraie fonction via `tsx` :

```bash
mkdir -p /tmp/claude-1000/-home-elthinkbuntu-Documents-Wizcard/fcade87f-2b5d-4554-baa3-129f3ee2368f/scratchpad
cat > /tmp/claude-1000/-home-elthinkbuntu-Documents-Wizcard/fcade87f-2b5d-4554-baa3-129f3ee2368f/scratchpad/check-type-line.ts <<'EOF'
import {
	parseTypeLine,
	hasCardType,
	isLandTypeLine,
} from '/home/elthinkbuntu/Documents/Wizcard/src/lib/card-editor/type-line';

const V = {
	supertypes: ['Basic', 'Legendary', 'Snow', 'World', 'Ongoing', 'Elite', 'Token'],
	types: ['Creature', 'Land', 'Artifact', 'Enchantment', 'Instant', 'Sorcery', 'Battle', 'Planeswalker', 'Kindred'],
};

let failed = 0;
function eq(label: string, actual: unknown, expected: unknown) {
	const a = JSON.stringify(actual);
	const e = JSON.stringify(expected);
	const ok = a === e;
	if (!ok) failed += 1;
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}\n       attendu ${e}\n       obtenu  ${a}`);
}

// 1. Le trait d'union ne coupe plus : sous-types officiels préservés.
eq('Assembly-Worker seul', parseTypeLine('Assembly-Worker', V).subtypes, ['Assembly-Worker']);
eq('Power-Plant seul', parseTypeLine('Power-Plant', V).subtypes, ['Power-Plant']);
eq("Urza's Power-Plant", parseTypeLine("Urza's Power-Plant", V).subtypes, ["Urza's", 'Power-Plant']);

// 2. Sans tiret, ventilation par vocabulaire.
eq('Humain Sorcier -> subtypes', parseTypeLine('Humain Sorcier', V).subtypes, ['Humain', 'Sorcier']);
eq('Humain Sorcier -> types vides', parseTypeLine('Humain Sorcier', V).types, []);
eq('Creature seul -> types', parseTypeLine('Creature', V).types, ['Creature']);
eq('Basic Land -> supertypes', parseTypeLine('Basic Land', V).supertypes, ['Basic']);
eq('Basic Land -> types', parseTypeLine('Basic Land', V).types, ['Land']);

// 3. Avec tiret, la grammaire explicite est respectée — rien ne change.
eq('avec tiret : supertypes', parseTypeLine('Legendary Creature — Human Wizard', V).supertypes, ['Legendary']);
eq('avec tiret : types', parseTypeLine('Legendary Creature — Human Wizard', V).types, ['Creature']);
eq('avec tiret : subtypes', parseTypeLine('Legendary Creature — Human Wizard', V).subtypes, ['Human', 'Wizard']);
eq('tiret + trait union', parseTypeLine('Artifact Creature — Assembly-Worker', V).subtypes, ['Assembly-Worker']);

// 4. Sans vocabulaire (chemin serveur) : tout à gauche reste dans types.
eq('null : Basic Land', parseTypeLine('Basic Land', null).types, ['Basic', 'Land']);
eq('null : Terrain', parseTypeLine('Terrain', null).types, ['Terrain']);

// 5. hasCardType — le cadre terrain et le layout jeton en dépendent.
for (const [line, expected] of [
	['Terrain', true], ['Terrain de base', true], ['Basic Land', true], ['Land', true],
	["Land — Urza's Power-Plant", true], ["Legendary Land — Urza's Saga", true],
	['Creature — Elemental Shaman', false], ['Creature — Landwalker', false],
	['Creature — Land Golem', false], ['Enchantment', false],
] as [string, boolean][]) {
	eq(`isLandTypeLine(${JSON.stringify(line)})`, isLandTypeLine(line), expected);
}
eq('isTokenTypeLine via hasCardType', hasCardType('Token Creature — Soldier', 'token'), true);
eq('pas un jeton', hasCardType('Creature — Token Beast', 'token'), false);

console.log(failed === 0 ? '\nTOUT PASSE' : `\n${failed} ÉCHEC(S)`);
process.exit(failed === 0 ? 0 : 1);
EOF
```

Le chemin d'import absolu ci-dessus a été vérifié : `npx tsx` résout bien le module depuis le scratchpad, sans configuration supplémentaire. Exécuter :

```bash
cd /home/elthinkbuntu/Documents/Wizcard
npx tsx /tmp/claude-1000/-home-elthinkbuntu-Documents-Wizcard/fcade87f-2b5d-4554-baa3-129f3ee2368f/scratchpad/check-type-line.ts
```

Attendu : **plusieurs FAIL**, notamment `Assembly-Worker seul`, `Power-Plant seul`, `Humain Sorcier -> subtypes`, et les `isLandTypeLine` en français. C'est la preuve que le script teste bien le défaut. S'il passe déjà tout, s'arrêter et le signaler : le script ne teste pas ce qu'il croit.

- [ ] **Step 2 : Corriger `parseTypeLine`**

Remplacer le corps de la fonction (`src/lib/card-editor/type-line.ts`, à partir de `export function parseTypeLine`). La docstring au-dessus décrit l'ancienne règle et doit être remplacée elle aussi :

```ts
/**
 * Lit une ligne existante et la ventile dans les trois listes.
 *
 * Sert à réhydrater l'éditeur depuis un brouillon ou une carte enregistrée :
 * seule la chaîne est stockée, il faut donc savoir la relire.
 *
 * Deux régimes, selon que la ligne porte un tiret ou non :
 *
 * - AVEC tiret, la grammaire est explicite — gauche = supertypes puis types,
 *   droite = sous-types. Un mot inconnu à gauche reste un type.
 * - SANS tiret, la ventilation est une déduction : on s'appuie sur le
 *   vocabulaire. « Creature » est un type, « Humain » un sous-type. Sans cette
 *   règle, des sous-types saisis seuls restaient bloqués dans le champ Types et
 *   n'en ressortaient jamais.
 *
 * Sans vocabulaire (chemin serveur, ou premier rendu avant que le store soit
 * rempli), on retombe sur l'ancien comportement : tout à gauche dans `types`.
 */
export function parseTypeLine(
	typeLine: string,
	vocabulary: { supertypes: string[]; types: string[] } | null
): TypeLineParts {
	// Seuls les tirets de SÉPARATION coupent la ligne : cadratin (celui
	// qu'écrit `composeTypeLine`) et demi-cadratin (confusion de saisie
	// plausible). PAS le trait d'union : le vocabulaire officiel contient
	// `Assembly-Worker` et `Power-Plant`, et couper dessus les déchirait en
	// deux. On cherche l'index plutôt qu'une regex encadrée d'espaces
	// optionnels, qui backtracke (sonarjs/super-linear-regex).
	const dashIndex = typeLine.search(/[—–]/);
	const hasDash = dashIndex !== -1;
	const leftRaw = hasDash ? typeLine.slice(0, dashIndex) : typeLine;
	const rightRaw = hasDash ? typeLine.slice(dashIndex + 1) : '';
	const knownSupertypes = new Set((vocabulary?.supertypes ?? []).map((v) => v.toLowerCase()));
	const knownTypes = new Set((vocabulary?.types ?? []).map((v) => v.toLowerCase()));

	const supertypes: string[] = [];
	const types: string[] = [];
	const looseSubtypes: string[] = [];
	for (const word of leftRaw.split(/\s+/).filter(Boolean)) {
		if (knownSupertypes.has(word.toLowerCase())) supertypes.push(word);
		else if (hasDash || !vocabulary) types.push(word);
		else if (knownTypes.has(word.toLowerCase())) types.push(word);
		else looseSubtypes.push(word);
	}

	return {
		supertypes,
		types,
		subtypes: [...looseSubtypes, ...rightRaw.split(/\s+/).filter(Boolean)],
	};
}
```

- [ ] **Step 3 : Ré-exécuter le script**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
npx tsx /tmp/claude-1000/-home-elthinkbuntu-Documents-Wizcard/fcade87f-2b5d-4554-baa3-129f3ee2368f/scratchpad/check-type-line.ts
```

Attendu : les assertions 1 à 4 passent. Les `isLandTypeLine` en **français** (`Terrain`, `Terrain de base`) **échouent encore** — c'est normal, Task 2 les traite. Ne pas modifier `hasCardType` ici.

- [ ] **Step 4 : Types et lint**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -F 'type-line.ts'
npx eslint src/lib/card-editor/type-line.ts
```

Attendu : les deux muets.

- [ ] **Step 5 : Commit**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
git add src/lib/card-editor/type-line.ts
git commit -m "fix(studio): stop splitting type lines on the hyphen

Assembly-Worker and Power-Plant are the only hyphenated entries in the
official vocabulary, and both were torn in two. The hyphen is never a
separator — only the em and en dashes are.

Without a dash the split between types and subtypes is a deduction, so it
now leans on the vocabulary: subtypes typed alone reach the right field
instead of being stuck in Types forever.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015hF7jdXAcFnXF2uDLwBr4q"
```

---

### Task 2 : `hasCardType` sensible au tiret, branché sur le vrai vocabulaire

**Files:**

- Modify: `src/lib/card-editor/type-line.ts` (resolver + fonction `hasCardType`, ~lignes 147-151)
- Create: `src/lib/card-editor/useTypeVocabularyBridge.ts`
- Modify: `src/app/[locale]/studio/useCardEditor.ts` (appeler le hook)

**Interfaces:**

- Consumes: `parseTypeLine` (Task 1).
- Produces:
  - `hasCardType(typeLine: string, type: string): boolean` — signature inchangée. `isLandTypeLine` et `isTokenTypeLine` l'appellent déjà et n'ont pas à changer.
  - `TypeVocabularySource = { supertypes: string[]; types: string[] } | null`
  - `setTypeVocabularyResolver(resolver: () => TypeVocabularySource): void`
  - `resolveTypeVocabulary(): TypeVocabularySource`
  - `useTypeVocabularyBridge(): void`

**Pourquoi cette tâche existe.** Task 1 introduit une régression que le script rend visible : `Terrain` seul part désormais en `subtypes`, parce que le vocabulaire Scryfall est **anglais** et ne connaît pas « Terrain ». `hasCardType` ne cherchant que dans supertypes+types, le cadre de terrain serait perdu sur la saisie française la plus banale.

**Pourquoi le vivier ET le câblage dans la même tâche.** `hasCardType` a besoin du vrai vocabulaire pour être juste. Les livrer séparément obligerait à écrire un `parseTypeLine(typeLine, null)` provisoire, remplacé aussitôt après : du code mort-né dans l'historique. Les deux arrivent donc ensemble, et la fonction est correcte dès son premier commit.

**Pourquoi un hook et pas un effet de module.** Le spec proposait de brancher le resolver par un `setTypeVocabularyResolver(...)` au niveau module de `mse-assets.ts`. C'est fragile : un effet de bord au niveau module dépend de l'ordre d'import, ne se rejoue pas, et ne se teste pas. Un hook appelé pendant le rendu est explicite et rejouable. Le résultat pour l'utilisateur est identique.

- [ ] **Step 1 : Constater l'échec ciblé**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
npx tsx /tmp/claude-1000/-home-elthinkbuntu-Documents-Wizcard/fcade87f-2b5d-4554-baa3-129f3ee2368f/scratchpad/check-type-line.ts 2>&1 | grep -E 'FAIL|ÉCHEC|TOUT'
```

Attendu : des FAIL sur `isLandTypeLine("Terrain")` et `isLandTypeLine("Terrain de base")`, et rien d'autre.

- [ ] **Step 2 : Ajouter le resolver dans `type-line.ts`**

Insérer juste avant `parseTypeLine` :

```ts
/** Forme minimale du vocabulaire dont la lecture a besoin. */
export type TypeVocabularySource = { supertypes: string[]; types: string[] } | null;

/**
 * Source de vocabulaire, injectée depuis le client.
 *
 * Ce module est atteint CÔTÉ SERVEUR (`db/custom-card-editor.ts` importe
 * `draft.ts`, qui importe `isTokenTypeLine`). Un import de store Zustand au
 * niveau module casserait alors le build Turbopack — un piège que ni `tsc` ni
 * ESLint n'attrapent, seul `npm run build`. D'où cette injection : le serveur
 * ne branche rien et lit `null`, ce qui est le repli sûr.
 */
let vocabularyResolver: () => TypeVocabularySource = () => null;

export function setTypeVocabularyResolver(resolver: () => TypeVocabularySource): void {
	vocabularyResolver = resolver;
}

export function resolveTypeVocabulary(): TypeVocabularySource {
	return vocabularyResolver();
}
```

- [ ] **Step 3 : Élargir le vivier quand la ligne n'a pas de tiret**

Remplacer `hasCardType` et sa docstring :

```ts
/**
 * Teste la présence d'un type/supertype, sur les MOTS de la ligne.
 *
 * Les appelants utilisaient des regex du genre `/\b(land|terrain)\b/i` sur la
 * ligne entière : « Creature — Landwalker » ou un sous-type contenant le mot
 * déclenchait alors le cas terrain. On compare ici des entrées ventilées.
 *
 * Le vivier dépend de la présence d'un tiret :
 *
 * - AVEC tiret, la grammaire est explicite : on ignore les sous-types, sinon
 *   « Creature — Land Golem » passerait pour un terrain.
 * - SANS tiret, la ventilation n'est qu'une déduction fondée sur un
 *   vocabulaire ANGLAIS : « Terrain » y est inconnu et atterrit en sous-type.
 *   S'y fier pour choisir un cadre reviendrait à donner à une heuristique le
 *   poids d'une certitude, et ferait perdre le cadre de terrain sur une
 *   saisie française. On cherche donc dans les trois listes.
 */
export function hasCardType(typeLine: string, type: string): boolean {
	const parts = parseTypeLine(typeLine, resolveTypeVocabulary());
	const pool = /[—–]/.test(typeLine)
		? [...parts.supertypes, ...parts.types]
		: [...parts.supertypes, ...parts.types, ...parts.subtypes];
	const needle = type.toLowerCase();
	return pool.some((entry) => entry.toLowerCase() === needle);
}
```

La ligne `parseTypeLine(typeLine, resolveTypeVocabulary())` s'appuie sur le resolver ajouté au Step 2 : la fonction est donc juste dès son premier commit, sans passer par un provisoire.

- [ ] **Step 4 : Créer le hook de branchement**

```ts
// src/lib/card-editor/useTypeVocabularyBridge.ts
'use client';

import { useEffect } from 'react';
import { useScryfallStore } from '@/lib/scryfall/store/scryfall-store';
import { setTypeVocabularyResolver } from './type-line';

/**
 * Donne au module `type-line` l'accès au vocabulaire Scryfall.
 *
 * `hasCardType` — donc le choix du cadre terrain et du layout jeton — est
 * appelé depuis des fonctions pures qui ne peuvent pas consommer un hook. On
 * leur passe donc un resolver qui lit le store Zustand par `getState()`.
 *
 * Le store est asynchrone : il vaut `null` au premier rendu, et la lecture
 * retombe alors sur le repli « tout à gauche dans types », qui reste juste.
 *
 * Le débranchement au démontage évite qu'un resolver survive à l'arbre qui
 * l'a posé. En Strict Mode l'effet est joué deux fois (montage, démontage,
 * remontage) : la séquence se termine sur un branchement, donc l'état final
 * est correct. `useCardEditor` n'a qu'un seul appelant
 * (`CardEditorStudio.tsx:77`), il n'y a donc pas deux ponts concurrents.
 */
export function useTypeVocabularyBridge(): void {
	useEffect(() => {
		setTypeVocabularyResolver(() => useScryfallStore.getState().typeVocabulary);
		return () => setTypeVocabularyResolver(() => null);
	}, []);
}
```

- [ ] **Step 5 : Appeler le hook depuis le studio**

Dans `src/app/[locale]/studio/useCardEditor.ts`, ajouter l'import puis l'appel au tout début du corps de `useCardEditor` :

```ts
import { useTypeVocabularyBridge } from '@/lib/card-editor/useTypeVocabularyBridge';
```

La signature est `export function useCardEditor(language: string) {` (ligne 32). Insérer l'appel juste après son accolade ouvrante, avant le `useState` qui suit :

```ts
export function useCardEditor(language: string) {
	useTypeVocabularyBridge();
	const [state, setState] = useState<CardEditorState>(() => ({
```

- [ ] **Step 6 : Types, lint et build**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E 'type-line|useCardEditor|TypeVocabularyBridge'
npx eslint src/lib/card-editor/type-line.ts src/lib/card-editor/useTypeVocabularyBridge.ts "src/app/[locale]/studio/useCardEditor.ts"
npm run build
```

Attendu : `tsc` et `eslint` muets, `npm run build` en succès. **Le build est la porte critique de cette tâche** : c'est lui, et lui seul, qui dirait qu'un import Zustand a fui dans un chemin serveur. S'il échoue sur une frontière client/serveur, ne pas contourner en ajoutant `'use client'` à `type-line.ts` — ce serait casser le chemin serveur ; revenir au resolver injecté.

- [ ] **Step 7 : Vérifier que le repli tient toujours**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
npx tsx /tmp/claude-1000/-home-elthinkbuntu-Documents-Wizcard/fcade87f-2b5d-4554-baa3-129f3ee2368f/scratchpad/check-type-line.ts
```

Attendu : **TOUT PASSE** encore. Ce script s'exécute hors React, donc le resolver n'est jamais branché et rend `null` : il prouve exactement le comportement du chemin serveur.

- [ ] **Step 8 : Commit**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
git add src/lib/card-editor/type-line.ts src/lib/card-editor/useTypeVocabularyBridge.ts "src/app/[locale]/studio/useCardEditor.ts"
git commit -m "fix(studio): keep the land frame on a dash-less type line

The Scryfall vocabulary is English, so 'Terrain' now lands in subtypes and
hasCardType stopped seeing it — the land frame was lost on the most ordinary
French input. Without a dash the type/subtype split is a deduction, so the
lookup spans all three lists; with a dash the grammar is explicit and
subtypes stay excluded.

hasCardType runs from pure functions that cannot consume a hook, so it takes
an injected resolver reading the Zustand store via getState(). type-line.ts
is reachable server-side, where a module-level store import would break the
Turbopack build — the server simply never wires the resolver and reads null,
which is the safe fallback.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015hF7jdXAcFnXF2uDLwBr4q"
```

---

### Task 3 : Vérification navigateur

**Files:** aucun (vérification seule ; si elle échoue, corriger dans les fichiers des tâches 1-2).

**Interfaces:**

- Consumes: le comportement livré par les tâches 1 et 2.
- Produces: rien.

C'est la porte qui compte : le bug a été trouvé dans le navigateur, il doit y être constaté résolu.

- [ ] **Step 1 : Démarrer le serveur si besoin**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
curl -s -o /dev/null -w '%{http_code}\n' --max-time 5 http://localhost:3000/fr/studio
```

Si ce n'est pas `200`/`307`, lancer `npm run dev` en tâche de fond et attendre.

- [ ] **Step 2 : Ouvrir le studio**

Charger les outils Chrome en UN seul appel :

```
ToolSearch query "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__browser_batch"
```

Puis `tabs_context_mcp`, un nouvel onglet, et naviguer vers `http://localhost:3000/fr/studio`.

Deux pièges relevés dans ce projet : l'action `zoom` fige le renderer de cet onglet — pour grossir, cloner le SVG dans la page et prendre une capture normale. Et ne jamais poser une valeur dans les champs de type par `dispatchEvent(new Event('input'))` : ce sont des champs à tags, la saisie doit passer par de vraies frappes clavier.

- [ ] **Step 3 : Le cas qui a révélé le bug**

Dans l'onglet **Carte**, cliquer le champ **Sous-types**, taper `Humain`, Entrée, `Sorcier`, Entrée.

Attendu : **deux tags dans Sous-types** (et non dans Types). La ligne rendue sur la carte affiche `Humain Sorcier`. Ajouter ensuite `Créature` dans **Types** → la carte affiche `Créature — Humain Sorcier`.

- [ ] **Step 4 : Les sous-types à trait d'union**

Dans **Sous-types**, taper `Assembly-Worker`, Entrée.

Attendu : **un seul tag** `Assembly-Worker`, pas `Assembly` + `Worker`. Recommencer avec `Power-Plant` → un seul tag. Puis `Urza's Power-Plant` → **deux** tags (`Urza's` et `Power-Plant`), le découpage sur les espaces étant correct.

- [ ] **Step 5 : Non-régression du cadre et de la couronne**

Vider la ligne de type, puis :

- taper `Terrain` dans **Types** → le cadre de **terrain** doit être peint ;
- remettre `Créature` dans Types et `Légendaire` dans **Supertypes** → la **couronne légendaire** doit apparaître.

Ces deux-là passent par `hasCardType` et `parseTypeLine` : ce sont eux qui prouvent qu'aucune régression n'a été introduite sur le rendu.

- [ ] **Step 6 : Consigner**

Si tout passe, rien à committer. Si un écart apparaît, le corriger dans `type-line.ts` puis committer avec un message `fix(studio): …`.

---

## Ce que ce plan ne fait pas

Repris du spec, § Hors périmètre :

- la normalisation des traductions françaises (le vocabulaire Scryfall est anglais ; un « Créature » saisi en français reste hors vocabulaire et part en sous-types sans tiret — acceptable, l'utilisateur tape dans le bon champ) ;
- le champ texte libre de la ligne de type, supprimé depuis longtemps ;
- la validation stricte des types — le studio sert aussi à en inventer.
