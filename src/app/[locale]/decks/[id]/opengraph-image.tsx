import { ImageResponse } from 'next/og';
import { fetchDeckMetaServer, fetchDeckCoverArtServer } from '@/lib/deck/db/deck.server';
import { fetchNicknameById } from '@/lib/profile/db/profiles.server';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Deck on Wizcard';

const BG = '#0a0a0a';
const FG = '#e8e0d0';
const GOLD = '#c9a84c';

/**
 * Fetch the deck cover (a Scryfall `art_crop` URL) as a data URI. Scryfall,
 * behind Cloudflare, rejects requests carrying a default HTTP-library
 * User-Agent (`generic_user_agent`), and `next/og`'s ImageResponse fetches
 * images with undici's default UA — so we fetch it ourselves with a real UA
 * and inline the bytes. Returns null on any failure (missing/blocked/timeout).
 */
async function fetchCoverDataUri(url: string | null): Promise<string | null> {
	if (!url) return null;
	try {
		const res = await fetch(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (compatible; WizcardBot/1.0; +https://wizcard.xyz)',
				Accept: 'image/*',
			},
			signal: AbortSignal.timeout(4000),
		});
		if (!res.ok) {
			await res.body?.cancel();
			return null;
		}
		const contentType = res.headers.get('content-type') ?? 'image/jpeg';
		const buffer = Buffer.from(await res.arrayBuffer());
		return `data:${contentType};base64,${buffer.toString('base64')}`;
	} catch {
		return null;
	}
}

export default async function OgImage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const deck = await fetchDeckMetaServer(id);
	const name = deck?.name ?? 'Deck';
	const format = deck?.format ? deck.format[0].toUpperCase() + deck.format.slice(1) : null;
	const description = deck?.description?.slice(0, 140) ?? null;

	// The site derives a cover from the deck's cards when none is explicitly set
	// (usePublicDeckDetail → pickCoverArt). Mirror that server-side so the OG
	// image is never blank for a deck that shows a cover on the site.
	const coverUrl = deck?.coverArtUrl ?? (deck ? await fetchDeckCoverArtServer(id) : null);

	const [cover, ownerNickname] = await Promise.all([
		fetchCoverDataUri(coverUrl),
		deck?.ownerId ? fetchNicknameById(deck.ownerId).catch(() => null) : Promise.resolve(null),
	]);

	return new ImageResponse(
		<div
			style={{
				width: '100%',
				height: '100%',
				display: 'flex',
				flexDirection: 'column',
				position: 'relative',
				background: BG,
				color: FG,
				fontFamily: 'sans-serif',
			}}
		>
			{/* Full-bleed cover art */}
			{cover ? (
				<img
					src={cover}
					alt=""
					width={size.width}
					height={size.height}
					style={{
						position: 'absolute',
						top: 0,
						left: 0,
						width: '100%',
						height: '100%',
						objectFit: 'cover',
					}}
				/>
			) : null}

			{/* Dark gradient for text legibility (stronger toward the bottom) */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					display: 'flex',
					background: cover
						? 'linear-gradient(180deg, rgba(10,10,10,0.55) 0%, rgba(10,10,10,0.25) 35%, rgba(10,10,10,0.85) 100%)'
						: BG,
				}}
			/>

			{/* Top bar: brand + format badge */}
			<div
				style={{
					position: 'relative',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					padding: '48px 64px 0 64px',
				}}
			>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						fontSize: 34,
						fontWeight: 700,
						color: GOLD,
						letterSpacing: 1,
					}}
				>
					Wizcard
				</div>
				{format ? (
					<div
						style={{
							display: 'flex',
							fontSize: 28,
							fontWeight: 600,
							color: BG,
							background: GOLD,
							padding: '10px 24px',
							borderRadius: 999,
						}}
					>
						{format}
					</div>
				) : null}
			</div>

			{/* Bottom block: deck name, owner, description */}
			<div
				style={{
					position: 'relative',
					marginTop: 'auto',
					display: 'flex',
					flexDirection: 'column',
					padding: '0 64px 56px 64px',
				}}
			>
				<div
					style={{
						display: 'flex',
						fontSize: 72,
						fontWeight: 800,
						lineHeight: 1.05,
						textShadow: '0 2px 12px rgba(0,0,0,0.6)',
					}}
				>
					{name}
				</div>

				{ownerNickname ? (
					<div
						style={{
							display: 'flex',
							marginTop: 18,
							fontSize: 30,
							color: GOLD,
							fontWeight: 600,
						}}
					>
						{`by ${ownerNickname}`}
					</div>
				) : null}

				{description ? (
					<div
						style={{
							display: 'flex',
							marginTop: 20,
							fontSize: 28,
							lineHeight: 1.3,
							color: 'rgba(232,224,208,0.88)',
							maxWidth: 900,
						}}
					>
						{description}
					</div>
				) : null}
			</div>
		</div>,
		size
	);
}
