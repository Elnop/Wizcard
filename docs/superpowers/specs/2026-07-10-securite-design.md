# Sécurité — Design (wizcard.xyz)

**Date** : 2026-07-10
**Contexte** : Le site est en production sur wizcard.xyz. Premier des quatre
chantiers « mise en production propre » (sécurité → SEO/indexation → légal →
optimisation). Ce spec ne couvre que la **sécurité**. Les autres chantiers
auront chacun leur spec.

## Objectif

Fermer les trous de sécurité réels du site en production, sans introduire de
mécanismes redondants avec les protections déjà fournies par Supabase.

## Audit de l'existant (ce qui protège déjà)

Vérifié dans le repo et l'env de prod (`.env.supabase.coolify`, gitignored,
jamais commité) :

| Protection              | État          | Détail                                                         |
| ----------------------- | ------------- | -------------------------------------------------------------- |
| RLS                     | ✅            | 16 tables, 104 policies                                        |
| Cap lignes PostgREST    | ✅            | `max_rows = 1000` (config.toml) — anti-exfiltration            |
| Rate limit auth         | ✅            | `[auth.rate_limit]` GoTrue natif (brute-force login/signup)    |
| Pool connexions         | ✅            | `max_client_conn = 100`, pool 20                               |
| Storage file size       | ✅            | `50MiB`                                                        |
| Auth anonyme            | ✅ désactivée | `ENABLE_ANONYMOUS_USERS=false` → `authenticated` = vrai compte |
| Email autoconfirm       | ✅ désactivé  | `ENABLE_EMAIL_AUTOCONFIRM=false`                               |
| `service_role` en front | ✅ absent     | jamais dans `src/` ni le bundle client                         |
| Secrets git             | ✅            | `.env*` gitignored, aucune fuite dans l'historique             |

**Décision** : un rate limit applicatif maison serait **redondant** avec l'auth
rate limit + `max_rows` + le pool + l'absence d'auth anonyme. Les APIs externes
(Scryfall/EDHREC/Moxfield) gèrent leur propre rate limit, déjà respecté par
`scryfall-throttle.ts` (550ms/110ms par tier, backoff 429). **Aucun rate limit
sortant ni entrant n'est ajouté.**

## Trous identifiés → lots

| #   | Lot                                                        | Criticité                  |
| --- | ---------------------------------------------------------- | -------------------------- |
| 1   | Fuite `purchase_price` (lecture publique brute de `cards`) | 🔴 Critique — fuite active |
| 2   | Audit RLS des policies restantes                           | 🔴                         |
| 3   | Headers de sécurité HTTP + CSP (Report-Only d'abord)       | 🟠                         |
| 4   | Durcissement route `scryfall/cards/collection`             | 🟠                         |

---

## Lot 1 — Fix fuite `purchase_price`

### Le défaut

Migration `20260616000000_public_read_sharing.sql` :

```sql
create policy "Public can view collection cards"
  on public.cards for select
  to anon, authenticated
  using (owner_id is not null);
```

Cette policy ouvre **toute la table `cards`** (colonne `purchase_price`
incluse) en lecture à anon + authenticated. La view `public_collection_cards`,
qui exclut délibérément `purchase_price` (« sensitive »), est ainsi
court-circuitée : n'importe qui peut lire directement `cards` et récupérer le
prix d'achat de tous les utilisateurs. RLS s'applique à la **ligne**, pas à la
**colonne**, donc une policy ne peut pas masquer une colonne.

`purchase_price` est une donnée financière personnelle → **doit rester privée
au propriétaire de la ligne**, invisible pour tout visiteur (anonyme OU
connecté regardant la collection d'autrui).

### Contrainte à préserver (cartes owned via deck)

La policy owner SELECT sur `cards` (bootstrap + `20260407000000_create_decks`)
est :

```sql
using (
  auth.uid() = owner_id
  or deck_id in (select id from public.decks where owner_id = auth.uid())
)
```

L'owner voit ses cartes par **deux chemins** : `owner_id = auth.uid()`
(collection) ET `deck_id` d'un de ses decks (typiquement `owner_id = null`).
**Cette policy ne doit PAS être modifiée** — sinon l'owner perd la vue de ses
cartes de deck.

### Pourquoi la view et non un column-GRANT

Un column-level `GRANT SELECT (cols)` s'attache à un **rôle** (`anon` /
`authenticated`), pas à une **ligne**. La règle « le prix est visible par le
owner de la ligne, pas par les autres » est une règle **par ligne** : un
utilisateur connecté est le rôle `authenticated` qu'il regarde sa collection ou
celle d'un autre. Un GRANT de colonne ne peut pas distinguer les deux → il
fuirait `purchase_price` vers tout compte connecté. **La view est le bon outil**
(elle n'était pas inutile — c'est la policy redondante qui la contournait).

### Solution (une migration)

Deux chemins de lecture distingués :

1. **Owner (`authenticated`) → `cards` directement**, RLS ligne
   (`owner_id = auth.uid() OR deck_id in (...)`), toutes colonnes y compris
   `purchase_price`. **Inchangé.**
2. **Visiteur (anon + authenticated regardant autrui) → view
   `public_collection_cards`**, qui n'expose pas `purchase_price`. C'est déjà le
   chemin utilisé par le front (`src/lib/supabase/queries/cards.ts`,
   `collection/db/collection.ts`).

Migration :

1. `DROP POLICY "Public can view collection cards" ON public.cards;`
   → ferme le SELECT public brut qui contournait la view.
2. **Conserver** `"Public can view deck cards"` (`using (deck_id is not null)`)
   — les cartes de deck restent publiquement lisibles (un deck partagé EST
   public).
3. **Conserver intacte** la policy owner (`auth.uid() = owner_id OR deck_id in
(...)`).
4. Défense en profondeur : `REVOKE SELECT ON public.cards FROM anon;` — un
   anonyme ne touche plus jamais la table brute, uniquement la view.
   (`authenticated` garde le GRANT complet — la RLS ligne le protège.)

### Impact front

**Aucun changement attendu.** Vérifié :

- Collections d'autrui lues via `public_collection_cards` (view). ✅
- Accès directs à `cards` = owner-scoped ou deck-scoped. ✅

À confirmer à l'implémentation : que le point 4 (`REVOKE anon`) ne casse aucune
lecture anonyme légitime des cartes de deck (celles-ci passent-elles par `cards`
ou par un autre objet en anonyme ?).

---

## Lot 2 — Audit RLS des policies restantes

**Méthode** (inspection, pas de code au départ) : passer en revue chaque table à
policy publique/anonyme et chercher le même motif que le Lot 1 — une colonne
sensible exposée par `using (true)` ou `to anon`.

Cibles :

- **`profiles`** — `"Public can view profiles"`. Vérifier qu'aucune colonne PII
  non-publique (email, données privées) n'est exposée. (L'email vit dans
  `auth.users`, pas `profiles` — à confirmer.)
- **`custom_cards`** — `public read custom_cards` + `service role write`.
  Vérifier qu'aucune donnée owner-privée ne fuit.
- **Buckets storage** — `avatars`, `custom-cards` : policies `public read`.
  Vérifier le périmètre (lecture publique OK, écriture restreinte ?).
- **`decks` / `deck_folders`** — `using (true)`. Confirmer que c'est bien voulu
  (partage public assumé) et qu'aucune colonne sensible n'y traîne.

**Livrable** : tableau `table → colonnes exposées → sensible ? → action`. Les
fixes éventuels sont regroupés dans la migration du Lot 1 ou une migration
frère datée.

---

## Lot 3 — Headers de sécurité HTTP

Dans `next.config.ts`, via `async headers()`, appliqués à toutes les routes.

**Headers sans risque de casse (livrés en mode bloquant direct) :**

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Frame-Options: DENY` (anti-clickjacking)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — désactive caméra/micro/géoloc (non utilisés)

**CSP — livrée en `Content-Security-Policy-Report-Only` d'abord.** Le navigateur
signale les violations sans rien bloquer. On navigue le site en prod, on observe
ce qui casserait, puis on bascule en mode bloquant.

Origines à autoriser (déduites de `next.config.ts` `remotePatterns` + endpoints) :

- Supabase (`SUPABASE_PUBLIC_URL` / `NEXT_PUBLIC_SUPABASE_URL`)
- `cards.scryfall.io`
- `drive.google.com`, `drive.usercontent.google.com`
- Google Fonts (Geist, Cinzel via `next/font`)
- `'self'`, inline styles Next (`'unsafe-inline'` sur `style-src` si nécessaire
  pour Next), à affiner via les rapports Report-Only.

**Terminal state du lot** : rapport Report-Only relu → CSP bloquante activée
dans un second temps (peut être un sous-lot séparé pour ne pas bloquer le reste).

---

## Lot 4 — Durcissement route `scryfall/cards/collection`

`src/app/api/scryfall/cards/collection/route.ts` est le **seul endpoint
non-authentifié de notre backend Node** acceptant un body arbitraire. Il
forwarde actuellement le body brut à Scryfall sans validation ni limite.

Durcissement :

- **Limite de taille du body** : rejeter (`413`) au-delà d'un seuil raisonnable
  (l'API Scryfall cape à 75 identifiers/requête).
- **Validation de forme** : attendre `{ identifiers: [...] }`, tableau, longueur
  ≤ 75, entrées de forme Scryfall valide. Rejeter (`400`) sinon, **avant tout
  fetch** sortant.
- Empêche l'usage de la route en relais/proxy anonyme.

**Important** : l'import passe par cette route en batchs de 75 (voir
`scryfall-resolver.ts`, `BATCH_SIZE = 75`). La validation `≤ 75` est alignée sur
ce comportement et sur l'API Scryfall — elle ne gêne pas l'import légitime.

---

## Hors périmètre (notés, autres chantiers)

- **`OPENAI_API_KEY`** présente dans l'env prod mais non utilisée par `src/` →
  clé morte, à retirer de l'env (surface inutile). Action ops, pas code.
- SEO / indexation / légal / optimisation → specs dédiés.

## Ordre d'exécution recommandé

1. Lot 1 (fuite active — priorité absolue)
2. Lot 2 (audit RLS — peut révéler d'autres fixes à grouper avec Lot 1)
3. Lot 4 (durcissement route — isolé, sans risque)
4. Lot 3 (headers non-CSP, puis CSP Report-Only, puis CSP bloquante)

## Vérification

Pas de framework de test (cf. `project_no_test_framework`). Validation via :

- `npm run check` (tsc + eslint + prettier)
- `npm run sb:reset` / `sb:migrate` local + Studio pour valider les migrations
- Test runtime : lecture collection anonyme (pas de `purchase_price`), lecture
  owner (avec `purchase_price`), cartes de deck visibles, import fonctionnel
- Headers vérifiés via `curl -I` / DevTools ; CSP via les rapports Report-Only
