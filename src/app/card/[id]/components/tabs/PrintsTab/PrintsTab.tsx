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
import { useMpcPrints } from '@/lib/mpc/hooks/useMpcPrints';
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
	const [showMpc, setShowMpc] = useState(true);
	const { addCard } = useCollectionContext();

	const { prints: mpcPrints, loading: mpcLoading } = useMpcPrints(showMpc ? card.name : '');

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

			<div className={styles.mpcHeader}>
				<span className={styles.mpcTitle}>
					Proxies MPC
					{mpcPrints.length > 0 && <span className={styles.mpcCount}>{mpcPrints.length}</span>}
				</span>
				<label className={styles.mpcToggle}>
					<input type="checkbox" checked={showMpc} onChange={(e) => setShowMpc(e.target.checked)} />
					Afficher
				</label>
			</div>

			{showMpc && (
				<CardList
					cards={mpcPrints}
					isLoading={mpcLoading}
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
							label: 'Source',
							render: (p: AnyCard) => (
								<>
									<div className={styles.printName}>{(p as ScryfallCard).set_name}</div>
									<div className={styles.printMeta}>
										<span className={styles.proxyBadge}>proxy</span>
									</div>
								</>
							),
						},
						{
							key: 'rarity',
							label: 'DPI',
							render: (p: AnyCard) => {
								const id = (p as ScryfallCard).collector_number;
								return <span className={styles.printMeta}>{id}</span>;
							},
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
			)}

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
