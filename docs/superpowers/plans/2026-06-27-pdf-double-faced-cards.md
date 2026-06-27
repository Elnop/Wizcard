# PDF Double-Faced Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render both faces (front and back) of double-faced cards as two consecutive slots in the PDF export, instead of only the front face.

**Architecture:** Doubling happens at image resolution, not in the PDF generator. A new helper returns 1 or 2 face URLs per card based on the _presence of two per-face images_; a new plural resolver wraps it with the existing localization/fallback logic; the two PDF callers flatten the resulting `string[][]` before passing it to the unchanged `generateCardsPdf`.

**Tech Stack:** TypeScript, Next.js, jsPDF. No test framework exists in this repo — logic is verified with a temporary `tsx` script (run, observe output, delete) plus the `npm run check` gate (tsc + eslint + prettier).

## Global Constraints

- `generateCardsPdf` (`src/lib/pdf/generateCardsPdf.ts`) MUST remain unchanged — it keeps consuming a flat `string[]`.
- `getScryfallCardImageUriBySize` (`src/lib/scryfall/utils/scryfall-query.ts`) MUST remain unchanged — other callers depend on it returning the first face.
- `resolveLocalizedImageUri` (singular) MUST stay exported with the same signature `(card, size?) => Promise<string>` so existing callers don't break.
- Double-face detection is by _presence of two per-face `image_uris`_, NOT by `layout` name. Cards with only a root `image_uris` (e.g. `split`, `flip`, `adventure`) stay at 1 image.
- Verification command for the whole repo: `npm run check`.

---

### Task 1: `getScryfallCardFaceImageUris` helper

**Files:**

- Modify: `src/lib/scryfall/utils/scryfall-query.ts` (append after `getScryfallCardImageUriBySize`, ends line 110)
- Verify (temporary): `scripts/verify-face-uris.ts` (created then deleted)

**Interfaces:**

- Consumes: existing `getScryfallCardImageUriBySize(card, size)` in the same file.
- Produces: `getScryfallCardFaceImageUris(card: { image_uris?: { normal?: string; small?: string; large?: string }; card_faces?: Array<{ image_uris?: { normal?: string; small?: string; large?: string } }> }, size?: 'small' | 'normal' | 'large'): string[]` — returns `[front, back]` when the first two faces both have an image for `size`, otherwise `[getScryfallCardImageUriBySize(card, size)]`.

- [ ] **Step 1: Implement the helper**

In `src/lib/scryfall/utils/scryfall-query.ts`, append after the closing brace of `getScryfallCardImageUriBySize` (line 110):

```ts
/**
 * Returns the image URI(s) for a card's faces at the given size.
 *
 * Double-faced cards (transform, modal_dfc, double_faced_token, reversible)
 * carry a distinct `image_uris` on each entry of `card_faces`. When the first
 * two faces both have an image for `size`, this returns `[front, back]` so the
 * PDF export can render both. Single-image cards — including split/flip/
 * adventure, which share the root `image_uris` and have no per-face image —
 * return a single-element array (the same value as getScryfallCardImageUriBySize).
 */
export function getScryfallCardFaceImageUris(
	card: {
		image_uris?: { normal?: string; small?: string; large?: string };
		card_faces?: Array<{ image_uris?: { normal?: string; small?: string; large?: string } }>;
	},
	size: 'small' | 'normal' | 'large' = 'normal'
): string[] {
	const faces = card.card_faces;
	const front = faces?.[0]?.image_uris?.[size];
	const back = faces?.[1]?.image_uris?.[size];
	if (front && back) return [front, back];
	return [getScryfallCardImageUriBySize(card, size)];
}
```

- [ ] **Step 2: Write the temporary verification script**

Create `scripts/verify-face-uris.ts`:

```ts
import { getScryfallCardFaceImageUris } from '../src/lib/scryfall/utils/scryfall-query';

const simple = { image_uris: { normal: 'root.jpg' } };
const transform = {
	card_faces: [{ image_uris: { normal: 'front.jpg' } }, { image_uris: { normal: 'back.jpg' } }],
};
const splitLike = {
	image_uris: { normal: 'root.jpg' },
	card_faces: [{ name: 'a' } as never, { name: 'b' } as never],
};

console.log('simple   ', JSON.stringify(getScryfallCardFaceImageUris(simple)));
console.log('transform', JSON.stringify(getScryfallCardFaceImageUris(transform)));
console.log('splitLike', JSON.stringify(getScryfallCardFaceImageUris(splitLike)));
```

- [ ] **Step 3: Run it and verify output**

Run: `npx tsx scripts/verify-face-uris.ts`

Expected output exactly:

```
simple    ["root.jpg"]
transform ["front.jpg","back.jpg"]
splitLike ["root.jpg"]
```

- [ ] **Step 4: Delete the temporary script**

Run: `rm scripts/verify-face-uris.ts`

- [ ] **Step 5: Run the check gate**

Run: `npm run check`
Expected: PASS (no tsc/eslint/prettier errors).

- [ ] **Step 6: Commit**

```bash
git add src/lib/scryfall/utils/scryfall-query.ts
git commit -m "feat(scryfall): add getScryfallCardFaceImageUris for double-faced cards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `resolveLocalizedImageUris` plural resolver

**Files:**

- Modify: `src/lib/scryfall/utils/resolveLocalizedImageUri.ts` (whole file)
- Verify (temporary): `scripts/verify-resolve-uris.ts` (created then deleted)

**Interfaces:**

- Consumes: `getScryfallCardFaceImageUris` (Task 1); existing `fetchLocalizedImage(card)`; existing `LocalizedImageCard` type.
- Produces:
  - `resolveLocalizedImageUris(card: ImageCard, size?: 'small' | 'normal' | 'large'): Promise<string[]>` — 1 or 2 URLs, localized where available, falling back per-URL to the source card.
  - `resolveLocalizedImageUri(card: ImageCard, size?): Promise<string>` — unchanged signature, now `(await resolveLocalizedImageUris(card, size))[0] ?? ''`.

- [ ] **Step 1: Rewrite the resolver file**

Replace the entire contents of `src/lib/scryfall/utils/resolveLocalizedImageUri.ts` with:

```ts
import { fetchLocalizedImage } from '@/lib/scryfall/hooks/useLocalizedImage';
import { getScryfallCardFaceImageUris } from '@/lib/scryfall/utils/scryfall-query';
import type { LocalizedImageCard } from '@/lib/scryfall/hooks/useLocalizedImage';

type ImageCard = LocalizedImageCard & {
	image_uris?: { small?: string; normal?: string; large?: string };
	card_faces?: Array<{ image_uris?: { small?: string; normal?: string; large?: string } }>;
};

/**
 * Non-hook equivalent of useCardImageUri, returning every face image the card
 * should contribute to the PDF: a single URL for normal cards, or two URLs
 * ([front, back]) for double-faced cards (transform, modal_dfc, double-faced
 * tokens, reversible). Each URL is localized to the card's language when a
 * localized print is available, falling back per-URL to the card's default
 * (English) image.
 *
 * Delegates the cache/fetch/404 logic to fetchLocalizedImage, which goes
 * through the shared Scryfall throttle — so PDF export never duplicates that
 * logic nor bypasses rate limiting.
 */
export async function resolveLocalizedImageUris(
	card: ImageCard,
	size: 'small' | 'normal' | 'large' = 'normal'
): Promise<string[]> {
	const fallback = getScryfallCardFaceImageUris(card, size);
	const localized = await fetchLocalizedImage(card);
	if (!localized) return fallback;
	const localizedUris = getScryfallCardFaceImageUris(localized, size);
	// Align with the fallback: keep the same number of faces as the source card,
	// substituting the localized URL per face when present.
	return fallback.map((fallbackUri, i) => localizedUris[i] || fallbackUri);
}

/**
 * Single-URL resolver kept for callers that only need the front face.
 * Returns the first face URL from resolveLocalizedImageUris.
 */
export async function resolveLocalizedImageUri(
	card: ImageCard,
	size: 'small' | 'normal' | 'large' = 'normal'
): Promise<string> {
	return (await resolveLocalizedImageUris(card, size))[0] ?? '';
}
```

- [ ] **Step 2: Write the temporary verification script**

Create `scripts/verify-resolve-uris.ts` (exercises the no-localization path, which returns synchronously after `fetchLocalizedImage` resolves to `null` for English/locale-less cards):

```ts
import {
	resolveLocalizedImageUri,
	resolveLocalizedImageUris,
} from '../src/lib/scryfall/utils/resolveLocalizedImageUri';

async function main() {
	// No language → fetchLocalizedImage returns null → uses fallback (source card).
	const simple = { image_uris: { normal: 'root.jpg' } };
	const transform = {
		card_faces: [{ image_uris: { normal: 'front.jpg' } }, { image_uris: { normal: 'back.jpg' } }],
	};

	console.log('plural simple   ', JSON.stringify(await resolveLocalizedImageUris(simple)));
	console.log('plural transform', JSON.stringify(await resolveLocalizedImageUris(transform)));
	console.log('singular simple ', JSON.stringify(await resolveLocalizedImageUri(simple)));
}

void main();
```

- [ ] **Step 3: Run it and verify output**

Run: `npx tsx scripts/verify-resolve-uris.ts`

Expected output exactly:

```
plural simple    ["root.jpg"]
plural transform ["front.jpg","back.jpg"]
singular simple  "root.jpg"
```

- [ ] **Step 4: Delete the temporary script**

Run: `rm scripts/verify-resolve-uris.ts`

- [ ] **Step 5: Run the check gate**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/scryfall/utils/resolveLocalizedImageUri.ts
git commit -m "feat(scryfall): resolveLocalizedImageUris returns both faces of DFCs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Wire both PDF callers to flatten faces

**Files:**

- Modify: `src/app/decks/[id]/DeckDetailOwnerView.tsx` (~lines 49, 765-769)
- Modify: `src/app/wishlist/page.tsx` (~lines 17, 213-216)

**Interfaces:**

- Consumes: `resolveLocalizedImageUris` (Task 2); existing `generateCardsPdf(imageUrls, settings, filename)`.
- Produces: PDFs containing both faces of double-faced cards.

- [ ] **Step 1: Update the deck import**

In `src/app/decks/[id]/DeckDetailOwnerView.tsx` line 49, change:

```ts
import { resolveLocalizedImageUri } from '@/lib/scryfall/utils/resolveLocalizedImageUri';
```

to:

```ts
import { resolveLocalizedImageUris } from '@/lib/scryfall/utils/resolveLocalizedImageUri';
```

(If the existing import line differs, only swap the named import `resolveLocalizedImageUri` → `resolveLocalizedImageUris`.)

- [ ] **Step 2: Update the deck resolve block**

In `src/app/decks/[id]/DeckDetailOwnerView.tsx`, replace lines 765-768:

```ts
const resolved = await Promise.all(
	pdfFilteredCards.map((c) => resolveLocalizedImageUri(c, 'normal'))
);
const imageUrls = resolved.filter((url): url is string => !!url);
```

with:

```ts
const resolved = await Promise.all(
	pdfFilteredCards.map((c) => resolveLocalizedImageUris(c, 'normal'))
);
const imageUrls = resolved.flat().filter((url): url is string => !!url);
```

- [ ] **Step 3: Update the wishlist import**

In `src/app/wishlist/page.tsx` line 17, change the named import `resolveLocalizedImageUri` → `resolveLocalizedImageUris`. First confirm the exact current import line:

Run: `grep -n "resolveLocalizedImageUri" src/app/wishlist/page.tsx`

Then swap the named import to the plural form, and the call site (see next step).

- [ ] **Step 4: Update the wishlist resolve block**

In `src/app/wishlist/page.tsx`, replace lines 213-215:

```ts
const resolved = await Promise.all(cards.map((c) => resolveLocalizedImageUri(c, 'normal')));
const imageUrls = resolved.filter((url): url is string => !!url);
```

with:

```ts
const resolved = await Promise.all(cards.map((c) => resolveLocalizedImageUris(c, 'normal')));
const imageUrls = resolved.flat().filter((url): url is string => !!url);
```

(Match the variable that holds the cards to map over — confirm with the grep from Step 3 if the local name differs from `cards`.)

- [ ] **Step 5: Run the check gate**

Run: `npm run check`
Expected: PASS. In particular, no "resolveLocalizedImageUri is not exported" or unused-import errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/decks/[id]/DeckDetailOwnerView.tsx" src/app/wishlist/page.tsx
git commit -m "feat(pdf): export both faces of double-faced cards in deck & wishlist PDFs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**

- Helper `getScryfallCardFaceImageUris` (spec §Modifications 1) → Task 1. ✓
- `resolveLocalizedImageUris` + singular kept (spec §Modifications 2) → Task 2. ✓
- Both callers flatten (spec §Modifications 3) → Task 3. ✓
- `generateCardsPdf`/`getScryfallCardImageUriBySize` unchanged (spec §Hors périmètre, Global Constraints) → no task touches them. ✓
- Detection by presence of two per-face images, not layout (spec §Objectif) → Task 1 logic `if (front && back)`. ✓
- Tests: spec asked for unit tests; repo has no test runner. Substituted temporary `tsx` verification scripts covering the same cases (simple/transform/split-like; localized fallback exercised via no-language path) + `npm run check`. Documented in Tech Stack. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have exact expected output. ✓

**Type consistency:** `getScryfallCardFaceImageUris` signature identical in Task 1 definition and Task 2 consumption; `resolveLocalizedImageUris` returns `Promise<string[]>` in Task 2 and is `.flat()`-ed in Task 3; `resolveLocalizedImageUri` singular signature unchanged. ✓
