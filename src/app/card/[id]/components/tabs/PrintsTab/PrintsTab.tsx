'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CardEntry } from '@/types/cards';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import { useCardPrints } from '@/lib/scryfall/hooks/useCardPrints';
import { CardList } from '@/lib/card/components/CardList/CardList';
import { groupPrintsByLang } from '@/lib/card/components/PrintList/PrintList.types';
import { EditCardModal } from '@/lib/card/components/EditCardModal/EditCardModal';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { LocalizedCardThumb } from '@/lib/card/components/LocalizedCardThumb/LocalizedCardThumb';
import styles from './PrintsTab.module.css';

interface Props {
	card: ScryfallCard;
}

function MiniThumb({ card }: { card: ScryfallCard }): ReactNode {
	return (
		<LocalizedCardThumb card={card} size="small" width={40} height={56} className={styles.thumb} />
	);
}

function SetInfo({ card }: { card: ScryfallCard }): ReactNode {
	return (
		<>
			<div className={styles.printName}>{card.set_name}</div>
			<div className={styles.printMeta}>#{card.collector_number}</div>
		</>
	);
}

function PrintAction({
	print,
	currentId,
	onAdd,
}: {
	print: ScryfallCard;
	currentId: string;
	onAdd: (print: ScryfallCard) => void;
}): ReactNode {
	if (print.id === currentId) {
		return <span className={styles.currentBadge}>Affiché</span>;
	}
	return (
		<button
			type="button"
			className={styles.addBtn}
			onClick={(e) => {
				e.stopPropagation();
				onAdd(print);
			}}
		>
			Ajouter
		</button>
	);
}

export function PrintsTab({ card }: Props) {
	const { prints, loading } = useCardPrints(card.prints_search_uri);
	const [addingCard, setAddingCard] = useState<ScryfallCard | null>(null);
	const { addCard } = useCollectionContext();

	function handleAdd(print: ScryfallCard, entry: Partial<CardEntry>) {
		addCard(print, entry);
		setAddingCard(null);
	}

	const sections = groupPrintsByLang(prints, card.lang);

	return (
		<>
			<CardList
				cards={sections}
				isLoading={loading}
				pageSize={false}
				renderOverlay={(p: AnyCard) => (
					<PrintAction print={p as ScryfallCard} currentId={card.id} onAdd={setAddingCard} />
				)}
				tableColumns={[
					{
						key: 'image',
						label: '',
						render: (p: AnyCard) => <MiniThumb card={p as ScryfallCard} />,
					},
					{
						key: 'set',
						label: 'Édition',
						render: (p: AnyCard) => <SetInfo card={p as ScryfallCard} />,
					},
					{
						key: 'rarity',
						label: 'Rareté',
						render: (p: AnyCard) =>
							((p as ScryfallCard).rarity ?? '').charAt(0).toUpperCase() +
							((p as ScryfallCard).rarity ?? '').slice(1),
					},
					{
						key: 'action',
						label: '',
						render: (p: AnyCard) => (
							<PrintAction print={p as ScryfallCard} currentId={card.id} onAdd={setAddingCard} />
						),
					},
				]}
			/>

			{addingCard && (
				<EditCardModal
					mode="add"
					scryfallCard={addingCard}
					onAdd={handleAdd}
					onClose={() => setAddingCard(null)}
				/>
			)}
		</>
	);
}
