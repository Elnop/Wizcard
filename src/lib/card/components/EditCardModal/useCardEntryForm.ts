'use client';

import { useEffect, useRef, useState } from 'react';
import type { CardEntry } from '@/types/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { SCRYFALL_CODE_TO_LANGUAGE } from '@/lib/mtg/languages';
import { getCardBySetNumberAndLang } from '@/lib/scryfall/endpoints/cards';
import { resolveLanguageChange } from './resolveLanguageChange';

/**
 * Shared form state + logic for the card-entry modals (AddCardModal / EditCardModal):
 * the draft entry, the previewed print, the change-print picker, and the
 * localized-language fetch (with abort). Both modals compose this hook and render
 * `CardEntryFormBody`; they only differ in init source and their confirm action.
 */
export function useCardEntryForm(initialDraft: Partial<CardEntry>, initialPrint: ScryfallCard) {
	const [draftEntry, setDraftEntry] = useState<Partial<CardEntry>>(initialDraft);
	const [selectedPrint, setSelectedPrint] = useState<ScryfallCard>(initialPrint);
	const [showPrintPicker, setShowPrintPicker] = useState(false);
	const [tagInput, setTagInput] = useState('');
	const [langInfoMessage, setLangInfoMessage] = useState<string | null>(null);
	const langFetchAbort = useRef<AbortController | null>(null);

	function save(patch: Partial<CardEntry>) {
		setDraftEntry((prev) => ({ ...prev, ...patch }));
	}

	async function handleLanguageChange(value: string) {
		const language = (value as CardEntry['language']) || undefined;
		save({ language });

		const action = resolveLanguageChange(language, selectedPrint);
		if (action.kind === 'skip') {
			setLangInfoMessage(null);
			langFetchAbort.current?.abort();
			return;
		}

		langFetchAbort.current?.abort();
		const controller = new AbortController();
		langFetchAbort.current = controller;

		try {
			const localized = await getCardBySetNumberAndLang(
				action.set,
				action.collectorNumber,
				action.langCode,
				controller.signal
			);
			if (controller.signal.aborted) return;
			// Update the local preview only. The print and language are committed to
			// the collection on Save/Confirm, like every other field — committing
			// mid-edit churns the global store and destabilizes the open modal.
			setSelectedPrint(localized);
			setLangInfoMessage(null);
		} catch (err: unknown) {
			if (err instanceof DOMException && err.name === 'AbortError') return;
			if (controller.signal.aborted) return;
			setLangInfoMessage('Image localisée indisponible pour cette édition.');
		}
	}

	function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		const currentTags = draftEntry.tags ?? [];
		if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
			e.preventDefault();
			const newTag = tagInput.trim().replace(/,$/, '');
			if (newTag && !currentTags.includes(newTag)) {
				const newTags = [...currentTags, newTag];
				save({ tags: newTags.length > 0 ? newTags : undefined });
			}
			setTagInput('');
		} else if (e.key === 'Backspace' && !tagInput && currentTags.length > 0) {
			const newTags = currentTags.slice(0, -1);
			save({ tags: newTags.length > 0 ? newTags : undefined });
		}
	}

	function removeTag(tag: string) {
		const newTags = (draftEntry.tags ?? []).filter((t) => t !== tag);
		save({ tags: newTags.length > 0 ? newTags : undefined });
	}

	function selectPrint(print: ScryfallCard) {
		setSelectedPrint(print);
		const lang = print.lang ? SCRYFALL_CODE_TO_LANGUAGE[print.lang] : undefined;
		save({ language: lang });
		setLangInfoMessage(null);
		setShowPrintPicker(false);
	}

	useEffect(() => {
		return () => langFetchAbort.current?.abort();
	}, []);

	// Highlight the print actually shown in the preview. Using the displayed
	// print's lang keeps the picker's "current" marker correct even when a chosen
	// language has no localized print (404 → preview stays unchanged).
	const entryLangCode = selectedPrint.lang ?? 'en';

	return {
		draftEntry,
		selectedPrint,
		showPrintPicker,
		setShowPrintPicker,
		tagInput,
		setTagInput,
		langInfoMessage,
		entryLangCode,
		save,
		handleLanguageChange,
		handleTagKeyDown,
		removeTag,
		selectPrint,
	};
}
