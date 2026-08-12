'use client';

import { useEffect, useMemo, useState } from 'react';
import {
	cardTemplateAssetUrl,
	fetchCardTemplates,
	type CardTemplateRow,
	type TemplateGeometryRow,
} from '@/lib/supabase/queries/card-templates';
import type { CardQuality } from './quality';
import type { CardFaceDraft, CardLayoutId, FrameStyleId } from './types';
import { getManaSymbols } from './text-layout';
import { isLandTypeLine } from './type-line';

/** Couleur de base d'un cadre : les 7 pastilles de la palette. */
export type MseColorKey = Exclude<FrameStyleId, 'auto'>;

/**
 * Clé de cadre. Les terrains préfixent la couleur de base : `land-tide` est le
 * cadre terrain bleu.
 *
 * `land` seul a DISPARU : c'était une clé qu'aucun gabarit ne fournissait, donc
 * `isLandTypeLine` la renvoyait dans le vide.
 */
export type MseFrameKey = MseColorKey | 'colorless' | `land-${MseColorKey | 'colorless'}`;

export interface MseTemplate {
	id: string;
	name: string;
	shortName: string | null;
	directory: string;
	stylePath: string;
	samplePath: string | null;
	iconPath: string | null;
	orientation: 'portrait' | 'landscape' | 'unknown';
	dimensions: { width: number | null; height: number | null; dpi: number | null };
	installerGroup: string | null;
	positionHint: string | null;
	tags: string[];
	dependencies: string[];
	assetCount: number;
	framePaths: Partial<Record<MseFrameKey, string>>;
	/** Couronnes légendaires par clé de couleur ; null = gabarit incompatible. */
	crownPaths: Partial<Record<MseFrameKey, string>> | null;
	/**
	 * Panneaux force/endurance servis à part du cadre ; null = le cadre l'intègre.
	 *
	 * Les gabarits MSE peignent ce panneau dans leur image de cadre, donc le
	 * canvas n'a que le TEXTE à poser. Les cadres CardConjurer le livrent en
	 * asset séparé : sans lui, la force/endurance s'écrit sur le vide.
	 */
	ptPaths: Partial<Record<MseFrameKey, string>> | null;
	/**
	 * Masques de fondu bicolore ; null = ce gabarit n'en fournit pas.
	 *
	 * Trois clés possibles (`multicolor`, `hybrid`, `artifact`) sont ingérées,
	 * stockées et téléversées, mais seule `multicolor` est lue aujourd'hui (cf.
	 * `resolveMseBlend`). `hybrid` et `artifact` attendent une règle de
	 * déclenchement qui n'est pas encore spécifiée — hors périmètre de ce
	 * chantier, pas un oubli.
	 */
	blendMasks: Record<string, string> | null;
	frameTextColors?: Partial<Record<MseFrameKey, MseTextColors>>;
	sampleTextColors?: MseTextColors | null;
	renderMode: 'frame' | 'sample';
	version: string | null;
	source?: 'cardconjurer' | 'mse';
	quality?: 'accurate' | 'legacy';
	layoutId?: CardLayoutId;
	/** Géométrie mesurée du corpus MSE ; null = gabarit non mesuré (cf. Task 11). */
	geometry: TemplateGeometryRow | null;
}

export interface MseTextColors {
	title: string;
	type: string;
	rules: string;
	footer: string;
}

interface MseCatalogState {
	templates: MseTemplate[];
	isLoading: boolean;
	error: boolean;
}

/**
 * Les chemins stockés en base sont relatifs au bucket `card-templates` ; le
 * client les résout en URL CDN. Retourne null quand le chemin est absent, ce
 * qui laisse l'appelant retomber sur son fallback (sample, puis rien).
 */
export function cardAssetUrl(
	path: string | null | undefined,
	quality?: CardQuality
): string | null {
	return cardTemplateAssetUrl(qualityVariantPath(path, quality));
}

/**
 * Chemin du même asset au palier demandé.
 *
 * Les variantes CardConjurer vivent sous `cc/<palier>/…`, une par palier, donc
 * changer de qualité revient à changer un segment du chemin. C'est fait ICI
 * plutôt qu'à chaque appel parce que toutes les URLs de cadre passent par
 * `cardAssetUrl` : un seul point à traverser, donc aucun appelant ne peut
 * oublier le palier.
 *
 * Un chemin qui ne commence pas par `cc/` est rendu TEL QUEL : les assets MSE
 * n'existent qu'en une seule résolution, et leur inventer un palier produirait
 * une URL morte. Les deux jeux cohabitent ainsi pendant la migration.
 *
 * `source` ne rend pas un WebP mais le PNG d'origine, sous `cc/source/…` : c'est
 * l'export imprimable, qui ne doit pas partir d'une image déjà compressée.
 */
function qualityVariantPath(
	path: string | null | undefined,
	quality: CardQuality | undefined
): string | null | undefined {
	if (!path || !quality || !path.startsWith('cc/')) return path;
	return path.replace(/^cc\/[^/]+\//, `cc/${quality}/`);
}

/** Ligne DB -> modèle du studio. Les colonnes texte libres sont contraintes par
 *  des CHECK côté DB ; on caste sans re-valider pour ne pas dupliquer la règle. */
function rowToTemplate(row: CardTemplateRow): MseTemplate {
	return {
		id: row.id,
		name: row.name,
		shortName: row.short_name,
		// `directory` et `stylePath` n'ont plus de sens côté client : les assets
		// ne sont plus servis depuis une arborescence locale. On garde les champs
		// pour ne pas casser la forme du type, avec des valeurs vides.
		directory: '',
		stylePath: '',
		samplePath: row.sample_path,
		iconPath: row.icon_path,
		orientation: row.orientation as MseTemplate['orientation'],
		dimensions: { width: row.width, height: row.height, dpi: row.dpi },
		installerGroup: row.installer_group as string | null,
		positionHint: row.position_hint as string | null,
		tags: (row.tags ?? []) as string[],
		dependencies: [],
		assetCount: 0,
		framePaths: (row.frame_paths ?? {}) as Partial<Record<MseFrameKey, string>>,
		crownPaths: (row.crown_paths ?? null) as Partial<Record<MseFrameKey, string>> | null,
		ptPaths: (row.pt_paths ?? null) as Partial<Record<MseFrameKey, string>> | null,
		blendMasks: (row.blend_masks ?? null) as Record<string, string> | null,
		frameTextColors: (row.frame_text_colors ?? {}) as Partial<Record<MseFrameKey, MseTextColors>>,
		sampleTextColors: (row.sample_text_colors ?? null) as MseTextColors | null,
		renderMode: row.render_mode as MseTemplate['renderMode'],
		version: row.version,
		source: row.source as MseTemplate['source'],
		quality: row.quality as MseTemplate['quality'],
		layoutId: (row.layout_id ?? undefined) as CardLayoutId | undefined,
		geometry: row.geometry,
	};
}

export function useMseTemplateCatalog(): MseCatalogState {
	const [state, setState] = useState<MseCatalogState>({
		templates: [],
		isLoading: true,
		error: false,
	});

	useEffect(() => {
		let cancelled = false;
		async function loadCatalog() {
			try {
				const rows = await fetchCardTemplates();
				if (cancelled) return;
				setState({ templates: rows.map(rowToTemplate), isLoading: false, error: false });
			} catch (error) {
				if (cancelled) return;
				console.error('[card-editor] template catalogue failed to load', error);
				setState({ templates: [], isLoading: false, error: true });
			}
		}
		void loadCatalog();
		return () => {
			cancelled = true;
		};
	}, []);

	return state;
}

/** Ordre canonique des couleurs de Magic. Une carte {U}{W} s'imprime blanc-bleu. */
const WUBRG = ['W', 'U', 'B', 'R', 'G'] as const;

const COLOR_TO_FRAME: Record<string, MseColorKey> = {
	W: 'light',
	U: 'tide',
	B: 'void',
	R: 'ember',
	G: 'grove',
};

/** Couleurs du coût, dans l'ordre WUBRG et non dans l'ordre de saisie. */
function faceColors(face: CardFaceDraft): string[] {
	const symbols = getManaSymbols(face.manaCost).join('');
	return WUBRG.filter((color) => symbols.includes(color));
}

/**
 * Le coût contient-il un symbole hybride bicolore (`{W/U}`) ?
 *
 * La distinction est celle que fait le script du jeu MSE
 * (`magic.mse-game/script`), qui termine la combinaison de couleurs par
 * « hybrid » plutôt que « multicolor » selon la NATURE du coût :
 *
 *     #### hybrid, not artifact
 *     else if count == 2 then  color_names_2() + ", hybrid"
 *
 * Les deux masques découpent des zones différentes : `multicolor` protège la
 * barre de titre ET la ligne de type, `hybrid` ne protège que les deux barres.
 * Les confondre donnait à une carte hybride le cadre d'une bicolore ordinaire.
 *
 * Deux formes ressemblantes ne sont PAS hybrides et doivent rester exclues :
 * `{U/P}` (phyrexian, une seule couleur) et `{2/W}` (hybride monocolore).
 * D'où le test sur DEUX moitiés qui sont toutes deux des couleurs.
 */
function hasHybridCost(face: CardFaceDraft): boolean {
	return getManaSymbols(face.manaCost).some((symbol) => {
		const halves = symbol.split('/');
		return halves.length === 2 && halves.every((half) => WUBRG.includes(half as never));
	});
}

function resolveAutomaticFrame(face: CardFaceDraft): MseFrameKey {
	const colors = faceColors(face);
	const symbols = getManaSymbols(face.manaCost).join('');

	// Un terrain se décide AVANT la couleur, et pas sur le coût de mana : une
	// vraie carte terrain n'en a pas. Sa couleur vient du mana qu'elle PRODUIT,
	// que le studio ne modélise pas — donc un terrain sans coût prend le cadre
	// terre incolore, qui est aussi celui des terrains non-base.
	//
	// Un coût reste possible et significatif : la ligne de type d'un artefact-
	// terrain ou d'un terrain coloré porte alors sa couleur.
	if (isLandTypeLine(face.typeLine)) {
		if (colors.length > 1) return 'land-prismatic';
		if (colors[0]) return `land-${COLOR_TO_FRAME[colors[0]]}` as MseFrameKey;
		return 'land-colorless';
	}

	// Hors terrain : la couleur si elle est unique, l'or si la carte est
	// multicolore, l'incolore sinon. `{C}` est du mana INCOLORE, pas de
	// l'artefact — le studio renvoyait `artifact` ici, ce qui confondait deux
	// cadres visuellement distincts (gris-brun contre bleu-métal).
	//
	// Une carte BICOLORE renvoie quand même `prismatic` : cette fonction choisit
	// un cadre unique, et `resolveMseBlend` décide séparément s'il y a de quoi
	// composer un fondu. Le canvas peint le fondu quand il existe, `prismatic`
	// sinon — c'est le repli, pas une contradiction.
	if (colors.length > 1) return 'prismatic';
	if (colors[0]) return COLOR_TO_FRAME[colors[0]];
	if (symbols.includes('C')) return 'colorless';
	return 'light';
}

function resolveFrameStyle(face: CardFaceDraft): MseFrameKey {
	return face.frameStyle === 'auto' ? resolveAutomaticFrame(face) : face.frameStyle;
}

/**
 * Chaîne de dégradation « moins spécifique, jamais une autre couleur » pour une
 * clé de cadre : `land-<couleur>` -> `<couleur>` ; `land-colorless` ->
 * `colorless` -> `artifact` (le corpus n'a pas de couronne/masque `colorless`,
 * `artifact` est le cadre incolore le plus proche) ; `colorless` -> `artifact`.
 * Une clé de couleur de base (`tide`, `light`, ...) n'a pas de repli, elle est
 * déjà la forme la plus générique.
 */
function frameDegradationChain(frame: MseFrameKey): MseFrameKey[] {
	if (frame.startsWith('land-')) {
		const base = frame.slice(5) as MseColorKey | 'colorless';
		return base === 'colorless' ? ['colorless', 'artifact'] : [base];
	}
	if (frame === 'colorless') return ['artifact'];
	return [];
}

/**
 * Cadre à peindre.
 *
 * Dégradation en CHAÎNE pour les nouvelles clés, jamais un seul repli : `land-
 * tide` absent retombe sur `tide` ; `land-colorless` ou `colorless` absents
 * retombent sur `artifact` avant de risquer autre chose. C'est une dégradation
 * vers moins SPÉCIFIQUE au sein de la MÊME couleur, pas vers faux — un cadre
 * bleu là où on attendait un terrain bleu reste juste, mais `colorless` ne doit
 * jamais atterrir sur `tide` faute de mieux. Le dernier repli sur la première
 * clé disponible n'est atteint qu'une fois la chaîne de couleur épuisée, pour
 * les gabarits exotiques qui ne fournissent qu'une variante.
 */
export function resolveMseFramePath(
	template: MseTemplate | undefined,
	face: CardFaceDraft,
	quality?: CardQuality
): string | null {
	if (!template) return null;
	const frame = resolveFrameStyle(face);
	const direct = template.framePaths[frame];
	if (direct) return cardAssetUrl(direct, quality);
	for (const candidate of frameDegradationChain(frame)) {
		const degraded = template.framePaths[candidate];
		if (degraded) return cardAssetUrl(degraded, quality);
	}
	return cardAssetUrl(Object.values(template.framePaths)[0], quality);
}

/**
 * Le PNG du cadre porte-t-il DÉJÀ sa fenêtre d'illustration ?
 *
 * `CardCanvas` peint le cadre par-dessus l'illustration puis y creuse la boîte
 * `image` mesurée (masque `-artwin`). Cette découpe est la SEULE fenêtre des
 * gabarits servis en JPEG — 102 des 140 mesurés — qui n'ont pas de canal alpha.
 *
 * Mais quelques gabarits sont servis en PNG avec une fenêtre déjà transparente.
 * Y appliquer la découpe géométrique est au mieux redondant, au pire
 * destructeur : quand la fenêtre couvre 60 à 68 % de la carte (`magic-m15-
 * textless`, `magic-old-promo`), le masque efface le cadre lui-même et il ne
 * reste que l'illustration nue avec le texte posé dessus.
 *
 * On se fie à l'EXTENSION et non au contenu : décoder le PNG au rendu pour y
 * mesurer l'alpha coûterait un aller-retour par cadre, à chaque rendu. La
 * correspondance a été vérifiée sur les 112 gabarits lisibles du corpus —
 * l'extension prédit le format réel sans une seule divergence.
 *
 * Attention : « PNG » n'implique pas « fenêtre transparente ». Certains PNG du
 * corpus sont opaques dans leur boîte `image` (`magic-cbg-planeswalker`, 0 % de
 * transparence). Pour eux, sauter la découpe cacherait l'illustration derrière
 * un cadre opaque. C'est pourquoi ce test ne suffit pas seul et n'est consulté
 * que pour les cadres PLEINE ILLUSTRATION, dont `frame-choices.ts` a vérifié
 * qu'ils ne sont proposés que si leur fenêtre est réellement transparente.
 */
export function frameCarriesOwnArtWindow(path: string | null): boolean {
	if (!path) return false;
	// Les cadres CardConjurer portent TOUS leur fenêtre, quel que soit le format
	// dans lequel on les sert. Mesuré sur `m15FrameW` : 37.3 % de pixels
	// totalement transparents, alpha 0 au centre de la fenêtre d'illustration et
	// 255 sur la bordure. Le test d'extension ci-dessous les manquait, puisque nos
	// variantes d'aperçu sont en WebP — la découpe géométrique s'appliquait alors
	// à un cadre qui a déjà sa fenêtre, et effaçait sa bordure noire (carte au
	// contour blanc, couronne détachée).
	//
	// On cherche le segment DANS l'URL et non en préfixe : l'appelant passe
	// l'URL CDN complète (`http://…/card-templates/cc/preview/…`), pas le chemin
	// relatif stocké en base.
	if (path.includes('/cc/')) return true;
	return path.split('?')[0].toLowerCase().endsWith('.png');
}

/**
 * Fondu HYBRIDE, ou `null`.
 *
 * Réservé aux coûts hybrides (`{W/U}`). Une carte bicolore ordinaire (`{W}{U}`)
 * n'est PAS fondue : elle porte le cadre or, comme une tricolore.
 *
 * MSE compose `masked_blend(mask, dark, light)` : le masque décide par pixel
 * lequel des DEUX cadres colorés apparaît. On renvoie donc les trois URL, jamais
 * une seule — peindre le masque seul donnerait une carte blanche.
 *
 * `null` dès qu'une pièce manque : coût non hybride, carte pas exactement
 * bicolore, gabarit sans masque `hybrid`, ou cadre manquant pour l'une des deux
 * couleurs. Le rendu retombe alors sur le cadre simple, qui reste juste.
 */
export function resolveMseBlend(
	template: MseTemplate | undefined,
	face: CardFaceDraft,
	quality?: CardQuality
): { base: string; overlay: string; mask: string; plate: string } | null {
	if (!template?.blendMasks) return null;
	if (face.frameStyle !== 'auto') return null;
	const colors = faceColors(face);
	if (colors.length !== 2) return null;
	// SEUL l'hybride est fondu. Une carte bicolore ORDINAIRE porte le cadre or,
	// exactement comme une tricolore — c'est ce qu'imprime Wizards.
	//
	// MSE fond les bicolores par défaut, mais c'est une facilité de l'éditeur et
	// non l'imprimé : le réglage `use gradient multicolor` (magic.mse-game/
	// set_fields) existe précisément pour la désactiver, et sa description dit
	// « Use gradients on multicolor cards BY DEFAULT », pas « comme les vraies
	// cartes ». On suit l'imprimé, donc `multicolor` n'est jamais peint et
	// `resolveAutomaticFrame` renvoie `prismatic` pour les bicolores.
	if (!hasHybridCost(face)) return null;
	const maskPath = template.blendMasks.hybrid;
	if (!maskPath) return null;
	const first = template.framePaths[COLOR_TO_FRAME[colors[0]]];
	const second = template.framePaths[COLOR_TO_FRAME[colors[1]]];
	if (!first || !second) return null;
	// Les plaques (titre, ligne de type) d'un hybride sont grises, pas colorées.
	// MSE les prend dans le cadre TERRAIN : `color_combination` fait
	// `mode := "hybrid" ; dark := land_template` (magic-blends.mse-include/
	// new-blends). On suit la même chaîne de dégradation que le reste du module :
	// on descend vers moins spécifique AU SEIN DU GRIS, jamais vers une autre
	// couleur — sans gris disponible on ne fond pas, et le cadre or s'applique.
	const landColorless: MseFrameKey = 'land-colorless';
	const plateKey = [landColorless, ...frameDegradationChain(landColorless)].find(
		(key) => template.framePaths[key]
	);
	if (!plateKey) return null;
	const platePath = template.framePaths[plateKey];
	if (!platePath) return null;
	const base = cardAssetUrl(first, quality);
	const overlay = cardAssetUrl(second, quality);
	const mask = cardAssetUrl(maskPath, quality);
	const plate = cardAssetUrl(platePath, quality);
	if (!base || !overlay || !mask || !plate) return null;
	return { base, overlay, mask, plate };
}

/**
 * Chemin de la couronne légendaire, ou `null`.
 *
 * Trois raisons de ne rien peindre, toutes légitimes :
 *
 * 1. la carte n'est pas légendaire ;
 * 2. le gabarit n'accepte pas la couronne (`crownPaths` à null) — sa barre de
 *    titre n'a pas la géométrie pour laquelle les couronnes sont dessinées ;
 * 3. même ramenée à sa couleur de base, la clé n'a pas de couronne dans ce
 *    gabarit précis.
 *
 * `crown_paths` ne connaît que les 7 clés de couleur d'origine (vérifié en
 * base : `artifact, ember, grove, light, prismatic, tide, void`) — jamais de
 * `land-*` ni de `colorless`. Il faut donc ramener la clé à sa couleur de base
 * AVANT le lookup : `land-tide` -> `tide`, `land-colorless` -> `artifact`,
 * `colorless` -> `artifact` (pas de couronne incolore dans le corpus,
 * `artifact` est la plus proche). C'est la même dégradation « moins
 * spécifique, jamais une autre couleur » que `resolveMseFramePath`, pas un
 * repli vers une couleur différente : la règle « aucun fallback » du studio
 * interdit d'inventer une mauvaise couleur, pas de résoudre vers une forme
 * moins spécifique de la même couleur.
 */
/*
 * Pas de résolveur pour `blendMasks.image`, et c'est délibéré.
 *
 * Ce masque est ingéré (cf. scripts/mse-geometry/image-mask.mjs) mais AUCUN
 * rendu ne le lit : la fenêtre d'illustration est découpée géométriquement,
 * pour tous les gabarits, à partir de `geometry.art`.
 *
 * Une version antérieure s'en servait comme pochoir pour creuser le cadre. À
 * tort : dans MSE ce masque s'applique à l'ILLUSTRATION — il lui donne sa
 * forme — et non au cadre. D'où le symptôme qui l'a révélé : 30 des 142
 * masques ingérés sont uniformément blancs, ce qui est parfaitement normal
 * pour une fenêtre rectangulaire mais ne retire rien quand on l'emploie comme
 * pochoir, laissant le cadre opaque au-dessus de l'illustration.
 *
 * La donnée reste en base pour un usage futur conforme à son rôle réel.
 */

export function resolveMseCrownPath(
	template: MseTemplate | undefined,
	face: CardFaceDraft,
	isLegendary: boolean,
	quality?: CardQuality
): string | null {
	if (!isLegendary) return null;
	if (!template?.crownPaths) return null;
	const frame = resolveFrameStyle(face);
	const direct = template.crownPaths[frame];
	if (direct) return cardAssetUrl(direct, quality);
	for (const candidate of frameDegradationChain(frame)) {
		const degraded = template.crownPaths[candidate];
		if (degraded) return cardAssetUrl(degraded, quality);
	}
	return null;
}

/**
 * Panneau force/endurance à peindre, ou `null`.
 *
 * `null` couvre DEUX cas qui n'ont pas la même cause mais le même effet :
 * le gabarit intègre son panneau dans l'image du cadre (tous les MSE), ou la
 * carte n'a pas de force/endurance à afficher. Dans les deux cas le canvas n'a
 * rien à peindre en plus, et c'est l'appelant qui sait s'il y a des stats.
 *
 * Même chaîne de dégradation que le cadre : une couleur absente retombe sur la
 * plus proche plutôt que de laisser le texte sur le vide.
 */
export function resolveMsePtPath(
	template: MseTemplate | undefined,
	face: CardFaceDraft,
	quality?: CardQuality
): string | null {
	if (!template?.ptPaths) return null;
	const frame = resolveFrameStyle(face);
	const direct = template.ptPaths[frame];
	if (direct) return cardAssetUrl(direct, quality);
	for (const candidate of frameDegradationChain(frame)) {
		const degraded = template.ptPaths[candidate];
		if (degraded) return cardAssetUrl(degraded, quality);
	}
	return null;
}

export function resolveMseTextColors(
	template: MseTemplate | undefined,
	face: CardFaceDraft
): MseTextColors | null {
	if (!template) return null;
	const frame = resolveFrameStyle(face);
	return template.frameTextColors?.[frame] ?? template.sampleTextColors ?? null;
}

export function useSelectedMseTemplate(templates: MseTemplate[], templateId: string) {
	return useMemo(
		() => templates.find((template) => template.id === templateId),
		[templateId, templates]
	);
}
