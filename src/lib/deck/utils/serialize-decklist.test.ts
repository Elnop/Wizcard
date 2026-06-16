import { serializeDecklist } from './serialize-decklist';
import { parseMtgaCardLine } from '@/lib/import/formats/mtgaCardLine';
import type { DeckZone } from '@/types/decks';
import type { ResolvedDeckCard } from '@/app/decks/[id]/useDeckDetail';

let passed = 0;
let failed = 0;

function check(label: string, got: string, want: string) {
	if (got === want) {
		console.log(`PASS: ${label}`);
		passed++;
	} else {
		console.error(`FAIL: ${label}`);
		console.error(`  got:\n${JSON.stringify(got)}`);
		console.error(`  want:\n${JSON.stringify(want)}`);
		failed++;
	}
}

// Minimal card factory — only the fields serializeDecklist reads.
function card(
	name: string,
	zone: DeckZone,
	opts: { set?: string; collector?: string; oracleId?: string; id?: string } = {}
): ResolvedDeckCard {
	return {
		id: opts.id ?? `${name}-id`,
		name,
		set: opts.set,
		collector_number: opts.collector,
		oracle_id: opts.oracleId ?? `${name}-oracle`,
		entry: { tags: [`zone:${zone}`] },
	} as unknown as ResolvedDeckCard;
}

function emptyZones(): Record<DeckZone, ResolvedDeckCard[]> {
	return { commander: [], mainboard: [], sideboard: [], maybeboard: [], tokens: [] };
}

// 1. Round-trip: une ligne carte re-parsée avec parseMtgaCardLine redonne les bons champs.
{
	const z = emptyZones();
	z.mainboard = [card('Lightning Bolt', 'mainboard', { set: '2x2', collector: '117' })];
	const out = serializeDecklist(z);
	const cardLines = out.split('\n').filter((l) => l && l !== 'Deck');
	const parsed = parseMtgaCardLine(cardLines[0]);
	check('round-trip line present', cardLines.length === 1 ? 'ok' : 'bad', 'ok');
	check('round-trip name', parsed?.name ?? '∅', 'Lightning Bolt');
	check('round-trip set', parsed?.set ?? '∅', '2x2');
	check('round-trip collector', parsed?.collectorNumber ?? '∅', '117');
	check('round-trip qty', String(parsed?.quantity ?? '∅'), '1');
}

// 2. Regroupement des quantités: 3 copies (même oracle_id) → "3 ...".
{
	const z = emptyZones();
	z.mainboard = [
		card('Forest', 'mainboard', { set: 'unf', collector: '276', oracleId: 'forest' }),
		card('Forest', 'mainboard', { set: 'unf', collector: '276', oracleId: 'forest' }),
		card('Forest', 'mainboard', { set: 'unf', collector: '276', oracleId: 'forest' }),
	];
	const out = serializeDecklist(z);
	check('quantity grouping', out, 'Deck\n3 Forest (UNF) 276');
}

// 3. Ordre des sections + zones vides omises + séparation par ligne vide.
{
	const z = emptyZones();
	z.commander = [card('Atraxa', 'commander', { set: 'cmm', collector: '1' })];
	z.mainboard = [card('Sol Ring', 'mainboard', { set: 'cmm', collector: '2' })];
	z.sideboard = [card('Swords', 'sideboard', { set: 'cmm', collector: '3' })];
	z.maybeboard = [card('Counterspell', 'maybeboard', { set: 'cmm', collector: '4' })];
	const out = serializeDecklist(z);
	check(
		'section order + blank lines',
		out,
		'Commander\n1 Atraxa (CMM) 1\n\nDeck\n1 Sol Ring (CMM) 2\n\nSideboard\n1 Swords (CMM) 3\n\nMaybeboard\n1 Counterspell (CMM) 4'
	);
}

// 4. Exclusion des tokens.
{
	const z = emptyZones();
	z.mainboard = [card('Sol Ring', 'mainboard', { set: 'cmm', collector: '2' })];
	z.tokens = [card('Treasure', 'tokens', { set: 'tcmm', collector: '20' })];
	const out = serializeDecklist(z);
	check('tokens excluded', out, 'Deck\n1 Sol Ring (CMM) 2');
}

// 5. Fallback name-only (set ou collector manquant).
{
	const z = emptyZones();
	z.mainboard = [
		card('Custom Card', 'mainboard', {}),
		card('Set Only', 'mainboard', { set: 'abc' }),
	];
	const out = serializeDecklist(z);
	check('name-only fallback', out, 'Deck\n1 Custom Card\n1 Set Only');
}

// 6. Decklist vide → ''.
{
	check('empty decklist', serializeDecklist(emptyZones()), '');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
