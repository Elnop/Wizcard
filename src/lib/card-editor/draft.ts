import {
	DEFAULT_FRAME_TEMPLATE_ID,
	type CardEditorPayload,
	type CardFaceDraft,
	type CardLayoutId,
	type CustomCardDraft,
} from './types';
import { getManaSymbols } from './text-layout';

export const CARD_EDITOR_AUTOSAVE_KEY = 'wizcard-custom-card-draft-v2';

export function createEmptyFace(): CardFaceDraft {
	return {
		name: '',
		manaCost: '',
		typeLine: '',
		oracleText: '',
		flavorText: '',
		power: '',
		toughness: '',
		loyalty: '',
		artist: '',
		frameStyle: 'auto',
		accentColor: '#c9a84c',
		artwork: {
			dataUrl: '',
			fileName: '',
			mimeType: '',
			zoom: 1,
			offsetX: 0,
			offsetY: 0,
		},
	};
}

export function createInitialCardDraft(language = 'en'): CustomCardDraft {
	return {
		version: 1,
		layoutId: 'arcana',
		mseTemplateId: DEFAULT_FRAME_TEMPLATE_ID,
		faces: [createEmptyFace()],
		activeFace: 0,
		rarity: 'rare',
		finish: 'matte',
		setName: 'Wizcard Studio',
		setCode: 'WIZ',
		collectorNumber: '001',
		language,
		tags: '',
		isPublic: false,
		updatedAt: new Date().toISOString(),
	};
}

export function getActiveFace(draft: CustomCardDraft): CardFaceDraft {
	return draft.faces[draft.activeFace] ?? draft.faces[0];
}

export function calculateManaValue(manaCost: string): number {
	const symbols = getManaSymbols(manaCost);
	return symbols.reduce((total, symbol) => {
		if (/^\d+$/.test(symbol)) return total + Number(symbol);
		if (symbol.toUpperCase() === 'X') return total;
		return total + 1;
	}, 0);
}

export function deriveCardColors(face: CardFaceDraft): string[] {
	const symbols = getManaSymbols(`${face.manaCost} ${face.oracleText}`);
	return ['W', 'U', 'B', 'R', 'G'].filter((color) =>
		symbols.some((symbol) => symbol.split('/').includes(color))
	);
}

export function parseCardTags(tags: string): string[] {
	return [
		...new Set(
			tags
				.split(',')
				.map((tag) => tag.trim())
				.filter(Boolean)
		),
	].slice(0, 24);
}

export function normalizeSetCode(value: string): string {
	return value
		.replace(/[^a-z0-9]/gi, '')
		.slice(0, 6)
		.toUpperCase();
}

export function getCardTypeForLayout(layoutId: CardLayoutId): 'card' | 'token' {
	return layoutId === 'token' ? 'token' : 'card';
}

export function validateCardDraft(draft: CustomCardDraft): Array<'name' | 'type' | 'artwork'> {
	const face = draft.faces[0];
	const errors: Array<'name' | 'type' | 'artwork'> = [];
	if (!face.name.trim()) errors.push('name');
	if (!face.typeLine.trim()) errors.push('type');
	if (!face.artwork.dataUrl) errors.push('artwork');
	return errors;
}

export function toCardEditorPayload(
	draft: CustomCardDraft,
	artStoragePaths: Array<string | null>
): CardEditorPayload {
	return {
		version: 1,
		layoutId: draft.layoutId,
		mseTemplateId: draft.mseTemplateId,
		faces: draft.faces
			.filter((face): face is CardFaceDraft => Boolean(face))
			.map((face, index) => ({
				...face,
				artwork: {
					fileName: face.artwork.fileName,
					mimeType: face.artwork.mimeType,
					zoom: face.artwork.zoom,
					offsetX: face.artwork.offsetX,
					offsetY: face.artwork.offsetY,
					storagePath: artStoragePaths[index] ?? null,
				},
			})),
		rarity: draft.rarity,
		finish: draft.finish,
		setName: draft.setName,
		setCode: normalizeSetCode(draft.setCode),
		collectorNumber: draft.collectorNumber.trim(),
		language: draft.language,
		tags: parseCardTags(draft.tags),
	};
}
