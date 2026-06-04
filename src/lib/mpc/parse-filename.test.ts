import { parseCardFilename } from './parse-filename';

type Case = {
	input: string;
	cardName: string;
	variants: string[];
	bracketTags: string[];
	collectorNumber: string | null;
	extension: string | null;
};

const cases: Case[] = [
	{
		input: "Ancient Tomb (Balin's Tomb) [LTC] {357}.jpg",
		cardName: 'Ancient Tomb',
		variants: ["Balin's Tomb"],
		bracketTags: ['LTC'],
		collectorNumber: '357',
		extension: 'jpg',
	},
	{
		input: 'Elesh Norn, Mother of Machines (v2) [third party art, popout].png',
		cardName: 'Elesh Norn, Mother of Machines',
		variants: ['v2'],
		bracketTags: ['third party art, popout'],
		collectorNumber: null,
		extension: 'png',
	},
	{
		input: 'Lightning Bolt [M10] {127}.png',
		cardName: 'Lightning Bolt',
		variants: [],
		bracketTags: ['M10'],
		collectorNumber: '127',
		extension: 'png',
	},
	{
		input: 'Lightning Bolt.png',
		cardName: 'Lightning Bolt',
		variants: [],
		bracketTags: [],
		collectorNumber: null,
		extension: 'png',
	},
	{
		input: 'Jace, the Mind Sculptor (Extended) (Alt Art) [SLD] {123}.jpg',
		cardName: 'Jace, the Mind Sculptor',
		variants: ['Extended', 'Alt Art'],
		bracketTags: ['SLD'],
		collectorNumber: '123',
		extension: 'jpg',
	},
	{
		input: 'Ragavan, Nimble Pilferer',
		cardName: 'Ragavan, Nimble Pilferer',
		variants: [],
		bracketTags: [],
		collectorNumber: null,
		extension: null,
	},
];

let passed = 0;
let failed = 0;

for (const c of cases) {
	const result = parseCardFilename(c.input);
	const errors: string[] = [];

	if (result.cardName !== c.cardName)
		errors.push(`  cardName: got "${result.cardName}", want "${c.cardName}"`);
	if (JSON.stringify(result.variants) !== JSON.stringify(c.variants))
		errors.push(
			`  variants: got ${JSON.stringify(result.variants)}, want ${JSON.stringify(c.variants)}`
		);
	if (JSON.stringify(result.bracketTags) !== JSON.stringify(c.bracketTags))
		errors.push(
			`  bracketTags: got ${JSON.stringify(result.bracketTags)}, want ${JSON.stringify(c.bracketTags)}`
		);
	if (result.collectorNumber !== c.collectorNumber)
		errors.push(`  collectorNumber: got "${result.collectorNumber}", want "${c.collectorNumber}"`);
	if (result.extension !== c.extension)
		errors.push(`  extension: got "${result.extension}", want "${c.extension}"`);

	if (errors.length > 0) {
		console.error(`FAIL: ${c.input}`);
		errors.forEach((e) => console.error(e));
		failed++;
	} else {
		console.log(`PASS: ${c.input}`);
		passed++;
	}
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
