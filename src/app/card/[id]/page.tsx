import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getCardById } from '@/lib/scryfall/endpoints/cards';
import { CardDetail } from '@/components/cards/CardDetail';
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
			title: `${card.name} | MTG Snap`,
			description: `${card.type_line} - ${card.oracle_text?.slice(0, 150) ?? card.name}`,
		};
	} catch {
		return {
			title: 'Card Not Found | MTG Snap',
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
			<nav className={styles.nav}>
				<Link href="/search" className={styles.backLink}>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="m15 18-6-6 6-6" />
					</svg>
					Back to Search
				</Link>
			</nav>
			<CardDetail card={card} />
		</div>
	);
}
