'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { Card } from '@/types/cards';
import type { AnyCard, CardListSection } from '@/lib/card/components/CardList/CardList.types';
import { useCardPrints } from '@/lib/scryfall/hooks/useCardPrints';
import { CardList } from '@/lib/card/components/CardList/CardList';
import { CardLightbox } from '@/lib/card/components/CardLightbox/CardLightbox';
import { type PrintListProps, groupPrintsByLang, groupCollectionByPrint } from './PrintList.types';
import styles from './PrintList.module.css';

export function PrintList({
	prints_search_uri,
	currentCardId,
	currentSet,
	currentCollectorNumber,
	currentLang,
	onSelect,
	collectionCopies,
	onSelectCollectionCopy,
}: PrintListProps) {
	const { prints, loading, error } = useCardPrints(prints_search_uri);
	const [lightboxCard, setLightboxCard] = useState<ScryfallCard | null>(null);

	function isCurrentPrint(card: ScryfallCard): boolean {
		if (currentSet && currentCollectorNumber && currentLang) {
			return (
				card.set === currentSet &&
				card.collector_number === currentCollectorNumber &&
				(card.lang ?? 'en') === currentLang
			);
		}
		return card.id === currentCardId;
	}

	const sections: CardListSection[] = [];

	if (collectionCopies && collectionCopies.length > 0 && prints.length > 0) {
		const printMap = new Map<string, ScryfallCard>(prints.map((p) => [p.id, p]));
		const printSections = groupCollectionByPrint(collectionCopies, printMap);

		if (printSections.length > 0) {
			sections.push({
				label: `Ma collection (${collectionCopies.length})`,
				cards: [],
				children: printSections,
			});
		}
	}

	if (!loading && !error && prints.length > 0) {
		const langSections = groupPrintsByLang(prints, currentLang ?? 'en');
		sections.push(...langSections);
	}

	function renderOverlay(anyCard: AnyCard): ReactNode {
		if ('entry' in anyCard) {
			const card = anyCard as Card;
			const copyMeta = (collectionCopies ?? []).find((c) => c.rowId === card.entry.rowId);
			const assignedDeckName = copyMeta?.assignedToDeckName;
			const isCurrentDeck = copyMeta?.isCurrentDeck ?? false;

			if (isCurrentDeck) {
				return (
					<button
						type="button"
						className={`${styles.selectBtn} ${styles.selectBtnActive}`}
						onClick={(e) => {
							e.stopPropagation();
							onSelectCollectionCopy?.(card.entry.rowId);
						}}
					>
						Sélectionné
					</button>
				);
			}

			return (
				<>
					{assignedDeckName && (
						<span className={styles.assignedBadge} title={`Utilisé dans : ${assignedDeckName}`}>
							Utilisé
						</span>
					)}
					<button
						type="button"
						className={styles.copySelectBtn}
						onClick={(e) => {
							e.stopPropagation();
							onSelectCollectionCopy?.(card.entry.rowId);
						}}
					>
						Utiliser
					</button>
				</>
			);
		}

		const print = anyCard as ScryfallCard;
		const isCurrent = isCurrentPrint(print);
		return (
			<button
				type="button"
				className={`${styles.selectBtn} ${isCurrent ? styles.selectBtnActive : ''}`}
				onClick={(e) => {
					e.stopPropagation();
					onSelect(print);
				}}
			>
				{isCurrent ? 'Sélectionné' : 'Sélectionner'}
			</button>
		);
	}

	const tableColumns = [
		{
			key: 'set',
			label: 'Édition',
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
			key: 'rarity',
			label: 'Rareté',
			render: (anyCard: AnyCard) => {
				const rarity = (anyCard as ScryfallCard).rarity ?? '';
				return rarity.charAt(0).toUpperCase() + rarity.slice(1);
			},
		},
		{
			key: 'meta',
			label: 'Détails',
			render: (anyCard: AnyCard) => {
				if (!('entry' in anyCard)) return null;
				const card = anyCard as Card;
				return (
					<span className={styles.copyMeta}>
						<span className={styles.copyCondition}>{card.entry.condition ?? 'NM'}</span>
						{card.entry.isFoil && <span className={styles.copyFoil}>✦</span>}
						{card.entry.language && card.entry.language !== 'English' && (
							<span className={styles.copyLang}>{card.entry.language}</span>
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

	if (loading) return <p className={styles.status}>Chargement des éditions…</p>;
	if (error) return <p className={styles.statusError}>{error}</p>;
	if (sections.length === 0) return <p className={styles.status}>Aucune édition trouvée.</p>;

	return (
		<>
			<CardList
				cards={sections}
				pageSize={false}
				viewModes={['grid', 'fluid-grid', 'table']}
				renderOverlay={renderOverlay}
				onCardClick={(card) => setLightboxCard(card as ScryfallCard)}
				tableColumns={tableColumns}
			/>
			{lightboxCard && <CardLightbox card={lightboxCard} onClose={() => setLightboxCard(null)} />}
		</>
	);
}
