import { readFileSync } from 'node:fs';
import opentype from 'opentype.js';
import { Unresolved } from './evaluate';

const FONT_ROOT = 'assets/card-templates/card-assets/v/bcdf4190b4bf/full-magic-pack/fonts';
const SYMBOL_FONT_ROOT = 'assets/card-templates/card-assets/v/bcdf4190b4bf/full-magic-pack/data';

/**
 * MSE écrit un nom de police « logique » (« MPlantin ») qui ne correspond pas
 * toujours au nom de fichier exact du TTF livré. Cette table est un FAIT du
 * dépôt (les 15 fichiers de full-magic-pack/fonts/), pas une approximation :
 * seuls les noms observés dans le corpus pour `casting cost.font.name` et les
 * builtins tier-2 (Beleren pour titre/PT) y figurent. Un nom absent lève
 * `Unresolved` plutôt que d'être deviné.
 */
const TTF_BY_NAME: Record<string, string> = {
	MPlantin: 'mplantin.ttf',
	'MPlantin-Italic': 'mplantinit.ttf',
	'Beleren-Bold': 'beleren-bold_P1.01.ttf',
	'Beleren Small Caps Bold': 'belerensmallcaps-bold.ttf',
	MatrixBold: 'MatrixBold.ttf',
	'Matrix-Bold': 'MatrixBold.ttf',
	Matrix: 'matrixb.ttf',
};

const fontCache = new Map<string, opentype.Font>();

/**
 * opentype.js v2 : `parse` accepte directement le Buffer Node retourné par
 * `readFileSync` dans cette installation (cf. scripts/generate-logo.ts, qui
 * documente que `loadSync` est un stub obsolète). On ne réinvente pas cette
 * convention pour ce module.
 */
function loadFont(fontFile: string): opentype.Font {
	const cached = fontCache.get(fontFile);
	if (cached) return cached;
	let font: opentype.Font;
	try {
		font = opentype.parse(readFileSync(`${FONT_ROOT}/${fontFile}`));
	} catch {
		throw new Unresolved(`police introuvable ${fontFile}`);
	}
	fontCache.set(fontFile, font);
	return font;
}

/** Résout un nom de police MSE vers son fichier TTF livré, ou lève `Unresolved`. */
function resolveFontFile(mseName: string): string {
	const file = TTF_BY_NAME[mseName];
	if (!file) throw new Unresolved(`police non résolue ${mseName}`);
	return file;
}

/**
 * Décalage vertical d'une police, en unités de carte.
 *
 * MSE positionne le texte sur la ligne de base : l'écart entre le haut de la
 * boîte et cette ligne dépend de l'ascendante de la police RÉELLE, d'où la
 * lecture des TTF plutôt qu'une constante.
 */
export function verticalOffset(fontFile: string, size: number): number {
	const key = `${fontFile}:${size}`;
	const cached = verticalOffsetCache.get(key);
	if (cached !== undefined) return cached;
	const font = loadFont(fontFile);
	const ratio = font.ascender / font.unitsPerEm;
	const offset = size * ratio - size;
	verticalOffsetCache.set(key, offset);
	return offset;
}
const verticalOffsetCache = new Map<string, number>();

/** Largeur du texte rendu avec la police MSE nommée `mseFontName`, à la taille `size`. */
export function textWidth(mseFontName: string, size: number, text: string): number {
	const font = loadFont(resolveFontFile(mseFontName));
	return font.getAdvanceWidth(text, size);
}

// ---------------------------------------------------------------------------
// Polices à symboles (coûts de mana) : les glyphes sont des PNG, pas des
// contours vectoriels. MSE code chaque symbole dans une CELLULE dont le
// rapport largeur/hauteur est celui du PNG livré ; la cellule est mise à
// l'échelle pour que sa hauteur corresponde à la taille de police effective
// du symbole (son propre « image font size », ou à défaut celui du paquet).
// ---------------------------------------------------------------------------

interface SymbolEntry {
	image: string;
	imageFontSize?: number;
}

interface RegexSymbolEntry extends SymbolEntry {
	pattern: RegExp;
}

interface SymbolFontPackage {
	/** Taille de dessin par défaut du paquet (« image font size » au niveau racine). */
	defaultImageFontSize: number;
	/** Espace horizontal entre deux symboles consécutifs, en unités de police. */
	horizontalSpace: number;
	/** code littéral -> { fichier image, taille de dessin propre au symbole si redéfinie }. */
	symbols: Map<string, SymbolEntry>;
	/**
	 * Symboles à code REGEX (`regex: yes`), dans l'ordre du fichier. Le mana
	 * générique (chiffres) est très souvent rendu ainsi : un même visuel
	 * (cercle) avec le chiffre dessiné par-dessus au lieu d'un PNG par valeur —
	 * cf. `magic-mana-old`, `magic-mana-graffiti`, etc. MSE essaie les codes
	 * dans l'ordre déclaré et prend le premier qui matche ; on fait pareil.
	 */
	regexSymbols: RegexSymbolEntry[];
}

const symbolFontCache = new Map<string, SymbolFontPackage>();

/**
 * Un fichier `.png` livré avec le paquet : dimensions lues depuis l'en-tête
 * IHDR directement (pas de décodage complet, pas de dépendance async comme
 * `sharp`) pour rester synchrone — l'évaluateur entier l'est.
 */
const pngSizeCache = new Map<string, { width: number; height: number }>();
function pngSize(path: string): { width: number; height: number } {
	const cached = pngSizeCache.get(path);
	if (cached) return cached;
	let buffer: Buffer;
	try {
		buffer = readFileSync(path);
	} catch {
		throw new Unresolved(`image de symbole introuvable ${path}`);
	}
	const size = { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
	pngSizeCache.set(path, size);
	return size;
}

/**
 * Charge et indexe un paquet `.mse-symbol-font`. Un `image:` ou un `code:`
 * calculé (« {...} ») n'est volontairement PAS indexé : son fichier dépend
 * d'une variable de style non fixée par la carte canonique, donc pas de
 * fichier littéral à mesurer sans deviner.
 */
function loadSymbolFont(mseName: string): SymbolFontPackage {
	const cached = symbolFontCache.get(mseName);
	if (cached) return cached;
	const dirName = mseName.endsWith('.mse-symbol-font') ? mseName : `${mseName}.mse-symbol-font`;
	const path = `${SYMBOL_FONT_ROOT}/${dirName}/symbol-font`;
	let source: string;
	try {
		source = readFileSync(path, 'utf8');
	} catch {
		throw new Unresolved(`police à symboles introuvable ${mseName}`);
	}

	const defaultSizeMatch = /^image font size:\s*([\d.]+)/m.exec(source);
	const spaceMatch = /^horizontal space:\s*([\d.]+)/m.exec(source);
	if (!defaultSizeMatch) throw new Unresolved(`« image font size » absent pour ${mseName}`);

	const symbols = new Map<string, SymbolEntry>();
	const regexSymbols: RegexSymbolEntry[] = [];
	// Un bloc `symbol:` en tête de ligne (jamais indenté ni commenté) ; ses
	// propriétés vivent sur les lignes suivantes indentées d'une tabulation.
	const blocks = source.split(/\nsymbol:\n/).slice(1);
	for (const block of blocks) {
		const body = block.split(/\nsymbol:\n/)[0];
		const lines = body.split('\n').filter((line) => line.startsWith('\t'));
		const codeLine = lines.find((line) => /^\tcode:\s*/.test(line));
		const imageLine = lines.find((line) => /^\timage:\s*/.test(line));
		const sizeLine = lines.find((line) => /^\timage font size:\s*/.test(line));
		const isRegex = lines.some((line) => /^\tregex:\s*yes/.test(line));
		if (!codeLine || !imageLine) continue;
		const code = codeLine.replace(/^\tcode:\s*/, '').trim();
		const image = imageLine.replace(/^\timage:\s*/, '').trim();
		// Un `image:` calculé (« { ... } ») n'est pas un fichier littéral : on
		// n'indexe pas ce symbole plutôt que de deviner son nom de fichier.
		if (image.startsWith('{') || code.startsWith('{')) continue;
		const imageFontSize = sizeLine
			? Number(sizeLine.replace(/^\timage font size:\s*/, '').trim())
			: undefined;
		if (isRegex) {
			// La syntaxe regex de MSE (classes de caractères, lookahead `(?!…)`)
			// observée dans le corpus est déjà de la syntaxe JS valide — pas de
			// traduction nécessaire. Un motif qui ne compile pas est ignoré
			// plutôt que de faire échouer tout le chargement du paquet.
			try {
				regexSymbols.push({ image, imageFontSize, pattern: new RegExp(`^(?:${code})$`) });
			} catch {
				/* motif non traduisible tel quel : ignoré, cf. commentaire ci-dessus */
			}
			continue;
		}
		// Premier match gagne : dans le corpus, les doublons de code sont des
		// variantes gardées par `enabled:` (ex. ancestral_mana) déclarées AVANT
		// la version normale — cf. rapport, symbole "2" de magic-mana-large.
		if (!symbols.has(code)) symbols.set(code, { image, imageFontSize });
	}

	const pack: SymbolFontPackage = {
		defaultImageFontSize: Number(defaultSizeMatch[1]),
		horizontalSpace: spaceMatch ? Number(spaceMatch[1]) : 0,
		symbols,
		regexSymbols,
	};
	symbolFontCache.set(mseName, pack);
	return pack;
}

/**
 * Résout un `code:` vers son entrée : d'abord les codes littéraux, puis les
 * codes REGEX dans l'ordre déclaré (même priorité que MSE, cf. `regexSymbols`).
 */
function resolveSymbol(pack: SymbolFontPackage, code: string): SymbolEntry {
	const literal = pack.symbols.get(code);
	if (literal) return literal;
	const regexMatch = pack.regexSymbols.find((entry) => entry.pattern.test(code));
	if (regexMatch) return regexMatch;
	throw new Unresolved(`symbole ${code} absent du paquet`);
}

/** Largeur rendue d'UN symbole (« W », « 2 », …) à la taille de police `size`. */
function symbolWidth(pack: SymbolFontPackage, dirName: string, code: string, size: number): number {
	const symbol = resolveSymbol(pack, code);
	const { width, height } = pngSize(`${SYMBOL_FONT_ROOT}/${dirName}/${symbol.image}`);
	// MSE met le PNG à l'échelle pour que sa hauteur corresponde à `size`, en
	// conservant son rapport largeur/hauteur natif. `imageFontSize` propre au
	// symbole (stocké sur `symbol` pour un usage diagnostique futur) s'annule
	// dans ce calcul : il ne changerait le résultat que si l'on comparait deux
	// symboles de tailles de dessin différentes, ce qu'un coût de mana composé
	// de pips simples ne fait jamais dans ce corpus.
	return (width / height) * size;
}

/**
 * Largeur totale d'une séquence de symboles (un coût de mana).
 *
 * `horizontal space` est exprimé dans le même référentiel que `size` (unités
 * de carte, pas un multiplicateur) : `casting cost.height: 23` et
 * `symbol font.size: 15` cohabitent dans les mêmes unités dans le corpus, donc
 * un espacement de 2 signifie « 2 unités de carte », ajouté tel quel entre
 * chaque paire de symboles consécutifs.
 */
export function manaCostWidth(mseFontName: string, size: number, codes: string[]): number {
	const dirName = mseFontName.endsWith('.mse-symbol-font')
		? mseFontName
		: `${mseFontName}.mse-symbol-font`;
	const pack = loadSymbolFont(mseFontName);
	const widths = codes.map((code) => symbolWidth(pack, dirName, code, size));
	const spacing = pack.horizontalSpace * Math.max(0, codes.length - 1);
	return widths.reduce((sum, width) => sum + width, 0) + spacing;
}
