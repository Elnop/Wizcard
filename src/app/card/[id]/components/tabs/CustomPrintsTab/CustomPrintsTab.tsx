'use client';

import { useState } from 'react';
import type { CustomCard } from '@/lib/mpc/types';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CardEntry } from '@/types/cards';
import type { AnyCard, CardListSection } from '@/lib/card/components/CardList/CardList.types';
import { useCustomCardPrints } from '@/lib/mpc/hooks/useCustomCardPrints';
import { CardList } from '@/lib/card/components/CardList/CardList';
import { CardImage } from '@/lib/card/components/CardImage/CardImage';
import { EditCardModal } from '@/lib/card/components/EditCardModal/EditCardModal';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import styles from './CustomPrintsTab.module.css';

interface Props {
	card: CustomCard;
}

function Thumb({ card }: { card: CustomCard }) {
	return (
		<CardImage
			card={card as unknown as Parameters<typeof CardImage>[0]['card']}
			size="small"
			className={styles.thumb}
		/>
	);
}

export function CustomPrintsTab({ card }: Props) {
	const oracleId = card.oracle_id;
	const { prints, loading } = useCustomCardPrints(oracleId, card.id);
	const [addingCard, setAddingCard] = useState<CustomCard | null>(null);
	const { addCard } = useCollectionContext();

	if (!oracleId) {
		return (
			<p className={styles.empty}>
				Cette carte n&apos;est pas enrichie — les prints alternatifs ne sont pas disponibles.
			</p>
		);
	}

	const sections: CardListSection[] = [
		{
			label: 'Prints custom',
			cards: prints as unknown as AnyCard[],
		},
	];

	function handleAdd(print: CustomCard, entry: Partial<CardEntry>) {
		addCard(print as unknown as ScryfallCard, entry);
		setAddingCard(null);
	}

	return (
		<>
			{!loading && prints.length === 0 && (
				<p className={styles.empty}>Aucun autre print custom connu pour cette carte.</p>
			)}

			{(loading || prints.length > 0) && (
				<CardList
					cards={sections}
					isLoading={loading}
					pageSize={false}
					tableColumns={[
						{
							key: 'image',
							label: '',
							render: (p: AnyCard) => <Thumb card={p as CustomCard} />,
						},
						{
							key: 'source',
							label: 'Source',
							render: (p: AnyCard) => {
								const c = p as CustomCard;
								return (
									<>
										<div className={styles.sourceName}>{c.custom.source_name}</div>
										{c.custom.set_code && (
											<div className={styles.meta}>
												{c.custom.set_code.toUpperCase()}
												{c.custom.collector_number ? ` #${c.custom.collector_number}` : ''}
											</div>
										)}
									</>
								);
							},
						},
						{
							key: 'lang',
							label: 'Langue',
							render: (p: AnyCard) => (p as CustomCard).custom.lang ?? '—',
						},
						{
							key: 'action',
							label: '',
							render: (p: AnyCard) => (
								<button
									type="button"
									className={styles.addBtn}
									onClick={(e) => {
										e.stopPropagation();
										setAddingCard(p as CustomCard);
									}}
								>
									Ajouter
								</button>
							),
						},
					]}
				/>
			)}

			{addingCard && (
				<EditCardModal
					mode="add"
					scryfallCard={addingCard as unknown as ScryfallCard}
					onAdd={(_, entry) => handleAdd(addingCard, entry)}
					onClose={() => setAddingCard(null)}
				/>
			)}
		</>
	);
}
