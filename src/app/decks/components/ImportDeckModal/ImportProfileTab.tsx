'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/Button/Button';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { extractMoxfieldUsername, fetchMoxfieldUserDecks } from '@/lib/moxfield/fetch-user-decks';
import { fetchMoxfieldDeck } from '@/lib/moxfield/fetch-deck';
import { convertMoxfieldDeck } from '@/lib/moxfield/convert-deck';
import type { MoxfieldUserDeckEntry } from '@/lib/moxfield/fetch-user-decks';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { ColorIdentityIcons } from '@/lib/scryfall/components/ColorIdentityIcons';
import { FORMAT_LABELS } from './ImportDeckModal';
import styles from './ImportProfileTab.module.css';

type Phase = 'input' | 'select' | 'importing';

type Props = { onClose: () => void };

export function ImportProfileTab({ onClose }: Props) {
	const { createDeck, createFolder, bulkAddCardsToDeck } = useDeckContext();

	const [phase, setPhase] = useState<Phase>('input');
	const [input, setInput] = useState('');
	const [decks, setDecks] = useState<MoxfieldUserDeckEntry[]>([]);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [useImportFolder, setUseImportFolder] = useState(true);
	const [preserveFolders, setPreserveFolders] = useState(true);
	const [isFetching, setIsFetching] = useState(false);
	const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
	const [errors, setErrors] = useState<string[]>([]);

	const handleFetch = useCallback(async () => {
		setErrors([]);
		const username = extractMoxfieldUsername(input);
		if (!username) {
			setErrors([
				'Invalid username or profile URL. Expected: https://moxfield.com/users/... or just the username.',
			]);
			return;
		}
		setIsFetching(true);
		try {
			const fetched = await fetchMoxfieldUserDecks(username);
			if (fetched.length === 0) {
				setErrors(['No public decks found for this user.']);
				return;
			}
			setDecks(fetched);
			setSelected(new Set(fetched.map((d) => d.publicId)));
			setPhase('select');
		} catch (err) {
			setErrors([err instanceof Error ? err.message : 'Failed to fetch Moxfield profile.']);
		} finally {
			setIsFetching(false);
		}
	}, [input]);

	const toggleAll = useCallback(() => {
		setSelected((prev) =>
			prev.size === decks.length ? new Set() : new Set(decks.map((d) => d.publicId))
		);
	}, [decks]);

	const toggleDeck = useCallback((publicId: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(publicId)) next.delete(publicId);
			else next.add(publicId);
			return next;
		});
	}, []);

	const handleImport = useCallback(async () => {
		if (selected.size === 0) return;
		setErrors([]);
		setPhase('importing');

		const toImport = decks.filter((d) => selected.has(d.publicId));
		setProgress({ done: 0, total: toImport.length });

		// Optionally create top-level import folder
		let rootFolderId: string | null = null;
		if (useImportFolder) {
			rootFolderId = createFolder('Import From Moxfield', null);
		}

		// Build subfolder map if preserving Moxfield folder structure
		const subfolderMap = new Map<string, string>(); // folderName → Wizcard folderId

		const importErrors: string[] = [];

		for (let i = 0; i < toImport.length; i++) {
			const entry = toImport[i];
			try {
				// Determine target folder
				let folderId: string | null = rootFolderId;
				if (preserveFolders && entry.folderName) {
					const key = entry.folderName;
					if (!subfolderMap.has(key)) {
						const subId = createFolder(key, rootFolderId);
						subfolderMap.set(key, subId);
					}
					folderId = subfolderMap.get(key) ?? rootFolderId;
				}

				// Fetch full deck data
				const deckResponse = await fetchMoxfieldDeck(entry.publicId);
				const deckData = convertMoxfieldDeck(deckResponse);

				// Create deck
				const deckId = createDeck(deckData.name, deckData.format, deckData.description, folderId);

				// Add cards
				const cardsToAdd = deckData.cards.map((c) => ({
					card: { id: c.scryfallId } as ScryfallCard,
					zone: c.zone,
					quantity: c.quantity,
				}));
				bulkAddCardsToDeck(deckId, cardsToAdd);
			} catch {
				importErrors.push(`Failed to import "${entry.name}"`);
			}
			setProgress({ done: i + 1, total: toImport.length });
		}

		if (importErrors.length > 0) {
			setErrors(importErrors);
		}
		// Stay open so user sees the result; they close manually
		setPhase('select');
	}, [
		selected,
		decks,
		useImportFolder,
		preserveFolders,
		createFolder,
		createDeck,
		bulkAddCardsToDeck,
	]);

	// Group decks by folderName for display
	const grouped = groupByFolder(decks);

	if (phase === 'input') {
		return (
			<div className={styles.root}>
				<label className={styles.label}>
					Moxfield Username or Profile URL
					<div className={styles.urlRow}>
						<input
							type="text"
							className={styles.input}
							value={input}
							onChange={(e) => setInput(e.target.value)}
							onKeyDown={(e) => e.key === 'Enter' && void handleFetch()}
							placeholder="SaffronOlive or https://moxfield.com/users/..."
							autoFocus
						/>
						<Button
							variant="secondary"
							onClick={() => void handleFetch()}
							disabled={!input.trim() || isFetching}
							isLoading={isFetching}
						>
							Fetch
						</Button>
					</div>
				</label>
				{errors.length > 0 && (
					<div className={styles.errors}>
						{errors.map((e, i) => (
							<p key={i} className={styles.errorLine}>
								{e}
							</p>
						))}
					</div>
				)}
				<div className={styles.actions}>
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
				</div>
			</div>
		);
	}

	const selectedCount = selected.size;
	const allSelected = selectedCount === decks.length;

	return (
		<div className={styles.root}>
			<div className={styles.listHeader}>
				<button type="button" className={styles.selectAll} onClick={toggleAll}>
					{allSelected ? 'Deselect all' : 'Select all'} ({decks.length})
				</button>
				<span className={styles.selectedCount}>{selectedCount} selected</span>
			</div>

			<div className={styles.deckList}>
				{grouped.map(({ folderName, items }) => (
					<div key={folderName ?? '__none__'} className={styles.group}>
						{folderName && <div className={styles.groupLabel}>{folderName}</div>}
						{items.map((deck) => (
							<label key={deck.publicId} className={styles.deckRow}>
								<input
									type="checkbox"
									checked={selected.has(deck.publicId)}
									onChange={() => toggleDeck(deck.publicId)}
									className={styles.checkbox}
								/>
								<span className={styles.deckName}>{deck.name}</span>
								<span className={styles.deckMeta}>
									{deck.format ? (FORMAT_LABELS[deck.format] ?? deck.format) : '—'}
								</span>
								<span className={styles.deckColors}>
									{deck.colorIdentity.length > 0 ? (
										<ColorIdentityIcons colors={deck.colorIdentity} size={14} />
									) : (
										'—'
									)}
								</span>
								<span className={styles.deckMeta}>{deck.cardCount}c</span>
								<span className={styles.deckMeta}>
									{deck.lastUpdatedAtUtc ? formatDate(deck.lastUpdatedAtUtc) : '—'}
								</span>
							</label>
						))}
					</div>
				))}
			</div>

			<div className={styles.options}>
				<label className={styles.optionRow}>
					<input
						type="checkbox"
						checked={useImportFolder}
						onChange={(e) => setUseImportFolder(e.target.checked)}
					/>
					Put imported decks in a folder &quot;Import From Moxfield&quot;
				</label>
				<label className={styles.optionRow}>
					<input
						type="checkbox"
						checked={preserveFolders}
						onChange={(e) => setPreserveFolders(e.target.checked)}
					/>
					Preserve Moxfield folder structure as subfolders
				</label>
			</div>

			{progress && phase === 'importing' && (
				<p className={styles.progress}>
					Importing… {progress.done}/{progress.total}
				</p>
			)}

			{errors.length > 0 && (
				<div className={styles.errors}>
					{errors.map((e, i) => (
						<p key={i} className={styles.errorLine}>
							{e}
						</p>
					))}
				</div>
			)}

			<div className={styles.actions}>
				<Button variant="ghost" onClick={onClose} disabled={phase === 'importing'}>
					{errors.length > 0 ? 'Close' : 'Cancel'}
				</Button>
				<Button
					onClick={() => void handleImport()}
					disabled={selectedCount === 0 || phase === 'importing'}
					isLoading={phase === 'importing'}
				>
					Import {selectedCount > 0 ? `${selectedCount} deck${selectedCount > 1 ? 's' : ''}` : ''}
				</Button>
			</div>
		</div>
	);
}

function groupByFolder(
	decks: MoxfieldUserDeckEntry[]
): Array<{ folderName: string | null; items: MoxfieldUserDeckEntry[] }> {
	const map = new Map<string, MoxfieldUserDeckEntry[]>();
	const order: Array<string | null> = [];

	for (const deck of decks) {
		const key = deck.folderName ?? '__none__';
		if (!map.has(key)) {
			map.set(key, []);
			order.push(deck.folderName);
		}
		map.get(key)!.push(deck);
	}

	return order.map((folderName) => ({
		folderName,
		items: map.get(folderName ?? '__none__')!,
	}));
}

function formatDate(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
}
