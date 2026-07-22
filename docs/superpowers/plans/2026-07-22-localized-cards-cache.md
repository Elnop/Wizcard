# Cache serveur d'images/textes localisés (`localized_cards`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supprimer le N+1 sur `api.scryfall.com` en 1re visite en servant les images/textes localisés depuis une table `localized_cards` partagée, pré-remplie en masse via le bulk file Scryfall et lue en batch par le client.

**Architecture:** Une table Postgres `localized_cards` (clé `(set, collector_number, lang)`) est peuplée par un script de seed manuel qui streame le bulk `all_cards` (sur `*.scryfall.io`, sans rate limit). Au montage d'une vue, le client lit en **un batch** les localisations dont il a besoin et les injecte dans le cache IndexedDB existant, que `useLocalizedImage` lit déjà — donc 0 appel API. Un miss retombe sur le fallback API actuel, inchangé.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (Postgres + RLS), Zustand, IndexedDB, `tsx` pour les scripts Node, `@supabase/supabase-js` (service role) côté seed.

## Global Constraints

- **Noms de champs = noms Scryfall à l'identique** sur tout le chemin localisé (`card_faces`, `image_uris`, `printed_name`, `printed_type_line`, `printed_text`, `scryfall_id`, `oracle_id`, `set`, `collector_number`, `lang`).
- **Faces normalisées (Option 1)** : `card_faces` est **toujours** un tableau de 1 ou 2 entrées, jamais NULL, jamais de colonne racine `image_uris`/`printed_*` séparée.
- **Aucun nouveau consommateur du `sharedScryfallThrottle`.** Le seed ne touche `api.scryfall.com` que pour le seul GET `/bulk-data`. **Aucune route d'écriture publique.**
- **Ne jamais appeler le client Supabase hors `src/lib/supabase/`** (AGENTS.md). Les `.from()` vivent dans `src/lib/supabase/queries/`, le mapping row↔domaine dans un module `db/`.
- **Contenu de la table** : uniquement `lang ≠ en` et scan réel (`hasRealScan`), jamais les placeholders Scryfall.
- **PK = `(set, collector_number, lang)`** (seule clé que le client possède à la lecture). `scryfall_id`/`oracle_id` sont des colonnes de liaison, pas la clé d'accès.
- **Pas de framework de test** (memory `no_test_framework`) : chaque tâche se vérifie par `npm run check` (baseline rouge → gate sur « aucun NOUVEAU problème » via `npx eslint` sur les fichiers changés, memory `check_red_baseline`), `npm run build` (attrape les TS2589 Supabase), `sb:migrate`/`sb:reset` + Studio, et vérif runtime (Network tab).
- **Migration prod** appliquée via le workflow idempotent manuel (memory `prod_migration_workflow`) ; seed lancé à la main depuis la machine dev.

---

## File Structure

- `supabase/migrations/20260722120000_add_localized_cards.sql` — **créer** : table `localized_cards` + PK + index + RLS (SELECT anon/authenticated, aucune écriture publique).
- `scripts/seed/seed-localized-cards.ts` — **créer** : entrée du seed (téléchargement bulk, stream, upsert batch).
- `scripts/seed/normalize-localized-card.ts` — **créer** : fonction pure `toLocalizedCardRow(card)` (normalisation Option 1) + son harness de vérif.
- `package.json` — **modifier** : ajouter le script npm `seed:localized-cards`.
- `src/lib/supabase/queries/localized-cards.ts` — **créer** : seul endroit qui fait `client.from('localized_cards')` ; lecture batch par triplets.
- `src/lib/scryfall/db/localized-cards.ts` — **créer** : `prefetchLocalizedCards` — lecture batch serveur + injection dans le cache IndexedDB.
- `src/lib/scryfall/utils/card-cache.ts` — **modifier** : renommer `face_image_uris → card_faces` dans `CachedLocalizedImage`, bump DB IndexedDB v3 → v4 (+ clear store).
- `src/lib/scryfall/hooks/useLocalizedImage.ts` — **modifier** : `cachedToResult` lit `card_faces` uniforme et projette vers `LocalizedImageResult` (image_uris racine si 1 face, card_faces si 2) ; `putLocalizedImageInCache` écrit `card_faces`.
- `src/lib/collection/hooks/useCollectionCards.ts` — **modifier** : après résolution, déclencher (fire-and-forget) le préchargement localisé batch avec la langue effective des entrées.

---

## Task 1 : Migration table `localized_cards`

**Files:**

- Create: `supabase/migrations/20260722120000_add_localized_cards.sql`

**Interfaces:**

- Produces: table `public.localized_cards(set text, collector_number text, lang text, scryfall_id uuid, oracle_id uuid, card_faces jsonb, updated_at timestamptz)`, PK `(set, collector_number, lang)`, `UNIQUE(scryfall_id)`, index sur `oracle_id`, RLS SELECT pour `anon, authenticated`.

- [ ] **Step 1 : Écrire la migration**

Create `supabase/migrations/20260722120000_add_localized_cards.sql` :

```sql
-- Cache partagé des images/textes localisés (non-anglais), pré-rempli par le seed
-- bulk (scripts/seed/seed-localized-cards.ts). Supprime le N+1 sur api.scryfall.com
-- en 1re visite : le client lit ici par (set, collector_number, lang) au lieu de
-- fetcher /cards/{set}/{number}/{lang} carte par carte.
--
-- PK = (set, collector_number, lang) : la seule clé que le client possède au moment
-- de lire (il ne connaît pas l'UUID du print localisé, c'est ce qu'il vient chercher).
-- scryfall_id (print localisé) et oracle_id (identité gameplay) sont des colonnes de
-- liaison/traçabilité, pas la clé d'accès.
--
-- card_faces : TOUJOURS un tableau de 1 ou 2 entrées (Option 1 — jamais NULL, jamais
-- de colonne racine image_uris/printed_* séparée). Mono-face = 1 entrée ; carte à deux
-- images physiques (transform, modal_dfc) = 2 entrées. Chaque entrée porte
-- { image_uris, printed_name, printed_type_line, printed_text } (noms Scryfall).
create table if not exists public.localized_cards (
  set text not null,
  collector_number text not null,
  lang text not null,
  scryfall_id uuid not null,
  oracle_id uuid,
  card_faces jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (set, collector_number, lang)
);

create unique index if not exists localized_cards_scryfall_id_key
  on public.localized_cards (scryfall_id);

create index if not exists localized_cards_oracle_id_idx
  on public.localized_cards (oracle_id);

-- lang est toujours non-anglais dans cette table (l'anglais ne déclenche jamais de
-- localisation côté client).
alter table public.localized_cards
  add constraint localized_cards_lang_not_en check (lang <> 'en');

-- Lecture publique : un deck public doit être consultable sans login ; ce sont des
-- URLs d'images publiques, pas de données privées. AUCUNE policy d'écriture — la
-- table n'est écrite que par le seed via la service-role key (bypasse la RLS).
alter table public.localized_cards enable row level security;

drop policy if exists localized_cards_select_all on public.localized_cards;
create policy localized_cards_select_all
  on public.localized_cards
  for select
  using (true);

grant select on public.localized_cards to anon, authenticated;
```

- [ ] **Step 2 : Appliquer en local et vérifier**

Run : `npm run sb:migrate`
Expected : la migration s'applique sans erreur (`Applying migration 20260722120000_add_localized_cards.sql...`).

- [ ] **Step 3 : Vérifier la table dans Studio**

Run : `npm run sb:studio`
Expected : la table `localized_cards` existe avec les 7 colonnes, PK sur `(set, collector_number, lang)`, index unique sur `scryfall_id`, RLS activé avec une policy SELECT.

- [ ] **Step 4 : Vérifier la lecture anonyme**

Dans Studio → SQL editor, exécuter :

```sql
insert into public.localized_cards (set, collector_number, lang, scryfall_id, card_faces)
values ('woe', '1', 'fr', gen_random_uuid(), '[{"image_uris":{"normal":"https://cards.scryfall.io/x.jpg"}}]'::jsonb);
set role anon;
select set, collector_number, lang from public.localized_cards where set = 'woe';
reset role;
delete from public.localized_cards where set = 'woe';
```

Expected : le `select` sous `role anon` renvoie la ligne (lecture publique OK).

- [ ] **Step 5 : Commit**

```bash
git add supabase/migrations/20260722120000_add_localized_cards.sql
git commit -m "feat(db): add localized_cards shared cache table

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2 : Normalisation Option 1 (fonction pure)

**Files:**

- Create: `scripts/seed/normalize-localized-card.ts`

**Interfaces:**

- Consumes: `ScryfallCard`, `ScryfallImageUris`, `ScryfallCardFace`, `hasRealScan` depuis `@/lib/scryfall/types/scryfall`.
- Produces:
  - type `LocalizedFace = { image_uris?: ScryfallImageUris; printed_name?: string; printed_type_line?: string; printed_text?: string }`
  - type `LocalizedCardRow = { set: string; collector_number: string; lang: string; scryfall_id: string; oracle_id: string | null; card_faces: LocalizedFace[] }`
  - `toLocalizedCardRow(card: ScryfallCard): LocalizedCardRow | null` — renvoie `null` si `lang === 'en'`, si pas de scan réel exploitable, ou si champs clés absents.

- [ ] **Step 1 : Écrire la fonction de normalisation**

Create `scripts/seed/normalize-localized-card.ts` :

```ts
// Normalisation "Option 1" : transforme un objet carte Scryfall en une ligne
// localized_cards dont card_faces est TOUJOURS un tableau de 1 ou 2 entrées.
// Toute la logique de discrimination (racine vs faces, selon le layout Scryfall)
// vit ICI — les lecteurs itèrent card_faces sans jamais tester "racine ou faces".

import type { ScryfallCard, ScryfallImageUris } from '@/lib/scryfall/types/scryfall';
import { hasRealScan } from '@/lib/scryfall/types/scryfall';

export interface LocalizedFace {
	image_uris?: ScryfallImageUris;
	printed_name?: string;
	printed_type_line?: string;
	printed_text?: string;
}

export interface LocalizedCardRow {
	set: string;
	collector_number: string;
	lang: string;
	scryfall_id: string;
	oracle_id: string | null;
	card_faces: LocalizedFace[];
}

/**
 * Normalise un ScryfallCard en LocalizedCardRow, ou null si la carte ne doit pas
 * entrer dans le cache localisé (anglais, pas de scan réel, champs clés absents).
 *
 * - lang === 'en'            → null (l'anglais ne déclenche jamais de localisation)
 * - set/collector_number/id absents → null
 * - image_uris à la racine (mono-face, split/flip/adventure) → 1 face
 * - image_uris par card_face (transform, modal_dfc)          → 2 faces
 * - aucune face ne porte de scan réel → null
 */
export function toLocalizedCardRow(card: ScryfallCard): LocalizedCardRow | null {
	if (card.lang === 'en') return null;
	if (!card.set || !card.collector_number || !card.id) return null;

	const faces: LocalizedFace[] = [];

	if (card.image_uris) {
		// Racine : une seule image physique (mono-face, split/flip/adventure).
		if (hasRealScan(card.image_status)) {
			faces.push({
				image_uris: card.image_uris,
				printed_name: card.printed_name,
				printed_type_line: card.printed_type_line,
				printed_text: card.printed_text,
			});
		}
	} else if (card.card_faces && card.card_faces.some((f) => f.image_uris)) {
		// Faces : deux images physiques (transform, modal_dfc). On ne garde que les
		// faces qui portent réellement une image.
		for (const f of card.card_faces) {
			if (!f.image_uris) continue;
			faces.push({
				image_uris: f.image_uris,
				printed_name: f.printed_name,
				printed_type_line: f.printed_type_line,
				printed_text: f.printed_text,
			});
		}
		// card_faces sans image_status propre : on se fie à la présence d'image_uris
		// (un placeholder par face n'expose pas d'URL réelle dans le bulk).
	}

	if (faces.length === 0) return null;

	return {
		set: card.set,
		collector_number: card.collector_number,
		lang: card.lang,
		scryfall_id: card.id,
		oracle_id: card.oracle_id ?? null,
		card_faces: faces,
	};
}
```

- [ ] **Step 2 : Écrire un harness de vérification jetable**

Create `scripts/seed/_verify-normalize.ts` :

```ts
// Harness de vérification jetable (pas de framework de test dans ce projet).
// Lancé une fois à la main, supprimé après. Vérifie les 4 cas de normalisation.
import { toLocalizedCardRow } from './normalize-localized-card';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

function assert(name: string, cond: boolean): void {
	console.log(`${cond ? '✓' : '✗ FAIL'} ${name}`);
	if (!cond) process.exitCode = 1;
}

const uris = { small: 's', normal: 'n', large: 'l', png: 'p', art_crop: 'a', border_crop: 'b' };

// 1. Anglais → null
assert(
	'english → null',
	toLocalizedCardRow({ lang: 'en', set: 'woe', collector_number: '1', id: 'x' } as ScryfallCard) ===
		null
);

// 2. Mono-face FR scan réel → 1 face
const mono = toLocalizedCardRow({
	lang: 'fr',
	set: 'woe',
	collector_number: '1',
	id: 'id1',
	oracle_id: 'o1',
	image_status: 'highres_scan',
	image_uris: uris,
	printed_name: 'Nom FR',
} as ScryfallCard);
assert('mono-face → 1 face', mono?.card_faces.length === 1);
assert('mono-face → printed_name porté', mono?.card_faces[0].printed_name === 'Nom FR');
assert('mono-face → scryfall_id', mono?.scryfall_id === 'id1');

// 3. Placeholder → null
assert(
	'placeholder → null',
	toLocalizedCardRow({
		lang: 'fr',
		set: 'woe',
		collector_number: '2',
		id: 'id2',
		image_status: 'placeholder',
		image_uris: uris,
	} as ScryfallCard) === null
);

// 4. DFC (transform) → 2 faces
const dfc = toLocalizedCardRow({
	lang: 'fr',
	set: 'mid',
	collector_number: '3',
	id: 'id3',
	oracle_id: 'o3',
	card_faces: [
		{ image_uris: uris, printed_name: 'Recto FR', object: 'card_face', mana_cost: '', name: 'a' },
		{ image_uris: uris, printed_name: 'Verso FR', object: 'card_face', mana_cost: '', name: 'b' },
	],
} as ScryfallCard);
assert('dfc → 2 faces', dfc?.card_faces.length === 2);
assert('dfc → verso printed_name', dfc?.card_faces[1].printed_name === 'Verso FR');
```

- [ ] **Step 3 : Lancer le harness, vérifier que tout passe**

Run : `npx tsx scripts/seed/_verify-normalize.ts`
Expected : 8 lignes `✓`, aucun `✗ FAIL`, exit 0.

- [ ] **Step 4 : Supprimer le harness et vérifier le lint**

Run :

```bash
rm scripts/seed/_verify-normalize.ts
npx eslint scripts/seed/normalize-localized-card.ts
```

Expected : le fichier de harness est supprimé ; `eslint` ne signale aucun NOUVEAU problème sur `normalize-localized-card.ts`.

- [ ] **Step 5 : Commit**

```bash
git add scripts/seed/normalize-localized-card.ts
git commit -m "feat(seed): add Option-1 localized card normalization

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3 : Script de seed (download bulk → stream → upsert)

**Files:**

- Create: `scripts/seed/seed-localized-cards.ts`
- Modify: `package.json` (scripts)

**Interfaces:**

- Consumes: `toLocalizedCardRow`, `LocalizedCardRow` depuis `./normalize-localized-card`.
- Produces: la commande `npm run seed:localized-cards` qui peuple `public.localized_cards`.

- [ ] **Step 1 : Écrire le script de seed**

Create `scripts/seed/seed-localized-cards.ts` :

```ts
// Seed manuel de public.localized_cards depuis le bulk file Scryfall `all_cards`.
//
//   npm run seed:localized-cards              — seed contre la DB pointée par l'env
//   npm run seed:localized-cards -- --dry-run — compter/normaliser sans écrire
//   npm run seed:localized-cards -- --limit=N — s'arrêter après N lignes upsertées
//
// Le bulk vit sur *.scryfall.io (AUCUN rate limit). Le SEUL appel à api.scryfall.com
// est le GET /bulk-data initial pour récupérer l'URL du fichier. On streame le
// .jsonl.gz ligne par ligne (jamais tout en mémoire — le fichier fait ~2.58 GB).
//
// Écrit via la service-role key (bypasse la RLS ; il n'existe aucune policy d'écriture).
// En prod : renseigner SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY de la prod avant de lancer.

import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { createClient } from '@supabase/supabase-js';
import { toLocalizedCardRow, type LocalizedCardRow } from './normalize-localized-card';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const BULK_META_URL = 'https://api.scryfall.com/bulk-data';
const UPSERT_BATCH = 500;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.slice('--limit='.length), 10) : 0;

if (!SUPABASE_SERVICE_ROLE_KEY && !dryRun) {
	console.error('✖ Missing SUPABASE_SERVICE_ROLE_KEY (required unless --dry-run)');
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false },
});

async function bulkUrl(): Promise<string> {
	const res = await fetch(BULK_META_URL, {
		headers: {
			'User-Agent': 'Wizcard/1.0 (https://github.com/devinedev/wizcard)',
			Accept: 'application/json',
		},
	});
	if (!res.ok) throw new Error(`GET /bulk-data failed: HTTP ${res.status}`);
	const json = (await res.json()) as {
		data: Array<{ type: string; download_uri: string; size: number }>;
	};
	const all = json.data.find((b) => b.type === 'all_cards');
	if (!all) throw new Error('all_cards entry not found in /bulk-data');
	console.log(`ℹ all_cards: ${(all.size / 1e6).toFixed(0)} MB — ${all.download_uri}`);
	return all.download_uri;
}

async function flush(rows: LocalizedCardRow[]): Promise<void> {
	if (rows.length === 0 || dryRun) return;
	const { error } = await supabase
		.from('localized_cards')
		.upsert(rows, { onConflict: 'set,collector_number,lang' });
	if (error) throw new Error(`upsert failed: ${error.message}`);
}

async function main(): Promise<void> {
	const started = Date.now();
	const url = await bulkUrl();

	const res = await fetch(url, {
		headers: { 'User-Agent': 'Wizcard/1.0 (https://github.com/devinedev/wizcard)' },
	});
	if (!res.ok || !res.body) throw new Error(`bulk download failed: HTTP ${res.status}`);

	// Node's fetch body is a web ReadableStream; bridge it to a Node stream to pipe
	// through gunzip, then read line-by-line (JSONL). Never buffer the whole file.
	const nodeStream = (await import('node:stream')).Readable.fromWeb(res.body as never);
	const gunzip = nodeStream.pipe(createGunzip());
	const rl = createInterface({ input: gunzip, crlfDelay: Infinity });

	let seen = 0;
	let kept = 0;
	let batch: LocalizedCardRow[] = [];

	for await (const line of rl) {
		const trimmed = line.trim().replace(/,$/, '');
		if (trimmed === '' || trimmed === '[' || trimmed === ']') continue;
		seen++;

		let card: ScryfallCard;
		try {
			card = JSON.parse(trimmed) as ScryfallCard;
		} catch {
			continue; // ligne non-JSON (bordure du tableau) — ignorer
		}

		const row = toLocalizedCardRow(card);
		if (!row) continue;
		batch.push(row);
		kept++;

		if (batch.length >= UPSERT_BATCH) {
			await flush(batch);
			batch = [];
		}
		if (seen % 50_000 === 0) console.log(`ℹ ${seen} lues, ${kept} gardées…`);
		if (limit > 0 && kept >= limit) break;
	}

	await flush(batch);
	const secs = ((Date.now() - started) / 1000).toFixed(0);
	console.log(
		`✓ ${dryRun ? '[dry-run] ' : ''}${kept} lignes localisées sur ${seen} cartes lues (${secs}s)`
	);
}

main().catch((err) => {
	console.error('✖ seed failed:', err);
	process.exit(1);
});
```

- [ ] **Step 2 : Ajouter le script npm**

Modify `package.json`, dans `"scripts"`, après la ligne `"precons:sync"` :

```json
		"seed:localized-cards": "NODE_ENV=production npx tsx scripts/seed/seed-localized-cards.ts",
```

- [ ] **Step 3 : Dry-run rapide contre la DB locale (limite basse)**

Prérequis : Supabase local démarré (`npm run sb:start`) et Task 1 migrée.
Run : `npm run seed:localized-cards -- --dry-run --limit=200`
Expected : le script télécharge la métadonnée bulk, streame, et log `✓ [dry-run] <=200 lignes localisées sur N cartes lues` sans erreur ni écriture.

- [ ] **Step 4 : Seed réel limité contre la DB locale, vérifier l'écriture**

Récupérer la service-role key locale : `npm run sb:status` (champ `service_role key`).
Run :

```bash
SUPABASE_SERVICE_ROLE_KEY="<clé locale>" npm run seed:localized-cards -- --limit=200
```

Expected : `✓ <=200 lignes localisées…`. Puis dans Studio → SQL editor :

```sql
select count(*) from public.localized_cards;
select set, collector_number, lang, jsonb_array_length(card_faces) as faces from public.localized_cards limit 5;
```

Expected : `count` > 0, chaque `faces` vaut 1 ou 2, `lang` jamais `en`.

- [ ] **Step 5 : Vérifier lint/types**

Run : `npx eslint scripts/seed/seed-localized-cards.ts && npx tsc --noEmit`
Expected : aucun NOUVEAU problème sur le script (le baseline `tsc` peut avoir des erreurs préexistantes ailleurs — vérifier qu'aucune ne pointe le nouveau fichier).

- [ ] **Step 6 : Commit**

```bash
git add scripts/seed/seed-localized-cards.ts package.json
git commit -m "feat(seed): bulk seed script for localized_cards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4 : Query Supabase — lecture batch par triplets

**Files:**

- Create: `src/lib/supabase/queries/localized-cards.ts`

**Interfaces:**

- Produces:
  - type `LocalizedCardDbRow = { set: string; collector_number: string; lang: string; scryfall_id: string; oracle_id: string | null; card_faces: LocalizedFaceRow[] }` où `LocalizedFaceRow = { image_uris?: ScryfallImageUris; printed_name?: string; printed_type_line?: string; printed_text?: string }`.
  - `fetchLocalizedCardRows(keys: Array<{ set: string; collector_number: string; lang: string }>): Promise<LocalizedCardDbRow[]>` — 1 requête, dédup interne, renvoie les hits (misses simplement absents).

- [ ] **Step 1 : Écrire la query**

Create `src/lib/supabase/queries/localized-cards.ts` :

```ts
import { createClient } from '@/lib/supabase/client';
import type { ScryfallImageUris } from '@/lib/scryfall/types/scryfall';

/**
 * Raw Supabase access for `localized_cards`. Ce fichier est le SEUL endroit qui
 * fait client.from('localized_cards'). Le mapping row -> cache client vit dans
 * src/lib/scryfall/db/localized-cards.ts.
 *
 * La table n'a pas de FK vers auth.users (données publiques partagées), donc pas
 * d'embed PostgREST : on lit à plat par (set, collector_number, lang).
 */

export interface LocalizedFaceRow {
	image_uris?: ScryfallImageUris;
	printed_name?: string;
	printed_type_line?: string;
	printed_text?: string;
}

export interface LocalizedCardDbRow {
	set: string;
	collector_number: string;
	lang: string;
	scryfall_id: string;
	oracle_id: string | null;
	card_faces: LocalizedFaceRow[];
}

// PostgREST n'exprime pas facilement un IN sur un tuple composite. On requête par
// (set, lang) groupés — en pratique une vue partage peu de sets/langues — puis on
// filtre les collector_number côté client. Simple et suffisant pour une grille.
export async function fetchLocalizedCardRows(
	keys: Array<{ set: string; collector_number: string; lang: string }>
): Promise<LocalizedCardDbRow[]> {
	if (keys.length === 0) return [];
	const supabase = createClient();

	// Dédupe les clés et collecte les sets/langs à interroger.
	const wanted = new Set(keys.map((k) => `${k.set}/${k.collector_number}/${k.lang}`));
	const sets = [...new Set(keys.map((k) => k.set))];
	const langs = [...new Set(keys.map((k) => k.lang))];

	const { data, error } = await supabase
		.from('localized_cards')
		.select('set, collector_number, lang, scryfall_id, oracle_id, card_faces')
		.in('set', sets)
		.in('lang', langs);

	if (error) {
		console.error('[queries/localized-cards] fetchLocalizedCardRows error:', error);
		return [];
	}

	// Ne garder que les triplets réellement demandés (le IN croise set × lang).
	return (data as LocalizedCardDbRow[]).filter((r) =>
		wanted.has(`${r.set}/${r.collector_number}/${r.lang}`)
	);
}
```

- [ ] **Step 2 : Vérifier types + lint**

Run : `npx eslint src/lib/supabase/queries/localized-cards.ts && npx tsc --noEmit`
Expected : aucun NOUVEAU problème sur le fichier.

- [ ] **Step 3 : Vérifier `npm run build` (TS2589 Supabase builder)**

Run : `npm run build`
Expected : build OK. (Le `.in().in()` reste chaîné sur `supabase.from()` directement, sans réassignation dans un initialiseur `let q = ...`, donc pas de TS2589 — memory `supabase_builder_ts2589`. Si le build échoue en TS2589 sur ce fichier, réécrire en `let q = supabase.from(...).select(...); q = q.in('set', sets); q = q.in('lang', langs);`.)

- [ ] **Step 4 : Commit**

```bash
git add src/lib/supabase/queries/localized-cards.ts
git commit -m "feat(supabase): batch query for localized_cards by triplet

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5 : Unifier le cache client sur `card_faces` (bump IndexedDB v4)

**Files:**

- Modify: `src/lib/scryfall/utils/card-cache.ts`
- Modify: `src/lib/scryfall/hooks/useLocalizedImage.ts`

**Interfaces:**

- Consumes: rien de neuf.
- Produces: `CachedLocalizedImage` avec `card_faces?: LocalizedFace[]` (au lieu de `face_image_uris`), DB IndexedDB en v4. `cachedToResult` projette `card_faces` (1 face → `image_uris` racine, 2 faces → `card_faces`) vers `LocalizedImageResult` inchangé.

- [ ] **Step 1 : Renommer `face_image_uris → card_faces` dans `CachedLocalizedImage`**

Modify `src/lib/scryfall/utils/card-cache.ts`, interface `CachedLocalizedImage` (actuellement lignes 21-32) :

```ts
/** Cached localized image URIs, keyed by "set/collector_number/lang". */
export interface CachedLocalizedImage {
	key: string; // keyPath — "set/collector_number/lang"
	// Faces normalisées (Option 1) : toujours 1 ou 2 entrées quand la carte a un
	// scan localisé. Absent pour une entrée `missing`. Noms Scryfall.
	card_faces?: Array<{
		image_uris?: ScryfallImageUris;
		printed_name?: string;
		printed_type_line?: string;
		printed_text?: string;
	}>;
	cachedAt: number;
	/**
	 * True when Scryfall has no print in that language (404). Persisting the
	 * miss stops every card lacking a localized print from being re-fetched.
	 */
	missing?: boolean;
}
```

- [ ] **Step 2 : Bump la version IndexedDB v3 → v4 + clear du store localisé**

Modify `src/lib/scryfall/utils/card-cache.ts` :

- Ligne `const request = indexedDB.open(DB_NAME, 3);` → `4`.
- Dans `onupgradeneeded`, le bloc `else if (event.oldVersion < 3)` qui `.clear()` le `LOCALIZED_IMAGE_STORE` : changer la condition en `event.oldVersion < 4` pour purger l'ancien format `face_image_uris` :

```ts
if (!db.objectStoreNames.contains(LOCALIZED_IMAGE_STORE)) {
	db.createObjectStore(LOCALIZED_IMAGE_STORE, { keyPath: 'key' });
} else if (event.oldVersion < 4) {
	// v4: le format d'une entrée localisée passe de `face_image_uris` (nom
	// non-Scryfall) à `card_faces` uniforme. Purge l'ancien format ; le cache
	// se re-remplit au prochain accès (seed serveur ou fallback API).
	request.transaction!.objectStore(LOCALIZED_IMAGE_STORE).clear();
}
```

- [ ] **Step 3 : Adapter `cachedToResult` (projection card_faces → LocalizedImageResult)**

Modify `src/lib/scryfall/hooks/useLocalizedImage.ts`, fonction `cachedToResult` (actuellement lignes 54-69). Elle recevait `{ image_uris?, face_image_uris? }` ; elle reçoit désormais `{ card_faces? }` et projette vers la forme que `CardImage` consomme déjà (image_uris racine pour 1 face, card_faces pour 2+) :

```ts
function cachedToResult(cached: {
	card_faces?: Array<{
		image_uris?: ScryfallImageUris;
		printed_name?: string;
		printed_type_line?: string;
		printed_text?: string;
	}>;
}): LocalizedImageResult {
	const faces = cached.card_faces ?? [];
	// 1 face → image_uris racine (mono-face : ce que resolveImageUri lit par défaut).
	// 2+ faces → card_faces (DFC : computeIsDoubleFaced + resolveImageUri lisent card_faces).
	if (faces.length <= 1) {
		return { image_uris: faces[0]?.image_uris };
	}
	return {
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

- [ ] **Step 4 : Adapter les écritures `putLocalizedImageInCache` (fetch + english)**

Modify `src/lib/scryfall/hooks/useLocalizedImage.ts` — dans `fetchLocalizedImage` et `fetchEnglishImage`, les deux `putLocalizedImageInCache({ key, image_uris: …, face_image_uris: …, cachedAt })` (actuellement ~lignes 122-127 et 179-184). Remplacer par une écriture `card_faces` uniforme. Ajouter un helper local en haut du fichier :

```ts
/** Normalise un ScryfallCard en tableau card_faces uniforme (Option 1) pour le cache. */
function toCachedFaces(card: {
	image_uris?: ScryfallImageUris;
	printed_name?: string;
	printed_type_line?: string;
	printed_text?: string;
	card_faces?: ScryfallCardFace[];
}): CachedLocalizedImage['card_faces'] {
	if (card.image_uris) {
		return [
			{
				image_uris: card.image_uris,
				printed_name: card.printed_name,
				printed_type_line: card.printed_type_line,
				printed_text: card.printed_text,
			},
		];
	}
	if (card.card_faces?.some((f) => f.image_uris)) {
		return card.card_faces
			.filter((f) => f.image_uris)
			.map((f) => ({
				image_uris: f.image_uris,
				printed_name: f.printed_name,
				printed_type_line: f.printed_type_line,
				printed_text: f.printed_text,
			}));
	}
	return [];
}
```

Puis, dans `fetchLocalizedImage`, remplacer le bloc de persistance du hit :

```ts
// 3. Persist to IndexedDB (format card_faces uniforme)
void putLocalizedImageInCache({
	key: cacheKey,
	card_faces: toCachedFaces(localized),
	cachedAt: Date.now(),
});

return { image_uris: localized.image_uris, card_faces: localized.card_faces };
```

Et dans `fetchEnglishImage`, le bloc équivalent :

```ts
void putLocalizedImageInCache({
	key: cacheKey,
	card_faces: toCachedFaces(english),
	cachedAt: Date.now(),
});

return { image_uris: english.image_uris, card_faces: english.card_faces };
```

Importer `CachedLocalizedImage` et `ScryfallCardFace` en tête du fichier si absent :

```ts
import type { CachedLocalizedImage } from '@/lib/scryfall/utils/card-cache';
import type { ScryfallImageUris, ScryfallCardFace } from '@/lib/scryfall/types/scryfall';
```

(`ScryfallImageUris` est déjà importé ; ajouter `ScryfallCardFace` et `CachedLocalizedImage`.)

- [ ] **Step 5 : Vérifier types + lint + build**

Run : `npx eslint src/lib/scryfall/utils/card-cache.ts src/lib/scryfall/hooks/useLocalizedImage.ts && npm run build`
Expected : aucun NOUVEAU problème ; build OK.

- [ ] **Step 6 : Vérif runtime — le fallback API marche toujours**

Prérequis : `npm run dev`, table `localized_cards` VIDE (ou non seedée pour la carte testée), collection avec une carte non-anglaise.
Ouvrir la vue collection, DevTools → Network filtré sur `api.scryfall.com`.
Expected : la carte FR se localise via `GET /cards/{set}/{number}/{lang}` (fallback intact) et s'affiche correctement. Recharger : plus de fetch (cache IndexedDB `card_faces` chaud). Le rendu recto/verso d'une DFC FR reste correct.

- [ ] **Step 7 : Commit**

```bash
git add src/lib/scryfall/utils/card-cache.ts src/lib/scryfall/hooks/useLocalizedImage.ts
git commit -m "refactor(scryfall): unify localized cache on card_faces (Scryfall names, IDB v4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6 : Préchargement batch — injecter les hits serveur dans le cache

**Files:**

- Create: `src/lib/scryfall/db/localized-cards.ts`
- Modify: `src/lib/collection/hooks/useCollectionCards.ts`

**Pourquoi `useCollectionCards` et NON `resolveCardsByScryfallIds` :** la langue voulue
vient de l'**entrée de collection** (`entry.language`), pas du print Scryfall.
`resolveCardsByScryfallIds` ne reçoit que des `scryfallId` (aucune langue) — précharger
là-bas sur `card.lang` raterait le cas « print anglais possédé en FR » (`card.lang === 'en'`
→ sauté à tort). `useCollectionCards` a à la fois les `entries` (donc la langue effective)
ET les cartes résolues (donc `set`/`collector_number`) — c'est le seul endroit qui possède
le triplet réel à précharger, avec exactement la même dérivation de langue que `langCodeFor`.

**Interfaces:**

- Consumes: `fetchLocalizedCardRows`, `LocalizedCardDbRow` (Task 4) ; `putLocalizedImageInCache`, `getLocalizedImageFromCache` (card-cache) ; `LANGUAGE_TO_SCRYFALL_CODE`, `MtgLanguage` (langues).
- Produces: `prefetchLocalizedCards(cards: Array<{ set?: string; collector_number?: string; lang?: string }>): Promise<void>` — lecture batch serveur + injection dans le cache IndexedDB, en sautant les clés déjà en cache. `lang` = code Scryfall déjà résolu (≠ langue brute de l'entrée). Fire-and-forget.

- [ ] **Step 1 : Écrire le module d'injection**

Create `src/lib/scryfall/db/localized-cards.ts` :

```ts
// Préchargement batch des images/textes localisés depuis la table serveur partagée
// `localized_cards`. Lit en UN batch les triplets (set, collector_number, lang≠en)
// d'une vue et injecte les hits dans le cache IndexedDB `localized-images`, que
// useLocalizedImage lit déjà. Résultat : useLocalizedImage trouve un cache chaud →
// 0 appel api.scryfall.com. Un miss retombe sur le fallback API existant, inchangé.

import { fetchLocalizedCardRows } from '@/lib/supabase/queries/localized-cards';
import {
	getLocalizedImageFromCache,
	putLocalizedImageInCache,
} from '@/lib/scryfall/utils/card-cache';

interface PrefetchCard {
	set?: string;
	collector_number?: string;
	lang?: string;
}

/**
 * Précharge les localisations d'une liste de cartes depuis la table serveur.
 * - ne considère que les cartes lang≠en avec set + collector_number
 * - saute les clés déjà présentes dans le cache IndexedDB (hit ou miss mémorisé)
 * - 1 seule requête serveur pour toute la liste restante
 * - injecte les hits au format card_faces uniforme
 */
export async function prefetchLocalizedCards(cards: PrefetchCard[]): Promise<void> {
	// 1. Retenir les clés localisables (lang≠en, set+number présents), dédupées.
	const keyMap = new Map<string, { set: string; collector_number: string; lang: string }>();
	for (const c of cards) {
		if (!c.set || !c.collector_number || !c.lang || c.lang === 'en') continue;
		keyMap.set(`${c.set}/${c.collector_number}/${c.lang}`, {
			set: c.set,
			collector_number: c.collector_number,
			lang: c.lang,
		});
	}
	if (keyMap.size === 0) return;

	// 2. Écarter les clés déjà en cache (évite une requête et une réécriture inutiles).
	const misses: Array<{ set: string; collector_number: string; lang: string }> = [];
	await Promise.all(
		[...keyMap.entries()].map(async ([key, triplet]) => {
			const cached = await getLocalizedImageFromCache(key);
			if (!cached) misses.push(triplet);
		})
	);
	if (misses.length === 0) return;

	// 3. UN batch serveur.
	const rows = await fetchLocalizedCardRows(misses);

	// 4. Injecter les hits dans le cache IndexedDB (format card_faces uniforme).
	await Promise.all(
		rows.map((r) =>
			putLocalizedImageInCache({
				key: `${r.set}/${r.collector_number}/${r.lang}`,
				card_faces: r.card_faces,
				cachedAt: Date.now(),
			})
		)
	);
}
```

- [ ] **Step 2 : Déclencher le préchargement dans `useCollectionCards`**

Modify `src/lib/collection/hooks/useCollectionCards.ts`. Ce hook a les `entries` (donc la
langue voulue) ET le `scryfallMap` (cartes résolues, donc `set`/`collector_number`). On
précharge en **fire-and-forget** dès que des cartes sont résolues, sur la langue effective
dérivée comme `langCodeFor` (entrée d'abord, préférence profil en repli).

Ajouter les imports en tête :

```ts
import { prefetchLocalizedCards } from '@/lib/scryfall/db/localized-cards';
import { LANGUAGE_TO_SCRYFALL_CODE, type MtgLanguage } from '@/lib/mtg/languages';
import { usePreferredCardLang } from '@/lib/scryfall/hooks/useLocalizedImage';
```

Dans le corps du hook, après la construction de `cards` (`const cards = useMemo(...)`),
ajouter un effet de préchargement. Il dérive le code Scryfall exactement comme `langCodeFor`
(entrée → préférence profil) :

```ts
const preferredLang = usePreferredCardLang();

useEffect(() => {
	if (cards.length === 0) return;
	const targets = cards.map((card) => {
		const raw = card.entry?.language ?? card.language;
		const lang = raw ? LANGUAGE_TO_SCRYFALL_CODE[raw as MtgLanguage] : preferredLang;
		return { set: card.set, collector_number: card.collector_number, lang };
	});
	// Fire-and-forget : n'affecte pas le rendu ; un miss laisse le fallback API
	// de useLocalizedImage opérer normalement.
	void prefetchLocalizedCards(targets);
}, [cards, preferredLang]);
```

Note : `card.entry` existe car `buildCards` attache `entry` à chaque `Card` (ligne 19 du
hook). `card.set`/`card.collector_number`/`card.language` viennent du `ScryfallCard` étalé.

- [ ] **Step 3 : Vérifier types + lint + build**

Run : `npx eslint src/lib/scryfall/db/localized-cards.ts src/lib/collection/hooks/useCollectionCards.ts && npm run build`
Expected : aucun NOUVEAU problème ; build OK.

- [ ] **Step 4 : Vérif runtime — cache chaud, 0 appel API après seed**

Prérequis : DB locale seedée pour au moins une carte FR de la collection (`npm run seed:localized-cards -- --limit=…` ou seed complet), `npm run dev`, cache IndexedDB purgé (DevTools → Application → IndexedDB → supprimer `wizcard-cache`, ou navigation privée).
Ouvrir la vue collection, DevTools → Network.
Expected : **une** requête vers `localized_cards` (Supabase) au montage ; **aucun** `GET api.scryfall.com/cards/{set}/{number}/{lang}` pour les cartes couvertes par le seed ; les images FR s'affichent. Pour une carte FR non seedée : le fallback `GET /cards/{set}/{number}/{lang}` apparaît (dégradation gracieuse).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/scryfall/db/localized-cards.ts src/lib/collection/hooks/useCollectionCards.ts
git commit -m "feat(scryfall): batch-prefetch localized cards from server cache

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Déploiement (hors tâches — checklist manuelle)

- [ ] Appliquer la migration `localized_cards` en prod via le workflow idempotent (memory `prod_migration_workflow` : script idempotent dans le SQL editor, sync `schema_migrations`, avancer `deploy`).
- [ ] Lancer le seed contre la prod : renseigner `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` de la prod, puis `npm run seed:localized-cards`. Vérifier `select count(*) from localized_cards;`.
- [ ] Re-lancer le seed manuellement à chaque sortie d'édition majeure (nouvelles cartes non-en).

## Notes de vérification finale (memories projet)

- `npm run check` reste rouge au baseline (~60 problèmes préexistants) — gate sur « aucun NOUVEAU problème » via `npx eslint` sur les fichiers changés.
- Seul `npm run build` attrape les TS2589 des builders Supabase — le lancer après les tâches 4 et 6.
- Éditer `config.toml` n'est PAS nécessaire ici (pas de changement GoTrue).
