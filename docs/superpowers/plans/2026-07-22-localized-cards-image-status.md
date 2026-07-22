# Amendement `localized_cards` : `image_status` (qualité) + filtre placeholder DFC

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. This AMENDS the delivered `localized_cards` feature (plan `2026-07-22-localized-cards-cache.md`).

**Goal:** Sauvegarder la qualité d'image Scryfall (`image_status`) et la propager jusqu'au rendu (Usage B, transport seul), et corriger le filtre placeholder des DFC.

**Architecture:** `image_status` (niveau carte Scryfall) devient une colonne `not null` de `localized_cards`, extraite au seed, propagée table → query → cache IndexedDB → `LocalizedImageResult`. Le filtre DFC du seed passe de « présence d'URL » à `hasRealScan(card.image_status)`. `CardImage` n'est PAS modifié (le branchement fallback-HD est un follow-up).

**Tech Stack:** identique au plan parent.

## Global Constraints

- `image_status` est au **niveau carte** chez Scryfall (une valeur par carte, pas par face). Enum : `missing`/`placeholder`/`lowres`/`highres_scan`.
- La table ne stocke JAMAIS `missing`/`placeholder` (filtrés au seed) → en pratique `image_status` ∈ {`lowres`, `highres_scan`}. Colonne `not null`.
- **Transport seul** : `image_status` devient disponible au rendu via `LocalizedImageResult` mais la logique de `CardImage`/`resolveImageUri`/`useEnglishFallbackImage` N'EST PAS modifiée. Zéro régression de rendu.
- Noms Scryfall exacts (`image_status`). Le type est `ScryfallImageStatus` (`src/lib/scryfall/types/scryfall.ts`).
- Rien n'est encore en prod : on AMENDE la migration existante `20260722120000_add_localized_cards.sql` (pas une nouvelle migration) et on **re-seede** localement.
- Pas de framework de test : `npm run check`/`build`, `sb:reset`/`sb:migrate` local, docker psql, seed `--limit`. Gate « aucun NOUVEAU problème ».
- **FORBIDDEN pour les subagents** : aucune commande destructive non demandée. `sb:reset` est ICI autorisé et nécessaire (la migration existante est modifiée → il faut recréer la table) MAIS uniquement en local, et le contrôleur le confirme dans le dispatch.

---

## Task A : colonne `image_status` + filtre DFC (migration + seed)

**Files:**

- Modify: `supabase/migrations/20260722120000_add_localized_cards.sql`
- Modify: `scripts/seed/normalize-localized-card.ts`

**Interfaces:**

- Produces: table avec colonne `image_status text not null` ; `LocalizedCardRow` gagne `image_status: ScryfallImageStatus`.

- [ ] **Step 1 : Ajouter la colonne à la migration**

Modify `supabase/migrations/20260722120000_add_localized_cards.sql`, dans le `create table`, après la ligne `oracle_id uuid,` et avant `card_faces jsonb not null,` :

```sql
  image_status text not null,
```

Et compléter le commentaire de tête du fichier (après le bloc `card_faces :`) :

```sql
-- image_status : qualité du scan Scryfall (niveau carte). Jamais missing/placeholder
-- (filtrés au seed) → en pratique 'lowres' ou 'highres_scan'. not null.
```

- [ ] **Step 2 : Recréer la table locale (migration modifiée) + confirmer la colonne**

La migration existante ayant changé, recréer la DB locale.
Run : `npm run sb:reset` (LOCAL only — recrée la DB à partir des migrations).
Puis vérifier via docker psql (`docker exec -i $(docker ps --format '{{.Names}}'|grep supabase_db) psql -U postgres -d postgres -c "\d public.localized_cards"`).
Expected : colonne `image_status text not null` présente.

- [ ] **Step 3 : Extraire `image_status` + corriger le filtre DFC au seed**

Modify `scripts/seed/normalize-localized-card.ts`.

Import — ajouter `ScryfallImageStatus` :

```ts
import type {
	ScryfallCard,
	ScryfallImageUris,
	ScryfallImageStatus,
} from '@/lib/scryfall/types/scryfall';
import { hasRealScan } from '@/lib/scryfall/types/scryfall';
```

Ajouter `image_status` au type `LocalizedCardRow` (après `oracle_id`) :

```ts
export interface LocalizedCardRow {
	set: string;
	collector_number: string;
	lang: string;
	scryfall_id: string;
	oracle_id: string | null;
	image_status: ScryfallImageStatus;
	card_faces: LocalizedFace[];
}
```

Corriger la branche DFC pour gater sur `hasRealScan(card.image_status)` (le placeholder DFC a une URL valide mais un `image_status` placeholder au niveau carte). Remplacer le bloc `else if (card.card_faces …)` par :

```ts
	} else if (
		hasRealScan(card.image_status) &&
		card.card_faces &&
		card.card_faces.some((f) => f.image_uris)
	) {
		// Faces : deux images physiques (transform, modal_dfc). image_status est au
		// niveau CARTE chez Scryfall (pas par face) → on gate ici avec le MÊME
		// hasRealScan(card.image_status) que la racine, sinon un placeholder DFC
		// (servi à une URL 200 valide) passerait le filtre.
		for (const f of card.card_faces) {
			if (!f.image_uris) continue;
			faces.push({
				image_uris: f.image_uris,
				printed_name: f.printed_name,
				printed_type_line: f.printed_type_line,
				printed_text: f.printed_text,
			});
		}
	}
```

Ajouter `image_status` au retour (après `oracle_id`) :

```ts
return {
	set: card.set,
	collector_number: card.collector_number,
	lang: card.lang,
	scryfall_id: card.id,
	oracle_id: card.oracle_id ?? null,
	image_status: card.image_status,
	card_faces: faces,
};
```

- [ ] **Step 4 : Re-seeder localement + vérifier image_status peuplé, aucun placeholder**

Run (clé service-role locale déjà connue) :

```bash
SUPABASE_SERVICE_ROLE_KEY="<clé locale>" npm run seed:localized-cards -- --limit=300
```

Puis docker psql :

```sql
select image_status, count(*) from public.localized_cards group by image_status;
select count(*) from public.localized_cards where image_status in ('missing','placeholder');
```

Expected : uniquement `lowres`/`highres_scan` ; **0** ligne `missing`/`placeholder`.

- [ ] **Step 5 : lint + tsc**

Run : `npx eslint scripts/seed/normalize-localized-card.ts && npx tsc --noEmit`
Expected : aucun NOUVEAU problème sur le fichier.

- [ ] **Step 6 : Commit**

```bash
git add supabase/migrations/20260722120000_add_localized_cards.sql scripts/seed/normalize-localized-card.ts
git commit -m "feat(seed): store image_status + gate DFC placeholders by card image_status

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task B : propager `image_status` (query → cache → LocalizedImageResult)

**Files:**

- Modify: `src/lib/supabase/queries/localized-cards.ts`
- Modify: `src/lib/scryfall/db/localized-cards.ts`
- Modify: `src/lib/scryfall/utils/card-cache.ts`
- Modify: `src/lib/scryfall/hooks/useLocalizedImage.ts`

**Interfaces:**

- Consumes: `ScryfallImageStatus`.
- Produces: `LocalizedCardDbRow.image_status`, `CachedLocalizedImage.image_status`, `LocalizedImageResult.image_status` — tous optionnels côté cache/résultat (une entrée `missing` n'en a pas), NON-NULL côté DB row.

- [ ] **Step 1 : query — select + type**

Modify `src/lib/supabase/queries/localized-cards.ts`.

Import `ScryfallImageStatus` (à côté de `ScryfallImageUris`) :

```ts
import type { ScryfallImageUris, ScryfallImageStatus } from '@/lib/scryfall/types/scryfall';
```

Ajouter au type `LocalizedCardDbRow` (après `oracle_id`) :

```ts
image_status: ScryfallImageStatus;
```

Ajouter `image_status` au `.select(...)` :

```ts
		.select('set, collector_number, lang, scryfall_id, oracle_id, image_status, card_faces')
```

- [ ] **Step 2 : cache type — CachedLocalizedImage**

Modify `src/lib/scryfall/utils/card-cache.ts`.

Import `ScryfallImageStatus` :

```ts
import type {
	ScryfallCard,
	ScryfallImageUris,
	ScryfallImageStatus,
} from '@/lib/scryfall/types/scryfall';
```

Ajouter à `CachedLocalizedImage` (après le champ `card_faces?`, avant `cachedAt`) :

```ts
	/** Qualité du scan localisé (lowres/highres_scan). Absent pour une entrée `missing`. */
	image_status?: ScryfallImageStatus;
```

- [ ] **Step 3 : injection prefetch — porter image_status dans le cache**

Modify `src/lib/scryfall/db/localized-cards.ts`, dans le `putLocalizedImageInCache(...)` de `prefetchLocalizedCards` (le mapping des `rows`), ajouter `image_status` :

```ts
putLocalizedImageInCache({
	key: `${r.set}/${r.collector_number}/${r.lang}`,
	card_faces: r.card_faces,
	image_status: r.image_status,
	cachedAt: Date.now(),
});
```

- [ ] **Step 4 : useLocalizedImage — LocalizedImageResult + écritures + cachedToResult**

Modify `src/lib/scryfall/hooks/useLocalizedImage.ts`.

(a) `LocalizedImageResult` gagne `image_status` :

```ts
export interface LocalizedImageResult {
	image_uris?: ScryfallImageUris;
	card_faces?: ScryfallCardFace[];
	image_status?: ScryfallImageStatus;
}
```

Importer `ScryfallImageStatus` (à côté des autres types scryfall déjà importés) :

```ts
import type {
	ScryfallImageUris,
	ScryfallCardFace,
	ScryfallImageStatus,
} from '@/lib/scryfall/types/scryfall';
```

(b) `cachedToResult` — propager `image_status` du cache vers le résultat. Modifier sa signature d'entrée et ses deux `return` :

```ts
function cachedToResult(cached: {
	card_faces?: Array<{
		image_uris?: ScryfallImageUris;
		printed_name?: string;
		printed_type_line?: string;
		printed_text?: string;
	}>;
	image_status?: ScryfallImageStatus;
}): LocalizedImageResult {
	const faces = cached.card_faces ?? [];
	if (faces.length <= 1) {
		return { image_uris: faces[0]?.image_uris, image_status: cached.image_status };
	}
	return {
		image_status: cached.image_status,
		card_faces: faces.map((f) => ({
			object: 'card_face' as const,
			mana_cost: '',
			name: '',
			image_uris: f.image_uris,
			printed_name: f.printed_name,
			printed_type_line: f.printed_type_line,
			printed_text: f.printed_text,
		})),
	};
}
```

(c) Les deux écritures `putLocalizedImageInCache` (dans `fetchLocalizedImage` et `fetchEnglishImage`) — ajouter `image_status` de la carte fetchée. Dans `fetchLocalizedImage`, le bloc de persistance du hit :

```ts
void putLocalizedImageInCache({
	key: cacheKey,
	card_faces: toCachedFaces(localized),
	image_status: localized.image_status,
	cachedAt: Date.now(),
});

return {
	image_uris: localized.image_uris,
	card_faces: localized.card_faces,
	image_status: localized.image_status,
};
```

Dans `fetchEnglishImage`, le bloc équivalent :

```ts
void putLocalizedImageInCache({
	key: cacheKey,
	card_faces: toCachedFaces(english),
	image_status: english.image_status,
	cachedAt: Date.now(),
});

return {
	image_uris: english.image_uris,
	card_faces: english.card_faces,
	image_status: english.image_status,
};
```

- [ ] **Step 5 : lint + tsc + build**

Run : `npx eslint src/lib/supabase/queries/localized-cards.ts src/lib/scryfall/db/localized-cards.ts src/lib/scryfall/utils/card-cache.ts src/lib/scryfall/hooks/useLocalizedImage.ts && npx tsc --noEmit && npm run build`
Expected : aucun NOUVEAU problème ; build compile.

- [ ] **Step 6 : Vérif runtime — image_status remonte, rendu inchangé**

Prérequis : DB locale re-seedée (Task A), cache IndexedDB purgé, `npm run dev`.
Ouvrir une vue avec cartes non-en. DevTools → Application → IndexedDB → `wizcard-cache` → `localized-images` : confirmer qu'une entrée porte un champ `image_status` (`lowres`/`highres_scan`). Le rendu des cartes (mono-face et DFC localisées) reste correct — aucune différence visuelle (transport seul).

- [ ] **Step 7 : Commit**

```bash
git add src/lib/supabase/queries/localized-cards.ts src/lib/scryfall/db/localized-cards.ts src/lib/scryfall/utils/card-cache.ts src/lib/scryfall/hooks/useLocalizedImage.ts
git commit -m "feat(scryfall): propagate localized image_status to render (transport only)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notes

- Pas de bump IndexedDB nécessaire : `image_status` est un champ AJOUTÉ optionnel sur `CachedLocalizedImage` — les entrées v4 existantes sans lui restent valides (undefined). Mais comme la migration DB change et qu'on re-seede, purger le cache IndexedDB en dev est recommandé pour re-remplir avec `image_status`.
- `CardImage` NON modifié : le fallback anglais HD basé sur le `image_status` localisé est un follow-up (spec § Hors scope).
- Prod : re-appliquer la migration amendée (idempotente) + re-seed complet.
