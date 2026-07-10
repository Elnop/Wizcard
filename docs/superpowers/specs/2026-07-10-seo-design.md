# SEO / Indexation — Design (wizcard.xyz)

**Date** : 2026-07-10
**Contexte** : Wizcard est en production sur wizcard.xyz mais **non référencé**
sur les moteurs de recherche. Troisième des quatre chantiers (sécurité ✅ →
légal ✅ → **SEO/indexation** → optimisation). Objectif : rendre le site
indexable et crawlable.

## Objectif

Faire indexer le contenu public de Wizcard par les moteurs : fondations SEO
(robots, sitemap, metadata globale) + rendre crawlables les pages dynamiques
publiques aujourd'hui invisibles aux crawlers.

## Audit de l'existant

| Élément                                          | État                                                                                                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `robots.ts` / `sitemap.ts` / `manifest.ts`       | ❌ Aucun                                                                                                                                                           |
| `metadataBase` / OpenGraph / Twitter / canonical | ❌ Aucun (root = title/description/keywords)                                                                                                                       |
| `keywords` dans root metadata                    | ⚠️ Présent mais ignoré par Google depuis 2009 → à retirer                                                                                                          |
| Pages avec metadata                              | ✅ `card/[id]`, `sets` + `sets/[code]`, 3 pages légales                                                                                                            |
| Pages sans metadata                              | ❌ 13 pages dont `decks/[id]`, `users/[userId]` (+ sous-pages), landing, search                                                                                    |
| **Crawlabilité pages dynamiques**                | 🔴 `decks/[id]` et le shell `users/[userId]` (page + layout) sont `'use client'` → le crawler reçoit une coquille vide. **Cause principale de la non-indexation.** |
| Icônes                                           | ⚠️ Seulement `favicon.ico` (pas de PNG 192/512 ni image OG) → assets à fournir OU génération dynamique                                                             |
| Colonnes sitemap                                 | ✅ `decks.id/updated_at`, `profiles.nickname/updated_at` existent                                                                                                  |

## Décisions actées

- **Périmètre** : complet (fondations + crawlabilité des pages dynamiques).
- **Indexation** : public indexé (landing, `/search`, `/card`, `/sets`,
  `/decks/[id]`, `/users`, légal) ; privé exclu (`/collection`, `/wishlist`,
  `/profile`, `/auth/*`).
- **`/search` INDEXÉE** (décision utilisateur) — capte le trafic « recherche de
  cartes ».
- **URL de base** : `https://wizcard.xyz` (en dur, sans www).
- **Manifest PWA** : inclus.
- **Icônes** : **générées via Next** (`src/app/icon.tsx` + `apple-icon.tsx`,
  `ImageResponse`) — zéro fichier image à fournir. Le manifest les référence.
- **Langue SEO** : **anglais** (cohérent avec `card/[id]`/`sets`). Une
  implémentation **i18n est prévue** → garder les titres/descriptions SEO
  **minimaux et simples** (pas d'effort rédactionnel, ils seront repris par
  l'i18n). YAGNI sur la copie.
- **Images OG dynamiques** : générées via Next `ImageResponse`
  (`opengraph-image.tsx`) pour deck et profil — zéro asset à fournir.
- **Renommage** `page.tsx → *Client.tsx` pour les pages client passant en
  server shell : validé.
- **Sous-pages profil** (`/users/[userId]/collection|wishlist|decks`) : hors
  sitemap (dupliquent le profil principal), mais restent indexables.
- **Cartes `/card/[id]`** : hors sitemap (catalogue Scryfall entier, des dizaines
  de milliers) ; restent crawlables via liens internes.

---

## Section 1 — Fondations globales

### `src/app/robots.ts`

Retourne un `MetadataRoute.Robots` :

- `allow: '/'` global,
- `disallow: ['/collection', '/wishlist', '/profile', '/auth/']`,
- `sitemap: 'https://wizcard.xyz/sitemap.xml'`,
- `host: 'https://wizcard.xyz'`.

### `src/app/sitemap.ts`

`MetadataRoute.Sitemap` dynamique (server, via `@/lib/supabase/server`
`createClient`) :

- **Statique** : `/`, `/search`, `/sets`, `/mentions-legales`,
  `/confidentialite`, `/cgu` (avec `changeFrequency`/`priority` raisonnables).
- **Dynamique DB** :
  - `from('decks').select('id, updated_at')` → `/decks/<id>`, `lastModified =
updated_at`.
  - `from('profiles').select('nickname, updated_at')` → `/users/<nickname>`,
    `lastModified = updated_at` (exclure les profils au nickname nul).
- En cas d'erreur DB : retourner au moins les URLs statiques (ne pas casser le
  sitemap).

### `src/app/manifest.ts`

`MetadataRoute.Manifest` de base : `name: 'Wizcard'`, `short_name: 'Wizcard'`,
`description`, `start_url: '/'`, `display: 'standalone'`, `background_color` /
`theme_color` (aligner sur `--primary` #c9a84c / fond sombre), `icons`.
**Icônes générées** : `src/app/icon.tsx` et `src/app/apple-icon.tsx`
(`ImageResponse`) rendent une icône à la volée depuis un glyphe/texte de marque
(ex. « W » sur fond sombre/or) — aucun fichier PNG à fournir. Next les expose et
le manifest peut les référencer via leurs routes générées.

### Root `layout.tsx` — enrichir `metadata`

- `metadataBase: new URL('https://wizcard.xyz')` (rend OG/canonical absolus).
- `title: { default: 'Wizcard — Recherche de cartes Magic: The Gathering',
template: '%s | Wizcard' }` (les pages enfant fournissent `%s`).
- `description` soignée (marque + valeur).
- `openGraph` par défaut (`type: website`, `siteName: 'Wizcard'`, `url`, `locale`,
  image OG par défaut) + `twitter` (`card: 'summary_large_image'`).
- **Retirer `keywords`.**
- `alternates: { canonical: '/' }` au niveau racine (les pages dynamiques
  poseront leur propre canonical).

---

## Section 2 — Crawlabilité des pages dynamiques (cœur)

Pattern : **server component fin au-dessus du client existant** (modèle déjà en
place dans `card/[id]/page.tsx`).

### `decks/[id]`

- Renommer l'actuel `src/app/decks/[id]/page.tsx` (client) en
  `src/app/decks/[id]/DeckDetailClient.tsx` (garder `'use client'` et toute la
  logique auth/ownership/édition **inchangée**).
- Nouveau `src/app/decks/[id]/page.tsx` = **server component** :
  - `generateMetadata({ params })` : `await params`, `fetchDeckMetaById(id)`
    (déjà server-safe). Si `null` → `{ title: 'Deck introuvable' }` (pas de
    `notFound()` dans generateMetadata ; le client gère l'affichage). Sinon
    `title: '<nom>'`, `description` (format + description deck, tronquée),
    `openGraph` (title/description + image OG dynamique), `alternates.canonical:
'/decks/<id>'`.
  - Rendu : un `<h1>` serveur avec le nom du deck (contenu crawlable avant
    hydratation) + `<DeckDetailClient />`.
- `src/app/decks/[id]/opengraph-image.tsx` : `ImageResponse` (1200×630) affichant
  le nom du deck + branding, fetch via `fetchDeckMetaById`.

### `users/[userId]`

Complication : le **layout** `users/[userId]/layout.tsx` est `'use client'` et
résout le nickname. On ne touche pas au layout (il gère l'UI/tabs) ; on ajoute la
couche serveur au niveau **page**.

- Créer `src/lib/profile/db/profile.server.ts` :
  `fetchProfileByNickname(nickname)` → `createClient()` (server) +
  `from('profiles').select('id, nickname, description, avatar_url,
updated_at').eq('nickname', nickname).maybeSingle()`. Retourne
  `Profile | null`.
- Renommer l'actuel `src/app/users/[userId]/page.tsx` (client) en
  `UserOverviewClient.tsx` (`'use client'`, logique inchangée).
- Nouveau `src/app/users/[userId]/page.tsx` = **server component** :
  - `generateMetadata({ params })` : `fetchProfileByNickname(nickname)` →
    `title: '<nickname>'`, `description` (description profil ou fallback),
    `openGraph` (+ image OG dynamique), `alternates.canonical:
'/users/<nickname>'`. Profil introuvable → `{ title: 'Profil introuvable' }`.
  - Rendu : `<h1>` serveur (nickname) + `<UserOverviewClient />`.
- `src/app/users/[userId]/opengraph-image.tsx` : `ImageResponse` (1200×630)
  nickname + branding.

**Note SSR** : les composants clients (`DeckDetailClient`, `UserOverviewClient`)
restent rendus côté client comme avant ; le gain SEO vient du `generateMetadata`
serveur + du `<h1>`/texte serveur. On ne réécrit PAS la logique interactive en
serveur (hors périmètre, YAGNI).

---

## Section 3 — Metadata des pages restantes + noindex privé

Statut client/serveur constaté (détermine où poser la metadata) :
`(landing)` = server, `profile` = server (redirect), `auth/login` = server,
`auth/error` = server → metadata **dans la page**. `search`, `collection`,
`wishlist` = `'use client'` → metadata via **layout de segment serveur**.
Layouts de segment déjà présents : `collection/layout.tsx`, `wishlist/layout.tsx`,
`auth/layout.tsx`. Absent (à créer) : `search/layout.tsx`.

### Metadata statique (pages publiques sans données dynamiques)

- `src/app/(landing)/page.tsx` (server) : `export const metadata` —
  titre/description d'accueil soignés + `openGraph`. Page la plus importante pour
  le référencement de marque.
- `src/app/search/layout.tsx` (**à créer**, server) : `export const metadata`
  avec un titre simple en anglais (ex. `'Card Search'` → rendu `Card Search |
Wizcard` via le template) + description courte + `robots: { index: true }`. Le
  `search/page.tsx` client reste inchangé comme `children`.

### `noindex` sur les pages privées (défense en profondeur, en plus de robots)

`robots: { index: false, follow: false }` sur : `collection`, `wishlist`,
`profile`, `auth/*`.

- `collection/layout.tsx` + `wishlist/layout.tsx` + `auth/layout.tsx` existent
  déjà (server) → y ajouter `export const metadata = { robots: { index: false,
follow: false } }`.
- `profile/page.tsx` est un server component (redirect) → `robots: noindex`
  directement dans la page (ou son propre layout si plus simple).

---

## Contraintes

- **Pas de nouvelle dépendance npm** (`ImageResponse` vient de `next/og`, inclus).
- Suivre le pattern `card/[id]` pour les server components + `generateMetadata`.
- URLs absolues via `metadataBase` (ne pas hardcoder l'origine dans chaque page).
- Ne PAS réécrire la logique interactive client en serveur — server shell fin
  uniquement.
- **Anglais** pour tous les titres/descriptions (cohérent avec l'existant). i18n
  à venir → copie SEO minimale, pas d'effort rédactionnel.
- Pas de framework de test — vérif via `npm run check` + runtime (curl du HTML
  rendu montrant les balises `<title>`/`<meta>`/`<h1>` côté serveur ; `/robots.txt`
  et `/sitemap.xml` accessibles).

## Dépendances / assets (hors code)

- **Icônes PNG 192×192 + 512×512** pour le manifest (sinon fallback favicon +
  TODO). Image OG par défaut 1200×630 optionnelle (les OG dynamiques couvrent
  deck/profil ; une image OG statique pour la landing serait un plus).
- Post-déploiement (ops) : soumettre le sitemap à **Google Search Console** +
  **Bing Webmaster Tools** (hors code, mais c'est ce qui déclenche réellement
  l'indexation).

## Vérification

- `npm run check`.
- `curl https://.../robots.txt` → règles correctes + lien sitemap.
- `curl https://.../sitemap.xml` → URLs statiques + decks + profils.
- `curl https://.../decks/<id>` → `<title>` = nom du deck, `<h1>` présent dans le
  HTML **serveur** (pas seulement après hydratation).
- `curl https://.../users/<nickname>` → idem avec le nickname.
- Pages privées → `<meta name="robots" content="noindex">` présent.
- OG : vérifier `<meta property="og:*">` absolus (via metadataBase).

## Découpage / ordre

1. Fondations (robots, sitemap, manifest, root metadata) — indépendant, rapide.
2. Crawlabilité `decks/[id]` (rename client + server page + generateMetadata + OG).
3. Crawlabilité `users/[userId]` (fetchProfileByNickname + rename + server page + OG).
4. Metadata statique landing/search + noindex privé.
