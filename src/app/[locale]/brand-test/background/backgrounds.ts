/**
 * Fonds candidats pour les pages de recherche, tous accordés à la DA Wizcard :
 * nuit `#0b0c10`, or/laiton `#c9a84c`/`#b5a06c`, jade `#4a8c6f`, navy `#0f1b2d`.
 *
 * Chaque `layers` est empilé dans un `background:` CSS unique (première couche =
 * au-dessus). Les motifs sont des SVG inline en data-uri (aucune requête réseau,
 * tileables via background-size). L'idée : maximiser les variantes pour choisir.
 */

const NIGHT = '#0b0c10';
const NAVY = '#0f1b2d';
const GOLD = '#c9a84c';

/** Encode un SVG en data-uri utilisable dans `url(...)`. */
function svg(markup: string): string {
	return `url("data:image/svg+xml,${encodeURIComponent(markup)}")`;
}

/** Un tile SVG carré `size`, contenu arbitraire, couleur/opacité au choix. */
function tile(size: number, inner: string): string {
	return svg(
		`<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>${inner}</svg>`
	);
}

export type BackgroundVariant = {
	id: string;
	label: string;
	/** Note courte sur l'intention du motif. */
	note: string;
	/** Valeur CSS complète pour `background` (couches + couleur de base). */
	background: string;
	/** background-size éventuel (répétition du tile). */
	backgroundSize?: string;
};

// --- Symboles réutilisés dans les tiles -----------------------------------

/** Étoile à 4 branches (éclat arcanique), centrée en (cx,cy), rayon r. */
const spark = (cx: number, cy: number, r: number, fill: string, op: number) =>
	`<path d='M${cx} ${cy - r} L${cx + r * 0.25} ${cy - r * 0.25} L${cx + r} ${cy} L${cx + r * 0.25} ${cy + r * 0.25} L${cx} ${cy + r} L${cx - r * 0.25} ${cy + r * 0.25} L${cx - r} ${cy} L${cx - r * 0.25} ${cy - r * 0.25} Z' fill='${fill}' fill-opacity='${op}'/>`;

const ring = (cx: number, cy: number, r: number, stroke: string, op: number, sw = 1) =>
	`<circle cx='${cx}' cy='${cy}' r='${r}' fill='none' stroke='${stroke}' stroke-opacity='${op}' stroke-width='${sw}'/>`;

const pip = (cx: number, cy: number, r: number, fill: string, op: number) =>
	`<circle cx='${cx}' cy='${cy}' r='${r}' fill='${fill}' fill-opacity='${op}'/>`;

/**
 * Grain procédural : un tile SVG rempli de bruit `feTurbulence` fractal. `freq`
 * pilote la finesse (haut = plus fin), `op` l'intensité. C'est le vrai grain
 * (pas un semis de points), tileable et sans image externe.
 */
const noise = (size: number, freq: number, op: number, seed = 3) =>
	svg(
		`<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>` +
			`<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='2' seed='${seed}' stitchTiles='stitch'/>` +
			`<feColorMatrix type='saturate' values='0'/></filter>` +
			// `#n` en clair : encodeURIComponent le transforme en %23 une seule fois
			// (un %23 déjà encodé ici deviendrait %2523 et casserait la référence).
			`<rect width='100%' height='100%' filter='url(#n)' opacity='${op}'/></svg>`
	);

export const BACKGROUNDS: BackgroundVariant[] = [
	{
		id: 'plain',
		label: '00 — Actuel (témoin)',
		note: 'Le fond uni actuel, pour référence.',
		background: NIGHT,
	},
	{
		id: 'radial-halo',
		label: '01 — Halo radial navy',
		note: 'Lueur douce navy → nuit, sans motif. Le plus sobre.',
		background: `radial-gradient(120% 90% at 50% -10%, ${NAVY} 0%, ${NIGHT} 60%)`,
	},
	{
		id: 'gold-vignette',
		label: '02 — Vignette dorée haute',
		note: 'Halo doré très faible en haut, vignette sombre sur les bords.',
		background: `radial-gradient(80% 55% at 50% -8%, rgba(201,168,76,0.10) 0%, rgba(201,168,76,0) 55%), radial-gradient(140% 120% at 50% 50%, ${NIGHT} 55%, #060609 100%)`,
	},
	{
		id: 'mana-grid',
		label: '03 — Grille de pips mana',
		note: '5 pips (W/U/B/R/G) en filigrane doré, semis régulier.',
		background: `${tile(
			120,
			pip(20, 24, 3, '#f8e7b9', 0.05) +
				pip(60, 24, 3, '#0e68ab', 0.06) +
				pip(100, 24, 3, '#cfc6c4', 0.05) +
				pip(40, 84, 3, '#d3202a', 0.06) +
				pip(80, 84, 3, '#3aa06a', 0.06)
		)}, ${NIGHT}`,
		backgroundSize: '120px 120px',
	},
	{
		id: 'spark-lattice',
		label: '04 — Treillis d’éclats',
		note: 'Éclats arcaniques 4 branches, or atténué, maillage diagonal.',
		background: `${tile(
			90,
			spark(22, 22, 7, GOLD, 0.07) +
				spark(67, 67, 7, GOLD, 0.07) +
				spark(67, 22, 3, GOLD, 0.05) +
				spark(22, 67, 3, GOLD, 0.05)
		)}, radial-gradient(120% 100% at 50% 0%, ${NAVY} 0%, ${NIGHT} 65%)`,
		backgroundSize: '90px 90px, cover',
	},
	{
		id: 'arcane-rings',
		label: '05 — Anneaux arcaniques',
		note: 'Cercles concentriques fins, glyphe central, ton or.',
		background: `${tile(
			160,
			ring(80, 80, 54, GOLD, 0.05) +
				ring(80, 80, 34, GOLD, 0.06) +
				spark(80, 80, 6, GOLD, 0.08) +
				pip(80, 26, 1.5, GOLD, 0.06) +
				pip(80, 134, 1.5, GOLD, 0.06) +
				pip(26, 80, 1.5, GOLD, 0.06) +
				pip(134, 80, 1.5, GOLD, 0.06)
		)}, ${NIGHT}`,
		backgroundSize: '160px 160px',
	},
	{
		id: 'hex-weave',
		label: '06 — Trame hexagonale',
		note: 'Fines lignes hexagonales, évoque un plateau / réseau de mana.',
		background: `${tile(
			56,
			`<path d='M14 0 L42 0 L56 24 L42 48 L14 48 L0 24 Z' fill='none' stroke='${GOLD}' stroke-opacity='0.05' stroke-width='1'/>`
		)}, radial-gradient(130% 110% at 50% 0%, ${NAVY} 0%, ${NIGHT} 70%)`,
		backgroundSize: '56px 48px, cover',
	},
	{
		id: 'diagonal-brass',
		label: '07 — Hachures laiton',
		note: 'Fines diagonales laiton, texture textile discrète.',
		background: `repeating-linear-gradient(45deg, rgba(181,160,108,0.045) 0 1px, transparent 1px 14px), ${NIGHT}`,
	},
	{
		id: 'runes-column',
		label: '08 — Colonnes de runes',
		note: 'Glyphes verticaux type grimoire, or très faible.',
		background: `${tile(
			70,
			`<g stroke='${GOLD}' stroke-opacity='0.06' stroke-width='1' fill='none'>` +
				`<path d='M35 8 v18 M28 14 h14'/>` +
				`<path d='M18 40 l8 10 l-8 10'/>` +
				`<path d='M52 40 l-8 10 l8 10'/>` +
				`<circle cx='35' cy='52' r='4'/>` +
				`</g>`
		)}, ${NIGHT}`,
		backgroundSize: '70px 70px',
	},
	{
		id: 'starfield-gold',
		label: '09 — Poussière d’étoiles',
		note: 'Semis irrégulier de micro-étoiles dorées + halo.',
		background: `${tile(
			200,
			spark(30, 40, 4, GOLD, 0.09) +
				spark(150, 20, 2.5, GOLD, 0.07) +
				spark(90, 120, 3, '#f8e7b9', 0.06) +
				spark(180, 160, 4, GOLD, 0.08) +
				pip(60, 90, 1.2, GOLD, 0.12) +
				pip(120, 60, 1, GOLD, 0.1) +
				pip(20, 170, 1.4, GOLD, 0.1) +
				pip(170, 110, 1, '#f8e7b9', 0.1)
		)}, radial-gradient(120% 90% at 50% -10%, ${NAVY} 0%, ${NIGHT} 60%)`,
		backgroundSize: '200px 200px, cover',
	},
	{
		id: 'grid-lines',
		label: '10 — Grille fine + nœuds',
		note: 'Grille technique subtile avec nœuds dorés aux intersections.',
		background: `${tile(
			48,
			`<path d='M48 0 H0 V48' fill='none' stroke='${GOLD}' stroke-opacity='0.05' stroke-width='1'/>` +
				pip(0, 0, 1.4, GOLD, 0.14)
		)}, ${NIGHT}`,
		backgroundSize: '48px 48px',
	},
	{
		id: 'sigil-scatter',
		label: '11 — Sceaux dispersés',
		note: 'Grands sceaux (anneau + éclat) espacés, très diffus.',
		background: `${tile(
			260,
			ring(130, 130, 70, GOLD, 0.04, 1.5) +
				ring(130, 130, 44, GOLD, 0.05) +
				spark(130, 130, 10, GOLD, 0.06) +
				`<g stroke='${GOLD}' stroke-opacity='0.05' stroke-width='1' fill='none'>` +
				`<path d='M130 60 L138 76 L122 76 Z'/>` +
				`<path d='M130 200 L138 184 L122 184 Z'/>` +
				`</g>`
		)}, radial-gradient(130% 110% at 50% 0%, ${NAVY} 0%, ${NIGHT} 68%)`,
		backgroundSize: '260px 260px, cover',
	},
	{
		id: 'jade-mist',
		label: '12 — Brume jade + or',
		note: 'Deux halos colorés (jade & or) très diffus sur la nuit.',
		background: `radial-gradient(60% 50% at 15% 10%, rgba(74,140,111,0.12) 0%, transparent 60%), radial-gradient(55% 45% at 85% 20%, rgba(201,168,76,0.10) 0%, transparent 60%), ${NIGHT}`,
	},
	{
		id: 'parchment-grain',
		label: '13 — Grain sombre + fibres',
		note: 'Texture fibreuse fine (comme un vélin sombre), or minimal.',
		background: `repeating-linear-gradient(0deg, rgba(201,168,76,0.03) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(181,160,108,0.025) 0 1px, transparent 1px 5px), ${NAVY}`,
	},

	// --- Cadriages / quadrillages ---------------------------------------------
	{
		id: 'plaid-gold',
		label: '14 — Tartan doré',
		note: 'Bandes croisées d’épaisseurs variables (tartan), or discret.',
		background: `repeating-linear-gradient(0deg, rgba(201,168,76,0.05) 0 2px, transparent 2px 22px, rgba(181,160,108,0.035) 22px 23px, transparent 23px 44px), repeating-linear-gradient(90deg, rgba(201,168,76,0.05) 0 2px, transparent 2px 22px, rgba(181,160,108,0.035) 22px 23px, transparent 23px 44px), ${NIGHT}`,
	},
	{
		id: 'grid-double',
		label: '15 — Quadrillage double',
		note: 'Grille fine imbriquée dans une grille large, façon papier millimétré.',
		background: `linear-gradient(rgba(201,168,76,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(201,168,76,0.06) 1px, transparent 1px), linear-gradient(rgba(181,160,108,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(181,160,108,0.03) 1px, transparent 1px), ${NAVY}`,
		backgroundSize: '80px 80px, 80px 80px, 16px 16px, 16px 16px, cover',
	},
	{
		id: 'grid-diamond',
		label: '16 — Cadriage losange',
		note: 'Quadrillage tourné à 45° : trame en losanges, ton or.',
		background: `repeating-linear-gradient(45deg, rgba(201,168,76,0.05) 0 1px, transparent 1px 26px), repeating-linear-gradient(-45deg, rgba(201,168,76,0.05) 0 1px, transparent 1px 26px), ${NIGHT}`,
	},
	{
		id: 'cartouche-grid',
		label: '17 — Cartouches',
		note: 'Cadres rectangulaires dorés espacés, comme des cartouches de grimoire.',
		background: `${tile(
			140,
			`<rect x='16' y='16' width='108' height='108' rx='6' fill='none' stroke='${GOLD}' stroke-opacity='0.06' stroke-width='1'/>` +
				`<rect x='24' y='24' width='92' height='92' rx='3' fill='none' stroke='${GOLD}' stroke-opacity='0.035' stroke-width='1'/>` +
				pip(70, 16, 1.6, GOLD, 0.1) +
				pip(70, 124, 1.6, GOLD, 0.1)
		)}, ${NIGHT}`,
		backgroundSize: '140px 140px',
	},
	{
		id: 'crosshatch-fine',
		label: '18 — Croisillons fins',
		note: 'Fines hachures croisées serrées, texture tissée laiton.',
		background: `repeating-linear-gradient(45deg, rgba(181,160,108,0.04) 0 1px, transparent 1px 7px), repeating-linear-gradient(-45deg, rgba(181,160,108,0.03) 0 1px, transparent 1px 7px), ${NIGHT}`,
	},
	{
		id: 'grid-plus',
		label: '19 — Grille à croix',
		note: 'Petites croix (+) aux intersections d’une grille invisible.',
		background: `${tile(
			44,
			`<path d='M22 16 v12 M16 22 h12' stroke='${GOLD}' stroke-opacity='0.09' stroke-width='1'/>`
		)}, ${NIGHT}`,
		backgroundSize: '44px 44px',
	},

	// --- Grains / bruits -------------------------------------------------------
	{
		id: 'grain-fine',
		label: '20 — Grain fin',
		note: 'Bruit procédural fin (feTurbulence) très léger sur la nuit.',
		background: `${noise(160, 0.9, 0.04)}, ${NIGHT}`,
		backgroundSize: '160px 160px, cover',
	},
	{
		id: 'grain-coarse-navy',
		label: '21 — Grain épais + navy',
		note: 'Grain plus gros sur un dégradé navy, effet matière / photo argentique.',
		background: `${noise(200, 0.55, 0.06, 7)}, radial-gradient(120% 90% at 50% -10%, ${NAVY} 0%, ${NIGHT} 62%)`,
		backgroundSize: '200px 200px, cover',
	},
	{
		id: 'grain-gold-halo',
		label: '22 — Grain + halo doré',
		note: 'Grain fin combiné à un halo doré haut : matière + chaleur.',
		background: `${noise(
			160,
			0.85,
			0.045,
			11
		)}, radial-gradient(80% 55% at 50% -6%, rgba(201,168,76,0.10) 0%, transparent 55%), ${NIGHT}`,
		backgroundSize: '160px 160px, cover, cover',
	},
	{
		id: 'grain-grid',
		label: '23 — Grain + quadrillage',
		note: 'Grain fin par-dessus une grille dorée subtile : matière + structure.',
		background: `${noise(
			160,
			0.9,
			0.035,
			5
		)}, linear-gradient(rgba(201,168,76,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(201,168,76,0.05) 1px, transparent 1px), ${NIGHT}`,
		backgroundSize: '160px 160px, 40px 40px, 40px 40px, cover',
	},
	{
		id: 'grain-vignette',
		label: '24 — Grain + vignette',
		note: 'Grain fin avec une vignette sombre marquée aux bords : profondeur.',
		background: `${noise(
			180,
			0.8,
			0.05,
			2
		)}, radial-gradient(130% 120% at 50% 45%, transparent 45%, #060609 100%), ${NIGHT}`,
		backgroundSize: '180px 180px, cover, cover',
	},

	// --- Croisillons (déclinaisons) -------------------------------------------
	{
		id: 'crosshatch-wide',
		label: '25 — Croisillons larges',
		note: 'Même trame croisée que #18 mais mailles espacées : plus aérée.',
		background: `repeating-linear-gradient(45deg, rgba(181,160,108,0.045) 0 1px, transparent 1px 18px), repeating-linear-gradient(-45deg, rgba(181,160,108,0.035) 0 1px, transparent 1px 18px), ${NIGHT}`,
	},
	{
		id: 'crosshatch-ortho',
		label: '26 — Croisillons droits',
		note: 'Croisillons horizontaux/verticaux (0°/90°) plutôt qu’en biais.',
		background: `repeating-linear-gradient(0deg, rgba(181,160,108,0.045) 0 1px, transparent 1px 12px), repeating-linear-gradient(90deg, rgba(181,160,108,0.035) 0 1px, transparent 1px 12px), ${NIGHT}`,
	},
	{
		id: 'crosshatch-bold',
		label: '27 — Croisillons épais',
		note: 'Traits plus épais et plus contrastés : trame affirmée.',
		background: `repeating-linear-gradient(45deg, rgba(201,168,76,0.07) 0 2px, transparent 2px 16px), repeating-linear-gradient(-45deg, rgba(201,168,76,0.055) 0 2px, transparent 2px 16px), ${NIGHT}`,
	},
	{
		id: 'crosshatch-gold',
		label: '28 — Croisillons or vif',
		note: 'Trame fine mais teintée or franc (au lieu du laiton), sur navy.',
		background: `repeating-linear-gradient(45deg, rgba(201,168,76,0.06) 0 1px, transparent 1px 9px), repeating-linear-gradient(-45deg, rgba(201,168,76,0.05) 0 1px, transparent 1px 9px), radial-gradient(120% 100% at 50% 0%, ${NAVY} 0%, ${NIGHT} 68%)`,
	},
	{
		id: 'crosshatch-dense',
		label: '29 — Croisillons serrés',
		note: 'Mailles très rapprochées : aspect tissu / lin dense.',
		background: `repeating-linear-gradient(45deg, rgba(181,160,108,0.05) 0 1px, transparent 1px 4px), repeating-linear-gradient(-45deg, rgba(181,160,108,0.04) 0 1px, transparent 1px 4px), ${NIGHT}`,
	},
	{
		id: 'crosshatch-triple',
		label: '30 — Croisillons triple',
		note: 'Trois familles de lignes (0°, 60°, 120°) : trame en losanges triangulés.',
		background: `repeating-linear-gradient(0deg, rgba(181,160,108,0.04) 0 1px, transparent 1px 16px), repeating-linear-gradient(60deg, rgba(181,160,108,0.04) 0 1px, transparent 1px 16px), repeating-linear-gradient(120deg, rgba(181,160,108,0.04) 0 1px, transparent 1px 16px), ${NIGHT}`,
	},
	{
		id: 'crosshatch-dotted',
		label: '31 — Croisillons pointés',
		note: 'Trame croisée avec un point doré à chaque intersection.',
		background: `${tile(
			16,
			pip(0, 0, 1, GOLD, 0.14)
		)}, repeating-linear-gradient(45deg, rgba(181,160,108,0.04) 0 1px, transparent 1px 16px), repeating-linear-gradient(-45deg, rgba(181,160,108,0.03) 0 1px, transparent 1px 16px), ${NIGHT}`,
		backgroundSize: '11.31px 11.31px, cover, cover, cover',
	},

	// --- Déclinaisons du #28 : mêmes croisillons or, dégradé de fond recoloré --
	...(
		[
			['crosshatch-jade', '32 — …dégradé jade', 'Halo jade profond', '#12312a'],
			['crosshatch-warm', '33 — …dégradé or chaud', 'Halo doré chaud', '#241d0f'],
			['crosshatch-plum', '34 — …dégradé prune', 'Halo prune arcanique', '#1e1330'],
			['crosshatch-ember', '35 — …dégradé braise', 'Halo rouge braise (mana R)', '#2a1211'],
			['crosshatch-teal', '36 — …dégradé sarcelle', 'Halo bleu sarcelle (mana U)', '#0c2230'],
			['crosshatch-ink', '37 — …dégradé encre', 'Halo quasi noir, très sobre', '#101015'],
		] as const
	).map(([id, label, note, top]) => ({
		id,
		label,
		note: `${note} sous les croisillons or du #28.`,
		// Croisillons identiques au #28 ; seule la couleur haute du radial change.
		background: `repeating-linear-gradient(45deg, rgba(201,168,76,0.06) 0 1px, transparent 1px 9px), repeating-linear-gradient(-45deg, rgba(201,168,76,0.05) 0 1px, transparent 1px 9px), radial-gradient(120% 100% at 50% 0%, ${top} 0%, ${NIGHT} 68%)`,
	})),

	{
		id: 'crosshatch-gold-native',
		label: '38 — …dégradé or natif (doux)',
		note: `Or natif du thème (${GOLD}) en halo atténué, sous les croisillons or du #28.`,
		// L'or natif est clair : mis à ~14% d'opacité par-dessus la nuit, il donne un
		// halo doré visible mais qui reste un fond. Croisillons identiques au #28.
		background: `repeating-linear-gradient(45deg, rgba(201,168,76,0.06) 0 1px, transparent 1px 9px), repeating-linear-gradient(-45deg, rgba(201,168,76,0.05) 0 1px, transparent 1px 9px), radial-gradient(120% 100% at 50% 0%, rgba(201,168,76,0.14) 0%, transparent 55%), ${NIGHT}`,
	},
	{
		id: 'crosshatch-gold-native-strong',
		label: '39 — …dégradé or natif (plein)',
		note: `Or natif ${GOLD} en stop plein (halo franc, plus lumineux), croisillons or du #28.`,
		// Version à pleine couleur pour comparer : le premier stop est l'or opaque.
		background: `repeating-linear-gradient(45deg, rgba(201,168,76,0.06) 0 1px, transparent 1px 9px), repeating-linear-gradient(-45deg, rgba(201,168,76,0.05) 0 1px, transparent 1px 9px), radial-gradient(120% 100% at 50% 0%, ${GOLD} 0%, ${NIGHT} 60%)`,
	},
];
