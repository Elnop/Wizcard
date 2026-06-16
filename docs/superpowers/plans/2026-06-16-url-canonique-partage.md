# URL canonique de partage `/users/[id]` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire de `/users/[userId]/collection` et `/users/[userId]/decks` l'unique URL canonique (partageable) de chaque surface, servant à la fois le propriétaire (édition) et les visiteurs (lecture seule) ; `/collection` et `/decks` deviennent de simples redirects.

**Architecture:** Le travail read-only existe déjà sous `/u/[userId]/...` (pages, hooks `usePublicCollection`/`usePublicDecks`, et le split deck `/decks/[id]` est déjà complet). Ce plan **migre** `/u/` → `/users/`, transforme chaque page canonique en **switch `isOwner`** qui réutilise le client owner existant (`CollectionPage`, `DecksPageClient` — qui lisent les contextes owner, correct car ce sont les données de l'utilisateur connecté) quand `isOwner`, sinon la vue read-only existante. Les anciennes pages `/collection` et `/decks` deviennent des redirects serveur. Un composant `ShareButton` réutilisable copie l'URL courante.

**Tech Stack:** Next.js App Router (RSC + `'use client'`), Supabase RLS (déjà en place), React hooks. La frontière de sécurité reste le RLS Postgres ; `isOwner` ne choisit que la vue/source.

**État déjà acquis (NE PAS refaire) :**

- RLS : `supabase/migrations/20260616000000_public_read_sharing.sql` + miroir `PROD_REBUILD.sql` ✓
- Data layer : `fetchDeckMetaById` (decks.ts:68), `fetchPublicCollectionPage` (collection.ts:42), `ownerId` dans `DeckMeta` ✓
- Deck individuel : `/decks/[id]/page.tsx` switch `isOwner` + `DeckDetailOwnerView`/`DeckDetailReadOnlyView` + `usePublicDeckDetail` + `useCopyDeckToMyCollection` ✓ (rien à faire)
- `/decks/page.tsx` gate owner→`/auth/login`, `/decks/layout.tsx` public ✓

---

## Structure des fichiers

**Créés :**

- `src/components/ShareButton/ShareButton.tsx` — bouton « Partager » (copie `window.location.href` + toast)
- `src/components/ShareButton/ShareButton.module.css`
- `src/app/users/layout.tsx` — layout public passe-plat (déplacé depuis `u/layout.tsx`)
- `src/app/users/[userId]/collection/page.tsx` — switch `isOwner`
- `src/app/users/[userId]/collection/usePublicCollection.ts` — déplacé depuis `u/...`
- `src/app/users/[userId]/decks/page.tsx` — switch `isOwner`
- `src/app/users/[userId]/decks/usePublicDecks.ts` — déplacé depuis `u/...`

**Modifiés :**

- `src/app/collection/page.tsx` — devient redirect serveur
- `src/app/collection/layout.tsx` — simplifié (plus de gate ; le redirect porte le gate)
- `src/app/decks/page.tsx` — redirige l'owner vers `/users/<id>/decks`
- `src/app/decks/DecksPageClient.tsx` — la page canonique le réutilise (aucune modif de logique attendue)
- `src/app/collection/components/CollectionView/CollectionView.tsx` — commentaire `/u/` → `/users/`

**Supprimés (après migration) :**

- `src/app/u/` (tout le sous-arbre)

---

## Task 1 : Composant ShareButton

**Files:**

- Create: `src/components/ShareButton/ShareButton.tsx`
- Create: `src/components/ShareButton/ShareButton.module.css`

- [ ] **Step 1 : Lire un composant Button voisin pour le style**

Run: `sed -n '1,40p' src/components/Button/Button.tsx`
But: confirmer la signature de `Button` (variants `primary|secondary|danger`, props `onClick`, `disabled`, children) déjà utilisée partout dans les pages.

- [ ] **Step 2 : Écrire `ShareButton.tsx`**

```tsx
'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/Button/Button';
import styles from './ShareButton.module.css';

/**
 * Copies the current page URL (already the canonical /users/<id>/... share URL)
 * to the clipboard. Rendered only for the owner of the surface.
 */
export function ShareButton() {
	const [copied, setCopied] = useState(false);

	const handleShare = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(window.location.href);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard may be unavailable (insecure context); silently no-op.
		}
	}, []);

	return (
		<Button variant="secondary" onClick={handleShare}>
			<span className={styles.label}>{copied ? 'Lien copié ✓' : 'Partager'}</span>
		</Button>
	);
}
```

- [ ] **Step 3 : Écrire `ShareButton.module.css`**

```css
.label {
	white-space: nowrap;
}
```

- [ ] **Step 4 : Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur liée à `ShareButton`.

- [ ] **Step 5 : Commit**

```bash
git add src/components/ShareButton/
git commit -m "feat(share): ShareButton qui copie l'URL canonique au presse-papier"
```

---

## Task 2 : Déplacer le layout public `/u` → `/users`

**Files:**

- Create: `src/app/users/layout.tsx`

- [ ] **Step 1 : Lire le layout existant**

Run: `cat src/app/u/layout.tsx`
Expected: layout passe-plat non auth-gaté (commentaire + `return <>{children}</>`).

- [ ] **Step 2 : Créer `src/app/users/layout.tsx`**

```tsx
// Public sharing routes (/users/[userId]/...) are intentionally NOT auth-gated:
// anyone may view a user's shared collection and decks. Read access is enforced
// by the public SELECT RLS policies; this layout simply avoids the auth redirect.
// The view inside each page adapts to ownership (editable for the owner).
export default function UsersLayout({ children }: { children: React.ReactNode }) {
	return <>{children}</>;
}
```

- [ ] **Step 3 : Vérifier**

Run: `npx tsc --noEmit`
Expected: pas d'erreur.

- [ ] **Step 4 : Commit**

```bash
git add src/app/users/layout.tsx
git commit -m "feat(users): layout public passe-plat sous /users"
```

---

## Task 3 : Déplacer les hooks publics sous `/users`

**Files:**

- Create: `src/app/users/[userId]/collection/usePublicCollection.ts`
- Create: `src/app/users/[userId]/decks/usePublicDecks.ts`

- [ ] **Step 1 : Copier `usePublicCollection.ts` à l'identique**

Run: `mkdir -p "src/app/users/[userId]/collection" && cp "src/app/u/[userId]/collection/usePublicCollection.ts" "src/app/users/[userId]/collection/usePublicCollection.ts"`
Le contenu est inchangé (le hook ne dépend que de `fetchPublicCollectionPage`, pas du chemin de route).

- [ ] **Step 2 : Copier `usePublicDecks.ts` à l'identique**

Run: `mkdir -p "src/app/users/[userId]/decks" && cp "src/app/u/[userId]/decks/usePublicDecks.ts" "src/app/users/[userId]/decks/usePublicDecks.ts"`

- [ ] **Step 3 : Vérifier**

Run: `npx tsc --noEmit`
Expected: pas d'erreur (les imports sont des chemins `@/...` absolus, donc inchangés).

- [ ] **Step 4 : Commit**

```bash
git add "src/app/users/[userId]/collection/usePublicCollection.ts" "src/app/users/[userId]/decks/usePublicDecks.ts"
git commit -m "feat(users): hooks publics collection/decks sous /users"
```

---

## Task 4 : Page canonique collection (switch isOwner)

**Files:**

- Create: `src/app/users/[userId]/collection/page.tsx`

La page rend la vue éditable owner (`CollectionPage` existant) si l'utilisateur connecté est le propriétaire, sinon la vue read-only existante, avec le `ShareButton` ajouté dans la barre d'actions owner. On réutilise les deux implémentations sans les réécrire.

- [ ] **Step 1 : Lire les deux vues à réutiliser**

Run: `sed -n '1,20p' src/app/collection/page.tsx && echo '---' && sed -n '1,20p' "src/app/u/[userId]/collection/page.tsx"`
But: confirmer que `CollectionPage` (default export de `@/app/collection/page`) lit les contextes owner, et que la vue read-only lit `usePublicCollection(userId)`.

- [ ] **Step 2 : Extraire la vue read-only en composant nommé réutilisable**

Modifier `src/app/users/[userId]/collection/page.tsx` en y plaçant le corps read-only actuel sous un composant `PublicCollectionView({ userId }: { userId: string })`, et un default export `UserCollectionPage` qui switch :

```tsx
'use client';

import { useCallback, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import type { CardStack } from '@/types/cards';
import { useCollectionCards } from '@/app/collection/useCollectionCards';
import { CollectionView } from '@/app/collection/components/CollectionView/CollectionView';
import { CardModal } from '@/lib/card/components/CardModal/CardModal';
import { Button } from '@/components/Button/Button';
import { Spinner } from '@/components/Spinner/Spinner';
import { serializeToMoxfieldCSV, downloadCSV } from '@/lib/moxfield/serialize';
import CollectionPage from '@/app/collection/page';
import { usePublicCollection } from './usePublicCollection';

function PublicCollectionView({ userId }: { userId: string }) {
	const { entries, isLoaded, isFullyLoaded } = usePublicCollection(userId);
	const { stacks, isLoading: isHydrating, totalExpected } = useCollectionCards(entries);
	const [selectedStack, setSelectedStack] = useState<CardStack | null>(null);

	const handleExport = useCallback(() => {
		downloadCSV(serializeToMoxfieldCSV(stacks.flatMap((s) => s.cards)), 'collection.csv');
	}, [stacks]);

	const isLoadingCollection = !isFullyLoaded || isHydrating;

	const emptyState = (
		<div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
			<h2>Collection vide</h2>
			<p>Cet utilisateur n&apos;a pas encore de cartes publiques.</p>
		</div>
	);

	const actions = entries.length > 0 && (
		<Button variant="secondary" onClick={handleExport} disabled={isLoadingCollection}>
			Export CSV
		</Button>
	);

	return (
		<CollectionView
			stacks={stacks}
			entryCount={entries.length}
			isHydrating={isHydrating}
			totalExpected={totalExpected}
			isLoaded={isLoaded}
			isFullyLoaded={isFullyLoaded}
			title="Collection"
			actions={actions || undefined}
			emptyState={emptyState}
			onCardClick={setSelectedStack}
		>
			<CardModal cards={selectedStack?.cards ?? null} onClose={() => setSelectedStack(null)} />
		</CollectionView>
	);
}

/**
 * Canonical, shareable collection URL. Renders the full editable owner view when
 * the signed-in user owns this collection (reusing the owner CollectionPage,
 * which reads the owner contexts — correct since it's that user's own data),
 * otherwise the public read-only view.
 */
export default function UserCollectionPage() {
	const params = useParams();
	const userId = params.userId as string;
	const { user, isLoading } = useAuth();

	if (isLoading) {
		return (
			<div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
				<Spinner />
			</div>
		);
	}

	const isOwner = !!user && user.id === userId;
	return isOwner ? <CollectionPage /> : <PublicCollectionView userId={userId} />;
}
```

- [ ] **Step 3 : Ajouter le ShareButton dans la barre d'actions owner**

Modifier `src/app/collection/page.tsx` : importer `ShareButton` et l'insérer dans `actions` (avant `Export CSV`).

Run: `sed -n '12,16p' src/app/collection/page.tsx`
Ajouter après la ligne `import { serializeToMoxfieldCSV, downloadCSV } ...` :

```tsx
import { ShareButton } from '@/components/ShareButton/ShareButton';
```

Puis dans le bloc `actions` (`src/app/collection/page.tsx`, le `<>` autour des boutons), ajouter `<ShareButton />` comme premier enfant :

```tsx
	const actions = (
		<>
			<ShareButton />
			{entries.length > 0 && (
```

- [ ] **Step 4 : Vérifier la compilation + lint**

Run: `npm run check`
Expected: pas d'erreur TS/ESLint/Prettier.

- [ ] **Step 5 : Vérifier manuellement le rendu owner vs visiteur**

Run (dev déjà lancé, sinon `npm run dev`) : ouvrir `/users/<monId>/collection` connecté → vue éditable + bouton Partager + Import. Ouvrir en navigation privée (anonyme) → vue read-only, Export CSV seul, pas de prix.

- [ ] **Step 6 : Commit**

```bash
git add "src/app/users/[userId]/collection/page.tsx" src/app/collection/page.tsx
git commit -m "feat(users): page collection canonique (switch isOwner) + ShareButton"
```

---

## Task 5 : Page canonique liste de decks (switch isOwner)

**Files:**

- Create: `src/app/users/[userId]/decks/page.tsx`

Même schéma : owner ⇒ `DecksPageClient` existant (lit `useDeckContext`, correct) ; visiteur ⇒ vue read-only existante. Les liens internes read-only doivent pointer vers `/users/<id>/decks` (et non plus `/u/...`).

- [ ] **Step 1 : Partir d'une copie de la vue read-only existante**

Run: `cp "src/app/u/[userId]/decks/page.tsx" "src/app/users/[userId]/decks/page.tsx"`

- [ ] **Step 2 : Renommer les liens `/u/` → `/users/` dans la copie**

Dans `src/app/users/[userId]/decks/page.tsx`, remplacer les deux `router.replace(\`/u/${userId}/decks...\`)` par `/users/${userId}/decks`.

Run: `grep -n "/u/\${userId}" "src/app/users/[userId]/decks/page.tsx"`
Expected: deux occurrences à remplacer (lignes du `handleFolderSelect`).

- [ ] **Step 3 : Transformer en switch isOwner**

Renommer le composant read-only en `PublicDecksView({ userId }: { userId: string })` (retirer son propre `useParams` ; recevoir `userId` en prop) et ajouter le default export switch en tête :

```tsx
'use client';

import { useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/supabase/contexts/AuthContext';
import type { DeckMeta } from '@/types/decks';
import { useScryfallSymbols } from '@/lib/scryfall/hooks/useScryfallSymbols';
import { Spinner } from '@/components/Spinner/Spinner';
import { DeckCard } from '@/app/decks/components/DeckCard/DeckCard';
import { FolderCard } from '@/app/decks/components/FolderCard/FolderCard';
import { FolderBreadcrumb } from '@/app/decks/components/FolderBreadcrumb/FolderBreadcrumb';
import { useDeckSummaries } from '@/app/decks/useDeckSummaries';
import DecksPageClient from '@/app/decks/DecksPageClient';
import { usePublicDecks } from './usePublicDecks';
import styles from '@/app/decks/page.module.css';

function PublicDecksView({ userId }: { userId: string }) {
	// ... corps actuel de PublicDecksPage, mais sans `const userId = params.userId`,
	// et avec `/users/${userId}/decks` dans handleFolderSelect.
}

/**
 * Canonical, shareable decks-list URL. Owner ⇒ full editable client
 * (DecksPageClient, which reads the owner DeckContext); visitor ⇒ read-only view.
 */
export default function UserDecksPage() {
	const params = useParams();
	const userId = params.userId as string;
	const { user, isLoading } = useAuth();

	if (isLoading) {
		return (
			<div className={styles.page}>
				<div className={styles.loading}>
					<Spinner />
				</div>
			</div>
		);
	}

	const isOwner = !!user && user.id === userId;
	return isOwner ? <DecksPageClient /> : <PublicDecksView userId={userId} />;
}
```

(Le corps de `PublicDecksView` est exactement celui de l'actuel `PublicDecksPage` lignes 22→141, sans la ligne `const userId = params.userId as string;` et avec `userId` venant de la prop.)

- [ ] **Step 4 : Ajouter le ShareButton à la vue owner decks**

`DecksPageClient` n'a pas de barre d'actions standardisée comme la collection. Insérer `<ShareButton />` dans son `titleSection`.

Run: `grep -n "titleSection\|titleLeft\|titleRight" src/app/decks/DecksPageClient.tsx | head`
Repérer le bloc titre, importer `import { ShareButton } from '@/components/ShareButton/ShareButton';` en tête de `DecksPageClient.tsx`, et placer `<ShareButton />` à droite du titre (dans `titleSection`, à côté du bouton de création de deck existant).

- [ ] **Step 5 : Vérifier compilation + lint**

Run: `npm run check`
Expected: pas d'erreur.

- [ ] **Step 6 : Vérifier manuellement**

Owner sur `/users/<monId>/decks` → grille éditable (création/import/drag) + ShareButton. Anonyme → grille read-only, navigation vers `/decks/<id>` OK, pas de contrôle d'édition.

- [ ] **Step 7 : Commit**

```bash
git add "src/app/users/[userId]/decks/page.tsx" src/app/decks/DecksPageClient.tsx
git commit -m "feat(users): page decks canonique (switch isOwner) + ShareButton"
```

---

## Task 6 : `/collection` et `/decks` deviennent des redirects

**Files:**

- Modify: `src/app/collection/page.tsx`
- Modify: `src/app/collection/layout.tsx`
- Modify: `src/app/decks/page.tsx`

Note : `src/app/collection/page.tsx` reste un composant `'use client'` réutilisé par la page canonique owner (Task 4). On NE le transforme PAS en redirect — il reste la **vue owner**. Le redirect doit vivre ailleurs pour ne pas casser cette réutilisation. On crée donc le redirect au niveau du **layout** de `/collection`, qui interceptait déjà l'auth.

Décision : `collection/layout.tsx` redirige toujours vers la version canonique (il ne rend jamais ses enfants pour un owner ; pour l'anonyme il redirige vers login). Mais la page canonique owner importe `CollectionPage` (le composant), pas la route `/collection` — donc rediriger la route `/collection` n'affecte pas l'import. Sûr.

- [ ] **Step 1 : Rediriger la route `/collection` vers la version canonique**

Remplacer le corps de `src/app/collection/layout.tsx` :

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// `/collection` is a shortcut to the canonical shareable URL. Logged-in users are
// sent to /users/<id>/collection; anonymous users to login. The actual owner view
// component (collection/page.tsx) is reused by the canonical page, not this route.
export default async function CollectionLayout() {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) redirect('/auth/login');
	redirect(`/users/${user.id}/collection`);
}
```

(Le layout ne rend plus `{children}` : `redirect()` interrompt le rendu dans tous les cas, donc `page.tsx` sous `/collection` n'est jamais rendu comme route — il n'existe plus que comme composant importé.)

- [ ] **Step 2 : Rediriger la route `/decks` vers la version canonique**

Remplacer `src/app/decks/page.tsx` :

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// `/decks` is a shortcut to the canonical shareable URL /users/<id>/decks.
// Anonymous visitors are sent to login (the decks list requires knowing whose
// list to show). `/decks/[id]` stays public via the un-gated decks layout.
export default async function DecksPage() {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) redirect('/auth/login');
	redirect(`/users/${user.id}/decks`);
}
```

- [ ] **Step 3 : Vérifier compilation**

Run: `npm run check`
Expected: pas d'erreur. (`DecksPageClient` est toujours importé par la page canonique, donc pas d'export inutilisé.)

- [ ] **Step 4 : Vérifier manuellement les redirects**

Connecté : `/collection` → barre d'adresse devient `/users/<monId>/collection` ; `/decks` → `/users/<monId>/decks`. Anonyme : les deux → `/auth/login`.

- [ ] **Step 5 : Commit**

```bash
git add src/app/collection/layout.tsx src/app/decks/page.tsx
git commit -m "feat(routing): /collection et /decks redirigent vers /users/[id]"
```

---

## Task 7 : Mettre à jour les liens de navigation internes

**Files:**

- Modify: tout fichier liant `/collection` ou `/decks` en dur dans la navbar/menus

- [ ] **Step 1 : Recenser les liens internes**

Run: `grep -rn "href=\"/collection\"\|href=\"/decks\"\|push('/collection')\|push('/decks')\|router.push(\`/collection\`)" src/app src/components src/lib | grep -v node_modules`
Expected: liste des liens de navigation (navbar, landing CTA, etc.).

- [ ] **Step 2 : Décider du comportement**

Les liens `/collection` et `/decks` **fonctionnent toujours** (ils redirigent). On peut donc les laisser tels quels — le redirect 307/308 amène l'utilisateur à la bonne URL. **Ne pas** réécrire les liens en `/users/<id>/...` côté navbar : la navbar ne connaît pas toujours l'`id` au moment du rendu serveur, et le raccourci `/collection` est plus lisible. Laisser tel quel.

- [ ] **Step 3 : Mettre à jour le commentaire obsolète dans CollectionView**

Run: `grep -n "/u/\[userId\]" src/app/collection/components/CollectionView/CollectionView.tsx`
Remplacer la référence `/u/[userId]/collection` par `/users/[userId]/collection` dans le commentaire (ligne ~43).

- [ ] **Step 4 : Vérifier**

Run: `npm run check`
Expected: pas d'erreur.

- [ ] **Step 5 : Commit**

```bash
git add src/app/collection/components/CollectionView/CollectionView.tsx
git commit -m "docs: corriger la référence de route /u → /users dans CollectionView"
```

---

## Task 8 : Supprimer l'ancien arbre `/u`

**Files:**

- Delete: `src/app/u/` (récursif)

- [ ] **Step 1 : Confirmer qu'aucune référence `/u/` ne subsiste**

Run: `grep -rn "'/u/\|\"/u/\|\`/u/\|app/u/" src/app src/components src/lib | grep -v node_modules`Expected: aucune occurrence (les liens internes utilisent`/users/`ou les raccourcis`/collection`,`/decks`).

- [ ] **Step 2 : Supprimer l'arbre**

Run: `git rm -r src/app/u`

- [ ] **Step 3 : Vérifier**

Run: `npm run check`
Expected: pas d'erreur (rien n'importe depuis `src/app/u`).

- [ ] **Step 4 : Commit**

```bash
git commit -m "chore: supprimer l'ancien arbre /u remplacé par /users"
```

---

## Task 9 : Vérification bout-en-bout

- [ ] **Step 1 : `npm run check` global**

Run: `npm run check`
Expected: TS + ESLint + Prettier OK.

- [ ] **Step 2 : Scénario propriétaire**

Connecté : `/collection` redirige → `/users/<monId>/collection`, vue éditable, ShareButton copie l'URL (vérifier le presse-papier), `purchasePrice` visible. `/decks` → `/users/<monId>/decks` éditable. `/decks/<monDeck>` éditable.

- [ ] **Step 3 : Scénario anonyme**

Navigation privée : `/users/<id>/collection` et `/users/<id>/decks` s'affichent (pas de redirect login), read-only, pas de ShareButton, `purchasePrice` absent. `/decks/<id>` read-only. `/collection` et `/decks` (sans id) → `/auth/login`.

- [ ] **Step 4 : Scénario visiteur connecté (autre compte)**

Sur `/decks/<deckDunAutre>` : vue read-only + bouton « Copier ce deck » → crée un nouveau deck dans `/users/<monId>/decks` ; deck source inchangé.

- [ ] **Step 5 : Commit de clôture (si ajustements)**

```bash
git add -A
git commit -m "test: vérification bout-en-bout du partage URL canonique"
```

---

## Self-Review (couverture du spec)

- URL canonique `/users/[id]/collection` + `/users/[id]/decks` → Tasks 2-5 ✓
- Vue fusionnée owner/visiteur (`isOwner`) → Tasks 4-5 ✓
- `/collection` et `/decks` redirects → Task 6 ✓ (Next `redirect()` émet un 307 temporaire ; le spec parlait de « 308 » mais l'effet de navigation — atterrir sur l'URL canonique — est identique. Si un 308 permanent est requis pour le SEO, utiliser `permanentRedirect()` à la place ; non nécessaire ici car les raccourcis restent valides.)
- Bouton « Partager » → Tasks 1, 4, 5 ✓
- Source collection selon `isOwner` (`cards` vs vue) → déjà acquis : owner réutilise `CollectionPage` (contexte owner lit `cards`), visiteur `usePublicCollection` (vue) ✓
- `/decks/[id]` consultable par tous → déjà acquis ✓
- Bouton « Copier ce deck » → déjà acquis ✓
- RLS → déjà acquis ✓
- Suppression du `/u` obsolète → Task 8 ✓
