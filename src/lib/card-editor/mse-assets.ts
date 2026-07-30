'use client';

import { useEffect, useMemo, useState } from 'react';
import {
	cardTemplateAssetUrl,
	fetchCardTemplates,
	type CardTemplateRow,
	type TemplateGeometryRow,
} from '@/lib/supabase/queries/card-templates';
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
export function cardAssetUrl(path: string | null | undefined): string | null {
	return cardTemplateAssetUrl(path);
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
	face: CardFaceDraft
): string | null {
	if (!template) return null;
	const frame = resolveFrameStyle(face);
	const direct = template.framePaths[frame];
	if (direct) return cardAssetUrl(direct);
	for (const candidate of frameDegradationChain(frame)) {
		const degraded = template.framePaths[candidate];
		if (degraded) return cardAssetUrl(degraded);
	}
	return cardAssetUrl(Object.values(template.framePaths)[0]);
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
	face: CardFaceDraft
): { base: string; overlay: string; mask: string } | null {
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
	const base = cardAssetUrl(first);
	const overlay = cardAssetUrl(second);
	const mask = cardAssetUrl(maskPath);
	if (!base || !overlay || !mask) return null;
	return { base, overlay, mask };
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
export function resolveMseCrownPath(
	template: MseTemplate | undefined,
	face: CardFaceDraft,
	isLegendary: boolean
): string | null {
	if (!isLegendary) return null;
	if (!template?.crownPaths) return null;
	const frame = resolveFrameStyle(face);
	const direct = template.crownPaths[frame];
	if (direct) return cardAssetUrl(direct);
	for (const candidate of frameDegradationChain(frame)) {
		const degraded = template.crownPaths[candidate];
		if (degraded) return cardAssetUrl(degraded);
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
