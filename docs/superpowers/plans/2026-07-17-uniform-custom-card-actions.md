# Uniform Custom Card Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un custom matché offre les mêmes actions (Add to collection/wishlist/deck, Open card page) qu'une carte officielle sur les menus contextuels, la modale bare et la page carte.

**Architecture:** Suppression des gates `isCustomCard` devenus obsolètes depuis la persistance des prints custom. Trois points : (1) `CardModal` — supprimer `CustomCardModalInner`, le custom suit `ScryfallCardModalInner` qui rend `CustomCardSection` sous garde ; (2) les deux builders de menu (`searchCardMenu`, `viewerCardMenu`) — retirer les early-returns (ce qui débloque AUSSI le menu image de la modale, `buildViewerImageMenu` déléguant à `buildViewerCardMenu`) ; (3) `CardPageHeader` — rendre `AddToCollectionButton` inconditionnellement. Aucun nouveau flux : `deriveCardModalProps` câble déjà le cas « bare custom » (sa JSDoc le dit), et `AddCardModal`/`useCardEntryForm` sont custom-safe depuis la feature précédente.

**Tech Stack:** Next.js (App Router), next-intl. Spec : `docs/superpowers/specs/2026-07-17-uniform-custom-card-actions-design.md`.

## Global Constraints

- **Pas de framework de test** — gates : `npx eslint <fichiers changés>` propre + `npm run build` vert (seule gate TS2589 fiable) + runtime dev (serveur déjà lancé sur :3100).
- `npm run check` baseline ROUGE (~53 pbs pré-existants) — gate « pas de NOUVEAU problème » sur nos fichiers uniquement.
- Le custom circule casté `as unknown as ScryfallCard` (pattern établi) — **pas d'élargissement d'union** des signatures.
- Sémantique validée : « Add … » sur un custom ajoute **le print custom lui-même** (`scryfall_id = mpc:<id>`), via `openAddCard`/`AddCardModal` avec le custom présélectionné.
- Les customs visibles ont toujours un `oracle_id` (filtre DB dur, feature « hide unmatched ») — aucun cas « sans oracle_id » à gérer.
- Commits : suffixe `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Menus contextuels — retirer les early-returns custom

**Files:**

- Modify: `src/app/[locale]/search/searchCardMenu.ts` (lignes ~40-44)
- Modify: `src/lib/card/viewerCardMenu.ts` (lignes ~26-29 JSDoc, ~50-52 early-return)

**Interfaces:**

- Consumes: rien de nouveau — les handlers existants (`onAddToCollection`, `onAddToWishlist`, `onAddToDeck`, `onOpenCardPage`) reçoivent la carte custom castée ; tous aboutissent à des chemins custom-safe (`openAddCard`/`AddCardModal`, `openAddToDeck`/`deriveDeckTarget`, `/card/mpc:<id>` SSR).
- Produces: comportement — les deux menus affichent tous leurs items pour un custom. Effet de bord voulu : `buildViewerImageMenu` (menu image de la modale, `CardModalProvider.tsx:128`) délègue à `buildViewerCardMenu` → le menu image bare/frozen se débloque pour les customs sans autre modification.

- [ ] **Step 1: searchCardMenu.ts**

Supprimer le bloc (lignes ~40-44) :

```ts
// Custom cards / cardbacks have no Scryfall page and aren't tracked in
// the collection or wishlist — only "view details" applies.
if (isCustomCard(card)) {
	return items;
}
```

Puis supprimer l'import devenu inutilisé ligne 3 : `import { isCustomCard } from '@/lib/mpc/types';`.

- [ ] **Step 2: viewerCardMenu.ts**

Supprimer le bloc (lignes ~50-52) :

```ts
if (isCustomCard(card)) {
	return items;
}
```

Supprimer l'import ligne 3 (`isCustomCard`). Mettre à jour la JSDoc de `buildViewerCardMenu` (lignes ~26-29) — remplacer :

```ts
/**
 * Builds the right-click menu for cards on someone else's profile. Custom cards
 * / cardbacks aren't Scryfall-tracked, so only "View details" applies to them.
 */
```

par :

```ts
/**
 * Builds the right-click menu for cards on someone else's profile. Custom cards
 * get the same actions — a matched custom print is a persistable copy.
 */
```

- [ ] **Step 3: Vérifier lint + types**

Run: `npx eslint src/app/[locale]/search/searchCardMenu.ts src/lib/card/viewerCardMenu.ts`
Expected: silencieux (l'import inutilisé aurait déclenché une erreur — sa suppression est vérifiée ici).

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/search/searchCardMenu.ts" src/lib/card/viewerCardMenu.ts
git commit -m "feat(custom-cards): full context-menu actions for custom cards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: CardModal — fusionner CustomCardModalInner dans ScryfallCardModalInner

**Files:**

- Modify: `src/lib/card/components/CardModal/CardModal.tsx`

**Interfaces:**

- Consumes: `CustomCardSection` (import déjà présent ligne 32) ; `isCustomCard` (import déjà présent ligne 9) ; `deriveCardModalProps` câble déjà `onAddToCollection`/`onAddToWishlist`/`onAddToDeck` pour un bare custom (`deriveCardModalProps.ts:66-72`) — aucun changement provider requis.
- Produces: comportement — la modale bare d'un custom affiche les boutons Add collection/wishlist/deck (fonctionnels via AddCardModal custom-safe) + `CustomCardSection` + le menu image (débloqué par Task 1). `CustomCardModalInner` n'existe plus.

- [ ] **Step 1: Enrichir ScryfallCardModalInner**

Dans `ScryfallCardModalInner` (lignes ~831-941) :

1. Ajouter au début du corps de la fonction (après `const symbolMap = useScryfallSymbols();`) :

```ts
const isCustom = isCustomCard(card as ScryfallCard | CustomCard);
```

2. Passer `isCustom` à `CardDetailSection` (ligne ~910) — remplacer :

```tsx
<CardDetailSection card={card} symbolMap={symbolMap} onClose={onClose} />
```

par :

```tsx
<CardDetailSection card={card} symbolMap={symbolMap} isCustom={isCustom} onClose={onClose} />
```

Note : `CardDetailSection` avec `isCustom` supprime son lien « More info » interne (ligne ~341 `{!isCustom && <Link …>}`). L'ancienne `CustomCardModalInner` rendait ce lien elle-même à la place — le restaurer à l'étape 3.

3. Dans la colonne info (`<div className={styles.infoCol}>`), après `CardDetailSection`, ajouter :

```tsx
{
	isCustom && (
		<>
			<Link href={`/card/${card.id}`} className={styles.moreInfoLink} onClick={onClose}>
				{t('moreInfo')}
			</Link>
			<CustomCardSection card={card as unknown as CustomCard} />
		</>
	);
}
```

Note : `Link`, `t`, `CustomCardSection`, `CustomCard` sont déjà importés dans le fichier. Le `onClick={onClose}` (absent de l'ancienne variante custom) aligne le comportement sur la variante Scryfall — fermeture de la modale à la navigation, amélioration voulue.

- [ ] **Step 2: Supprimer CustomCardModalInner et sa branche de dispatch**

1. Supprimer la fonction `CustomCardModalInner` entière (lignes ~943-991).
2. Dans le dispatcher `CardModal` (lignes ~1030-1033), supprimer :

```tsx
// Custom card path — must come before isCollectionCard check
if (isCustomCard(first as ScryfallCard | CustomCard)) {
	return <CustomCardModalInner key={first.id} card={first as CustomCard} onClose={onClose} />;
}
```

Le custom bare (pas d'`entry`) tombe alors dans `!isCollectionCard(first)` → `ScryfallCardModalInner` — le bon chemin.

**Attention — bug potentiel corrigé en passant** : un custom peut aussi arriver en tant que `Card[]` (copie possédée, `entry` présent). Aujourd'hui le dispatch teste `isCustomCard(first)` AVANT `isCollectionCard(first)` — une copie custom possédée est donc intercéptée par la branche custom et perd la modale à copies (édition/duplication). La suppression de la branche corrige ce bug : le stack custom retombe dans `CardModalInner` comme tout stack. Vérifier ce comportement au runtime (Task 3 Step 3, scénario 5) et documenter la conclusion dans le rapport.

3. Vérifier les imports : si `CustomCard` ou `isCustomCard` deviennent inutilisés après suppression, les retirer ; sinon les garder (utilisés à l'étape 1).

- [ ] **Step 3: Vérifier lint + build**

Run: `npx eslint src/lib/card/components/CardModal/CardModal.tsx && npm run build 2>&1 | tail -5`
Expected: eslint silencieux ; build vert.

- [ ] **Step 4: Commit**

```bash
git add src/lib/card/components/CardModal/CardModal.tsx
git commit -m "feat(custom-cards): merge CustomCardModalInner into ScryfallCardModalInner

Bare custom cards get the same add-to-collection/wishlist/deck actions
as official cards; CustomCardSection renders under a guard instead of
a separate impoverished modal variant.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Page carte — AddToCollectionButton pour les customs + vérification runtime globale

**Files:**

- Modify: `src/app/[locale]/card/[id]/components/CardPageHeader/CardPageHeader.tsx` (ligne ~79)

**Interfaces:**

- Consumes: `AddToCollectionButton` (passe par `openAddCard` → `AddCardModal`, custom-safe).
- Produces: comportement — la page `/card/mpc:<id>` affiche le bouton « Add to collection » fonctionnel.

- [ ] **Step 1: Rendu inconditionnel du bouton**

Remplacer (ligne ~79) :

```tsx
{
	!custom && <AddToCollectionButton card={card as ScryfallCard} />;
}
```

par :

```tsx
<AddToCollectionButton card={card as ScryfallCard} />
```

- [ ] **Step 2: Vérifier lint + build**

Run: `npx eslint "src/app/[locale]/card/[id]/components/CardPageHeader/CardPageHeader.tsx" && npm run build 2>&1 | tail -5`
Expected: eslint silencieux ; build vert.

- [ ] **Step 3: Vérification runtime complète (critères du spec)**

Dev server :3100, Supabase local. Scénarios :

1. **Recherche mode custom** : clic droit sur un custom → 5 items (View details, Open card page, divider, Add to collection, Add to wishlist, Add to deck). « Add to collection » → AddCardModal avec l'image custom → Save → la copie apparaît en collection (Studio : `scryfall_id = mpc:<id>`).
2. **Modale bare** : clic gauche sur un custom en recherche → boutons Add collection/wishlist/deck visibles + section « Carte custom » (CustomCardSection) + lien « More info » → clic droit sur l'image → menu viewer complet.
3. **Page carte** : `/card/mpc:<id>` → bouton « Add to collection » présent → clic → AddCardModal custom → Save fonctionne.
4. **Non-régression officiel** : mêmes 3 surfaces sur une carte officielle — menus, boutons et modale inchangés.
5. **Copie custom possédée** : ouvrir depuis la collection une copie custom (persistée en scénario 1) → la modale à copies (CardModalInner) s'ouvre avec l'édition normale (cf. note bug potentiel Task 2 Step 2).

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/card/[id]/components/CardPageHeader/CardPageHeader.tsx"
git commit -m "feat(custom-cards): add-to-collection button on custom card pages

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
