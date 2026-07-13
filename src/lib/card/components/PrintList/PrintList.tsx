'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { Card } from '@/types/cards';
import type { AnyCard, CardListSection } from '@/lib/card/components/CardList/CardList.types';
import { useCardPrints } from '@/lib/scryfall/hooks/useCardPrints';
import { CardList } from '@/lib/card/components/CardList/CardList';
import { CardLightbox } from '@/lib/card/components/CardLightbox/CardLightbox';
import { type PrintListProps, groupPrintsByLang } from './PrintList.types';
import styles from './PrintList.module.css';

export function PrintList({
	prints_search_uri,
	currentCardId,
	currentSet,
	currentCollectorNumber,
	currentLang,
	onSelect,
}: PrintListProps) {
	const t = useTranslations('card');
	const { prints, loading, error } = useCardPrints(prints_search_uri);
	const [lightboxCard, setLightboxCard] = useState<Card | ScryfallCard | null>(null);

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

	const sections: CardListSection[] = useMemo(() => {
		if (loading || error || prints.length === 0) return [];
		return groupPrintsByLang(prints, currentLang ?? 'en');
	}, [prints, loading, error, currentLang]);

	function renderOverlay(anyCard: AnyCard): ReactNode {
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
				{isCurrent ? 'Selected' : 'Select'}
			</button>
		);
	}

	const tableColumns = [
		{
			key: 'set',
			label: t('colPrint'),
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
			label: t('rarity'),
			render: (anyCard: AnyCard) => {
				const rarity = (anyCard as ScryfallCard).rarity ?? '';
				return rarity.charAt(0).toUpperCase() + rarity.slice(1);
			},
		},
		{
			key: 'action',
			label: '',
			render: (anyCard: AnyCard) => renderOverlay(anyCard),
		},
	];

	if (loading) return <p className={styles.status}>{t('loadingPrints')}</p>;
	if (error) return <p className={styles.statusError}>{error}</p>;
	if (sections.length === 0) return <p className={styles.status}>{t('noPrintFound')}</p>;

	return (
		<>
			<CardList
				cards={sections}
				pageSize={false}
				viewModes={['grid', 'fluid-grid', 'table']}
				renderOverlay={renderOverlay}
				onCardClick={(card) => setLightboxCard(card as Card | ScryfallCard)}
				tableColumns={tableColumns}
			/>
			{lightboxCard && (
				<CardLightbox card={lightboxCard as ScryfallCard} onClose={() => setLightboxCard(null)} />
			)}
		</>
	);
}
