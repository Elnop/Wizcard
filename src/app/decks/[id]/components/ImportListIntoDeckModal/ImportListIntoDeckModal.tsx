'use client';

import { useState, useCallback, useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '@/components/Modal/Modal';
import { Button } from '@/components/Button/Button';
import { Spinner } from '@/components/Spinner/Spinner';
import { ContextMenu, type ContextMenuAction } from '@/components/ContextMenu/ContextMenu';
import { CardList } from '@/lib/card/components/CardList/CardList';
import { CardModal } from '@/lib/card/components/CardModal/CardModal';
import { CardPrintPickerModal } from '@/lib/card/components/CardPrintPickerModal/CardPrintPickerModal';
import { groupByCardType } from '@/lib/card/utils/group-by-card-type';
import { ImportBulkApplyPanel } from '@/app/collection/lib/ImportModal/components/ImportBulkApplyPanel/ImportBulkApplyPanel';
import type { BulkApplyPatch } from '@/lib/import/hooks/useImportBulkApply';
import type { AnyCard, CardListSection } from '@/lib/card/components/CardList/CardList.types';
import type { Card } from '@/types/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { DeckZone } from '@/types/decks';
import { getDeckZone } from '@/types/decks';
import { useDeckContext } from '@/lib/deck/context/DeckContext';
import { parseMTGADeck } from '@/lib/import/formats/mtga-deck';
import { useSetCodeNormalizer } from '@/lib/import/hooks/useSetCodeNormalizer';
import { resolveDeckList, type ResolvedDeckRow } from '@/lib/import/hooks/useResolveDeckList';
import { useImportPreviewEdit, oracleKey, type ZoneMode } from './useImportPreviewEdit';
import styles from './ImportListIntoDeckModal.module.css';

const PLACEHOLDER = `4 Lightning Bolt (M11) 149
4x Counterspell
2 Snapcaster Mage (ISD)

Sideboard
2 Rest in Peace
1 Flusterstorm`;

const ZONE_OPTIONS: { value: DeckZone; label: string }[] = [
	{ value: 'mainboard', label: 'Mainboard' },
	{ value: 'sideboard', label: 'Sideboard' },
	{ value: 'maybeboard', label: 'Maybeboard' },
	{ value: 'commander', label: 'Commander' },
];

const ZONE_LABELS: Record<DeckZone, string> = {
	mainboard: 'Mainboard',
	sideboard: 'Sideboard',
	maybeboard: 'Maybeboard',
	commander: 'Commander',
	tokens: 'Tokens',
};

const ZONE_ORDER: DeckZone[] = ['commander', 'mainboard', 'sideboard', 'maybeboard', 'tokens'];
const MOVABLE_ZONES: DeckZone[] = ['mainboard', 'sideboard', 'maybeboard', 'commander'];

type Step = 'input' | 'resolving' | 'preview';

function modalTitle(step: Step): string {
	switch (step) {
		case 'resolving':
			return 'Récupération des cartes…';
		case 'preview':
			return "Aperçu de l'import";
		default:
			return 'Importer une liste';
	}
}

/** A unique card within a zone, with its total quantity and its copy rowIds. */
type ZoneCard = { card: Card; zone: DeckZone; quantity: number; rowIds: string[] };

type Props = {
	deckId: string;
	existingOracleIds: Set<string>;
	onClose: () => void;
};

export function ImportListIntoDeckModal({ deckId, existingOracleIds, onClose }: Props) {
	const { bulkAddCardsToDeck } = useDeckContext();
	const { normalize: normalizeSetCodes } = useSetCodeNormalizer();

	const [step, setStep] = useState<Step>('input');

	const [text, setText] = useState('');
	const [zone, setZone] = useState<DeckZone>('mainboard');
	// 'fallback': only used for cards without a section. 'force': overrides every card.
	const [zoneMode, setZoneMode] = useState<ZoneMode>('fallback');
	const [ignoreExisting, setIgnoreExisting] = useState(true);
	const [ignoreBasicLands, setIgnoreBasicLands] = useState(false);
	const [nameFilter, setNameFilter] = useState('');

	const [resolvedRows, setResolvedRows] = useState<ResolvedDeckRow[]>([]);
	const [notFound, setNotFound] = useState<string[]>([]);
	const [errors, setErrors] = useState<string[]>([]);

	const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
	const [contextMenu, setContextMenu] = useState<{
		card: Card;
		zone: DeckZone;
		x: number;
		y: number;
	} | null>(null);

	// Bulk selection: keys are `oracleId|zone` (one selectable unit per zone-card).
	const [selectionMode, setSelectionMode] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());

	const parsed = useMemo(() => (text.trim() ? parseMTGADeck(text) : null), [text]);

	// A list has explicit zone sections if any parsed row lands outside mainboard.
	const hasSections = useMemo(
		() => (parsed ? parsed.rows.some((r) => r.zone !== 'mainboard') : false),
		[parsed]
	);

	const {
		cards: editableCards,
		setCardZone,
		incrementCard,
		removeRow,
		removeCardInZone,
		changePrint,
		updateEntry,
		setZoneForRows,
		removeRows,
		changePrintForRows,
		applyPatchToRows,
	} = useImportPreviewEdit({
		resolvedRows,
		existingOracleIds,
		zone,
		zoneMode,
		hasSections,
		ignoreExisting,
		ignoreBasicLands,
	});

	const handleResolve = useCallback(async () => {
		setErrors([]);

		if (!parsed || parsed.rows.length === 0) {
			setErrors(
				parsed && parsed.parseErrors.length > 0
					? parsed.parseErrors
					: ['Aucune carte valide. Collez une liste comme « 4 Lightning Bolt ».']
			);
			return;
		}

		setStep('resolving');
		try {
			const result = await resolveDeckList(parsed, normalizeSetCodes);
			setResolvedRows(result.cardsToAdd);
			setNotFound(result.notFound);
			setStep('preview');
		} catch (err) {
			setErrors([`Échec de l'aperçu : ${err instanceof Error ? err.message : 'erreur inconnue'}`]);
			setStep('input');
		}
	}, [parsed, normalizeSetCodes]);

	const backToInput = useCallback(() => {
		setStep('input');
		setSelectedRowId(null);
		setContextMenu(null);
		setNameFilter('');
	}, []);

	// Group editable copies into one ZoneCard per (oracle, zone), summing quantity.
	const cardsByZone = useMemo(() => {
		const byZone = new Map<DeckZone, Map<string, ZoneCard>>();
		for (const card of editableCards) {
			const z = getDeckZone(card.entry.tags);
			const key = oracleKey(card as ScryfallCard);
			const zoneMap = byZone.get(z) ?? new Map<string, ZoneCard>();
			const existing = zoneMap.get(key);
			if (existing) {
				existing.quantity += 1;
				existing.rowIds.push(card.entry.rowId);
			} else {
				zoneMap.set(key, { card, zone: z, quantity: 1, rowIds: [card.entry.rowId] });
			}
			byZone.set(z, zoneMap);
		}
		return byZone;
	}, [editableCards]);

	// Quantity lookup for the grid badge (keyed by scryfall card id).
	const qtyByCardId = useMemo(() => {
		const map = new Map<string, number>();
		for (const card of editableCards) {
			map.set(card.id, (map.get(card.id) ?? 0) + 1);
		}
		return map;
	}, [editableCards]);

	const filterLower = nameFilter.trim().toLowerCase();

	// Build CardList sections (one per zone), filtered by name. Each zone (except
	// commander) is sub-divided by card type, matching the deck page layout.
	const sections: CardListSection[] = useMemo(() => {
		return ZONE_ORDER.filter((z) => cardsByZone.has(z)).flatMap((z) => {
			const zoneCards = [...cardsByZone.get(z)!.values()].filter(
				(zc) => !filterLower || zc.card.name.toLowerCase().includes(filterLower)
			);
			if (zoneCards.length === 0) return [];

			const cards = zoneCards.map((zc) => zc.card as AnyCard);
			const countById = new Map<string, number>();
			for (const zc of zoneCards) countById.set(zc.card.id, zc.quantity);
			const count = zoneCards.reduce((s, zc) => s + zc.quantity, 0);

			const children = z !== 'commander' ? groupByCardType(cards, countById) : undefined;

			return [
				{
					key: z,
					label: `${ZONE_LABELS[z]} (${count})`,
					cards,
					children,
					background: true,
					defaultCollapsed: z === 'sideboard' || z === 'maybeboard',
				},
			];
		});
	}, [cardsByZone, filterLower]);

	const totalToImport = editableCards.length;
	const uniqueToImport = qtyByCardId.size;

	const handleImport = useCallback(() => {
		if (editableCards.length === 0) {
			setErrors(['Aucune carte à importer.']);
			return;
		}
		// Aggregate copies into bulk-add rows: one per (scryfallId, zone) with quantity.
		const agg = new Map<string, { card: ScryfallCard; zone: DeckZone; quantity: number }>();
		for (const card of editableCards) {
			const z = getDeckZone(card.entry.tags);
			const key = `${card.id}:${z}`;
			const existing = agg.get(key);
			if (existing) existing.quantity += 1;
			else agg.set(key, { card: card as ScryfallCard, zone: z, quantity: 1 });
		}
		bulkAddCardsToDeck(deckId, [...agg.values()]);
		onClose();
	}, [editableCards, bulkAddCardsToDeck, deckId, onClose]);

	// Selection key for a preview card: one selectable unit per (oracle, zone).
	const selKeyFor = useCallback((card: Card): string => {
		return `${oracleKey(card as ScryfallCard)}|${getDeckZone(card.entry.tags)}`;
	}, []);

	// Resolve currently-selected keys to the underlying synthetic rowIds.
	const selectedRowIds = useMemo(() => {
		const ids = new Set<string>();
		for (const key of selected) {
			const [oracle, z] = key.split('|');
			const rowIds = cardsByZone.get(z as DeckZone)?.get(oracle)?.rowIds;
			rowIds?.forEach((id) => ids.add(id));
		}
		return ids;
	}, [selected, cardsByZone]);

	// Drop selection keys that no longer exist (e.g. after a bulk move/remove).
	const pruneSelection = useCallback(() => {
		setSelected((prev) => {
			const next = new Set<string>();
			for (const key of prev) {
				const [oracle, z] = key.split('|');
				if (cardsByZone.get(z as DeckZone)?.has(oracle)) next.add(key);
			}
			return next;
		});
	}, [cardsByZone]);

	const toggleSelected = useCallback((card: Card) => {
		const key = `${oracleKey(card as ScryfallCard)}|${getDeckZone(card.entry.tags)}`;
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}, []);

	const exitSelection = useCallback(() => {
		setSelectionMode(false);
		setSelected(new Set());
	}, []);

	const renderOverlay = (card: AnyCard): ReactNode => {
		const qty = qtyByCardId.get(card.id) ?? 0;
		const qtyBadge = qty > 1 ? <span className={styles.gridBadge}>×{qty}</span> : null;
		if (!selectionMode) return qtyBadge;
		const checked = selected.has(selKeyFor(card as Card));
		return (
			<>
				{qtyBadge}
				<span className={`${styles.selectOverlay} ${checked ? styles.selectOverlayChecked : ''}`}>
					<input type="checkbox" checked={checked} readOnly tabIndex={-1} />
				</span>
			</>
		);
	};

	// --- Selected card (detail modal): all copies of the clicked card across zones ---
	const selectedCopies = useMemo(() => {
		if (!selectedRowId) return null;
		const target = editableCards.find((c) => c.entry.rowId === selectedRowId);
		if (!target) return null;
		const key = oracleKey(target as ScryfallCard);
		return editableCards.filter((c) => oracleKey(c as ScryfallCard) === key);
	}, [selectedRowId, editableCards]);

	const openDetail = useCallback((card: AnyCard) => {
		setSelectedRowId((card as Card).entry?.rowId ?? null);
	}, []);

	// --- Bulk actions on the current selection ---

	const [bulkPrintOpen, setBulkPrintOpen] = useState(false);

	// The single logical card represented by the selection (same oracle across all
	// selected keys) — enables bulk "change print", which is per-card by nature.
	const selectionSingleCard = useMemo<Card | null>(() => {
		const oracles = new Set([...selected].map((k) => k.split('|')[0]));
		if (oracles.size !== 1) return null;
		const oracle = [...oracles][0];
		return editableCards.find((c) => oracleKey(c as ScryfallCard) === oracle) ?? null;
	}, [selected, editableCards]);

	const bulkMoveTo = useCallback(
		(z: DeckZone) => {
			setZoneForRows(selectedRowIds, z);
			pruneSelection();
		},
		[setZoneForRows, selectedRowIds, pruneSelection]
	);

	const bulkRemove = useCallback(() => {
		removeRows(selectedRowIds);
		setSelected(new Set());
	}, [removeRows, selectedRowIds]);

	const bulkApplyAttributes = useCallback(
		(patch: BulkApplyPatch) => {
			applyPatchToRows(selectedRowIds, patch);
		},
		[applyPatchToRows, selectedRowIds]
	);

	const bulkChangePrint = useCallback(
		(print: ScryfallCard) => {
			changePrintForRows(selectedRowIds, print);
			setBulkPrintOpen(false);
			pruneSelection();
		},
		[changePrintForRows, selectedRowIds, pruneSelection]
	);

	// --- Context menu actions ---

	const rowIdsFor = useCallback(
		(card: Card, cardZone: DeckZone): string[] =>
			cardsByZone.get(cardZone)?.get(oracleKey(card as ScryfallCard))?.rowIds ?? [],
		[cardsByZone]
	);

	const moveCardToZone = useCallback(
		(card: Card, from: DeckZone, to: DeckZone) => {
			for (const id of rowIdsFor(card, from)) setCardZone(id, to);
		},
		[rowIdsFor, setCardZone]
	);

	const decrementCard = useCallback(
		(card: Card, cardZone: DeckZone) => {
			const rowIds = rowIdsFor(card, cardZone);
			if (rowIds.length > 0) removeRow(rowIds[rowIds.length - 1]);
		},
		[rowIdsFor, removeRow]
	);

	const contextItems: ContextMenuAction[] = useMemo(() => {
		if (!contextMenu) return [];
		const { card, zone: cardZone } = contextMenu;
		const close = () => setContextMenu(null);
		const run = (fn: () => void) => () => {
			fn();
			close();
		};
		const moveItems: ContextMenuAction[] = MOVABLE_ZONES.filter((z) => z !== cardZone).map((z) => ({
			type: 'action',
			label: `→ ${ZONE_LABELS[z]}`,
			onClick: run(() => moveCardToZone(card, cardZone, z)),
		}));
		return [
			{ type: 'action', label: 'Détail / éditer…', onClick: run(() => openDetail(card)) },
			{ type: 'divider' },
			{ type: 'action', label: '+ 1 copie', onClick: run(() => incrementCard(card, cardZone)) },
			{ type: 'action', label: '− 1 copie', onClick: run(() => decrementCard(card, cardZone)) },
			...(moveItems.length > 0 ? [{ type: 'divider' as const }, ...moveItems] : []),
			{ type: 'divider' },
			{
				type: 'action',
				label: 'Retirer de l’import',
				danger: true,
				onClick: run(() => removeCardInZone(card.id, cardZone)),
			},
		];
	}, [contextMenu, openDetail, incrementCard, decrementCard, removeCardInZone, moveCardToZone]);

	const zoneControls = (
		<div className={styles.options}>
			<label className={styles.label}>
				Zone cible
				<div className={styles.zoneRow}>
					<select
						className={styles.input}
						value={zone}
						onChange={(e) => setZone(e.target.value as DeckZone)}
					>
						{ZONE_OPTIONS.map((z) => (
							<option key={z.value} value={z.value} className={styles.option}>
								{z.label}
							</option>
						))}
					</select>
					<div className={styles.modeToggle} role="group" aria-label="Mode de zone">
						<button
							type="button"
							className={`${styles.modeBtn} ${zoneMode === 'fallback' ? styles.modeBtnActive : ''}`}
							aria-pressed={zoneMode === 'fallback'}
							onClick={() => setZoneMode('fallback')}
						>
							Défaut
						</button>
						<button
							type="button"
							className={`${styles.modeBtn} ${zoneMode === 'force' ? styles.modeBtnActive : ''}`}
							aria-pressed={zoneMode === 'force'}
							onClick={() => setZoneMode('force')}
						>
							Forcer
						</button>
					</div>
				</div>
				<span className={styles.hint}>
					{zoneMode === 'force'
						? 'Toutes les cartes vont dans cette zone, sections ignorées.'
						: 'Utilisée seulement pour les cartes sans section dans la liste.'}
				</span>
			</label>

			<label className={styles.checkbox}>
				<input
					type="checkbox"
					checked={ignoreExisting}
					onChange={(e) => setIgnoreExisting(e.target.checked)}
				/>
				Ignorer les cartes déjà dans le deck
			</label>

			<label className={styles.checkbox}>
				<input
					type="checkbox"
					checked={ignoreBasicLands}
					onChange={(e) => setIgnoreBasicLands(e.target.checked)}
				/>
				Ignorer les terrains de base
			</label>
		</div>
	);

	function renderInput() {
		return (
			<div className={styles.form}>
				<label className={styles.label}>
					Liste de cartes
					<textarea
						className={styles.textarea}
						placeholder={PLACEHOLDER}
						value={text}
						onChange={(e) => setText(e.target.value)}
						rows={9}
						autoFocus
					/>
				</label>

				{zoneControls}

				{errors.length > 0 && (
					<div className={styles.errors}>
						{errors.map((err, i) => (
							<p key={i} className={styles.errorLine}>
								{err}
							</p>
						))}
					</div>
				)}

				<div className={styles.actions}>
					<Button variant="ghost" type="button" onClick={onClose}>
						Annuler
					</Button>
					<Button onClick={handleResolve} disabled={!text.trim()}>
						Aperçu
					</Button>
				</div>
			</div>
		);
	}

	function renderResolving() {
		return (
			<div className={styles.loadingScreen}>
				<Spinner size="md" />
				<p className={styles.loadingLabel}>Récupération des cartes…</p>
			</div>
		);
	}

	function renderPreview() {
		return (
			<div className={styles.previewLayout}>
				<div className={styles.previewLeft}>
					<div className={styles.previewStats}>
						<span className={styles.previewStat}>
							<span className={styles.previewStatValue}>{uniqueToImport}</span> cartes •{' '}
							{totalToImport} copie{totalToImport > 1 ? 's' : ''}
						</span>
						<span className={styles.previewHint}>Clic droit sur une carte pour l’éditer.</span>
					</div>

					{zoneControls}

					{notFound.length > 0 && (
						<div className={styles.scrollArea}>
							<div className={styles.notFound}>
								<p className={styles.notFoundTitle}>
									{notFound.length} non trouvée{notFound.length > 1 ? 's' : ''} sur Scryfall
								</p>
								{notFound.map((n, i) => (
									<span key={i} className={styles.notFoundRow}>
										{n}
									</span>
								))}
							</div>
						</div>
					)}

					{errors.length > 0 && (
						<div className={styles.errors}>
							{errors.map((err, i) => (
								<p key={i} className={styles.errorLine}>
									{err}
								</p>
							))}
						</div>
					)}

					<div className={styles.actions}>
						<Button variant="ghost" type="button" onClick={backToInput}>
							Changer la liste
						</Button>
						<Button onClick={handleImport} disabled={editableCards.length === 0}>
							Ajouter {totalToImport} carte{totalToImport === 1 ? '' : 's'}
						</Button>
					</div>
				</div>

				<div className={styles.previewRight}>
					<div className={styles.previewRightHeader}>
						<input
							type="text"
							className={styles.input}
							value={nameFilter}
							onChange={(e) => setNameFilter(e.target.value)}
							placeholder="Filtrer par nom…"
						/>
						<button
							type="button"
							className={`${styles.selectToggle} ${selectionMode ? styles.selectToggleActive : ''}`}
							onClick={() => (selectionMode ? exitSelection() : setSelectionMode(true))}
						>
							{selectionMode ? 'Annuler' : 'Sélectionner'}
						</button>
					</div>

					{selectionMode && selected.size > 0 && renderBulkBar()}

					<div className={styles.previewRightBody}>
						{sections.length === 0 ? (
							<p className={styles.previewEmpty}>Aucune carte à importer.</p>
						) : (
							<CardList
								cards={sections}
								cardsPerLine={4}
								onCardClick={selectionMode ? (card) => toggleSelected(card as Card) : openDetail}
								onCardContextMenu={
									selectionMode
										? undefined
										: (card, e) => {
												e.preventDefault();
												const c = card as Card;
												setContextMenu({
													card: c,
													zone: getDeckZone(c.entry.tags),
													x: e.clientX,
													y: e.clientY,
												});
											}
								}
								renderOverlay={renderOverlay}
							/>
						)}
					</div>
				</div>
			</div>
		);
	}

	function renderBulkBar() {
		return (
			<div className={styles.bulkBar}>
				<div className={styles.bulkBarRow}>
					<span className={styles.bulkBarCount}>{selected.size} sélectionnée(s)</span>
					<div className={styles.bulkMove}>
						<span className={styles.bulkMoveLabel}>Déplacer&nbsp;:</span>
						{MOVABLE_ZONES.map((z) => (
							<button
								key={z}
								type="button"
								className={styles.bulkMoveBtn}
								onClick={() => bulkMoveTo(z)}
							>
								{ZONE_LABELS[z]}
							</button>
						))}
					</div>
					{selectionSingleCard && (
						<button
							type="button"
							className={styles.bulkMoveBtn}
							onClick={() => setBulkPrintOpen(true)}
						>
							Changer l’édition
						</button>
					)}
					<button
						type="button"
						className={`${styles.bulkMoveBtn} ${styles.bulkRemoveBtn}`}
						onClick={bulkRemove}
					>
						Retirer
					</button>
				</div>
				<ImportBulkApplyPanel cardCount={selectedRowIds.size} onApplyToAll={bulkApplyAttributes} />
			</div>
		);
	}

	return (
		<Modal className={`${styles.modal} ${step === 'preview' ? styles.modalWide : ''}`}>
			<button className={styles.closeIcon} onClick={onClose} aria-label="Fermer" type="button">
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path
						d="M2 2l12 12M14 2L2 14"
						stroke="currentColor"
						strokeWidth="1.8"
						strokeLinecap="round"
					/>
				</svg>
			</button>
			<h2 className={styles.title}>{modalTitle(step)}</h2>
			{step === 'input' && renderInput()}
			{step === 'resolving' && renderResolving()}
			{step === 'preview' && renderPreview()}

			{/* Rendered through a portal to document.body: the import modal sets
			    backdrop-filter, which makes it a containing block for fixed-position
			    descendants — without the portal the detail modal would be clipped to
			    the import modal's height. */}
			{selectedCopies &&
				selectedCopies.length > 0 &&
				createPortal(
					<CardModal
						cards={selectedCopies}
						availableZones={MOVABLE_ZONES}
						onChangeZone={setCardZone}
						onChangePrint={changePrint}
						onSave={updateEntry}
						onRemoveEntry={removeRow}
						onClose={() => setSelectedRowId(null)}
					/>,
					document.body
				)}

			{contextMenu && (
				<ContextMenu
					items={contextItems}
					position={{ x: contextMenu.x, y: contextMenu.y }}
					onClose={() => setContextMenu(null)}
				/>
			)}

			{bulkPrintOpen &&
				selectionSingleCard &&
				createPortal(
					<CardPrintPickerModal
						prints_search_uri={(selectionSingleCard as ScryfallCard).prints_search_uri ?? ''}
						currentCardId={selectionSingleCard.id}
						currentSet={(selectionSingleCard as ScryfallCard).set}
						currentCollectorNumber={(selectionSingleCard as ScryfallCard).collector_number}
						currentLang={selectionSingleCard.entry.language}
						onSelect={bulkChangePrint}
						onClose={() => setBulkPrintOpen(false)}
					/>,
					document.body
				)}
		</Modal>
	);
}
