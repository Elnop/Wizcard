'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	CARD_EDITOR_AUTOSAVE_KEY,
	createEmptyFace,
	createInitialCardDraft,
	getActiveFace,
} from '@/lib/card-editor/draft';
import {
	DEFAULT_FRAME_TEMPLATE_ID,
	type CardArtworkDraft,
	type CardFaceDraft,
	type CustomCardDraft,
	type EditableCardField,
} from '@/lib/card-editor/types';

const MAX_HISTORY = 30;

interface CardEditorState {
	draft: CustomCardDraft;
	past: CustomCardDraft[];
	future: CustomCardDraft[];
}

function isStoredDraft(value: unknown): value is CustomCardDraft {
	if (!value || typeof value !== 'object') return false;
	const draft = value as Partial<CustomCardDraft>;
	return draft.version === 1 && Array.isArray(draft.faces) && draft.faces.length > 0;
}

export function useCardEditor(language: string) {
	const [state, setState] = useState<CardEditorState>(() => ({
		draft: createInitialCardDraft(language),
		past: [],
		future: [],
	}));
	const [autosaveStatus, setAutosaveStatus] = useState<'saving' | 'saved' | 'unavailable'>('saved');
	const [hasHydrated, setHasHydrated] = useState(false);

	useEffect(() => {
		const timeout = window.setTimeout(() => {
			try {
				const raw = localStorage.getItem(CARD_EDITOR_AUTOSAVE_KEY);
				if (raw) {
					const parsed: unknown = JSON.parse(raw);
					if (isStoredDraft(parsed)) {
						const migratedDraft = {
							...parsed,
							layoutId: parsed.layoutId === 'landscape' ? ('arcana' as const) : parsed.layoutId,
							mseTemplateId: parsed.mseTemplateId ?? DEFAULT_FRAME_TEMPLATE_ID,
						};
						setState({ draft: migratedDraft, past: [], future: [] });
					}
				}
			} catch {
				setAutosaveStatus('unavailable');
			} finally {
				setHasHydrated(true);
			}
		}, 0);
		return () => window.clearTimeout(timeout);
	}, []);

	useEffect(() => {
		if (!hasHydrated) return;
		const timeout = window.setTimeout(() => {
			try {
				localStorage.setItem(CARD_EDITOR_AUTOSAVE_KEY, JSON.stringify(state.draft));
				setAutosaveStatus('saved');
			} catch {
				setAutosaveStatus('unavailable');
			}
		}, 450);
		return () => window.clearTimeout(timeout);
	}, [hasHydrated, state.draft]);

	const commit = useCallback((buildNext: (current: CustomCardDraft) => CustomCardDraft) => {
		setAutosaveStatus('saving');
		setState((current) => {
			const next = { ...buildNext(current.draft), updatedAt: new Date().toISOString() };
			return {
				draft: next,
				past: [...current.past.slice(-(MAX_HISTORY - 1)), current.draft],
				future: [],
			};
		});
	}, []);

	const updateFace = useCallback(
		(field: EditableCardField, value: string) => {
			commit((draft) => {
				const faces = [...draft.faces] as CustomCardDraft['faces'];
				faces[draft.activeFace] = { ...getActiveFace(draft), [field]: value };
				return { ...draft, faces };
			});
		},
		[commit]
	);

	const updateArtwork = useCallback(
		(artwork: CardArtworkDraft) => {
			commit((draft) => {
				const faces = [...draft.faces] as CustomCardDraft['faces'];
				faces[draft.activeFace] = { ...getActiveFace(draft), artwork };
				return { ...draft, faces };
			});
		},
		[commit]
	);

	const updateFaceAppearance = useCallback(
		(values: Partial<Pick<CardFaceDraft, 'frameStyle' | 'accentColor'>>) => {
			commit((draft) => {
				const faces = [...draft.faces] as CustomCardDraft['faces'];
				faces[draft.activeFace] = { ...getActiveFace(draft), ...values };
				return { ...draft, faces };
			});
		},
		[commit]
	);

	const updateDraft = useCallback(
		(values: Partial<Omit<CustomCardDraft, 'faces' | 'activeFace' | 'version'>>) => {
			commit((draft) => ({ ...draft, ...values }));
		},
		[commit]
	);

	const setActiveFace = useCallback((activeFace: 0 | 1) => {
		setAutosaveStatus('saving');
		setState((current) => ({
			...current,
			draft: { ...current.draft, activeFace },
		}));
	}, []);

	const addBackFace = useCallback(() => {
		commit((draft) => ({ ...draft, faces: [draft.faces[0], createEmptyFace()], activeFace: 1 }));
	}, [commit]);

	const removeBackFace = useCallback(() => {
		commit((draft) => ({ ...draft, faces: [draft.faces[0]], activeFace: 0 }));
	}, [commit]);

	const undo = useCallback(() => {
		setAutosaveStatus('saving');
		setState((current) => {
			const previous = current.past.at(-1);
			if (!previous) return current;
			return {
				draft: previous,
				past: current.past.slice(0, -1),
				future: [current.draft, ...current.future].slice(0, MAX_HISTORY),
			};
		});
	}, []);

	const redo = useCallback(() => {
		setAutosaveStatus('saving');
		setState((current) => {
			const next = current.future[0];
			if (!next) return current;
			return {
				draft: next,
				past: [...current.past, current.draft].slice(-MAX_HISTORY),
				future: current.future.slice(1),
			};
		});
	}, []);

	const reset = useCallback(() => {
		commit(() => createInitialCardDraft(language));
	}, [commit, language]);

	useEffect(() => {
		function handleKeyboard(event: KeyboardEvent) {
			if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
			if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
				return;
			event.preventDefault();
			if (event.shiftKey) redo();
			else undo();
		}
		window.addEventListener('keydown', handleKeyboard);
		return () => window.removeEventListener('keydown', handleKeyboard);
	}, [redo, undo]);

	return useMemo(
		() => ({
			draft: state.draft,
			activeFace: getActiveFace(state.draft),
			autosaveStatus,
			hasHydrated,
			canUndo: state.past.length > 0,
			canRedo: state.future.length > 0,
			updateFace,
			updateArtwork,
			updateFaceAppearance,
			updateDraft,
			setActiveFace,
			addBackFace,
			removeBackFace,
			undo,
			redo,
			reset,
		}),
		[
			state,
			autosaveStatus,
			hasHydrated,
			updateFace,
			updateArtwork,
			updateFaceAppearance,
			updateDraft,
			setActiveFace,
			addBackFace,
			removeBackFace,
			undo,
			redo,
			reset,
		]
	);
}
