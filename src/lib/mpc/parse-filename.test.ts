import { parseCardFilename } from './parse-filename';

const RAGAVAN = 'Ragavan, Nimble Pilferer';
const LIGHTNING_BOLT = 'Lightning Bolt';

type Case = {
	input: string;
	cardName: string;
	variants: string[];
	bracketTags: string[];
	setCode: string | null;
	collectorNumber: string | null;
	extension: string | null;
	language: string | null;
};

const cases: Case[] = [
	// ── Original cases ──────────────────────────────────────────────────────
	{
		input: "Ancient Tomb (Balin's Tomb) [LTC] {357}.jpg",
		cardName: 'Ancient Tomb',
		variants: ["Balin's Tomb"],
		bracketTags: ['LTC'],
		setCode: 'LTC',
		collectorNumber: '357',
		extension: 'jpg',
		language: null,
	},
	{
		input: 'Elesh Norn, Mother of Machines (v2) [third party art, popout].png',
		cardName: 'Elesh Norn, Mother of Machines',
		variants: ['v2'],
		bracketTags: ['third party art', 'popout'],
		setCode: null,
		collectorNumber: null,
		extension: 'png',
		language: null,
	},
	{
		input: 'Lightning Bolt [M10] {127}.png',
		cardName: LIGHTNING_BOLT,
		variants: [],
		bracketTags: ['M10'],
		setCode: 'M10',
		collectorNumber: '127',
		extension: 'png',
		language: null,
	},
	{
		input: 'Lightning Bolt.png',
		cardName: LIGHTNING_BOLT,
		variants: [],
		bracketTags: [],
		setCode: null,
		collectorNumber: null,
		extension: 'png',
		language: null,
	},
	{
		input: 'Jace, the Mind Sculptor (Extended) (Alt Art) [SLD] {123}.jpg',
		cardName: 'Jace, the Mind Sculptor',
		variants: ['Extended', 'Alt Art'],
		bracketTags: ['SLD'],
		setCode: 'SLD',
		collectorNumber: '123',
		extension: 'jpg',
		language: null,
	},
	{
		input: RAGAVAN,
		cardName: RAGAVAN,
		variants: [],
		bracketTags: [],
		setCode: null,
		collectorNumber: null,
		extension: null,
		language: null,
	},

	// ── Underscore = apostrophe encoding ────────────────────────────────────
	{
		input: 'tormod_s crypt.png',
		cardName: "tormod's crypt",
		variants: [],
		bracketTags: [],
		setCode: null,
		collectorNumber: null,
		extension: 'png',
		language: null,
	},
	{
		input: 'painter_s servant.png',
		cardName: "painter's servant",
		variants: [],
		bracketTags: [],
		setCode: null,
		collectorNumber: null,
		extension: 'png',
		language: null,
	},

	// ── Underscore = word separator ──────────────────────────────────────────
	{
		input: '037_The_King_of_Kings.png',
		cardName: 'The King of Kings',
		variants: [],
		bracketTags: [],
		setCode: null,
		collectorNumber: null,
		extension: 'png',
		language: null,
	},

	// ── Numeric sort prefix ──────────────────────────────────────────────────
	{
		input: '19 - Exquisite Blood.JPEG',
		cardName: 'Exquisite Blood',
		variants: [],
		bracketTags: [],
		setCode: null,
		collectorNumber: null,
		extension: 'jpeg',
		language: null,
	},
	{
		input: '26.You Look Upon the Tarrasque (BFG 9000).png',
		cardName: 'You Look Upon the Tarrasque',
		variants: ['BFG 9000'],
		bracketTags: [],
		setCode: null,
		collectorNumber: null,
		extension: 'png',
		language: null,
	},

	// ── Drive dedup trailing number ──────────────────────────────────────────
	{
		input: 'Island (2).png',
		cardName: 'Island',
		variants: [],
		bracketTags: [],
		setCode: null,
		collectorNumber: null,
		extension: 'png',
		language: null,
	},
	{
		input: 'Command Tower (Normal) [SLD] {129} (3).jpg',
		cardName: 'Command Tower',
		variants: ['Normal'],
		bracketTags: ['SLD'],
		setCode: 'SLD',
		collectorNumber: '129',
		extension: 'jpg',
		language: null,
	},

	// ── Freeform bracket tags: comma-separated entries split individually ────
	{
		input: 'Forest [AI, Borderless Art, Upscaled].png',
		cardName: 'Forest',
		variants: [],
		bracketTags: ['AI', 'Borderless Art', 'Upscaled'],
		setCode: null,
		collectorNumber: null,
		extension: 'png',
		language: null,
	},
	{
		input: 'Monastery Swiftspear [2X2 Showcase].png',
		cardName: 'Monastery Swiftspear',
		variants: [],
		bracketTags: ['2X2 Showcase'],
		setCode: null,
		collectorNumber: null,
		extension: 'png',
		language: null,
	},

	// ── {PT} language prefix — PT = Portugais (ISO-639-1) ───────────────────
	{
		input: '{PT} Sol Ring (Kekai borderless).png',
		cardName: 'Sol Ring',
		variants: ['Kekai borderless'],
		bracketTags: [],
		setCode: null,
		collectorNumber: null,
		extension: 'png',
		language: 'PT',
	},

	// ── Double-faced card with // ─────────────────────────────────────────────
	{
		input: 'Cut // Ribbons.jpg',
		cardName: 'Cut // Ribbons',
		variants: [],
		bracketTags: [],
		setCode: null,
		collectorNumber: null,
		extension: 'jpg',
		language: null,
	},

	// ── Drive file ID in parens (should be ignored) ──────────────────────────
	{
		input:
			'Zurzoth, Chaos Rider (Borderless) [JMP] {27} (10ggY_0aKU10HORfLGPC8ky5Cx7Kih9h7) (1).png',
		cardName: 'Zurzoth, Chaos Rider',
		variants: ['Borderless'],
		bracketTags: ['JMP'],
		setCode: 'JMP',
		collectorNumber: '27',
		extension: 'png',
		language: null,
	},

	// ── Language prefix {DE}, {FR} ───────────────────────────────────────────
	{
		input: '{DE} Counterspell [TSR] {73}.png',
		cardName: 'Counterspell',
		variants: [],
		bracketTags: ['TSR'],
		setCode: 'TSR',
		collectorNumber: '73',
		extension: 'png',
		language: 'DE',
	},
	{
		input: `{FR} ${RAGAVAN}.png`,
		cardName: RAGAVAN,
		variants: [],
		bracketTags: [],
		setCode: null,
		collectorNumber: null,
		extension: 'png',
		language: 'FR',
	},

	// ── Brackets before card name (bracket-prefix pattern) ──────────────────
	{
		input: '[B-C] Black Lotus (Pinlines).png',
		cardName: 'Black Lotus',
		variants: ['Pinlines'],
		bracketTags: ['B-C'],
		setCode: null,
		collectorNumber: null,
		extension: 'png',
		language: null,
	},
	{
		input: '[Extended] Black Lotus.png',
		cardName: 'Black Lotus',
		variants: [],
		bracketTags: ['Extended'],
		setCode: null,
		collectorNumber: null,
		extension: 'png',
		language: null,
	},

	// ── Numeric sort prefix: bare digit(s) + space only (no separator char) ─
	{
		input: '9 Blackcleave Cliffs.png',
		cardName: 'Blackcleave Cliffs',
		variants: [],
		bracketTags: [],
		setCode: null,
		collectorNumber: null,
		extension: 'png',
		language: null,
	},
	{
		input: '12 Sol Ring.png',
		cardName: 'Sol Ring',
		variants: [],
		bracketTags: [],
		setCode: null,
		collectorNumber: null,
		extension: 'png',
		language: null,
	},

	// ── Parens with comma-separated values = equivalent to bracket tags ──────
	// Per MPC spec: "(NSFW, Full Art)" should be treated the same as "[NSFW, Full Art]"
	{
		input: 'Image A (NSFW, Full Art).png',
		cardName: 'Image A',
		variants: ['NSFW', 'Full Art'],
		bracketTags: [],
		setCode: null,
		collectorNumber: null,
		extension: 'png',
		language: null,
	},
	{
		input: `${RAGAVAN} (Extended, Borderless).png`,
		cardName: RAGAVAN,
		variants: ['Extended', 'Borderless'],
		bracketTags: [],
		setCode: null,
		collectorNumber: null,
		extension: 'png',
		language: null,
	},

	// ── 3-char ISO-639-1 language code ───────────────────────────────────────
	{
		input: '{ZHO} Lightning Bolt.png',
		cardName: LIGHTNING_BOLT,
		variants: [],
		bracketTags: [],
		setCode: null,
		collectorNumber: null,
		extension: 'png',
		language: 'ZHO',
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
	if (result.setCode !== c.setCode)
		errors.push(`  setCode: got "${result.setCode}", want "${c.setCode}"`);
	if (result.collectorNumber !== c.collectorNumber)
		errors.push(`  collectorNumber: got "${result.collectorNumber}", want "${c.collectorNumber}"`);
	if (result.extension !== c.extension)
		errors.push(`  extension: got "${result.extension}", want "${c.extension}"`);
	if (result.language !== c.language)
		errors.push(`  language: got "${result.language}", want "${c.language}"`);

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
