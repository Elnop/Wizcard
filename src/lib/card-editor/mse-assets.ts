'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CardFaceDraft, CardLayoutId, FrameStyleId } from './types';
import { getManaSymbols } from './text-layout';

const TEMPLATE_MANIFEST_URL = '/card-assets/manifests/templates.json?v=bcdf4190b4bf-text-colors-v1';

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
	framePaths: Partial<Record<Exclude<FrameStyleId, 'auto'>, string>>;
	frameTextColors?: Partial<Record<Exclude<FrameStyleId, 'auto'>, MseTextColors>>;
	sampleTextColors?: MseTextColors | null;
	renderMode: 'frame' | 'sample';
	version: string | null;
}

export interface MseTextColors {
	title: string;
	type: string;
	rules: string;
	footer: string;
}

interface MseTemplateManifest {
	schemaVersion: number;
	assetVersion: string;
	templates: MseTemplate[];
}

interface MseCatalogState {
	templates: MseTemplate[];
	isLoading: boolean;
	error: boolean;
}

function isManifest(value: unknown): value is MseTemplateManifest {
	if (!value || typeof value !== 'object') return false;
	const manifest = value as Partial<MseTemplateManifest>;
	return manifest.schemaVersion === 1 && Array.isArray(manifest.templates);
}

export function cardAssetUrl(path: string | null | undefined): string | null {
	if (!path) return null;
	return `/${path
		.split('/')
		.map((segment) => encodeURIComponent(segment))
		.join('/')}`;
}

export function useMseTemplateCatalog(): MseCatalogState {
	const [state, setState] = useState<MseCatalogState>({
		templates: [],
		isLoading: true,
		error: false,
	});

	useEffect(() => {
		const controller = new AbortController();
		async function loadCatalog() {
			try {
				const response = await fetch(TEMPLATE_MANIFEST_URL, {
					signal: controller.signal,
					cache: 'force-cache',
				});
				if (!response.ok) throw new Error(`Template manifest returned ${response.status}`);
				const value: unknown = await response.json();
				if (!isManifest(value)) throw new Error('Invalid template manifest');
				setState({ templates: value.templates, isLoading: false, error: false });
			} catch (error) {
				if (error instanceof DOMException && error.name === 'AbortError') return;
				console.error('[card-editor] MSE template catalogue failed to load', error);
				setState({ templates: [], isLoading: false, error: true });
			}
		}
		void loadCatalog();
		return () => controller.abort();
	}, []);

	return state;
}

function resolveAutomaticFrame(face: CardFaceDraft): Exclude<FrameStyleId, 'auto'> {
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
	if (/\b(land|terrain)\b/i.test(face.typeLine)) return 'prismatic';
	return 'light';
}

function resolveFrameStyle(face: CardFaceDraft): Exclude<FrameStyleId, 'auto'> {
	return face.frameStyle === 'auto' ? resolveAutomaticFrame(face) : face.frameStyle;
}

export function resolveMseFramePath(
	template: MseTemplate | undefined,
	face: CardFaceDraft
): string | null {
	if (!template) return null;
	const frame = resolveFrameStyle(face);
	const path = template.framePaths[frame] ?? Object.values(template.framePaths)[0];
	return cardAssetUrl(path ?? template.samplePath);
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
