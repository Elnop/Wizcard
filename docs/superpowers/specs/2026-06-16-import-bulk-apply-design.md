# Import — Appliquer des propriétés à toutes les cartes (bulk apply)

**Date:** 2026-06-16
**Statut:** Design validé, prêt pour plan d'implémentation

## Context

L'import de cartes dans la collection (modal d'aperçu, `ImportModal.tsx`) résout les
cartes via Scryfall puis les insère telles quelles, métadonnées par carte. Aujourd'hui,
pour marquer un lot importé comme proxy, leur ajouter un tag commun (ex: `import-2026`,
`achat-vinted`), ou forcer une condition/langue, il faut éditer **chaque carte
individuellement** via `EditCardModal`. C'est impraticable pour un import de plusieurs
dizaines de cartes.

Ce design ajoute un panneau **« Appliquer à toutes les cartes »** dans l'aperçu d'import,
permettant de définir en une fois : tags (additif), proxy, for trade, foil (+ type),
alter, condition, langue — appliqués **en direct** sur toutes les cartes résolues, qui
restent ensuite éditables individuellement avant confirmation.

## Décisions de design (validées avec l'utilisateur)

- **Champs concernés :** tags, proxy, for trade, foil (+ foilType), alter, condition, langue.
- **Sémantique tags :** **fusion additive** — les tags saisis s'ajoutent aux tags existants
  de chaque carte (dédupliqués), sans toucher aux tags système (`deck:`, `custom:`).
- **Sémantique autres champs :** **override** — la valeur choisie remplace celle de chaque carte.
- **Champs non renseignés :** ignorés (« ne pas toucher »), n'écrasent rien.
- **Moment :** application **en direct** dans l'aperçu (les cartes se mettent à jour
  visuellement ; on peut ensuite ajuster une carte à la main avant de confirmer).
- **Portée :** **toutes les cartes résolues** (`resolved.resolved`), indépendamment des
  filtres d'aperçu actifs.

## Architecture

Le câblage suit exactement la chaîne existante de `updateCard`/`removeCard` :
`useImport` → `ImportContext` (passthrough) → `page.tsx` (destructure) → `<ImportModal>`.

### 1. Hook de mutation — `useImportBulkApply`

Nouveau fichier : `src/lib/import/hooks/useImportBulkApply.ts`

Calqué sur `useImportRowEditing.ts` (lignes 14-27), mais map sur **tout** `prev.resolved`.

```ts
export interface BulkApplyPatch {
	tags?: string[]; // fusion additive si présent
	proxy?: boolean; // override
	forTrade?: boolean; // override
	isFoil?: boolean; // override
	foilType?: 'foil' | 'etched'; // override (couplé à isFoil)
	alter?: boolean; // override
	condition?: CardCondition; // override
	language?: MtgLanguage; // override
}

export function useImportBulkApply(deps: {
	setResolved: (
		updater: (prev: ResolvedImportResult | null) => ResolvedImportResult | null
	) => void;
}) {
	const applyToAll = useCallback(
		(patch: BulkApplyPatch) => {
			setResolved((prev) => {
				if (!prev) return prev;
				const { tags: tagsToAdd, ...overrides } = patch;
				const resolved = prev.resolved.map((card) => {
					const entry = { ...card.entry, ...overrides };
					if (tagsToAdd && tagsToAdd.length > 0) {
						entry.tags = mergeTags(card.entry.tags, tagsToAdd);
					}
					return { ...card, entry };
				});
				return { ...prev, resolved };
			});
		},
		[setResolved]
	);
	return { applyToAll };
}
```

`mergeTags(existing, toAdd)` : retourne `Array.from(new Set([...(existing ?? []), ...toAdd]))`.
Les tags système restent intacts car on n'ajoute que des tags utilisateur et on ne
supprime rien. Helper local au hook (ou `src/lib/import/utils/mergeTags.ts` si réutilisé).

**Note override foil :** quand `isFoil === false`, mettre aussi `foilType = undefined` pour
cohérence. Géré dans le panneau (le patch émis ne contient `foilType` que si `isFoil === true`).

### 2. Branchement dans `useImport`

`src/lib/import/hooks/useImport.ts` :

- importer `useImportBulkApply`
- `const { applyToAll } = useImportBulkApply({ setResolved });`
- exposer `applyToAll` dans l'objet retourné (à côté de `updateCard`, `removeCard`).

`ImportContext.tsx` : aucun changement de code requis (le type `ImportContextValue =
ReturnType<typeof useImport>` propage `applyToAll` automatiquement).

### 3. Composant panneau — `ImportBulkApplyPanel`

Nouveau fichier : `src/app/collection/components/ImportModal/ImportBulkApplyPanel.tsx`
(+ `ImportBulkApplyPanel.module.css`).

- **Pliable** (collapsed par défaut) avec un header cliquable « Appliquer à toutes les cartes ».
- État local (`useState`) pour chaque champ + un champ « touché ? » par propriété override
  (tri-état : ne pas toucher / oui / non). Approche simple : selects à 3 valeurs
  (`''` = ne pas toucher, `'true'`, `'false'`) pour proxy/forTrade/foil/alter ; selects pour
  condition (`'' | NM | LP | MP | HP | DMG`) et langue (`'' | MTG_LANGUAGES`).
- **Tags :** réutiliser le pattern d'input de `EditCardModal.tsx` (lignes 83-102, 262-297) —
  chips + input avec Enter/virgule pour ajouter, `×` / Backspace pour retirer. État local
  `pendingTags: string[]`.
- **Bouton « Appliquer » :** construit un `BulkApplyPatch` à partir des champs renseignés
  (omet ceux à « ne pas toucher », n'inclut `tags` que si `pendingTags` non vide, n'inclut
  `foilType` que si foil = true), appelle `onApplyToAll(patch)`.
- Après application : afficher un libellé éphémère « Appliqué à N cartes » (N = nombre de
  cartes résolues, passé en prop). Optionnel : ne pas vider les champs (l'utilisateur peut
  ré-appliquer). YAGNI : pas de "undo".
- Désactiver le bouton si aucun champ renseigné, ou si 0 carte résolue.

Constantes réutilisées : `CONDITIONS` (`['NM','LP','MP','HP','DMG']`, cf. `EditCardModal.tsx:18`),
`MTG_LANGUAGES` (`@/lib/mtg/languages`).

### 4. Intégration dans `ImportModal`

`src/app/collection/components/ImportModal/ImportModal.tsx` :

- nouvelle prop `onApplyToAll: (patch: BulkApplyPatch) => void`.
- rendre `<ImportBulkApplyPanel onApplyToAll={onApplyToAll} cardCount={resolved?.resolved.length ?? 0} />`
  dans la colonne gauche (`styles.previewLeft`), entre `ImportPreviewStats` (ligne ~162) et
  `ImportPreviewFilters` (ligne ~170). Ne s'affiche que s'il y a au moins une carte résolue.

### 5. Câblage final dans `page.tsx`

`src/app/collection/page.tsx` :

- destructurer `applyToAll` depuis `importCtx` (avec `updateCard`, `removeCard`).
- passer `onApplyToAll={applyToAll}` au `<ImportModal>`.

## Fichiers

**Nouveaux :**

- `src/lib/import/hooks/useImportBulkApply.ts`
- `src/app/collection/components/ImportModal/ImportBulkApplyPanel.tsx`
- `src/app/collection/components/ImportModal/ImportBulkApplyPanel.module.css`

**Modifiés :**

- `src/lib/import/hooks/useImport.ts` — instancier + exposer `applyToAll`
- `src/app/collection/components/ImportModal/ImportModal.tsx` — prop + rendu du panneau
- `src/app/collection/page.tsx` — destructurer + passer `onApplyToAll`

**Réutilisés (lecture seule) :**

- `src/lib/import/hooks/useImportRowEditing.ts` — pattern de mutation `setResolved`
- `src/lib/card/components/EditCardModal/EditCardModal.tsx` — pattern input tags + constantes
- `src/lib/mtg/languages.ts` — `MTG_LANGUAGES`
- `src/types/cards.ts` / `src/lib/import/types.ts` — types `CardEntry`, `Card`, `ResolvedImportResult`

## Vérification

1. `npm run check` — TypeScript + ESLint + Prettier passent.
2. Manuel (UI) :
   - Importer un fichier/texte (ex: coller `4 Lightning Bolt\n2 Counterspell`) → atteindre l'aperçu.
   - Ouvrir le panneau, saisir un tag `test-import`, cocher Proxy = oui, condition = LP, langue = fr,
     foil = oui/etched → Appliquer.
   - Vérifier dans l'aperçu (ouvrir une carte via `EditCardModal`) que les valeurs sont appliquées
     à toutes les cartes : tag présent, proxy/condition/langue/foil corrects.
   - **Fusion tags :** importer un CSV Moxfield avec des tags par carte, appliquer un tag en masse,
     vérifier que les tags d'origine ET le nouveau tag coexistent (pas d'écrasement).
   - Modifier une carte individuellement après l'application → la valeur individuelle est conservée.
   - Confirmer l'import → vérifier en base (Supabase Studio) que `tags`, `proxy`, `condition`,
     `language`, `is_foil`/`foil_type` sont bien persistés.
   - Champ laissé à « ne pas toucher » → n'altère pas les valeurs existantes des cartes.
