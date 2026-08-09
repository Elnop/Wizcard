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
/**
 * Police déclarée par le style pour un champ.
 *
 * `size` est en UNITÉS DE STYLE (repère de la carte, ex. 375x523), pas en pixels
 * du canvas : c'est `templateGeometry` qui lui applique la même échelle qu'aux
 * boîtes. Le corpus va de 6.93 à 32 selon le gabarit — d'où l'inutilité d'une
 * taille codée en dur.
 */
export interface TemplateFontRow {
	name: string;
	size: number;
	/** Ascendante/descendante en fraction de la taille, lues dans le TTF. */
	ascent?: number;
	descent?: number;
	/**
	 * Couleur MESURÉE du texte (`rgb(r,g,b)` ou nom CSS), quand le style la
	 * déclare — 132 des 140 gabarits mesurés.
	 *
	 * À ne pas confondre avec `frame_text_colors`, qui porte la MÊME valeur
	 * (`#17140d`) pour tous les gabarits : cette colonne-là est une constante
	 * d'ingestion, pas une mesure. Le canvas préfère donc celle-ci quand elle
	 * existe.
	 */
	color?: string;
	/**
	 * Ombre portée, quand le style en déclare une (37 gabarits).
	 *
	 * `dx`/`dy` sont en unités de style : ils passent par le même facteur
	 * d'échelle que les boîtes et les tailles de police.
	 */
	shadow?: { color: string; dx: number; dy: number };
}

/**
 * Où poser le texte dans sa boîte, tel que le style le déclare.
 *
 * Le canvas utilisait des décalages constants (`boîte + 36`) qui ne
 * correspondaient à aucun ancrage MSE : 125 gabarits sur 136 débordaient de
 * leur boîte de ligne de type. Le corpus déclare pourtant l'ancrage pour les
 * 140 gabarits mesurés, et une marge pour 120 d'entre eux.
 */
export interface TemplateLayoutRow {
	anchor?: 'top' | 'middle' | 'bottom';
	padding?: { top?: number; left?: number; right?: number; bottom?: number };
}

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
	/**
	 * Polices mesurées, par champ. Optionnel : les lignes écrites avant
	 * l'extraction des polices n'en ont pas, et un champ dont la police ne s'est
	 * pas résolue est absent (« aucun fallback »). Le canvas retombe alors sur sa
	 * pile générique.
	 */
	fonts?: Partial<Record<'name' | 'type' | 'text' | 'pt', TemplateFontRow>>;
	/** Ancrage et marges mesurés, par champ. Même statut partiel que `fonts`. */
	layout?: Partial<Record<'name' | 'type' | 'text' | 'pt', TemplateLayoutRow>>;
}

export interface CardTemplateRow {
	id: string;
	name: string;
	short_name: string | null;
	source: string;
	quality: string;
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
	installer_group: string | null;
	position_hint: string | null;
	tags: string[];
	crown_paths: Record<string, string> | null;
	blend_masks: Record<string, string> | null;
}

export const CARD_TEMPLATE_SELECT =
	'id, name, short_name, source, quality, orientation, layout_id, sample_path, icon_path, frame_paths, frame_text_colors, sample_text_colors, render_mode, width, height, dpi, asset_version, version, geometry, installer_group, position_hint, tags, crown_paths, blend_masks';

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
