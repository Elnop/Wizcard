'use client';

import { useEffect, useMemo, useState } from 'react';
import {
	cardTemplateAssetUrl,
	fetchCardTemplates,
	type CardTemplateRow,
} from '@/lib/supabase/queries/card-templates';
import type { CardFaceDraft, CardLayoutId, FrameStyleId } from './types';
import { getManaSymbols } from './text-layout';

export type MseFrameKey = Exclude<FrameStyleId, 'auto'> | 'land';

export type MseTemplateKind =
	'card' | 'token' | 'planeswalker' | 'saga' | 'split' | 'double-faced' | 'oversized' | 'packaging';

export interface MseTemplate {
	id: string;
	name: string;
	shortName: string | null;
	directory: string;
	stylePath: string;
	samplePath: string | null;
	iconPath: string | null;
	kind: MseTemplateKind;
	orientation: 'portrait' | 'landscape' | 'unknown';
	dimensions: { width: number | null; height: number | null; dpi: number | null };
	installerGroup: string | null;
	dependencies: string[];
	assetCount: number;
	framePaths: Partial<Record<MseFrameKey, string>>;
	frameTextColors?: Partial<Record<MseFrameKey, MseTextColors>>;
	sampleTextColors?: MseTextColors | null;
	renderMode: 'frame' | 'sample';
	version: string | null;
	source?: 'cardconjurer' | 'mse';
	quality?: 'accurate' | 'legacy';
	layoutId?: CardLayoutId;
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
		kind: row.kind as MseTemplateKind,
		orientation: row.orientation as MseTemplate['orientation'],
		dimensions: { width: row.width, height: row.height, dpi: row.dpi },
		installerGroup: null,
		dependencies: [],
		assetCount: 0,
		framePaths: (row.frame_paths ?? {}) as Partial<Record<MseFrameKey, string>>,
		frameTextColors: (row.frame_text_colors ?? {}) as Partial<Record<MseFrameKey, MseTextColors>>,
		sampleTextColors: (row.sample_text_colors ?? null) as MseTextColors | null,
		renderMode: row.render_mode as MseTemplate['renderMode'],
		version: row.version,
		source: row.source as MseTemplate['source'],
		quality: row.quality as MseTemplate['quality'],
		layoutId: (row.layout_id ?? undefined) as CardLayoutId | undefined,
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

function resolveAutomaticFrame(face: CardFaceDraft): MseFrameKey {
	const symbols = getManaSymbols(face.manaCost).join('');
	const colors = ['W', 'U', 'B', 'R', 'G'].filter((color) => symbols.includes(color));
	if (colors.length > 1) return 'prismatic';
	const frameByColor: Record<string, Exclude<FrameStyleId, 'auto'>> = {
		W: 'light',
		U: 'tide',
		B: 'void',
		R: 'ember',
		G: 'grove',
	};
	if (colors[0]) return frameByColor[colors[0]];
	if (symbols.includes('C')) return 'artifact';
	if (/\b(land|terrain)\b/i.test(face.typeLine)) return 'land';
	return 'light';
}

function resolveFrameStyle(face: CardFaceDraft): MseFrameKey {
	return face.frameStyle === 'auto' ? resolveAutomaticFrame(face) : face.frameStyle;
}

export function resolveMseFramePath(
	template: MseTemplate | undefined,
	face: CardFaceDraft
): string | null {
	if (!template) return null;
	const frame = resolveFrameStyle(face);
	const path = template.framePaths[frame] ?? Object.values(template.framePaths)[0];
	return cardAssetUrl(path);
}

export function resolveMseTextColors(
	template: MseTemplate | undefined,
	face: CardFaceDraft
): MseTextColors | null {
	if (!template) return null;
	const frame = resolveFrameStyle(face);
	return template.frameTextColors?.[frame] ?? template.sampleTextColors ?? null;
}

export function layoutForMseTemplate(template: MseTemplate): CardLayoutId {
	if (template.layoutId) return template.layoutId;
	if (template.kind === 'token') return 'token';
	if (template.kind === 'planeswalker') return 'planeswalker';
	if (template.kind === 'saga') return 'saga';
	return template.orientation === 'landscape' ? 'landscape' : 'arcana';
}

export function useSelectedMseTemplate(templates: MseTemplate[], templateId: string) {
	return useMemo(
		() => templates.find((template) => template.id === templateId),
		[templateId, templates]
	);
}
