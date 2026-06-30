'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { Card } from '@/types/cards';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import { useCardPrints } from '@/lib/scryfall/hooks/useCardPrints';
import { CardList } from '@/lib/card/components/CardList/CardList';
import { CardLightbox } from '@/lib/card/components/CardLightbox/CardLightbox';
import {
	type CollectionCopyEntry,
	groupCollectionByPrint,
	getLangLabel,
} from '@/lib/card/components/PrintList/PrintList.types';
import { LANGUAGE_TO_SCRYFALL_CODE } from '@/lib/mtg/languages';
import { Modal } from '@/components/Modal/Modal';
import styles from './UseCollectionCopyModal.module.css';

export type { CollectionCopyEntry };

interface Props {
	prints_search_uri: string;
	collectionCopies: CollectionCopyEntry[];
	/** rowId of the collection copy currently linked to the row being edited. */
	currentCollectionRowId?: string;
	onSelectCollectionCopy: (rowId: string) => void;
	/** When provided and a copy is currently linked, shows a "None" option to unassign. */
	onSelectNone?: () => void;
	onClose: () => void;
}

export function UseCollectionCopyModal({
	prints_search_uri,
	collectionCopies,
	currentCollectionRowId,
	onSelectCollectionCopy,
	onSelectNone,
	onClose,
}: Props) {
	const { prints, loading, error } = useCardPrints(prints_search_uri);
	const [lightboxCard, setLightboxCard] = useState<Card | ScryfallCard | null>(null);

	const sections = useMemo(() => {
		if (prints.length === 0) return [];
		const printMap = new Map<string, ScryfallCard>(prints.map((p) => [p.id, p]));
		return groupCollectionByPrint(collectionCopies, printMap);
	}, [collectionCopies, prints]);

	function handleSelect(rowId: string) {
		onSelectCollectionCopy(rowId);
		onClose();
	}

	function renderOverlay(anyCard: AnyCard): ReactNode {
		if (!('entry' in anyCard)) return null;
		const card = anyCard as Card;
		const copyMeta = collectionCopies.find((c) => c.rowId === card.entry.rowId);
		const isSelected =
			currentCollectionRowId !== undefined && card.entry.rowId === currentCollectionRowId;
		const assignedDeckName = copyMeta?.assignedToDeckName;

		if (isSelected) {
			return (
				<button type="button" className={`${styles.selectBtn} ${styles.selectBtnActive}`} disabled>
					Selected
				</button>
			);
		}

		return (
			<>
				{assignedDeckName && (
					<span className={styles.assignedBadge} title={`Used in: ${assignedDeckName}`}>
						Used
					</span>
				)}
				<button
					type="button"
					className={styles.copySelectBtn}
					onClick={(e) => {
						e.stopPropagation();
						handleSelect(card.entry.rowId);
					}}
				>
					Utiliser
				</button>
			</>
		);
	}

	const tableColumns = [
		{
			key: 'set',
			label: 'Print',
			render: (anyCard: AnyCard) => {
				const card = anyCard as ScryfallCard;
				return (
					<>
						<div className={styles.setName}>{card.set_name}</div>
						<div className={styles.setMeta}>#{card.collector_number}</div>
					</>
				);
			},
		},
		{
			key: 'meta',
			label: 'Details',
			render: (anyCard: AnyCard) => {
				if (!('entry' in anyCard)) return null;
				const card = anyCard as Card;
				const langCode = card.entry.language
					? LANGUAGE_TO_SCRYFALL_CODE[card.entry.language as keyof typeof LANGUAGE_TO_SCRYFALL_CODE]
					: null;
				const langLabel = langCode
					? // eslint-disable-next-line sonarjs/slow-regex -- short lang label strings, no ReDoS risk
						getLangLabel(langCode, 0).replace(/\s*\(\d+\)$/, '')
					: (card.entry.language ?? null);
				return (
					<span className={styles.copyMeta}>
						<span className={styles.copyCondition}>{card.entry.condition ?? 'NM'}</span>
						{card.entry.isFoil && <span className={styles.copyFoil}>✦</span>}
						{langLabel && card.entry.language !== 'English' && (
							<span className={styles.copyLang}>{langLabel}</span>
						)}
					</span>
				);
			},
		},
		{
			key: 'action',
			label: '',
			render: (anyCard: AnyCard) => renderOverlay(anyCard),
		},
	];

	let content: ReactNode;
	if (loading) {
		content = <p className={styles.status}>Loading prints…</p>;
	} else if (error) {
		content = <p className={styles.statusError}>{error}</p>;
	} else if (sections.length === 0) {
		content = <p className={styles.status}>No card in the collection.</p>;
	} else {
		content = (
			<CardList
				cards={sections}
				pageSize={false}
				viewModes={['grid', 'fluid-grid', 'table']}
				renderOverlay={renderOverlay}
				onCardClick={(card) => setLightboxCard(card as Card | ScryfallCard)}
				tableColumns={tableColumns}
			/>
		);
	}

	return (
		<Modal onClose={onClose} className={styles.modal} zIndex={1100}>
			<div className={styles.header}>
				<h2 className={styles.title}>Use a card from the collection</h2>
				<button className={styles.closeIcon} onClick={onClose} aria-label="Close" type="button">
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path
							d="M2 2l12 12M14 2L2 14"
							stroke="currentColor"
							strokeWidth="1.8"
							strokeLinecap="round"
						/>
					</svg>
				</button>
			</div>
			<div className={styles.body}>
				{onSelectNone && currentCollectionRowId !== undefined && (
					<div className={styles.noneRow}>
						<button
							type="button"
							className={styles.noneBtn}
							title="Unassign this card from the deck (becomes unowned again)"
							onClick={() => {
								onSelectNone();
								onClose();
							}}
						>
							None ✕
						</button>
					</div>
				)}
				{content}
			</div>
			{lightboxCard && (
				<CardLightbox card={lightboxCard as ScryfallCard} onClose={() => setLightboxCard(null)} />
			)}
		</Modal>
	);
}
