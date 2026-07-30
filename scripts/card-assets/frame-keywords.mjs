// scripts/card-assets/frame-keywords.mjs
//
// Extraction des mots-clés d'un gabarit MSE, à partir de TOUTES ses sources :
// l'id, le nom, le short name et le chemin `installer group` déclaré.
//
// Deux règles portent ce fichier (cf. le spec) :
//
// 1. MOTS ENTIERS, jamais de sous-chaîne. C'est ce qui distingue un indice d'une
//    collision : `/box/` matchait « Taller Textbox » et classait ce gabarit en
//    « packaging ». On découpe sur tout ce qui n'est pas alphanumérique.
// 2. RIEN N'EST ARBITRÉ. On garde les 188 mots-clés, y compris les mots de
//    phrase (`after`, `edition`). Les écarter demanderait de juger ce qui est un
//    mot-clé — précisément l'arbitrage que ce chantier supprime.

/** Jetons sans pouvoir discriminant. Mesuré, pas supposé. */
const STOPWORDS = new Set([
	// Présent sur 107 des 109 gabarits.
	'magic',
	// Mots de structure du chemin `installer group`.
	'card',
	'cards',
	'style',
	'normal',
]);

/**
 * Variantes d'écriture d'une MÊME notion, fusionnées.
 *
 * Table explicite et non heuristique : elle se lit et se corrige. La fusion est
 * CONSERVATRICE — elle ne rapproche jamais deux notions voisines. `flip` et
 * `double_faced` restent donc distincts : un flip a une seule face imprimée
 * qu'on pivote, une DFC en a deux.
 */
const SYNONYMS = new Map([
	['planeswalkers', 'planeswalker'],
	['walkers', 'planeswalker'],
	['tokens', 'token'],
	['gods', 'god'],
	['splits', 'split'],
	['promotional', 'promo'],
	['doublefaced', 'double_faced'],
	['fpm', 'firepenguinmaster'],
]);

/** Découpe en mots entiers minuscules. */
export function tokenize(text) {
	return String(text ?? '')
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean);
}

/**
 * Forme canonique d'un mot-clé, ou `null` s'il est écarté.
 *
 * Ordre : minuscules -> suppression du suffixe « cards » -> synonymes ->
 * espaces en `_`. Les jetons d'un seul caractère et purement numériques sont
 * écartés : ils ne désignent rien (`1`, `2`, `d`, `w`).
 */
export function normalizeKeyword(raw) {
	const cleaned = String(raw ?? '')
		.toLowerCase()
		.trim()
		// eslint-disable-next-line sonarjs/super-linear-regex -- safe: un mot-clé de gabarit, longueur bornée
		.replace(/\s+cards?$/, '')
		.trim();
	if (!cleaned) return null;

	const collapsed = cleaned
		.replace(/[^a-z0-9]+/g, '_')
		// eslint-disable-next-line sonarjs/super-linear-regex -- safe: un mot-clé de gabarit, longueur bornée
		.replace(/^_+|_+$/g, '');
	if (!collapsed) return null;

	const canonical = SYNONYMS.get(collapsed) ?? collapsed;
	if (STOPWORDS.has(canonical)) return null;
	if (canonical.length < 2) return null;
	if (/^\d+$/.test(canonical)) return null;
	return canonical;
}

/**
 * Union des mots-clés de toutes les sources.
 *
 * Les deux sources s'AJOUTENT, elles ne s'écrasent pas — vérifié : le chemin
 * seul perdrait `magic-m15-token-invention` (chemin « devoid cards », id
 * « token »), `magic-m15-scroll-demon-planeswalker` et
 * `magic-m15-outlaws-planeswalker` (chemin « normal cards »).
 *
 * Nuance de découpage : un segment de chemin est pris EN ENTIER (« double
 * faced » est un mot-clé, pas deux), parce que c'est une unité déclarée. L'id et
 * le nom sont du texte libre, donc découpés en mots.
 */
export function extractKeywords({ id, name, shortName, installerGroup }) {
	const keywords = new Set();

	for (const source of [id, name, shortName]) {
		for (const token of tokenize(source)) {
			const keyword = normalizeKeyword(token);
			if (keyword) keywords.add(keyword);
		}
	}

	// Segments 3+ du chemin : les deux premiers sont le namespace de jeu et la
	// famille, qui sont exposés séparément via `installer_group`.
	const segments = String(installerGroup ?? '')
		.split('/')
		.map((segment) => segment.trim())
		.filter(Boolean);
	for (const segment of segments.slice(2)) {
		const keyword = normalizeKeyword(segment);
		if (keyword) keywords.add(keyword);
	}

	return [...keywords].sort();
}
