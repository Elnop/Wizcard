'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import { getCardSimilar } from '@/lib/scryfall/endpoints/cards';
import styles from './SimilarTab.module.css';

interface Props {
	card: ScryfallCard;
}

export function SimilarTab({ card }: Props) {
	const [similar, setSimilar] = useState<ScryfallCard[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const controller = new AbortController();

		const fetchSimilar = async () => {
			try {
				setLoading(true);
				const data = await getCardSimilar(card, controller.signal);
				if (!controller.signal.aborted) {
					setSimilar(data);
				}
			} catch {
				if (!controller.signal.aborted) {
					setSimilar([]);
				}
			} finally {
				if (!controller.signal.aborted) {
					setLoading(false);
				}
			}
		};

		fetchSimilar();

		return () => {
			controller.abort();
		};
	}, [card]);

	if (loading) {
		return <div className={styles.loading}>Recherche de cartes similaires…</div>;
	}

	if (similar.length === 0) {
		return <div className={styles.empty}>Impossible de trouver des cartes similaires.</div>;
	}

	return (
		<div className={styles.grid}>
			{similar.map((c) => {
				const imgUri = c.image_uris?.normal ?? c.card_faces?.[0]?.image_uris?.normal;
				if (!imgUri) return null;
				return (
					<Link key={c.id} href={`/card/${c.id}`} className={styles.cardLink} title={c.name}>
						<Image
							src={imgUri}
							alt={c.name}
							width={488}
							height={680}
							className={styles.cardImage}
						/>
					</Link>
				);
			})}
		</div>
	);
}
