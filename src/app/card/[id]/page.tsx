import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getCardById } from '@/lib/scryfall/endpoints/cards';
import { CardPageHeader } from './components/CardPageHeader/CardPageHeader';
import { CardTabs } from './components/CardTabs/CardTabs';
import styles from './page.module.css';

interface CardPageProps {
	params: Promise<{
		id: string;
	}>;
}

export async function generateMetadata({ params }: CardPageProps) {
	const { id } = await params;
	try {
		const card = await getCardById(id);
		return {
			title: `${card.name} | Wizcard`,
			description: `${card.type_line} - ${card.oracle_text?.slice(0, 150) ?? card.name}`,
		};
	} catch {
		return {
			title: 'Card Not Found | Wizcard',
		};
	}
}

export default async function CardPage({ params }: CardPageProps) {
	const { id } = await params;

	let card;
	try {
		card = await getCardById(id);
	} catch {
		notFound();
	}

	return (
		<div className={styles.page}>
			<CardPageHeader card={card} />
			<Suspense>
				<CardTabs card={card} />
			</Suspense>
		</div>
	);
}
