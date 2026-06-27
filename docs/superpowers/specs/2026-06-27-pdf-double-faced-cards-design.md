# PDF — faces recto-verso des cartes double-face côte à côte

**Date :** 2026-06-27
**Statut :** approuvé (design)

## Problème

L'export PDF (decks et wishlist) ne rend qu'**une seule** image par carte. Pour
les cartes recto-verso — `transform`, `modal_dfc`, `double_faced_token`,
`reversible_card` — seule la face avant (recto) apparaît : la face arrière (verso)
est perdue.

La cause : `getScryfallCardImageUriBySize` (`src/lib/scryfall/utils/scryfall-query.ts:102`)
retourne `card.image_uris?.[size] ?? card.card_faces?.[0]?.image_uris?.[size]` —
toujours la première face. Le résolveur d'export `resolveLocalizedImageUri`
(`src/lib/scryfall/utils/resolveLocalizedImageUri.ts`) hérite de cette limite et
ne renvoie qu'une URL par carte.

## Objectif

Quand une carte possède **deux faces ayant chacune leur propre `image_uris`**,
le PDF doit contenir les **deux** images, dans **deux slots consécutifs** de la
grille existante (recto puis verso). Les autres cartes restent à une seule image.

La détection se fait sur la **présence de deux images de face**, pas sur le nom
du `layout`. Cela couvre exactement l'ensemble des cartes pour lesquelles une
image unique était insuffisante (et exclut naturellement `split`, `flip`,
`adventure`, qui partagent l'`image_uris` racine sans image par face).

## Approche

Dédoublement à la **résolution d'images**, pas dans le générateur PDF. Chaque
carte produit 1 ou 2 URLs. La liste est aplatie en `string[]` avant d'être passée
à `generateCardsPdf`, qui reste **inchangé**.

### Flux de données

```
Card[]
  → resolveLocalizedImageUris(card)   // Promise<string[]> : 1 ou 2 URLs
  → Promise.all(...)                  // string[][]
  → .flat()                           // string[]
  → .filter(Boolean)                  // string[]
  → generateCardsPdf(urls, settings)  // inchangé
```

## Modifications

### 1. `src/lib/scryfall/utils/scryfall-query.ts`

Ajouter un helper `getScryfallCardFaceImageUris` :

- Signature : `(card, size = 'normal'): string[]`.
- Si `card.card_faces` a **au moins deux entrées** dont les **deux premières**
  portent `image_uris?.[size]`, retourner `[recto, verso]`.
- Sinon, retourner `[getScryfallCardImageUriBySize(card, size)]` (1 URL, ou `['']`).

`getScryfallCardImageUriBySize` **reste inchangé** : ses autres appelants
continuent d'obtenir la première face.

### 2. `src/lib/scryfall/utils/resolveLocalizedImageUri.ts`

Ajouter `resolveLocalizedImageUris` (pluriel) : `Promise<string[]>`.

- Résout la carte localisée via `fetchLocalizedImage` (logique throttle/cache/404
  **inchangée**, réutilisée telle quelle).
- Construit les URLs de faces avec `getScryfallCardFaceImageUris` :
  - source des images : la carte localisée si présente, sinon la carte d'origine
    (même règle de fallback EN qu'aujourd'hui, appliquée par face) ;
  - fallback par URL : si une face localisée n'a pas d'image, retomber sur l'URL
    correspondante de la carte d'origine.
- Retourne le tableau (1 ou 2 URLs).

`resolveLocalizedImageUri` (singulier) **reste exporté**, réimplémenté comme
`(await resolveLocalizedImageUris(card, size))[0] ?? ''`, pour ne casser aucun
appelant existant.

### 3. Appelants

`src/app/decks/[id]/DeckDetailOwnerView.tsx` (~ligne 765) et
`src/app/wishlist/page.tsx` (~ligne 214) :

```ts
const resolved = await Promise.all(cards.map((c) => resolveLocalizedImageUris(c, 'normal')));
const imageUrls = resolved.flat().filter((url): url is string => !!url);
await generateCardsPdf(imageUrls, settings, filename);
```

## Tests

Unitaires :

- `getScryfallCardFaceImageUris`
  - carte simple (`image_uris` racine) → `['…normal']` (1 URL)
  - carte transform (2 `card_faces` avec images) → `[recto, verso]` (2 URLs)
  - carte sans image de face (`split`/`adventure`, pas de `image_uris` par face)
    → 1 URL (fallback racine)
- `resolveLocalizedImageUris`
  - carte non localisée → 1 URL (image racine EN)
  - carte transform localisée → 2 URLs localisées
  - face localisée sans image → fallback sur l'URL d'origine pour cette face

## Hors périmètre

- `generateCardsPdf` (grille, marges, traits de coupe) : inchangé.
- Layouts mono-image (`split`, `flip`, `adventure`) : restent à 1 image.
- Option « paire forcée côte à côte sans saut de ligne » et « versos page
  séparée » : non retenues (choix « deux slots consécutifs »).
