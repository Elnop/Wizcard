import type { ScryfallSet } from '@/lib/scryfall/types/scryfall';
import {
	getGameAvailability,
	classifySet,
	matchesTab,
	filterByName,
	groupSets,
	buildCatalog,
} from './set-classification';

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean): void {
	if (cond) {
		console.log(`PASS: ${label}`);
		passed++;
	} else {
		console.error(`FAIL: ${label}`);
		failed++;
	}
}

// ── Fixtures ─────────────────────────────────────────────────────────────────
function makeSet(p: Partial<ScryfallSet>): ScryfallSet {
	return {
		id: p.code ?? 'id',
		code: 'xxx',
		name: 'Unnamed',
		set_type: 'expansion',
		card_count: 0,
		digital: false,
		foil_only: false,
		scryfall_uri: '',
		uri: '',
		icon_svg_uri: '',
		search_uri: '',
		...p,
	} as ScryfallSet;
}

const paperOnly = makeSet({ code: 'old', name: 'Old Paper Set', released_at: '2005-01-01' });
const paperArena = makeSet({
	code: 'std',
	name: 'Standard Expansion',
	arena_code: 'std',
	block: 'Innistrad',
	released_at: '2024-09-01',
});
const alchemy = makeSet({
	code: 'yset',
	name: 'Alchemy: Something',
	set_type: 'alchemy',
	digital: true,
	block: 'Alchemy 2024',
	released_at: '2024-10-01',
});
const mtgoMasters = makeSet({
	code: 'vma',
	name: 'Vintage Masters',
	set_type: 'masters',
	digital: true,
	released_at: '2014-06-16',
});
const noBlockNoDate = makeSet({ code: 'wtf', name: 'No Block No Date', set_type: 'funny' });

// ── getGameAvailability ──────────────────────────────────────────────────────
check('paper-only => paper', getGameAvailability(paperOnly) === 'paper');
check('paper+arena => both', getGameAvailability(paperArena) === 'both');
check('alchemy (digital) => mtga', getGameAvailability(alchemy) === 'mtga');
check('masters (digital) => mtga', getGameAvailability(mtgoMasters) === 'mtga');

// ── classifySet ──────────────────────────────────────────────────────────────
const cAlchemy = classifySet(alchemy);
check('alchemy isAlchemy', cAlchemy.isAlchemy === true);
check('alchemy isDigital', cAlchemy.isDigital === true);
check('alchemy not hasPaper', cAlchemy.hasPaper === false);
check('alchemy not hasArena (digital badge instead)', cAlchemy.hasArena === false);

const cBoth = classifySet(paperArena);
check('both hasPaper', cBoth.hasPaper === true);
check('both hasArena', cBoth.hasArena === true);
check('both not isAlchemy', cBoth.isAlchemy === false);

const cMasters = classifySet(mtgoMasters);
check('masters not isAlchemy', cMasters.isAlchemy === false);
check('masters isDigital', cMasters.isDigital === true);

// ── matchesTab ───────────────────────────────────────────────────────────────
check('all matches paper', matchesTab(paperOnly, 'all'));
check('all matches mtga', matchesTab(alchemy, 'all'));
check('paper tab matches paper-only', matchesTab(paperOnly, 'paper'));
check('mtga tab matches alchemy', matchesTab(alchemy, 'mtga'));
// Un set "both" (papier + Arena) apparaît dans les DEUX onglets.
check('paper tab includes both', matchesTab(paperArena, 'paper'));
check('mtga tab includes both', matchesTab(paperArena, 'mtga'));
// Un set papier seul n'apparaît pas dans l'onglet MTGA.
check('mtga tab excludes paper-only', !matchesTab(paperOnly, 'mtga'));
// Un set numérique seul n'apparaît pas dans l'onglet Papier.
check('paper tab excludes mtga-only', !matchesTab(alchemy, 'paper'));

// ── filterByName ─────────────────────────────────────────────────────────────
const all = [paperOnly, paperArena, alchemy, mtgoMasters, noBlockNoDate];
check('empty query returns all', filterByName(all, '').length === all.length);
check('query is case-insensitive', filterByName(all, 'STANDARD').length === 1);
check('query matches substring', filterByName(all, 'master').length === 1);
check('no match returns empty', filterByName(all, 'zzzzz').length === 0);

// ── groupSets : regroupement par famille de set parent ───────────────────────
// Famille SPM : set principal + promos + eternal, tous via parent_set_code.
const spm = makeSet({ code: 'spm', name: "Marvel's Spider-Man", released_at: '2025-09-26' });
const pspm = makeSet({
	code: 'pspm',
	name: "Marvel's Spider-Man Promos",
	set_type: 'promo',
	parent_set_code: 'spm',
	released_at: '2025-09-20',
});
const spe = makeSet({
	code: 'spe',
	name: "Marvel's Spider-Man Eternal",
	set_type: 'eternal',
	parent_set_code: 'spm',
	released_at: '2025-09-26',
});
// Set indépendant, plus ancien.
const fin = makeSet({ code: 'fin', name: 'Final Fantasy', released_at: '2025-06-13' });

const famGroups = groupSets([pspm, spm, spe, fin]);
const famByKey = new Map(famGroups.map((g) => [g.key, g]));
check('famille groupée sous le set racine (spm)', famByKey.has('spm'));
check('un seul groupe pour la famille SPM', famByKey.get('spm')?.sets.length === 3);
check('titre du groupe = nom du set racine', famByKey.get('spm')?.title === "Marvel's Spider-Man");
check('racine en tête du groupe', famByKey.get('spm')?.sets[0].code === 'spm');
check(
	'set indépendant a son propre groupe',
	famByKey.has('fin') && famByKey.get('fin')?.sets.length === 1
);
check('groupes triés par date desc (SPM avant Final Fantasy)', famGroups[0].key === 'spm');

// Orphelin : parent absent de la liste -> le set devient sa propre racine.
const orphan = makeSet({
	code: 'p30t',
	name: 'Promo orpheline',
	set_type: 'promo',
	parent_set_code: 'absent',
	released_at: '2023-01-01',
});
const orphanGroups = groupSets([orphan]);
check('orphelin (parent absent) devient sa propre racine', orphanGroups[0]?.key === 'p30t');

// Tri intra-groupe des dérivés par date desc (après la racine).
const root = makeSet({ code: 'rt', name: 'Root', released_at: '2024-01-01' });
const childOld = makeSet({
	code: 'co',
	name: 'Child Old',
	parent_set_code: 'rt',
	released_at: '2024-01-02',
});
const childNew = makeSet({
	code: 'cn',
	name: 'Child New',
	parent_set_code: 'rt',
	released_at: '2024-06-01',
});
const rtGroup = groupSets([childOld, root, childNew]).find((g) => g.key === 'rt');
check(
	'dérivés triés date desc après la racine',
	rtGroup?.sets[0].code === 'rt' && rtGroup?.sets[1].code === 'cn' && rtGroup?.sets[2].code === 'co'
);

// ── buildCatalog ─────────────────────────────────────────────────────────────
const mtgaCatalog = buildCatalog(all, 'mtga', '');
const mtgaCodes = mtgaCatalog.flatMap((g) => g.sets.map((s) => s.code)).sort();
// MTGA = sets numériques (yset, vma) + sets papier+Arena "both" (std).
check('buildCatalog mtga tab keeps digital + both sets', mtgaCodes.join(',') === 'std,vma,yset');

const paperCatalog = buildCatalog(all, 'paper', '');
const paperCodes = paperCatalog.flatMap((g) => g.sets.map((s) => s.code)).sort();
// Papier = sets papier seul (old, wtf) + sets papier+Arena "both" (std).
check('buildCatalog paper tab keeps paper + both sets', paperCodes.join(',') === 'old,std,wtf');
const searched = buildCatalog(all, 'all', 'standard');
check(
	'buildCatalog applies tab+search',
	searched.length === 1 && searched[0].sets[0].code === 'std'
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
