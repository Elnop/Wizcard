# Landing /search : résultats par défaut

Date: 2026-07-20

## Contexte

La landing `/search` (livrée le 2026-07-20, spec
`2026-07-20-search-mode-routes-design.md`) affiche trois sections — cartes, decks,
profils — dont chacune montre un **texte de présentation** tant qu'aucun terme
n'est saisi, et ne lance aucune requête réseau. Ce choix rendait la page inerte à
l'arrivée.

Décision revue par l'utilisateur : les sections doivent **afficher directement des
résultats** pour une page vivante. On passe de « pitch → résultats filtrés » à
« résultats par défaut → résultats filtrés ».

## Principe

Chaque section affiche toujours des résultats. Le terme de recherche ne fait plus
apparaître/disparaître les résultats — il **filtre** un contenu déjà affiché.

| Section | Sans terme (défaut)                       | Avec terme         | Source du défaut                                |
| ------- | ----------------------------------------- | ------------------ | ----------------------------------------------- |
| Cartes  | EDH populaires (`f:edh order:edhrec`)     | recherche par nom  | défaut existant du hook `useScryfallCardSearch` |
| Decks   | decks publics récents (`created_at DESC`) | filtrés par nom    | tri déjà en place dans `searchDecks`            |
| Joueurs | profils avec le plus de decks publics     | filtrés par pseudo | **nouvelle vue SQL**                            |

## Comportement de la landing

**Plus de « pitch ».** Les trois sections rendent leur contenu en permanence. La
distinction n'est plus « pitch vs résultats » mais « résultats par défaut vs
résultats filtrés par le terme ».

**Les hooks tournent toujours.** Les trois sections passent `enabled = true` en
permanence :

- `useScryfallCardSearch(filters, { enabled: true })` — le hook a déjà le défaut
  `f:edh order:edhrec` quand `filters.name` est vide, donc **aucun changement de
  wiring cartes**.
- `useDeckSearch(filters, true)` — `searchDecks` sans terme trie déjà par
  `created_at DESC` (secondaire `id DESC`), donc « decks publics récents » sort
  **gratuitement**.
- `useProfileSearch(term, true)` — nécessite le nouveau tri par défaut (voir
  section vue SQL).

**Le flag `enabled` reste** sur `useDeckSearch`/`useProfileSearch` (tâche 1 de la
livraison précédente) — d'autres appelants peuvent en avoir besoin — mais la
landing le passe toujours à `true`.

**Le garde anti-résultats-périmés disparaît de la landing.** L'ancienne section
cartes gardait `enabled ? cards.slice(0, LIMIT) : []` parce que
`useScryfallCardSearch` conserve ses derniers résultats quand `enabled` repasse à
`false`. Puisqu'on ne repasse jamais à `false`, le garde devient
`cards.slice(0, LIMIT)`. Idem, plus de branche `!enabled → pitch` dans aucune des
trois sections.

**Branches de rendu par section**, dans l'ordre :

1. `isLoading` → spinner
2. `results.length === 0` → `landingNoResults` (une recherche filtrée peut ne rien
   donner ; le défaut, lui, est quasi toujours non vide)
3. sinon → la grille / `CardList`

La branche `!enabled → pitch` est supprimée.

**« Voir plus »** est toujours actif. Sans terme → route nue (`/search/decks`) ;
avec terme → pré-remplit le paramètre de l'entité (`/search/decks?name=<q>`, etc.).
Comportement déjà en place, inchangé.

**Nettoyage i18n.** Les clés `landingCardsPitch`, `landingDecksPitch`,
`landingProfilesPitch` deviennent mortes → supprimées de `messages/en.json` ET
`messages/fr.json`. `landingNoResults`, `landingSeeMore`, `landingPlaceholder`,
et les `landing*Title` **restent** (les titres de section et le placeholder sont
toujours affichés).

**Limites par section inchangées** : 6 cartes / 3 decks / 4 profils.

## Impact SSR / performance

La section cartes tape Scryfall (déjà le cas), decks et profils tapent Supabase.
Passage de **zéro à trois requêtes** au chargement de `/search`.

La page reste en rendu client (`'use client'` + `useSearchParams`), donc **pas de
régression de prerendering** — le shell reste SSG, les données arrivent côté
client, exactement comme sur les trois routes dédiées. La landing n'est plus
« instantanée à vide » mais c'est le prix assumé de l'objectif « page vivante », et
identique au comportement des routes `/search/cards|decks|profiles`.

## Vue SQL pour le tri profils

Aucun tri existant n'ordonne les profils par nombre de decks publics :
`searchProfiles` sans terme trie alphabétiquement par `nickname`, et
`user_usage.deck_count` compte **tous** les decks de l'owner (privés inclus, sans
filtre `is_public`), donc inutilisable pour un classement public.

Nouvelle migration créant une vue :

```sql
create or replace view public.profiles_by_public_deck_count
with (security_invoker = true) as
select
  p.id,
  p.nickname,
  p.avatar_url,
  count(d.id) as public_deck_count
from public.profiles p
left join public.decks d
  on d.owner_id = p.id
  and d.is_public = true
  and d.source = 'user'
where p.nickname is not null
group by p.id, p.nickname, p.avatar_url
order by public_deck_count desc, p.nickname asc;
```

Points de design :

- **`security_invoker = true`** : la vue respecte les RLS de l'appelant. Un anon ne
  voit que les profils et decks publics via les policies existantes. Sans ça, une
  vue s'exécute avec les droits du créateur et court-circuite les RLS.
- **LEFT JOIN** : tous les profils avec un pseudo apparaissent, ceux à zéro deck
  public en bas de liste. La section Joueurs n'est donc jamais vide, même sur un
  site jeune. (Décision utilisateur : inclure les profils vides.)
- **`d.source = 'user'`** : exclut les precons (dont `owner_id` est de toute façon
  `null`, mais l'explicite protège le compte).
- **Tri secondaire `nickname asc`** : rend l'ordre déterministe quand plusieurs
  profils partagent le même `public_deck_count`, sinon la pagination par offset est
  instable (même classe de bug que celui déjà corrigé côté decks — des lignes en
  double / sautées entre deux requêtes).
- **Idempotence** : `create or replace view`, applicable proprement en local et en
  prod.

### Intégration dans `searchProfiles`

`searchProfiles(term, opts)` gagne **deux branches** :

- **Terme non vide** : comportement actuel inchangé — `ilike('nickname', %term%)`
  sur la table `profiles`, tri `nickname asc`. Le tri par pertinence de pseudo
  garde du sens quand on filtre.
- **Terme vide** : interroge la vue `profiles_by_public_deck_count` (déjà triée),
  avec le même `range(offset, offset+limit-1)` pour la pagination.

La forme de retour (`ProfileSearchResult`) est **identique** dans les deux
branches (`id`, `nickname`, `avatar_url`) — la vue expose exactement ces colonnes,
donc aucun consommateur en aval ne change. `useProfileSearch`, `ProfileCard`,
`useProfileStats` restent inchangés.

## Workflow migration

- La migration suit le workflow habituel : fichier
  `supabase/migrations/<timestamp>_add_profiles_by_public_deck_count_view.sql`,
  appliqué en **local par le contrôleur** (jamais un subagent — directive
  permanente depuis l'incident `sb:reset`), et en **prod** via l'éditeur SQL
  Coolify selon le process `prod_migration_workflow`.
- La vue est en lecture seule et n'a pas d'impact sur les écritures ; pas de
  trigger, pas de RLS propre (elle hérite via `security_invoker`).

## Hors périmètre

- Les routes `/search/cards|decks|profiles` ne changent pas — elles montrent déjà
  leur défaut à vide.
- `ProfileCard`, `useProfileStats`, `useDeckSummaries` inchangés.
- Aucun changement au tri par défaut de `/search/cards` (garde `f:edh order:edhrec`)
  ni de `/search/decks` (garde `created_at DESC`).
- La recherche filtrée de profils (`ilike` par pseudo) garde son tri alphabétique.

## Vérification

Pas de framework de test (voir `AGENTS.md`). Vérification :

- `npm run check` — gate « aucun nouveau problème » (base rouge).
- `npm run build` — succès, landing toujours SSG (shell).
- Migration appliquée en local par le contrôleur ; `npm run sb:verify` ou requête
  directe pour confirmer la vue.
- Runtime en dev :
  - `/search` sans terme affiche **des résultats** dans les trois sections (pas de
    pitch) : cartes EDH populaires, decks récents, profils triés par nombre de
    decks publics décroissant.
  - Un profil à 0 deck public apparaît en bas, pas en tête.
  - Taper un terme filtre chaque section ; « Voir plus » pré-remplit le terme.
  - Vider le terme revient au contenu par défaut (pas de résultats périmés).
  - Comme anon : la vue ne révèle que les profils/decks publics (RLS via
    `security_invoker`).
