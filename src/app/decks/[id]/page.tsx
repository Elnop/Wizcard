import type { Metadata } from 'next';
import { fetchDeckMetaServer } from '@/lib/deck/db/deck.server';
import DeckDetailClient from './DeckDetailClient';

interface DeckPageProps {
	params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: DeckPageProps): Promise<Metadata> {
	const { id } = await params;
	const deck = await fetchDeckMetaServer(id);
	if (!deck) return { title: 'Deck Not Found' };
	const desc = deck.description?.slice(0, 160) ?? `${deck.format ?? 'MTG'} deck on Wizcard.`;
	return {
		title: deck.name,
		description: desc,
		alternates: { canonical: `/decks/${deck.id}` },
		openGraph: { title: deck.name, description: desc, url: `/decks/${deck.id}` },
	};
}

export default async function DeckPage({ params }: DeckPageProps) {
	const { id } = await params;
	const deck = await fetchDeckMetaServer(id);
	return (
		<>
			{/* Server-rendered heading for crawlers; visual heading comes from the
			    client view. Off-screen so it doesn't duplicate on screen. */}
			<h1
				style={{
					position: 'absolute',
					width: 1,
					height: 1,
					overflow: 'hidden',
					clip: 'rect(0 0 0 0)',
				}}
			>
				{deck?.name ?? 'Deck'}
			</h1>
			<DeckDetailClient />
		</>
	);
}
