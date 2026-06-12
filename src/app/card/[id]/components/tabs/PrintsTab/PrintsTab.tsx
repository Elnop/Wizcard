'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CardEntry } from '@/types/cards';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import type { CardListSection } from '@/lib/card/components/CardList/CardList.types';
import { useCardPrints } from '@/lib/scryfall/hooks/useCardPrints';
import { CardList } from '@/lib/card/components/CardList/CardList';
import { groupPrintsByLang } from '@/lib/card/components/PrintList/PrintList.types';
import { EditCardModal } from '@/lib/card/components/EditCardModal/EditCardModal';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import { LocalizedCardThumb } from '@/lib/card/components/LocalizedCardThumb/LocalizedCardThumb';
import { useMpcPrints } from '@/lib/mpc/hooks/useMpcPrints';
import { useCustomCardPrints } from '@/lib/mpc/hooks/useCustomCardPrints';
import styles from './PrintsTab.module.css';

interface Props {
	card: ScryfallCard;
}

function MiniThumb({ card }: { card: ScryfallCard }): ReactNode {
	return (
		<LocalizedCardThumb card={card} size="small" width={40} height={56} className={styles.thumb} />
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

	const { prints: mpcPrints, loading: mpcLoading, error: mpcError } = useMpcPrints(card.name);
	const { prints: customPrints, loading: customLoading } = useCustomCardPrints(card.oracle_id, '');

	function handleAdd(print: ScryfallCard, entry: Partial<CardEntry>) {
		addCard(print, entry);
		setAddingCard(null);
	}

	const officialSections = groupPrintsByLang(prints, card.lang);

	const mpcSection: CardListSection | null =
		mpcPrints.length > 0
			? {
					label: 'Proxies MPC',
					cards: mpcPrints as unknown as AnyCard[],
				}
			: null;

	const customSection: CardListSection | null =
		customPrints.length > 0
			? {
					label: 'Cartes Custom',
					cards: customPrints as unknown as AnyCard[],
				}
			: null;

	const sections: CardListSection[] = [
		...officialSections,
		...(mpcSection ? [mpcSection] : []),
		...(customSection ? [customSection] : []),
	];

	return (
		<>
			{mpcError && <p className={styles.printMeta}>Proxies indisponibles : {mpcError}</p>}

			<CardList
				cards={sections}
				isLoading={loading || mpcLoading || customLoading}
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
						render: (p: AnyCard) => {
							const c = p as ScryfallCard;
							const isProxy = c.set === 'mpc';
							return (
								<>
									<div className={styles.printName}>{c.set_name}</div>
									<div className={styles.printMeta}>
										{isProxy ? (
											<span className={styles.proxyBadge}>proxy</span>
										) : (
											`#${c.collector_number}`
										)}
									</div>
								</>
							);
						},
					},
					{
						key: 'rarity',
						label: 'Rareté',
						render: (p: AnyCard) => {
							const c = p as ScryfallCard;
							if (c.set === 'mpc') return null;
							return (c.rarity ?? '').charAt(0).toUpperCase() + (c.rarity ?? '').slice(1);
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
