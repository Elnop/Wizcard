import { ImageResponse } from 'next/og';
import { fetchDeckMetaServer } from '@/lib/deck/db/deck.server';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Deck on Wizcard';

export default async function OgImage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const deck = await fetchDeckMetaServer(id);
	const name = deck?.name ?? 'Deck';
	return new ImageResponse(
		<div
			style={{
				width: '100%',
				height: '100%',
				display: 'flex',
				flexDirection: 'column',
				justifyContent: 'center',
				padding: 80,
				background: '#0a0a0a',
				color: '#e8e0d0',
			}}
		>
			<div style={{ color: '#c9a84c', fontSize: 32, marginBottom: 24 }}>Wizcard</div>
			<div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.1 }}>{name}</div>
		</div>,
		size
	);
}
