# Landing /search : résultats par défaut — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire afficher à la landing `/search` des résultats par défaut dans ses trois sections (cartes EDH populaires, decks récents, profils par nombre de decks publics) au lieu d'un texte de présentation, le terme de recherche filtrant désormais un contenu déjà affiché.

**Architecture:** Les trois sections passent `enabled = true` en permanence, supprimant la branche « pitch » et le garde anti-résultats-périmés. Le tri profils par défaut vient d'une nouvelle vue SQL `profiles_by_public_deck_count` que `searchProfiles` interroge quand le terme est vide. Cartes et decks tirent leur défaut du wiring existant.

**Tech Stack:** Next.js App Router (client components), next-intl, TypeScript, Supabase (Postgres 17, RLS, vues `security_invoker`).

**Spec:** `docs/superpowers/specs/2026-07-20-search-landing-default-results-design.md`

## Global Constraints

- **Pas de framework de test.** Aucun vitest/jest. Vérification = `npx tsc --noEmit` + `npx eslint <fichiers>` + `npm run build` + runtime dev. Ne jamais créer de `*.test.ts`.
- **`npm run check` est ROUGE à la base** (~60 problèmes préexistants hors périmètre). Gate = « aucun NOUVEAU problème » sur les fichiers touchés.
- **Le CONTRÔLEUR exécute toute commande DB/shell d'état** (supabase, psql, migrations, sb:*, dev server, build). Les subagents écrivent du CODE uniquement et ne lancent JAMAIS de commande DB — directive permanente depuis un incident où un subagent a wipé la DB locale avec `sb:reset`. Un subagent qui a besoin d'une migration appliquée la SIGNALE ; le contrôleur l'applique.
- **Navigation localisée** : `Link`/`useRouter`/`usePathname`/`redirect` depuis `@/i18n/navigation`, jamais `next/*`. Seuls `useSearchParams`/`notFound`/`useParams` viennent de `next/navigation`.
- **Toute clé i18n touchée l'est dans `messages/en.json` ET `messages/fr.json`.**
- **`ProfileSearchResult` a QUATRE champs** : `id`, `nickname`, `description`, `avatarUrl`. La vue SQL doit exposer `id, nickname, description, avatar_url` (la spec en listait trois — c'est une erreur de la spec, corrigée ici) pour que les deux branches de `searchProfiles` retournent une forme identique.
- **Vue en `security_invoker = true`** obligatoire : sans ça la vue court-circuite les RLS et fuite des profils/decks privés à un anon.

---

## Structure des fichiers

**Créés :**

| Fichier                                                                         | Responsabilité                                            |
| ------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `supabase/migrations/20260720160000_add_profiles_by_public_deck_count_view.sql` | Vue de classement des profils par nombre de decks publics |

**Modifiés :**

| Fichier                                | Changement                                                               |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `src/lib/search/db/searchProfiles.ts`  | Branche « terme vide » → interroge la vue                                |
| `src/app/[locale]/search/page.tsx`     | 3 sections : suppression branche pitch + garde ; `enabled` toujours true |
| `messages/en.json`, `messages/fr.json` | Suppression des 3 clés `landing*Pitch` mortes                            |

**Ordre.** Tâche 1 (migration) est un prérequis DB indépendant. Tâche 2 (searchProfiles) dépend de la vue appliquée. Tâche 3 (landing) est indépendante des deux autres côté code mais a besoin d'elles pour un runtime correct. Tâche 4 (nettoyage i18n) dépend de la tâche 3 (qui retire les usages).

**Le timestamp de migration `20260720160000`** est postérieur au dernier existant (`20260720150000_add_jumpstart_planechase_archenemy_formats.sql`), vérifié au moment de l'écriture. Si un nouveau fichier de migration apparaît entre-temps, incrémenter (`ls supabase/migrations | tail -1`).

---

### Task 1: Vue SQL `profiles_by_public_deck_count`

**Files:**

- Create: `supabase/migrations/20260720160000_add_profiles_by_public_deck_count_view.sql`

**Interfaces:**

- Consumes: tables existantes `public.profiles` (colonnes `id`, `nickname`, `description`, `avatar_url`) et `public.decks` (`owner_id`, `is_public`, `source`).
- Produces: vue `public.profiles_by_public_deck_count` avec colonnes `id`, `nickname`, `description`, `avatar_url`, `public_deck_count`, triée `public_deck_count DESC, nickname ASC`.

- [ ] **Step 1: Écrire la migration**

Créer `supabase/migrations/20260720160000_add_profiles_by_public_deck_count_view.sql` :

```sql
-- Classe les profils publics par nombre de decks PUBLICS (source='user'),
-- décroissant. Alimente le tri par défaut de la section "Joueurs" de la landing
-- /search quand aucun terme n'est saisi. user_usage.deck_count ne convient pas :
-- il compte aussi les decks privés et ne filtre pas is_public.
--
-- security_invoker : la vue s'exécute avec les droits de l'appelant, donc les RLS
-- de profiles/decks s'appliquent (un anon ne voit que le public). SANS ça la vue
-- tournerait avec les droits du créateur et fuiterait profils/decks privés.
--
-- LEFT JOIN : tous les profils nommés apparaissent, ceux à 0 deck public en bas.
-- Tri secondaire nickname pour un ordre total déterministe (sinon pagination par
-- offset instable sur les ex æquo).
create or replace view public.profiles_by_public_deck_count
with (security_invoker = true) as
select
  p.id,
  p.nickname,
  p.description,
  p.avatar_url,
  count(d.id) as public_deck_count
from public.profiles p
left join public.decks d
  on d.owner_id = p.id
  and d.is_public = true
  and d.source = 'user'
where p.nickname is not null
group by p.id, p.nickname, p.description, p.avatar_url
order by public_deck_count desc, p.nickname asc;

grant select on public.profiles_by_public_deck_count to anon, authenticated;
```

Le `grant select` explicite reflète le fait que les vues n'héritent pas des grants de leurs tables sources ; anon/authenticated doivent pouvoir lire la vue (les RLS des tables sous-jacentes font le filtrage réel via `security_invoker`).

- [ ] **Step 2 (CONTRÔLEUR — pas un subagent) : appliquer la migration en local**

```bash
npm run sb:migrate
```

Attendu : la migration s'applique sans erreur.

- [ ] **Step 3 (CONTRÔLEUR) : vérifier la vue**

```bash
# via psql sur la DB locale
psql "$LOCAL_DB_URL" -c "select column_name, data_type from information_schema.columns where table_name = 'profiles_by_public_deck_count' order by ordinal_position;"
psql "$LOCAL_DB_URL" -c "select id, nickname, public_deck_count from public.profiles_by_public_deck_count limit 10;"
```

Attendu : cinq colonnes (`id`, `nickname`, `description`, `avatar_url`, `public_deck_count`), et une liste triée par `public_deck_count` décroissant. Vérifier qu'un profil à 0 deck public a bien `public_deck_count = 0` et se classe en bas.

- [ ] **Step 4 (CONTRÔLEUR) : vérifier l'isolation RLS**

Confirmer qu'en tant qu'`anon`, la vue ne compte que les decks publics et n'expose pas de profils privés. Requête via PostgREST anon ou `set role anon` :

```bash
psql "$LOCAL_DB_URL" -c "set local role anon; select count(*) from public.profiles_by_public_deck_count;"
```

Attendu : ne renvoie que les profils visibles publiquement ; `public_deck_count` n'inclut aucun deck privé.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260720160000_add_profiles_by_public_deck_count_view.sql
git commit -m "feat(search): view ranking profiles by public deck count"
```

**Note prod (contrôleur, hors implémentation locale) :** cette migration devra être appliquée en prod via l'éditeur SQL Coolify selon le process `prod_migration_workflow` avant de déployer la landing. `create or replace view` est idempotent.

---

### Task 2: Branche « terme vide » dans `searchProfiles`

**Files:**

- Modify: `src/lib/search/db/searchProfiles.ts:13-35`

**Interfaces:**

- Consumes: la vue `public.profiles_by_public_deck_count` (tâche 1).
- Produces: `searchProfiles(term, opts)` inchangé en signature et en type de retour (`{ profiles: ProfileSearchResult[]; total: number }`). Nouvelle branche interne quand `term.trim()` est vide.

- [ ] **Step 1: Réécrire le corps de `searchProfiles`**

Remplacer la fonction (lignes 13-35) par cette version à deux branches :

```ts
/**
 * Search public profiles by nickname (RLS already restricts to is_public).
 * With no term, returns the default ranking: profiles ordered by their number of
 * PUBLIC decks (descending) via the `profiles_by_public_deck_count` view, so the
 * /search landing's Players section leads with the most active players instead of
 * an alphabetical list.
 */
export async function searchProfiles(
	term: string,
	opts: { limit?: number; offset?: number } = {}
): Promise<{ profiles: ProfileSearchResult[]; total: number }> {
	const limit = opts.limit ?? PAGE;
	const offset = opts.offset ?? 0;
	const supabase = createClient();
	const trimmed = term.trim();

	// No term → default ranking from the view (already ordered
	// public_deck_count DESC, nickname ASC). With a term, alphabetical nickname
	// order still makes sense for a filtered `ilike` match, so keep the table path.
	const source = trimmed
		? supabase.from('profiles').select('id, nickname, description, avatar_url', { count: 'exact' })
		: supabase
				.from('profiles_by_public_deck_count')
				.select('id, nickname, description, avatar_url', { count: 'exact' });

	let q = source;
	if (trimmed) {
		q = q.ilike('nickname', `%${trimmed}%`).not('nickname', 'is', null).order('nickname', {
			ascending: true,
		});
	}
	// The view is already ordered and only exposes non-null nicknames, so the
	// empty-term branch needs no extra order()/not() — applying them would be
	// redundant and, for order(), would override the view's ranking.
	q = q.range(offset, offset + limit - 1);

	const { data, error, count } = await q;
	if (error) throw new Error(`[searchProfiles] ${error.message}`);
	const profiles = (data ?? []).map((r) => ({
		id: r.id as string,
		nickname: r.nickname as string | null,
		description: r.description as string | null,
		avatarUrl: r.avatar_url as string | null,
	}));
	return { profiles, total: count ?? profiles.length };
}
```

Points d'attention :

- La vue est déjà triée : ne PAS rappeler `.order()` sur la branche vide, ça écraserait le classement.
- La vue ne contient que des `nickname` non nuls (clause `where` de la vue) : le `.not('nickname','is',null)` est inutile sur cette branche.
- Le `.select(...)` liste les mêmes colonnes des deux côtés → le `.map()` final est commun.
- **Piège TS2589 possible** (voir mémoire projet `supabase_builder_ts2589`) : si le typage du builder Supabase explose sur le ternaire `source`, basculer en réassignations `let q = ...; q = q.x()` plutôt qu'un chaînage dans l'initialiseur. Seul `npm run build` attrape cette erreur (pas `tsc` par fichier) — la vérifier au Step 3.

- [ ] **Step 2 (subagent) : vérifier types + lint**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "searchProfiles" || echo "OK: pas d'erreur sur searchProfiles"
npx eslint src/lib/search/db/searchProfiles.ts
```

Attendu : aucune erreur.

- [ ] **Step 3 (CONTRÔLEUR) : `npm run build`**

```bash
npm run build
```

Attendu : build réussi. C'est la seule vérif qui attrape un éventuel TS2589 sur le builder Supabase (voir mémoire projet). Si le build échoue à la ligne du ternaire, appliquer le refactor en réassignations décrit au Step 1.

- [ ] **Step 4: Commit**

```bash
git add src/lib/search/db/searchProfiles.ts
git commit -m "feat(search): default profile search to public-deck-count ranking"
```

---

### Task 3: Landing — résultats par défaut dans les trois sections

Supprime la branche « pitch » et le garde anti-résultats-périmés ; les sections affichent leur contenu par défaut dès l'arrivée.

**Files:**

- Modify: `src/app/[locale]/search/page.tsx`

**Interfaces:**

- Consumes: hooks existants `useScryfallCardSearch`/`useDeckSearch`/`useProfileSearch` avec `enabled = true`.
- Produces: rien.

- [ ] **Step 1: Passer `enabled` à true en permanence**

Dans `SearchLandingContent` (autour des lignes 53-69), le terme et le débounce restent, mais les sections reçoivent toujours `enabled`. Remplacer le bloc des trois sections :

```tsx
const { term, setTerm } = useLandingSearchUrlState();
// `useScryfallCardSearch` débounce `filters.name` en interne ; on débounce ici
// pour les deux autres sections. Les résultats par défaut s'affichent term vide.
const debounced = useDebounce(term, 300);
```

Puis dans le JSX, appeler les sections SANS prop `enabled` (elles ne l'ont plus) :

```tsx
<div className={landing.sections}>
	<CardsSection term={term} />
	<DecksSection term={debounced} />
	<ProfilesSection term={debounced} />
</div>
```

Supprimer la variable `hasTerm` (plus utilisée) et le commentaire sur `enabled` calculé.

- [ ] **Step 2: `CardsSection` — retirer branche pitch + garde**

Remplacer la signature et le corps :

```tsx
function CardsSection({ term }: { term: string }) {
	const t = useTranslations('search');

	const filters = useMemo(
		() => ({
			name: term,
			colors: [],
			type: [],
			set: '',
			rarities: [],
			oracleText: '',
			cmc: '',
		}),
		[term]
	);

	// enabled: true en permanence → term vide affiche le défaut du hook
	// (f:edh order:edhrec). Plus de garde `enabled ? … : []` : on ne repasse
	// jamais à enabled=false, donc les résultats ne sont jamais périmés.
	const { cards, isLoading } = useScryfallCardSearch(filters, { enabled: true });

	const shown = useMemo(() => cards.slice(0, CARD_LIMIT), [cards]);
	const href = term ? `/search/cards?name=${encodeURIComponent(term)}` : '/search/cards';

	let body: ReactNode;
	if (isLoading) {
		body = (
			<div className={styles.loading}>
				<Spinner size="md" />
			</div>
		);
	} else if (shown.length === 0) {
		body = <p className={`${landing.pitch} ${landing.sectionEmpty}`}>{t('landingNoResults')}</p>;
	} else {
		body = <CardList cards={shown} pageSize={false} viewModes={['grid']} />;
	}

	return (
		<section className={landing.section}>
			<SectionHeader title={t('landingCardsTitle')} href={href} />
			{body}
		</section>
	);
}
```

- [ ] **Step 3: `DecksSection` — retirer branche pitch**

```tsx
function DecksSection({ term }: { term: string }) {
	const t = useTranslations('search');
	const router = useRouter();
	const symbolMap = useScryfallSymbols();

	const filters = useMemo(() => ({ ...DEFAULT_DECK_FILTERS, name: term }), [term]);
	// enabled: true → term vide affiche les decks publics récents (searchDecks
	// trie created_at DESC à vide).
	const { decks, isLoading } = useDeckSearch(filters, true);

	const shown = useMemo(() => decks.slice(0, DECK_LIMIT), [decks]);
	const deckMetas = useMemo(() => shown.map((d) => d.deck), [shown]);
	const summaryMap = useDeckSummaries(deckMetas);

	const href = term ? `/search/decks?name=${encodeURIComponent(term)}` : '/search/decks';

	let body: ReactNode;
	if (isLoading) {
		body = (
			<div className={styles.loading}>
				<Spinner size="md" />
			</div>
		);
	} else if (shown.length === 0) {
		body = <p className={`${landing.pitch} ${landing.sectionEmpty}`}>{t('landingNoResults')}</p>;
	} else {
		body = (
			<div className={styles.deckGrid}>
				{shown.map(({ deck, authorNickname }) => (
					<DeckCard
						key={deck.id}
						deck={deck}
						summary={summaryMap[deck.id]}
						symbolMap={symbolMap}
						authorNickname={authorNickname}
						isPrecon={deck.source === 'mtgjson'}
						readOnly
						onClick={() => router.push(`/decks/${deck.id}`)}
					/>
				))}
			</div>
		);
	}

	return (
		<section className={landing.section}>
			<SectionHeader title={t('landingDecksTitle')} href={href} />
			{body}
		</section>
	);
}
```

- [ ] **Step 4: `ProfilesSection` — retirer branche pitch**

```tsx
function ProfilesSection({ term }: { term: string }) {
	const t = useTranslations('search');
	// enabled: true → term vide affiche le classement par nombre de decks publics
	// (searchProfiles interroge la vue profiles_by_public_deck_count à vide).
	const { profiles, isLoading } = useProfileSearch(term, true);

	const shown = useMemo(() => profiles.slice(0, PROFILE_LIMIT), [profiles]);
	const ownerIds = useMemo(() => shown.map((p) => p.id), [shown]);
	const statsMap = useProfileStats(ownerIds);

	const href = term ? `/search/profiles?q=${encodeURIComponent(term)}` : '/search/profiles';

	let body: ReactNode;
	if (isLoading) {
		body = (
			<div className={styles.loading}>
				<Spinner size="md" />
			</div>
		);
	} else if (shown.length === 0) {
		body = <p className={`${landing.pitch} ${landing.sectionEmpty}`}>{t('landingNoResults')}</p>;
	} else {
		body = (
			<div className={styles.profileGrid}>
				{shown.map((p) => (
					<ProfileCard key={p.id} profile={p} stats={statsMap[p.id]} />
				))}
			</div>
		);
	}

	return (
		<section className={landing.section}>
			<SectionHeader title={t('landingProfilesTitle')} href={href} />
			{body}
		</section>
	);
}
```

- [ ] **Step 5 (subagent) : vérifier types + lint**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "search/page" || echo "OK: pas d'erreur sur la landing"
npx eslint "src/app/[locale]/search/page.tsx"
```

Attendu : aucune erreur. Vérifier aussi qu'aucune référence résiduelle aux clés pitch ne subsiste dans ce fichier :

```bash
grep -n "landingCardsPitch\|landingDecksPitch\|landingProfilesPitch\|hasTerm\|enabled ? " "src/app/[locale]/search/page.tsx" || echo "OK: pitch/hasTerm/garde supprimés"
```

Attendu : `OK`.

- [ ] **Step 6 (CONTRÔLEUR) : runtime**

`npm run dev`, `/search` sans terme :

| Vérification                    | Attendu                                                                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chargement `/search` sans terme | Les 3 sections affichent des **résultats**, pas de pitch. Cartes = EDH populaires, decks = récents, profils = classés par nb de decks publics décroissant |
| Un profil à 0 deck public       | apparaît **en bas**, pas en tête                                                                                                                          |
| Taper « bolt »                  | Les 3 sections filtrent ; l'URL devient `/search?q=bolt`                                                                                                  |
| Vider le champ                  | Retour au contenu par défaut, **pas de résultats périmés** dans la section cartes                                                                         |
| « Voir plus » sans terme        | route nue ; avec terme, pré-remplit                                                                                                                       |

- [ ] **Step 7: Commit**

```bash
git add "src/app/[locale]/search/page.tsx"
git commit -m "feat(search): show default results in landing sections"
```

---

### Task 4: Nettoyage des clés i18n mortes

Les trois clés `landing*Pitch` ne sont plus référencées après la tâche 3.

**Files:**

- Modify: `messages/en.json`
- Modify: `messages/fr.json`

**Interfaces:**

- Consumes: rien.
- Produces: rien.

- [ ] **Step 1: Confirmer que les clés sont orphelines**

```bash
cd /home/elthinkbuntu/Documents/Wizcard
grep -rn "landingCardsPitch\|landingDecksPitch\|landingProfilesPitch" src --include="*.ts" --include="*.tsx"
```

Attendu : **aucun résultat**. S'il en reste, la tâche 3 est incomplète — ne pas supprimer, corriger d'abord.

- [ ] **Step 2: Supprimer les trois clés dans les deux locales**

Retirer de l'objet `search` de `messages/en.json` :

```json
"landingCardsPitch": "...",
"landingDecksPitch": "...",
"landingProfilesPitch": "...",
```

Et les clés correspondantes de `messages/fr.json`. Ne PAS toucher `landingPlaceholder`, `landingCardsTitle`, `landingDecksTitle`, `landingProfilesTitle`, `landingSeeMore`, `landingNoResults` — toutes encore utilisées.

- [ ] **Step 3: Vérifier parité + JSON valide**

```bash
python3 -c "
import json
en=json.load(open('messages/en.json')); fr=json.load(open('messages/fr.json'))
a,b=set(en['search']),set(fr['search'])
assert a==b, f'search désynchronisé: en-only={a-b} fr-only={b-a}'
for k in ('landingCardsPitch','landingDecksPitch','landingProfilesPitch'):
    assert k not in en['search'], f'{k} encore dans en'
    assert k not in fr['search'], f'{k} encore dans fr'
for k in ('landingPlaceholder','landingCardsTitle','landingSeeMore','landingNoResults'):
    assert k in en['search'] and k in fr['search'], f'{k} manquant'
print('OK: pitch supprimées des 2 locales, clés conservées présentes, parité maintenue')
"
```

Attendu : la ligne `OK`.

- [ ] **Step 4: Commit**

```bash
git add messages/en.json messages/fr.json
git commit -m "chore(search): remove dead landing pitch i18n keys"
```

---

## Notes de vérification transverses

**Le piège principal** est l'isolation RLS de la vue. Si `security_invoker` est oublié ou faux, la vue tourne avec les droits du créateur (souvent superuser via la migration) et un anon voit alors des profils privés et des comptes incluant des decks privés. Le Step 4 de la tâche 1 (requête `set role anon`) est le seul moyen de l'attraper — tout fonctionne visuellement sinon.

**Le second piège** est le tri écrasé : sur la branche « terme vide » de `searchProfiles`, rappeler `.order()` annulerait le classement de la vue. La tâche 2 l'évite explicitement ; à re-vérifier au runtime (Step 6 tâche 3 : le profil à 0 deck doit être en bas, pas en tête).

**TS2589 Supabase** : le ternaire `source` dans `searchProfiles` peut faire exploser le typage du builder (mémoire projet). Seul `npm run build` l'attrape, d'où le Step 3 de la tâche 2 confié au contrôleur.
