// Pure (React-free) classification & grouping of Scryfall sets for the Extensions page.
//
// Scryfall's /sets endpoint has no per-set "games" field, so availability
// (paper / MTGA / both) is DERIVED from `digital` + `arena_code`:
//   digital === true                     -> 'mtga'  (numérique uniquement)
//   digital === false && arena_code set  -> 'both'  (papier + Arena)
//   digital === false && no arena_code   -> 'paper' (papier uniquement)

import type { ScryfallSet } from '@/lib/scryfall/types/scryfall';

export type GameAvailability = 'paper' | 'mtga' | 'both';
// Onglets de filtrage. Pas de catégorie « les deux » : un set disponible sur
// papier ET MTGA apparaît dans les DEUX onglets 'paper' et 'mtga'.
export type GameTab = 'all' | 'paper' | 'mtga';

export interface SetClassification {
	availability: GameAvailability;
	isAlchemy: boolean; // set_type === 'alchemy' — vrais exclusifs Arena
	isDigital: boolean; // mirror of set.digital
	hasArena: boolean; // arena_code présent
	hasPaper: boolean; // availability !== 'mtga'
}

export interface SetGroup {
	key: string; // code du set racine de la famille
	title: string; // nom du set racine
	sets: ScryfallSet[]; // racine en premier, puis dérivés par date desc
	latest: number; // max released_at (epoch) pour ordonner les groupes
}

/** Derive the availability bucket for one set. */
export function getGameAvailability(set: ScryfallSet): GameAvailability {
	if (set.digital) return 'mtga';
	if (set.arena_code) return 'both';
	return 'paper';
}

/** Full classification used to render badges. */
export function classifySet(set: ScryfallSet): SetClassification {
	const availability = getGameAvailability(set);
	return {
		availability,
		isAlchemy: set.set_type === 'alchemy',
		isDigital: Boolean(set.digital),
		hasArena: availability === 'both', // papier + Arena ; les sets numériques affichent un badge dédié
		hasPaper: availability !== 'mtga',
	};
}

/**
 * Does a set match the active tab? ('all' matches everything.)
 * Un set 'both' (papier + Arena) correspond aux onglets 'paper' ET 'mtga'.
 */
export function matchesTab(set: ScryfallSet, tab: GameTab): boolean {
	if (tab === 'all') return true;
	const availability = getGameAvailability(set);
	if (availability === 'both') return true;
	return availability === tab;
}

/** Parse released_at to an epoch; missing/invalid dates sort last (0). */
function releasedEpoch(set: ScryfallSet): number {
	const t = Date.parse(set.released_at ?? '');
	return Number.isNaN(t) ? 0 : t;
}

/** Case-insensitive name `.includes` filter. Empty query returns all. */
export function filterByName(sets: ScryfallSet[], query: string): ScryfallSet[] {
	const q = query.trim().toLowerCase();
	if (!q) return sets;
	return sets.filter((s) => s.name.toLowerCase().includes(q));
}

/**
 * Resolve the family root code for a set: follow `parent_set_code` as long as
 * the parent is present in `present`; otherwise the set is its own root.
 * Example : PSPM/SPE ont parent_set_code "spm" → tous rattachés à la famille "spm".
 */
function rootCode(
	set: ScryfallSet,
	byCode: Map<string, ScryfallSet>,
	present: Set<string>
): string {
	let current = set;
	const seen = new Set<string>();
	while (current.parent_set_code && present.has(current.parent_set_code)) {
		if (seen.has(current.code)) break; // garde-fou contre un cycle éventuel
		seen.add(current.code);
		const parent = byCode.get(current.parent_set_code);
		if (!parent) break;
		current = parent;
	}
	return current.code;
}

/**
 * Group sets by parent-set family. Un set principal (ex. SPM) et tous ses sets
 * dérivés présents dans la liste (PSPM promos, SPE eternal, …) forment un seul
 * groupe, titré par le nom du set racine. Les groupes sont ordonnés par date la
 * plus récente (desc) ; dans un groupe, la racine est en tête puis les dérivés
 * par date desc.
 */
export function groupSets(sets: ScryfallSet[]): SetGroup[] {
	const byCode = new Map(sets.map((s) => [s.code, s]));
	const present = new Set(byCode.keys());
	const groups = new Map<string, SetGroup>();

	for (const set of sets) {
		const key = rootCode(set, byCode, present);
		const root = byCode.get(key) ?? set;
		const epoch = releasedEpoch(set);
		const existing = groups.get(key);
		if (existing) {
			existing.sets.push(set);
			if (epoch > existing.latest) existing.latest = epoch;
		} else {
			groups.set(key, { key, title: root.name, sets: [set], latest: epoch });
		}
	}

	const result = Array.from(groups.values());
	for (const group of result) {
		group.sets.sort((a, b) => {
			// La racine de la famille reste toujours en tête.
			if (a.code === group.key) return -1;
			if (b.code === group.key) return 1;
			return releasedEpoch(b) - releasedEpoch(a);
		});
	}
	result.sort((a, b) => b.latest - a.latest);
	return result;
}

/** One-shot pipeline: filter by tab, then by name, then group. */
export function buildCatalog(sets: ScryfallSet[], tab: GameTab, query: string): SetGroup[] {
	const filtered = filterByName(
		sets.filter((s) => matchesTab(s, tab)),
		query
	);
	return groupSets(filtered);
}
