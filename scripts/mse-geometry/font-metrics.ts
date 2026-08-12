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
	// Ajoutés pour les métriques de ligne de base (`fontRatios`) : ce sont les
	// noms tels que le corpus les écrit dans `name`/`type`/`text`/`pt`, alors
	// que les entrées ci-dessus couvraient les noms vus dans `casting cost` et
	// les builtins. « Beleren Bold » (espace) est la forme la plus fréquente du
	// corpus — 186 déclarations — et manquait, seule « Beleren-Bold » figurait.
	'Beleren Bold': 'beleren-bold_P1.01.ttf',
	ModMatrix: 'ModMatrix.ttf',
	MagicMedieval: 'MagicMedieval.ttf',
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

/**
 * Table de recherche insensible à la casse, dérivée de `TTF_BY_NAME`.
 *
 * Le corpus écrit « MPlantin » et « Mplantin » pour la même police (3 gabarits
 * sur la seconde forme). Énumérer les variantes de casse à la main serait une
 * source d'oublis silencieux — un nom non résolu ne lève pas d'erreur visible,
 * il retire juste la métrique.
 */
const TTF_BY_LOWER_NAME = new Map(
	Object.entries(TTF_BY_NAME).map(([name, file]) => [name.toLowerCase(), file])
);

/** Résout un nom de police MSE vers son fichier TTF livré, ou lève `Unresolved`. */
function resolveFontFile(mseName: string): string {
	const file = TTF_BY_LOWER_NAME.get(mseName.trim().toLowerCase());
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

/**
 * Ascendante et descendante d'une police, en fraction de sa taille.
 *
 * C'est ce qui permet au canvas de POSER la ligne de base : le haut des glyphes
 * est à `baseline - size × ascent`, le bas à `baseline + size × descent`. Ces
 * ratios varient beaucoup d'une police à l'autre (mesuré : Beleren 0.939,
 * MPlantin 0.774, MagicMedieval 0.749), donc aucune constante ne peut convenir
 * aux trois — ce qui est précisément le défaut des décalages codés en dur.
 *
 * `descender` est négatif dans un TTF ; on le rend positif, plus naturel à
 * l'usage (`baseline + size × descent`).
 *
 * Rend `undefined` pour une police non livrée : l'appelant omet alors la
 * métrique plutôt que d'en inventer une.
 */
export function fontRatios(mseName: string): { ascent: number; descent: number } | undefined {
	try {
		const font = loadFont(resolveFontFile(mseName));
		return {
			ascent: font.ascender / font.unitsPerEm,
			descent: Math.abs(font.descender) / font.unitsPerEm,
		};
	} catch {
		return undefined;
	}
}

/**
 * Chaîne de référence pour mesurer l'ENCRE d'une police.
 *
 * Volontairement FIXE et indépendante de la carte : mesurer l'encre du texte
 * réel ferait bouger la ligne de type selon les caractères présents — la même
 * carte en français et en anglais ne s'aligneraient plus.
 *
 * `Hb` = capitale + hampe de bas-de-casse, soit la hauteur d'ASCENDANTE. C'est
 * la mesure vérifiée sur le corpus : elle rend exactement la même valeur que les
 * lignes de type réelles, française comme anglaise (Beleren 0.7402, Matrix
 * 0.6330, MPlantin 0.6990 dans les trois cas).
 *
 * Les capitales ACCENTUÉES en sont délibérément exclues : `É` monte bien plus
 * haut (Beleren 0.9268 contre 0.7402) mais MSE ne descend pas la ligne pour
 * autant — l'accent déborde vers le haut, comme sur les cartes imprimées. La
 * faire entrer dans la référence enfoncerait toutes les lignes de type de
 * ~2.5 unités, soit le défaut inverse de celui qu'on corrige.
 */
const INK_REFERENCE = 'Hb';

/** Glyphes descendants, pour le bas de l'encre (`INK_REFERENCE` n'en a aucun). */
const DESCENDER_REFERENCE = 'gpqy';

/**
 * Ascendante et descendante de l'ENCRE, en fraction de la taille.
 *
 * Distinctes de `fontRatios`, et c'est tout l'objet de cette fonction : `hhea`
 * décrit la LIGNE (accents et interligne interne compris), l'encre décrit les
 * GLYPHES. MSE aligne ses champs `alignment: top` sur l'encre, pas sur la ligne.
 *
 * L'écart n'est pas anecdotique et varie par police (mesuré sur les TTF du
 * corpus) : Beleren Bold réserve 0.196 em d'interligne au-dessus de son encre,
 * MPlantin 0.075, Matrix zéro. Aucune constante ne peut donc corriger les trois,
 * ce qui est la raison même de lire le TTF ici plutôt que d'ajuster au canvas.
 *
 * Repère : `getPath` dessine à la ligne de base en coordonnées écran (y vers le
 * BAS), donc l'encre au-dessus de la ligne de base a un y négatif — d'où le
 * signe sur `y1`.
 *
 * Rend `undefined` pour une police non livrée, comme `fontRatios` : l'appelant
 * omet la métrique plutôt que d'en inventer une.
 */
/**
 * Hauteur de CAPITALE, en fraction de la taille.
 *
 * C'est la bande que l'œil lit comme « le texte » : sur une carte imprimée, le
 * nom et la ligne de type sont centrés sur elle, la descendante étant laissée
 * libre de pendre en dessous. Centrer le bloc complet (ascendante + descendante)
 * réserve au contraire une place vide sous les mots qui n'ont pas de jambage —
 * « Ekthi, Contaminator Priest » n'en a aucun — et remonte visiblement le texte.
 *
 * Mesurée sur le `H`, présent dans toutes les polices du corpus, plutôt que lue
 * dans `OS/2.sCapHeight` : Matrix et MPlantin ne renseignent pas ce champ.
 */
export function capRatio(mseName: string): number | undefined {
	try {
		const font = loadFont(resolveFontFile(mseName));
		const box = font.getPath('H', 0, 0, 100).getBoundingBox();
		if (!Number.isFinite(box.y1)) return undefined;
		return -box.y1 / 100;
	} catch {
		return undefined;
	}
}

export function inkRatios(mseName: string): { ascent: number; descent: number } | undefined {
	try {
		const font = loadFont(resolveFontFile(mseName));
		// Taille de mesure arbitraire : les ratios rendus sont sans dimension, elle
		// s'annule à la division. 100 garde simplement la lecture facile en debug.
		const size = 100;
		const ascentBox = font.getPath(INK_REFERENCE, 0, 0, size).getBoundingBox();
		// La descendante se mesure sur ses propres glyphes : `Hb` n'en a aucun.
		const descentBox = font.getPath(DESCENDER_REFERENCE, 0, 0, size).getBoundingBox();
		if (!Number.isFinite(ascentBox.y1) || !Number.isFinite(descentBox.y2)) return undefined;
		return { ascent: -ascentBox.y1 / size, descent: descentBox.y2 / size };
	} catch {
		return undefined;
	}
}

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
