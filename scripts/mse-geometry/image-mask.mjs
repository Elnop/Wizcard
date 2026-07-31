// scripts/mse-geometry/image-mask.mjs
//
// Règle d'extraction du masque déclaré par le bloc `image:` d'un fichier de
// style MSE (`mask: …`). Module PUR (aucun accès filesystem) partagé par :
// - `style-file.ts` (parseur complet, avec résolution des `include file:`) ;
// - `generate-manifests.mjs` (ingestion, qui n'a besoin que du fichier `style`
//   propre — les masques ne sont jamais hérités par inclusion dans le corpus).
//
// Même précédent que `crown-compat.mjs` / `frame-keywords.mjs` : une règle
// d'extraction, un seul endroit, importée depuis du `.ts` (`allowJs`) comme
// depuis du `.mjs`.

/**
 * Masque déclaré par un champ. SEULES deux formes résolvent, dans le corpus :
 *
 *   mask: image_mask.png
 *   mask:
 *     script: if styling.image_size == "extended" then "imagemask_extended.png"
 *             else "imagemask_standard.png"
 *
 * Le studio n'expose pas l'option `image_size` de MSE : on retient la branche
 * `else`, qui est le défaut de MSE lui-même.
 *
 * Toute autre forme d'expression donne délibérément AUCUN masque — le rendu
 * retombe alors sur la géométrie mesurée, plutôt que d'inventer un nom de
 * fichier. Deux cas concrets du corpus ont montré qu'une troisième passe
 * générique (« n'importe quel `.png` entre guillemets ») est un pari, pas une
 * extraction :
 * - une concaténation, ex. `{ "image_" + (if … then "extended_" else "") +
 *   … + "mask.png" }` (`magic-genevensis-10-saga`, `-20-battle`,
 *   `-80-planechase`, `magic-the-ring-rule-card_744`) : la passe générique y
 *   attrapait le fragment littéral `"mask.png"`, un fichier qui n'existe même
 *   pas sur disque (les vrais fichiers sont `image_mask.png`,
 *   `image_extended_mask.png`, `image_extended_leaf_mask.png`) ;
 * - `else nil` (pas de masque applicable), ex. `if styling.image_size ==
 *   "extended" then "imagemask_extended.png" else nil`
 *   (`magic-new-omega-doublefaced`, `magic-new-unset-gmorph`) : la regex
 *   `else "..."` ne matchait pas `nil` (non cité), donc la passe générique
 *   retombait sur la PREMIÈRE chaîne citée du script — la branche `then`,
 *   exactement l'inverse de la branche applicable.
 *
 * Les variantes `_inv` sont écartées : leur polarité est inversée (centre noir,
 * coins blancs), les appliquer effacerait le cadre au lieu de la fenêtre.
 *
 * @param {string} raw
 * @returns {string | undefined}
 */
export function maskFileFrom(raw) {
	const literal = /^\s*([\w.-]+\.png)\s*$/i.exec(raw);
	const candidate = literal ? literal[1] : /else\s+"([\w.-]+\.png)"/i.exec(raw)?.[1];
	if (!candidate) return undefined;
	if (/_inv\d*\.png$/i.test(candidate)) return undefined;
	return candidate;
}

/**
 * Ligne « mask: … » du champ `image` UNIQUEMENT — `border_mask` et
 * `foil_mask` répondent à d'autres besoins et sont hors périmètre (cf.
 * `maskFileFrom`). Deux formes : littérale sur la même ligne, ou un sous-bloc
 * `script:` à trois tabulations quand la déclaration est pilotée par script.
 */
// eslint-disable-next-line sonarjs/super-linear-regex -- safe: une ligne de style, longueur bornée
export const IMAGE_MASK_LINE = /^\t\tmask\s*:\s*(.*)$/;
// eslint-disable-next-line sonarjs/super-linear-regex -- safe: une ligne de style, longueur bornée
export const IMAGE_MASK_SCRIPT_LINE = /^\t\t\tscript\s*:\s*(.+?)\s*$/;

/**
 * Isole le bloc du champ `image:` (une tabulation) dans le texte d'un fichier
 * de style, jusqu'au prochain champ racine (ou à la fin du bloc `card
 * style:`). Même profondeur que `cardStyleBlock` dans `style-file.ts`, mais
 * limité à ce seul champ : `generate-manifests.mjs` n'a besoin que de la
 * déclaration `mask:`, jamais des autres champs de géométrie.
 *
 * @param {string} source
 * @returns {string[]}
 */
function imageFieldBlock(source) {
	const lines = source.split(/\r?\n/);
	const start = lines.findIndex((line) => /^\timage\s*:\s*$/.test(line));
	if (start === -1) return [];
	const block = [];
	for (const line of lines.slice(start + 1)) {
		if (line.trim() && !line.startsWith('\t\t')) break;
		block.push(line);
	}
	return block;
}

/**
 * Nom de fichier du masque d'illustration déclaré par le champ `image:` d'un
 * fichier de style MSE brut (pas de résolution d'`include file:` : les
 * masques ne sont jamais hérités par inclusion dans le corpus). Même règle
 * que `style-file.ts` (`handleImageMask` + `maskFileFrom`), appliquée ici
 * directement sur le texte source plutôt que via l'accumulateur de parseur
 * complet.
 *
 * @param {string} source
 * @returns {string | undefined}
 */
export function imageMaskNameFrom(source) {
	let mask;
	for (const line of imageFieldBlock(source)) {
		const literal = IMAGE_MASK_LINE.exec(line);
		if (literal && literal[1].trim()) {
			mask = maskFileFrom(literal[1]) ?? mask;
			continue;
		}
		const script = IMAGE_MASK_SCRIPT_LINE.exec(line);
		if (script) mask = maskFileFrom(script[1]) ?? mask;
	}
	return mask;
}
