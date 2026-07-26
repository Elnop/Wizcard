import { createClient } from '@/lib/supabase/client';

/**
 * Raw Supabase access for `card_templates` (catalogue des gabarits du Custom
 * Card Studio). ONLY place that issues these client.from(...) calls. Returns DB
 * rows ; le mapping vers le modèle du studio vit dans card-editor/mse-assets.
 *
 * La table remplace le templates.json statique servi depuis public/ : les
 * assets vivent dans le bucket `card-templates` et le catalogue est alimenté
 * par scripts/card-assets/upload-templates.ts.
 */

/**
 * Géométrie mesurée depuis le corpus MSE (cf.
 * scripts/mse-geometry/extract.ts::TemplateGeometry). `boxes` n'a que 4 clés
 * garanties (image/name/type/text) ; `pt` et `casting cost` sont optionnelles.
 */
export interface TemplateGeometryRow {
	cardWidth: number;
	cardHeight: number;
	boxes: Partial<
		Record<
			'image' | 'name' | 'type' | 'text' | 'pt' | 'casting cost',
			{ left: number; top: number; width: number; height: number }
		>
	>;
	ast: Record<string, unknown>;
}

export interface CardTemplateRow {
	id: string;
	name: string;
	short_name: string | null;
	source: string;
	quality: string;
	kind: string;
	orientation: string;
	layout_id: string | null;
	sample_path: string | null;
	icon_path: string | null;
	frame_paths: Record<string, string> | null;
	frame_text_colors: Record<string, unknown> | null;
	sample_text_colors: unknown;
	render_mode: string;
	width: number | null;
	height: number | null;
	dpi: number | null;
	asset_version: string | null;
	version: string | null;
	geometry: TemplateGeometryRow | null;
}

export const CARD_TEMPLATE_SELECT =
	'id, name, short_name, source, quality, kind, orientation, layout_id, sample_path, icon_path, frame_paths, frame_text_colors, sample_text_colors, render_mode, width, height, dpi, asset_version, version, geometry';

/** Bucket public hébergeant les frames ; les chemins des rows y sont relatifs. */
export const CARD_TEMPLATE_BUCKET = 'card-templates';

/**
 * Catalogue complet. ~382 lignes, lues une fois au montage du studio : pas de
 * pagination, le tri place les frames haute fidélité en tête.
 */
export async function fetchCardTemplates(): Promise<CardTemplateRow[]> {
	const client = createClient();
	const { data, error } = await client
		.from('card_templates')
		.select(CARD_TEMPLATE_SELECT)
		.order('quality', { ascending: true }) // 'accurate' avant 'legacy'
		.order('name', { ascending: true });
	if (error) throw new Error(`Failed to load card templates: ${error.message}`);
	return (data ?? []) as CardTemplateRow[];
}

/** URL publique CDN d'un asset du bucket, ou null si le chemin est absent. */
export function cardTemplateAssetUrl(storagePath: string | null | undefined): string | null {
	if (!storagePath) return null;
	const client = createClient();
	const { data } = client.storage.from(CARD_TEMPLATE_BUCKET).getPublicUrl(storagePath);
	return data.publicUrl;
}
