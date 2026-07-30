# Lecture de la ligne de type — design

Corriger `parseTypeLine` : il coupe sur le trait d'union, ce qui casse les sous-types
composés, et il renvoie dans `types` des sous-types saisis seuls, qui n'en ressortent
jamais.

Date : 2026-07-31. Branche : `feat/custom-card-studio`.

## Le problème

`src/lib/card-editor/type-line.ts:107` :

```ts
const dashIndex = typeLine.search(/[—-]/);
```

La classe `[—-]` contient le tiret cadratin **et** le trait d'union. Trois défauts en
découlent, tous reproduits en exécutant la fonction :

Le vocabulaire officiel ne contient que **deux** entrées à trait d'union, relevées sur
l'API Scryfall (339 types de créature, 18 types de terrain, 19 types de carte,
7 supertypes) :

- **`Assembly-Worker`** — type de créature (_Urza's Battle Thopter_, _Self-Assembler_) ;
- **`Power-Plant`** — type de terrain (_Urza's Power-Plant_).

Aucun trait d'union dans `card-types` ni dans `supertypes`. Le trait d'union n'apparaît
donc **jamais** comme séparateur, et toujours à l'intérieur d'un sous-type.

| Entrée               | Résultat actuel                                | Attendu                               |
| -------------------- | ---------------------------------------------- | ------------------------------------- |
| `Assembly-Worker`    | types `["Assembly"]`, sous-types `["Worker"]`  | sous-types `["Assembly-Worker"]`      |
| `Power-Plant`        | types `["Power"]`, sous-types `["Plant"]`      | sous-types `["Power-Plant"]`          |
| `Urza's Power-Plant` | types `["Urza's","Power"]`, s.-t. `["Plant"]`  | sous-types `["Urza's","Power-Plant"]` |
| `Humain Sorcier`     | types `["Humain","Sorcier"]`, sous-types vides | sous-types `["Humain","Sorcier"]`     |

Les trois premiers cassent avec des sous-types **réellement imprimés** : saisir
`Assembly-Worker` dans le champ Sous-types produit deux tags, `Assembly` et `Worker`. Le
quatrième est celui qu'on observe dans le studio — des sous-types tapés seuls restent
bloqués dans le champ Types.

Deux précisions sur ce qui n'est **pas** en cause :

- `Artifact Creature — Assembly-Worker` fonctionne aujourd'hui **par accident** : le tiret
  cadratin précède le trait d'union, donc `search` tombe sur le bon. Le défaut se
  manifeste dès que le trait d'union est à gauche, ou qu'il n'y a pas de tiret du tout.
- Un sous-type composé de plusieurs MOTS (`Urza's Power-Plant`) donne bien deux entrées :
  ce sont deux sous-types distincts, découpés sur les espaces. Seul le trait d'union
  **interne à un mot** doit être préservé.

Reproduction dans le navigateur : saisir « Humain » puis « Sorcier » dans Sous-types
produit deux tags dans **Types**, et la ligne rendue est `Humain Sorcier` au lieu de
`Créature — Humain Sorcier`.

## Portée

`parseTypeLine` n'alimente pas que l'UI. Ses appelants :

| Appelant                          | Usage                                        |
| --------------------------------- | -------------------------------------------- |
| `TypeLineField.tsx:146`           | ventile la ligne dans les trois champs       |
| `CardEditorStudio.tsx:97`         | détecte `Legendary` → couronne légendaire    |
| `hasCardType` → `isLandTypeLine`  | `mse-assets.ts:204` → choix du cadre terrain |
| `hasCardType` → `isTokenTypeLine` | `draft.ts:104` → layout jeton                |

Une lecture fausse ne se voit donc pas seulement dans les champs : elle change le cadre
peint.

## Le correctif

### 1. Ne couper que sur un tiret de séparation

```ts
const dashIndex = typeLine.search(/[—–]/);
```

Tiret cadratin (`—`) et demi-cadratin (`–`) seulement. `composeTypeLine` n'écrit jamais
que `—` ; le repli sur `-` était censé rattraper une saisie manuelle, mais il casse des
sous-types officiels (`Assembly-Worker`, `Power-Plant`) sans jamais servir de séparateur
dans le vocabulaire réel.

Le demi-cadratin est conservé : c'est une confusion de saisie plausible, et aucun type
Magic ne le contient.

### 2. Ventiler par vocabulaire quand il n'y a pas de tiret

Aujourd'hui, sans tiret, tout part dans `types`. Nouvelle règle :

- mot connu des **supertypes** → `supertypes` (inchangé) ;
- sinon mot connu des **types** → `types` ;
- sinon → `subtypes`.

C'est ce qui fait revenir `Humain Sorcier` dans le champ Sous-types.

### Le piège du vocabulaire anglais

Vérifié en exécutant la règle : `Terrain` seul, sans tiret, donne
`subtypes: ["Terrain"]` — parce que « Terrain » est **absent du vocabulaire Scryfall, qui
est anglais**. Idem pour `Créature`, `Enchantement`, `Terrain de base`.
`isLandTypeLine` ne trouverait alors plus rien dans supertypes+types et **le cadre de
terrain serait perdu** — une régression réelle, sur le chemin même que ce studio doit
peindre juste, et déclenchée par la saisie française la plus banale.

Le correctif : `hasCardType` ne se limite pas à supertypes+types, mais cherche aussi dans
`subtypes` **quand la ligne n'a pas de tiret**. Sans tiret, la distinction type/sous-type
est une déduction, pas une donnée — s'y fier pour choisir un cadre serait accorder à une
heuristique le poids d'une certitude. Avec tiret, la grammaire est explicite et on
continue d'ignorer les sous-types (« Elemental Shaman » n'est pas un terrain), ce qui est
la raison d'être de `hasCardType` documentée dans le fichier.

**En présence d'un tiret, rien ne change** : la grammaire est explicite, on garde
gauche = supertypes+types, droite = sous-types. Le vocabulaire ne sert qu'à lever
l'ambiguïté d'une ligne sans tiret.

**Sans vocabulaire** (`null` — chemin serveur, ou premier rendu avant que le store soit
rempli), on garde le comportement actuel : tout à gauche dans `types`. C'est le repli sûr,
vérifié sur les cas limites en fin de document.

## L'accès au vocabulaire

Le vocabulaire vit dans un store **Zustand** (`useScryfallStore`), pas dans un contexte
React : il est donc lisible hors composant par `useScryfallStore.getState()`, sans
prop-drilling ni refonte des appelants.

`parseTypeLine` **garde son paramètre `vocabulary` explicite** — les appelants React
continuent de le passer, et la fonction reste pure et testable. Ce sont
`hasCardType` / `isLandTypeLine` / `isTokenTypeLine` qui cessent de passer `null` en dur
et lisent le store par défaut.

### La contrainte qui décide de la forme

`type-line.ts` est atteint côté serveur : `db/custom-card-editor.ts` (pas de
`'use client'`) importe `draft.ts`, qui importe `isTokenTypeLine`. Or un import de store
Zustand au niveau module dans un fichier atteignable côté serveur casse le build
Turbopack — c'est un piège déjà rencontré sur ce projet, que ni `tsc` ni ESLint
n'attrapent, seul `npm run build`.

Donc : **pas d'import statique du store dans `type-line.ts`**. On injecte à la place.

```ts
// type-line.ts — aucun import de store
type TypeVocabulary = { supertypes: string[]; types: string[] } | null;

let vocabularyResolver: () => TypeVocabulary = () => null;

/** Branche la source de vocabulaire. Appelé une fois, côté client. */
export function setTypeVocabularyResolver(resolver: () => TypeVocabulary): void {
	vocabularyResolver = resolver;
}

export function hasCardType(typeLine: string, type: string): boolean {
	const parts = parseTypeLine(typeLine, vocabularyResolver());
	// Sans tiret, la ventilation type/sous-type est une déduction : on cherche
	// donc dans les trois listes. Avec tiret, la grammaire est explicite et les
	// sous-types sont ignorés — « Creature — Land Golem » n'est pas un terrain.
	const pool = /[—–]/.test(typeLine)
		? [...parts.supertypes, ...parts.types]
		: [...parts.supertypes, ...parts.types, ...parts.subtypes];
	const needle = type.toLowerCase();
	return pool.some((entry) => entry.toLowerCase() === needle);
}
```

Le branchement se fait dans un module client déjà chargé par le studio
(`mse-assets.ts`, qui porte déjà `'use client'`) :

```ts
setTypeVocabularyResolver(() => useScryfallStore.getState().typeVocabulary);
```

Côté serveur, le resolver n'est jamais branché et rend `null` : le comportement actuel
est conservé, et rien n'importe Zustand dans un chemin serveur.

## Ce que ça ne change pas

Le store est asynchrone et vaut `null` au premier rendu. `hasCardType` doit donc rester
juste sans vocabulaire — et il l'est : sans vocabulaire tout part à gauche dans `types`,
et le mot cherché (`land`, `terrain`, `token`, `jeton`) s'y trouve.

Les deux régimes ont été exécutés sur les cas limites. Terrain reconnu :
`Terrain`, `Terrain de base`, `Basic Land`, `Land`, `Land — Urza's Power-Plant`,
`Legendary Land — Urza's Saga`. Terrain **non** reconnu, comme il se doit :
`Creature — Elemental Shaman`, `Creature — Landwalker`, `Creature — Land Golem`,
`Enchantment`. Jeton reconnu : `Token Creature — Soldier`, `Jeton` ; non reconnu :
`Creature — Token Beast`.

C'est bien le garde-fou historique de `hasCardType` qui tient : les trois derniers cas
ne passent que parce que le tiret rend la grammaire explicite.

## Vérification

Pas de framework de test dans ce dépôt. Les portes :

- `npm run check` — aucun NOUVEAU problème (base ~60 dans des fichiers sans rapport)
- `npm run build` — **obligatoire** : seule porte qui attrape une frontière client/serveur
- Navigateur, dans le studio :
  - saisir « Humain » puis « Sorcier » dans **Sous-types** → deux tags dans Sous-types,
    ligne rendue `Humain Sorcier` ; ajouter « Créature » dans Types → `Créature — Humain Sorcier`
  - saisir « Assembly-Worker » dans **Sous-types** → **un** tag, pas `Assembly` + `Worker`
  - saisir « Power-Plant » → **un** tag ; « Urza's Power-Plant » → **deux** tags
    (`Urza's` et `Power-Plant`), le découpage sur les espaces étant correct
  - « Légendaire » + « Créature » → couronne légendaire toujours peinte
  - une ligne « Terrain » → cadre de terrain toujours choisi

## Hors périmètre

- La normalisation des traductions françaises (le vocabulaire Scryfall est anglais ; un
  « Créature » saisi en français reste hors vocabulaire et part en sous-types sans tiret —
  comportement acceptable, l'utilisateur ajoute le tiret en tapant dans le bon champ)
- Le champ texte libre de la ligne de type — supprimé depuis longtemps
- La validation stricte des types (le studio sert aussi à inventer des types)
