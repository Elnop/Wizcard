# Localized Token Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make deck token/emblem detection work for localized (non-English) cards, and display the resulting tokens in the language of the producing card with English fallback.

**Architecture:** Two isolated units bolted onto the resolution choke point. Unit A (`hydrateAllParts`) runs inside `resolveCardsByScryfallIds` and grafts the language-invariant `all_parts` field onto localized cards (fetched from the English oracle print via `oracle_id`). Unit B (`localizeTokens`) runs after token IDs are resolved and re-resolves each token into its source card's language, falling back to English on 404.

**Tech Stack:** TypeScript, Next.js (App Router), Scryfall API via existing fetcher/proxy, IndexedDB cache. Tests are one-off `tsx` scripts (no test runner configured).

## Global Constraints

- Scryfall `/cards/collection` accepts max 75 identifiers per request; `BATCH_SIZE = 75` (`src/lib/scryfall/constants.ts`).
- Non-English Scryfall prints DO NOT include `all_parts`; only the oracle/English print does.
- `ScryfallRelatedCard` exposes only `id | object | component | name | type_line | uri` — no `set`/`collector_number`. Token localization therefore happens AFTER the token print is resolved (the resolved `ScryfallCard` carries `set`/`collector_number`/`lang`).
- Degrade silently on network failure: `console.warn` + return data unchanged, never throw. The fetcher already retries with backoff (`MAX_RETRIES = 3`).
- Run `npm run check` before every commit (TypeScript + ESLint + Prettier).
- Run TS test scripts with `npx tsx <path>`.
- Language code mapping: `LANGUAGE_TO_SCRYFALL_CODE` and `SCRYFALL_CODE_TO_LANGUAGE` in `src/lib/mtg/languages.ts`. A card's Scryfall lang code lives directly on `ScryfallCard.lang` (e.g. `'fr'`, `'en'`).

---

### Task 1: `collectDeckTokens` — preserve token → source language link

**Files:**

- Modify: `src/lib/deck/utils/collectDeckTokens.ts`
- Test: `scripts/test/collectDeckTokens.test.ts` (create)

**Interfaces:**

- Consumes: `ScryfallRelatedCard` (`{ id, object, component, name, type_line, uri }`), `CardWithParts` (`{ id: string; all_parts?: ScryfallRelatedCard[] }`).
- Produces:
  - `collectDeckTokenIds(cards: CardWithParts[]): string[]` — UNCHANGED signature, existing callers keep working.
  - NEW `collectDeckTokensWithSourceLang(cards: Array<CardWithParts & { lang?: string }>): Map<string, string>` — maps token print id (English) → producing card's Scryfall lang code (e.g. `'fr'`). When several source cards produce the same token, first writer wins.

- [ ] **Step 1: Write the failing test**

Create `scripts/test/collectDeckTokens.test.ts`:

```ts
import assert from 'node:assert';
import {
	collectDeckTokenIds,
	collectDeckTokensWithSourceLang,
} from '../../src/lib/deck/utils/collectDeckTokens';

const lolthFr = {
	id: 'lolth-fr',
	lang: 'fr',
	all_parts: [
		{
			object: 'related_card',
			id: 'lolth-fr',
			component: 'combo_piece',
			name: 'Lolth, Spider Queen',
			type_line: 'Legendary Planeswalker — Lolth',
			uri: '',
		},
		{
			object: 'related_card',
			id: 'spider-en',
			component: 'token',
			name: 'Spider',
			type_line: 'Token Creature — Spider',
			uri: '',
		},
		{
			object: 'related_card',
			id: 'emblem-en',
			component: 'combo_piece',
			name: 'Lolth, Spider Queen Emblem',
			type_line: 'Emblem — Lolth',
			uri: '',
		},
	],
} as const;

// collectDeckTokenIds: unchanged behavior — token + emblem, not the card's own face
const ids = collectDeckTokenIds([lolthFr]);
assert.deepStrictEqual(
	new Set(ids),
	new Set(['spider-en', 'emblem-en']),
	'ids should be spider + emblem'
);

// New: source language preserved
const map = collectDeckTokensWithSourceLang([lolthFr]);
assert.strictEqual(map.get('spider-en'), 'fr', 'spider source lang fr');
assert.strictEqual(map.get('emblem-en'), 'fr', 'emblem source lang fr');

// Card without all_parts → empty, no crash
assert.deepStrictEqual(collectDeckTokenIds([{ id: 'x' }]), [], 'no all_parts → []');
assert.strictEqual(
	collectDeckTokensWithSourceLang([{ id: 'x' }]).size,
	0,
	'no all_parts → empty map'
);

// Missing lang defaults to 'en'
const noLang = {
	id: 'y',
	all_parts: [
		{
			object: 'related_card',
			id: 'tok',
			component: 'token',
			name: 'T',
			type_line: 'Token Creature',
			uri: '',
		},
	],
};
assert.strictEqual(
	collectDeckTokensWithSourceLang([noLang as never]).get('tok'),
	'en',
	'missing lang → en'
);

console.log('collectDeckTokens: all assertions passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test/collectDeckTokens.test.ts`
Expected: FAIL — `collectDeckTokensWithSourceLang` is not exported (import error / undefined).

- [ ] **Step 3: Add the new function**

In `src/lib/deck/utils/collectDeckTokens.ts`, after `collectDeckTokenIds`, add:

```ts
/**
 * Like {@link collectDeckTokenIds}, but maps each produced token/emblem print id
 * to the Scryfall lang code of the card that produces it (default `'en'`). Used
 * to re-resolve tokens in their source card's language. First producer wins when
 * the same token is shared.
 */
export function collectDeckTokensWithSourceLang(
	cards: Array<CardWithParts & { lang?: string }>
): Map<string, string> {
	const byLang = new Map<string, string>();
	for (const card of cards) {
		const lang = card.lang ?? 'en';
		for (const part of card.all_parts ?? []) {
			if (isProducedToken(part, card.id) && !byLang.has(part.id)) {
				byLang.set(part.id, lang);
			}
		}
	}
	return byLang;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/test/collectDeckTokens.test.ts`
Expected: PASS — `collectDeckTokens: all assertions passed`.

- [ ] **Step 5: Lint + commit**

```bash
npm run check
git add src/lib/deck/utils/collectDeckTokens.ts scripts/test/collectDeckTokens.test.ts
git commit -m "feat(tokens): map produced tokens to source card language

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `hydrateAllParts` — graft all_parts onto localized cards (Unit A)

**Files:**

- Create: `src/lib/scryfall/hydrateAllParts.ts`
- Test: `scripts/test/hydrateAllParts.test.ts` (create)

**Interfaces:**

- Consumes: `ScryfallCard` (has `id`, `lang: string`, `oracle_id`, `all_parts?`), `getCardCollection(identifiers: ScryfallCardIdentifier[]): Promise<ScryfallList<ScryfallCard>>` from `src/lib/scryfall/endpoints/cards.ts`, `BATCH_SIZE` from `src/lib/scryfall/constants.ts`.
- Produces: `hydrateAllParts(cards: ScryfallCard[], deps?: { fetchByOracleIds?: (ids: string[]) => Promise<ScryfallCard[]> }): Promise<ScryfallCard[]>` — returns a NEW array where localized cards lacking `all_parts` have it grafted (other cards returned as-is, same reference). `deps.fetchByOracleIds` defaults to a `getCardCollection`-backed batched fetch; injected in tests.

- [ ] **Step 1: Write the failing test**

Create `scripts/test/hydrateAllParts.test.ts`:

```ts
import assert from 'node:assert';
import { hydrateAllParts } from '../../src/lib/scryfall/hydrateAllParts';
import type { ScryfallCard } from '../../src/lib/scryfall/types/scryfall';

function card(partial: Partial<ScryfallCard>): ScryfallCard {
	return {
		id: 'x',
		lang: 'en',
		oracle_id: 'o',
		name: 'N',
		printed_name: undefined,
		...partial,
	} as ScryfallCard;
}

// FR card without all_parts + oracle_id → all_parts grafted, identity preserved
const lolthFr = card({
	id: 'lolth-fr',
	lang: 'fr',
	oracle_id: 'lolth-oracle',
	name: 'Lolth',
	printed_name: 'Lolth VF',
	all_parts: undefined,
});
const oracleEn = card({
	id: 'lolth-en',
	lang: 'en',
	oracle_id: 'lolth-oracle',
	all_parts: [
		{
			object: 'related_card',
			id: 'emblem-en',
			component: 'combo_piece',
			name: 'Lolth Emblem',
			type_line: 'Emblem — Lolth',
			uri: '',
		},
	] as never,
});

const out = await hydrateAllParts([lolthFr], { fetchByOracleIds: async () => [oracleEn] });
const hydrated = out.find((c) => c.id === 'lolth-fr')!;
assert.ok(hydrated.all_parts && hydrated.all_parts.length === 1, 'all_parts grafted');
assert.strictEqual(hydrated.printed_name, 'Lolth VF', 'localized identity preserved');
assert.strictEqual(hydrated.lang, 'fr', 'lang preserved');

// EN card or card already having all_parts → no fetch, returned untouched
let called = 0;
const enCard = card({ id: 'en1', lang: 'en' });
const frWithParts = card({ id: 'fr2', lang: 'fr', all_parts: [] as never });
const out2 = await hydrateAllParts([enCard, frWithParts], {
	fetchByOracleIds: async () => {
		called++;
		return [];
	},
});
assert.strictEqual(called, 0, 'no fetch when nothing to hydrate');
assert.strictEqual(out2[0], enCard, 'en card same reference');

// Network failure → cards unchanged, no throw
const out3 = await hydrateAllParts([lolthFr], {
	fetchByOracleIds: async () => {
		throw new Error('network');
	},
});
assert.strictEqual(
	out3.find((c) => c.id === 'lolth-fr')!.all_parts,
	undefined,
	'unchanged on failure'
);

console.log('hydrateAllParts: all assertions passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test/hydrateAllParts.test.ts`
Expected: FAIL — module `hydrateAllParts` not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/scryfall/hydrateAllParts.ts`:

```ts
import { getCardCollection } from '@/lib/scryfall/endpoints/cards';
import { BATCH_SIZE } from '@/lib/scryfall/constants';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

/**
 * Non-English Scryfall prints omit `all_parts` (token/emblem relations live only
 * on the English oracle print). This fetches the oracle print by `oracle_id` and
 * grafts its `all_parts` onto the localized cards, leaving every other field
 * (image, printed_name, lang…) untouched. Cards that are English, already have
 * `all_parts`, or lack an `oracle_id` are returned unchanged.
 *
 * On network failure the input cards are returned as-is (no throw); the caller's
 * token detection degrades to "no tokens for this card", never worse than today.
 */
export async function hydrateAllParts(
	cards: ScryfallCard[],
	deps: { fetchByOracleIds?: (oracleIds: string[]) => Promise<ScryfallCard[]> } = {}
): Promise<ScryfallCard[]> {
	const fetchByOracleIds = deps.fetchByOracleIds ?? defaultFetchByOracleIds;

	const needsHydration = cards.filter(
		(c) => c.lang !== 'en' && !c.all_parts && Boolean(c.oracle_id)
	);
	if (needsHydration.length === 0) return cards;

	const oracleIds = [...new Set(needsHydration.map((c) => c.oracle_id))];

	let oracleCards: ScryfallCard[];
	try {
		oracleCards = await fetchByOracleIds(oracleIds);
	} catch (err) {
		console.warn('[hydrateAllParts] oracle fetch failed, leaving cards unhydrated:', err);
		return cards;
	}

	const partsByOracle = new Map<string, ScryfallCard['all_parts']>();
	for (const oc of oracleCards) {
		if (oc.oracle_id && oc.all_parts) partsByOracle.set(oc.oracle_id, oc.all_parts);
	}

	return cards.map((c) => {
		if (c.lang === 'en' || c.all_parts || !c.oracle_id) return c;
		const parts = partsByOracle.get(c.oracle_id);
		return parts ? { ...c, all_parts: parts } : c;
	});
}

async function defaultFetchByOracleIds(oracleIds: string[]): Promise<ScryfallCard[]> {
	const out: ScryfallCard[] = [];
	for (let i = 0; i < oracleIds.length; i += BATCH_SIZE) {
		const batch = oracleIds.slice(i, i + BATCH_SIZE);
		const result = await getCardCollection(batch.map((oracle_id) => ({ oracle_id })));
		out.push(...result.data);
	}
	return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/test/hydrateAllParts.test.ts`
Expected: PASS — `hydrateAllParts: all assertions passed`.

- [ ] **Step 5: Lint + commit**

```bash
npm run check
git add src/lib/scryfall/hydrateAllParts.ts scripts/test/hydrateAllParts.test.ts
git commit -m "feat(scryfall): hydrate all_parts on localized cards from oracle print

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Wire `hydrateAllParts` into `resolveCardsByScryfallIds` + re-cache

**Files:**

- Modify: `src/lib/scryfall/resolveCardsByScryfallIds.ts`
- Test: `scripts/test/resolveHydration.test.ts` (create)

**Interfaces:**

- Consumes: `hydrateAllParts` (Task 2), `putCardsInCache(cards: ScryfallCard[]): Promise<void>` (already imported in this file).
- Produces: `resolveCardsByScryfallIds` unchanged signature; the returned Map's localized cards now carry `all_parts`, and the hydrated versions are written back to cache.

- [ ] **Step 1: Write the failing test**

Create `scripts/test/resolveHydration.test.ts`. This test verifies the hydration step is invoked on the resolved map. Because `resolveCardsByScryfallIds` reads IndexedDB (unavailable in node), the test exercises the pure post-resolution hydration helper extracted in Step 3 (`hydrateResolvedMap`):

```ts
import assert from 'node:assert';
import { hydrateResolvedMap } from '../../src/lib/scryfall/resolveCardsByScryfallIds';
import type { ScryfallCard } from '../../src/lib/scryfall/types/scryfall';

const frNoParts = { id: 'fr', lang: 'fr', oracle_id: 'o', name: 'N' } as ScryfallCard;
const oracleEn = {
	id: 'en',
	lang: 'en',
	oracle_id: 'o',
	name: 'N',
	all_parts: [
		{
			object: 'related_card',
			id: 'tok',
			component: 'token',
			name: 'T',
			type_line: 'Token Creature',
			uri: '',
		},
	],
} as ScryfallCard;

const map = new Map<string, ScryfallCard>([['fr', frNoParts]]);
let cached: ScryfallCard[] = [];
const out = await hydrateResolvedMap(map, {
	fetchByOracleIds: async () => [oracleEn],
	writeCache: async (cards) => {
		cached = cards;
	},
});

assert.ok(out.get('fr')!.all_parts, 'resolved fr card now has all_parts');
assert.strictEqual(cached.length, 1, 'hydrated card written back to cache');
assert.strictEqual(cached[0].id, 'fr', 'cached the hydrated localized card');
console.log('resolveHydration: all assertions passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test/resolveHydration.test.ts`
Expected: FAIL — `hydrateResolvedMap` not exported.

- [ ] **Step 3: Add `hydrateResolvedMap` and call it before returning**

In `src/lib/scryfall/resolveCardsByScryfallIds.ts`:

Add import at top:

```ts
import { hydrateAllParts } from '@/lib/scryfall/hydrateAllParts';
```

Add this exported helper near the bottom of the file (above or below `resolveCardsByScryfallIds`):

```ts
/**
 * Hydrate `all_parts` on the localized cards of a resolved map and write the
 * enriched versions back to cache. Pure w.r.t. its injected deps so it can be
 * tested without IndexedDB. Failures inside `hydrateAllParts` are already
 * swallowed there; a cache-write failure is non-critical and ignored.
 */
export async function hydrateResolvedMap(
	resolved: Map<string, ScryfallCard>,
	deps: {
		fetchByOracleIds?: (oracleIds: string[]) => Promise<ScryfallCard[]>;
		writeCache?: (cards: ScryfallCard[]) => Promise<void>;
	} = {}
): Promise<Map<string, ScryfallCard>> {
	const writeCache = deps.writeCache ?? putCardsInCache;
	const cards = [...resolved.values()];
	const hydrated = await hydrateAllParts(cards, { fetchByOracleIds: deps.fetchByOracleIds });

	const changed: ScryfallCard[] = [];
	for (let i = 0; i < cards.length; i++) {
		if (hydrated[i] !== cards[i]) {
			resolved.set(hydrated[i].id, hydrated[i]);
			changed.push(hydrated[i]);
		}
	}
	if (changed.length > 0) void writeCache(changed);
	return resolved;
}
```

Then, in `resolveCardsByScryfallIds`, replace the final `return resolved;` (line ~81) with:

```ts
if (isCancelled?.()) return resolved;
return hydrateResolvedMap(resolved);
```

(The existing `void putCardsInCache(fetched)` block stays as-is; it caches the raw network fetch. `hydrateResolvedMap` writes back only the additionally-hydrated cards.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/test/resolveHydration.test.ts`
Expected: PASS — `resolveHydration: all assertions passed`.

- [ ] **Step 5: Lint + commit**

```bash
npm run check
git add src/lib/scryfall/resolveCardsByScryfallIds.ts scripts/test/resolveHydration.test.ts
git commit -m "feat(scryfall): hydrate all_parts on resolve and re-cache enriched cards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `localizeTokens` — re-resolve tokens in source language (Unit B)

**Files:**

- Create: `src/lib/scryfall/localizeTokens.ts`
- Test: `scripts/test/localizeTokens.test.ts` (create)

**Interfaces:**

- Consumes: `ScryfallCard` (has `set: string`, `collector_number: string`, `lang: string`), `getCardBySetNumberAndLang(setCode, collectorNumber, lang, signal?): Promise<ScryfallCard>` from `src/lib/scryfall/endpoints/cards.ts`, `LANGUAGE_TO_SCRYFALL_CODE` / `SCRYFALL_CODE_TO_LANGUAGE` from `src/lib/mtg/languages.ts`.
- Produces: `localizeTokens(tokens: ScryfallCard[], langByTokenId: Map<string, string>, deps?: { fetchLocalized?: (set: string, num: string, lang: string) => Promise<ScryfallCard> }): Promise<ScryfallCard[]>` — returns tokens, each replaced by its localized print when the source lang differs from English AND a localized print exists; otherwise the original English token (fallback).

- [ ] **Step 1: Write the failing test**

Create `scripts/test/localizeTokens.test.ts`:

```ts
import assert from 'node:assert';
import { localizeTokens } from '../../src/lib/scryfall/localizeTokens';
import type { ScryfallCard } from '../../src/lib/scryfall/types/scryfall';

const spiderEn = {
	id: 'spider-en',
	lang: 'en',
	set: 'afr',
	collector_number: '12',
	name: 'Spider',
	printed_name: undefined,
} as ScryfallCard;
const spiderFr = {
	id: 'spider-fr',
	lang: 'fr',
	set: 'afr',
	collector_number: '12',
	name: 'Spider',
	printed_name: 'Araignée',
} as ScryfallCard;

// Source lang fr + localized print exists → fr token
const out1 = await localizeTokens([spiderEn], new Map([['spider-en', 'fr']]), {
	fetchLocalized: async () => spiderFr,
});
assert.strictEqual(out1[0].id, 'spider-fr', 'returns fr print');
assert.strictEqual(out1[0].printed_name, 'Araignée', 'localized name');

// Localized print 404 → fallback to EN token
const out2 = await localizeTokens([spiderEn], new Map([['spider-en', 'fr']]), {
	fetchLocalized: async () => {
		throw new Error('404');
	},
});
assert.strictEqual(out2[0].id, 'spider-en', 'fallback to en token');

// Source lang en → no fetch, original token
let called = 0;
const out3 = await localizeTokens([spiderEn], new Map([['spider-en', 'en']]), {
	fetchLocalized: async () => {
		called++;
		return spiderFr;
	},
});
assert.strictEqual(called, 0, 'no fetch for en source');
assert.strictEqual(out3[0].id, 'spider-en', 'en source unchanged');

console.log('localizeTokens: all assertions passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test/localizeTokens.test.ts`
Expected: FAIL — module `localizeTokens` not found.

- [ ] **Step 3: Implement the module**

Create `src/lib/scryfall/localizeTokens.ts`:

```ts
import { getCardBySetNumberAndLang } from '@/lib/scryfall/endpoints/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

/**
 * Re-resolve each resolved (English) token print into the language of the card
 * that produces it. `langByTokenId` maps token print id → Scryfall lang code
 * (e.g. `'fr'`). Tokens whose source language is English (or `undefined`) are
 * left untouched. When the localized print does not exist (404) or the fetch
 * fails, the English token is kept (fallback) — we never drop a token.
 */
export async function localizeTokens(
	tokens: ScryfallCard[],
	langByTokenId: Map<string, string>,
	deps: { fetchLocalized?: (set: string, num: string, lang: string) => Promise<ScryfallCard> } = {}
): Promise<ScryfallCard[]> {
	const fetchLocalized = deps.fetchLocalized ?? defaultFetchLocalized;

	return Promise.all(
		tokens.map(async (token) => {
			const lang = langByTokenId.get(token.id);
			if (!lang || lang === 'en' || !token.set || !token.collector_number) return token;
			try {
				return await fetchLocalized(token.set, token.collector_number, lang);
			} catch {
				return token; // fallback to English print
			}
		})
	);
}

function defaultFetchLocalized(set: string, num: string, lang: string): Promise<ScryfallCard> {
	return getCardBySetNumberAndLang(set, num, lang);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/test/localizeTokens.test.ts`
Expected: PASS — `localizeTokens: all assertions passed`.

- [ ] **Step 5: Lint + commit**

```bash
npm run check
git add src/lib/scryfall/localizeTokens.ts scripts/test/localizeTokens.test.ts
git commit -m "feat(scryfall): localize resolved tokens to source card language

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Localize tokens in `useCardTokens` (CardModal + TokensTab)

**Files:**

- Modify: `src/lib/card/hooks/useCardTokens.ts`

**Interfaces:**

- Consumes: `collectDeckTokensWithSourceLang` (Task 1), `localizeTokens` (Task 4), existing `collectDeckTokenIds`, `resolveCardsByScryfallIds`.
- Produces: same hook return shape `{ tokens, loading, hasTokens }`; `tokens` now localized to the producing card's language.

- [ ] **Step 1: Wire localization into the resolve effect**

In `src/lib/card/hooks/useCardTokens.ts`:

Add imports:

```ts
import { collectDeckTokensWithSourceLang } from '@/lib/deck/utils/collectDeckTokens';
import { localizeTokens } from '@/lib/scryfall/localizeTokens';
```

Compute the lang map alongside `tokenIds` (after the existing `tokenIds` useMemo):

```ts
const langByTokenId = useMemo(
	() => (card ? collectDeckTokensWithSourceLang([card]) : new Map<string, string>()),
	[card]
);
```

Replace the `.then((resolvedMap) => { ... })` body (the part that builds `tokens`) so it localizes before setting state:

```ts
resolveCardsByScryfallIds(tokenIds)
	.then(async (resolvedMap) => {
		if (cancelled) return;
		const enTokens = tokenIds
			.map((id) => resolvedMap.get(id))
			.filter((c): c is ScryfallCard => Boolean(c));
		const localized = await localizeTokens(enTokens, langByTokenId);
		if (cancelled) return;
		setResolved({ key: tokenKey, tokens: localized });
	})
	.catch(() => {
		if (!cancelled) setResolved({ key: tokenKey, tokens: [] });
	});
```

Add `langByTokenId` to the effect dependency array (alongside `tokenIds, tokenKey`).

- [ ] **Step 2: Type/lint check**

Run: `npm run check`
Expected: PASS (no TS/ESLint errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/card/hooks/useCardTokens.ts
git commit -m "feat(tokens): localize tokens in useCardTokens (CardModal, TokensTab)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Localize tokens in `useDeckTokens` (add-to-deck flow)

**Files:**

- Modify: `src/app/decks/[id]/useDeckTokens.ts`

**Interfaces:**

- Consumes: `collectDeckTokensWithSourceLang` (Task 1), `localizeTokens` (Task 4), existing `collectDeckTokenIds`, `resolveCardsByScryfallIds`.
- Produces: same `{ addTokens, isAdding }`; tokens added to the deck are localized to their producing card's language.

- [ ] **Step 1: Wire localization into `addTokens`**

In `src/app/decks/[id]/useDeckTokens.ts`:

Add imports:

```ts
import { collectDeckTokensWithSourceLang } from '@/lib/deck/utils/collectDeckTokens';
import { localizeTokens } from '@/lib/scryfall/localizeTokens';
```

Inside `addTokens`, after `const tokenIds = collectDeckTokenIds(sourceCards);` add:

```ts
const langByTokenId = collectDeckTokensWithSourceLang(sourceCards);
```

After `const resolvedMap = await resolveCardsByScryfallIds(tokenIds);` and the cancel check, localize the resolved values before the dedupe loop. Replace the `for (const card of resolvedMap.values())` source with a localized array:

```ts
const localizedTokens = await localizeTokens([...resolvedMap.values()], langByTokenId);
if (cancelledRef.current) return;

const seen = new Set(existingKeys);
const survivors = [];
for (const card of localizedTokens) {
	const key = card.oracle_id ?? card.id;
	if (seen.has(key)) continue;
	seen.add(key);
	survivors.push(card);
}
```

(`sourceCards` are `ResolvedDeckCard` which extend `ScryfallCard` and carry `lang`; `collectDeckTokensWithSourceLang` accepts them.)

- [ ] **Step 2: Type/lint check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "src/app/decks/[id]/useDeckTokens.ts"
git commit -m "feat(tokens): localize tokens added via useDeckTokens

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Full local verification + manual prod check

**Files:** none (verification only).

- [ ] **Step 1: Run all token test scripts**

```bash
npx tsx scripts/test/collectDeckTokens.test.ts
npx tsx scripts/test/hydrateAllParts.test.ts
npx tsx scripts/test/resolveHydration.test.ts
npx tsx scripts/test/localizeTokens.test.ts
```

Expected: each prints `... all assertions passed`.

- [ ] **Step 2: Full project check**

Run: `npm run check`
Expected: PASS (TypeScript + ESLint + Prettier clean).

- [ ] **Step 3: Manual integration check (local dev)**

Start the app, open a deck containing a non-English (e.g. FR) card that produces tokens/emblems (Lolth, Spider Queen). Verify:

- The emblem AND the Spider token are detected (appear in the tokens section).
- Token names render localized (FR) when an FR print exists; English otherwise.

- [ ] **Step 4: Deploy + prod verification**

After merge/deploy, reopen the Lolth FR deck in production. Confirm the emblem + Spider token appear, localized. This is the original bug's acceptance criterion.

---

## Self-Review

**Spec coverage:**

- Root cause (localized cards lack `all_parts`) → Tasks 2+3 graft it. ✓
- Objective 1 (detection works any language) → Tasks 1–3. ✓
- Objective 2 (tokens localized to producing card's language, EN fallback) → Tasks 1, 4, 5, 6. ✓
- Unit A central, unconditional hydration → Task 3 (in `resolveCardsByScryfallIds`). ✓
- Unit B token localization → Task 4, wired in Tasks 5–6. ✓
- `collectDeckTokens` source-lang link → Task 1. ✓
- Error handling (retry via fetcher, silent degrade, 404 fallback, no oracle_id skip) → Tasks 2 (silent/skip), 4 (404 fallback). ✓
- Test strategy (one-off tsx scripts, fail-first) → every task. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `collectDeckTokensWithSourceLang` returns `Map<string,string>` (token id → lang code) — consumed identically in Tasks 4/5/6. `hydrateAllParts`/`hydrateResolvedMap`/`localizeTokens` signatures match across consuming tasks. `fetchByOracleIds`, `fetchLocalized`, `writeCache` dep names consistent. ✓

**Note for implementer:** `cardProducesToken` (used in `DeckDetailOwnerView.tsx`) is unchanged — it matches by token _name_, which is language-stable enough for its purpose (it operates on already-hydrated cards). No task touches it.
