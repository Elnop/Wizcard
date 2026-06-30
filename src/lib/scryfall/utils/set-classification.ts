// Pure (React-free) classification & grouping of Scryfall sets for the Extensions page.
//
// Scryfall's /sets endpoint has no per-set "games" field, so availability
// (paper / MTGA / both) is DERIVED from `digital` + `arena_code`:
//   digital === true                     -> 'mtga'  (digital only)
//   digital === false && arena_code set  -> 'both'  (papier + Arena)
//   digital === false && no arena_code   -> 'paper' (papier uniquement)

import type { ScryfallSet } from '@/lib/scryfall/types/scryfall';

export type GameAvailability = 'paper' | 'mtga' | 'both';
// Filter tabs. No "both" category: a set available on paper AND MTGA appears
// in BOTH the 'paper' and 'mtga' tabs.
export type GameTab = 'all' | 'paper' | 'mtga';

export interface SetClassification {
	availability: GameAvailability;
	isAlchemy: boolean; // set_type === 'alchemy' — vrais exclusifs Arena
	isDigital: boolean; // mirror of set.digital
	hasArena: boolean; // arena_code present
	hasPaper: boolean; // availability !== 'mtga'
}

export interface SetGroup {
	key: string; // code du set racine de la famille
	title: string; // nom du set racine
	sets: ScryfallSet[]; // root first, then derivatives by date desc
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
		hasArena: availability === 'both', // paper + Arena; digital sets show a dedicated badge
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
 * Example: PSPM/SPE have parent_set_code "spm" → all attached to the "spm" family.
 */
function rootCode(
	set: ScryfallSet,
	byCode: Map<string, ScryfallSet>,
	present: Set<string>
): string {
	let current = set;
	const seen = new Set<string>();
	while (current.parent_set_code && present.has(current.parent_set_code)) {
		if (seen.has(current.code)) break; // safeguard against a possible cycle
		seen.add(current.code);
		const parent = byCode.get(current.parent_set_code);
		if (!parent) break;
		current = parent;
	}
	return current.code;
}

/**
 * Group sets by parent-set family. A main set (e.g. SPM) and all its sets
 * derivatives present in the list (PSPM promos, SPE eternal, …) form a single
 * group, titled by the root set name. Groups are ordered by most recent date
 * (desc); within a group, the root comes first then the derivatives by date desc.
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
			// The family root always stays first.
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
