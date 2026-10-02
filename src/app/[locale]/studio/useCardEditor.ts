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
	type CardLayoutId,
	type CustomCardDraft,
	type EditableCardField,
} from '@/lib/card-editor/types';
import { cardToDraft, importedFaceCount } from '@/lib/card-editor/card-to-draft';
import { importArtwork } from '@/lib/card-editor/image';
import { useTypeVocabularyBridge } from '@/lib/card-editor/useTypeVocabularyBridge';
import type { Card } from '@/types/cards';

const MAX_HISTORY = 30;

/** Un import est-il en cours ? Pilote l'état du bouton de la barre d'outils. */
export type CardImportStatus = 'idle' | 'importing';

/**
 * Issue d'un import, rendue à l'appelant.
 *
 * `artFailed` n'est PAS un échec de l'import : le texte est posé, seule
 * l'illustration manque. Le studio ne peut pas inventer une illustration (même
 * règle que pour la géométrie des cadres), donc il le dit et laisse la boîte
 * d'art vide — à l'utilisateur d'en téléverser une.
 */
export type CardImportOutcome = 'imported' | 'artFailed';

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
	useTypeVocabularyBridge();
	const [state, setState] = useState<CardEditorState>(() => ({
		draft: createInitialCardDraft(language),
		past: [],
		future: [],
	}));
	const [autosaveStatus, setAutosaveStatus] = useState<'saving' | 'saved' | 'unavailable'>('saved');
	const [hasHydrated, setHasHydrated] = useState(false);
	const [importStatus, setImportStatus] = useState<CardImportStatus>('idle');

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

	/**
	 * Pose une illustration sur une face DÉSIGNÉE, sans passer par `activeFace`.
	 *
	 * L'import récupère l'art après coup : entre la requête et sa réponse,
	 * l'utilisateur a pu changer de face. Écrire sur la face active poserait
	 * alors le recto sur le verso.
	 *
	 * Ne touche pas à l'historique : l'arrivée de l'illustration prolonge
	 * l'import déjà enregistré, elle n'est pas une seconde action de
	 * l'utilisateur. Un Ctrl+Z annule donc l'import entier, texte ET image.
	 */
	const setFaceArtwork = useCallback((faceIndex: 0 | 1, artwork: CardArtworkDraft) => {
		setState((current) => {
			const face = current.draft.faces[faceIndex];
			if (!face) return current;
			const faces = [...current.draft.faces] as CustomCardDraft['faces'];
			faces[faceIndex] = { ...face, artwork };
			return { ...current, draft: { ...current.draft, faces } };
		});
	}, []);

	/**
	 * Remplit le brouillon à partir d'une carte existante.
	 *
	 * Le texte est posé en UN SEUL commit, donc un Ctrl+Z annule tout l'import
	 * d'un coup — c'est le filet qui remplace la boîte de dialogue de
	 * confirmation.
	 *
	 * L'illustration suit de façon asynchrone et son échec n'annule rien : une
	 * carte importée sans art reste une carte importée utilisable.
	 */
	const importFromCard = useCallback(
		async (card: Card, layoutId: CardLayoutId): Promise<CardImportOutcome> => {
			setImportStatus('importing');
			// Le nombre de faces se lit sur la CARTE, pas dans le commit : React
			// diffère le calcul de `setState`, donc une variable renseignée depuis
			// l'intérieur du callback vaut encore sa valeur initiale au moment de
			// lancer les requêtes d'illustration. Mesuré : un recto-verso ne
			// demandait que l'art du recto, et le verso restait vide.
			const faceCount = importedFaceCount(card);
			commit((draft) => ({
				// `layoutId` arrive de l'appelant : `cardToDraft` est un module pur,
				// sans accès au catalogue de gabarits qui seul sait quelle mise en
				// page accompagne le cadre. Les deux s'écrivent ici, ensemble.
				...cardToDraft(card, draft),
				layoutId,
			}));

			const results = await Promise.all(
				Array.from({ length: faceCount }, async (_unused, index) => {
					try {
						const artwork = await importArtwork(card.id, index as 0 | 1);
						setFaceArtwork(index as 0 | 1, { ...artwork, zoom: 1, offsetX: 0, offsetY: 0 });
						return true;
					} catch {
						return false;
					}
				})
			);

			setImportStatus('idle');
			// Rendu à l'appelant plutôt que laissé dans le state : c'est l'issue
			// d'UNE action, pas un état durable du studio. Le state ne garde que
			// `importing`, qui lui pilote l'affichage du bouton.
			return results.every(Boolean) ? 'imported' : 'artFailed';
		},
		[commit, setFaceArtwork]
	);

	const updateFaceAppearance = useCallback(
		(values: Partial<Pick<CardFaceDraft, 'frameStyle' | 'accentColor' | 'blendMode'>>) => {
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
			importStatus,
			canUndo: state.past.length > 0,
			canRedo: state.future.length > 0,
			importFromCard,
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
			importStatus,
			importFromCard,
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
