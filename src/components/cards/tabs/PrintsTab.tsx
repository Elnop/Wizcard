'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { CardEntry } from '@/types/cards';
import { useCardPrints } from '@/lib/scryfall/hooks/useCardPrints';
import { CopyEditModal } from '@/lib/collection/CardCollectionModal/components/CopyEditModal/CopyEditModal';
import { useCollectionContext } from '@/lib/collection/context/CollectionContext';
import styles from './PrintsTab.module.css';

interface Props {
	card: ScryfallCard;
}

export function PrintsTab({ card }: Props) {
	const { prints, loading } = useCardPrints(card.prints_search_uri);
	const [addingCard, setAddingCard] = useState<ScryfallCard | null>(null);
	const { addCard } = useCollectionContext();

	function handleAdd(print: ScryfallCard, entry: Partial<CardEntry>) {
		addCard(print, entry);
		setAddingCard(null);
	}

	if (loading) {
		return <div className={styles.loading}>Chargement des éditions…</div>;
	}

	if (prints.length === 0) {
		return <div className={styles.empty}>Aucune édition trouvée.</div>;
	}

	return (
		<>
			<div className={styles.container}>
				{prints.map((print) => {
					const isCurrent = print.id === card.id;
					const imageUri = print.image_uris?.small ?? print.card_faces?.[0]?.image_uris?.small;

					return (
						<div key={print.id} className={styles.printRow} data-current={isCurrent}>
							{imageUri && (
								<Image
									src={imageUri}
									alt={print.name}
									width={40}
									height={56}
									className={styles.thumb}
								/>
							)}
							<div className={styles.printInfo}>
								<div className={styles.printName}>{print.set_name}</div>
								<div className={styles.printMeta}>
									#{print.collector_number} · {print.rarity}
								</div>
							</div>
							<div className={styles.prices}>
								{print.prices?.usd && (
									<div className={styles.priceItem}>
										<span className={styles.priceLabel}>USD</span>
										<span className={styles.priceValue}>${print.prices.usd}</span>
									</div>
								)}
								{print.prices?.usd_foil && (
									<div className={styles.priceItem}>
										<span className={styles.priceLabel}>Foil</span>
										<span className={styles.priceValue}>${print.prices.usd_foil}</span>
									</div>
								)}
								{print.prices?.eur && (
									<div className={styles.priceItem}>
										<span className={styles.priceLabel}>EUR</span>
										<span className={styles.priceValue}>{print.prices.eur}€</span>
									</div>
								)}
							</div>
							{isCurrent ? (
								<span className={styles.currentBadge}>Affiché</span>
							) : (
								<button
									type="button"
									className={styles.addBtn}
									onClick={() => setAddingCard(print)}
								>
									Ajouter
								</button>
							)}
						</div>
					);
				})}
			</div>

			{addingCard && (
				<CopyEditModal
					mode="add"
					scryfallCard={addingCard}
					onAdd={(entry) => handleAdd(addingCard, entry)}
					onClose={() => setAddingCard(null)}
				/>
			)}
		</>
	);
}
