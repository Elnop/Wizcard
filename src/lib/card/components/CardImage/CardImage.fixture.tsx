'use client';

import { useRef, useState } from 'react';
import styles from './CardImage.module.css';

const CARD_URL = '/fixture-lightning-bolt.jpg';
const W = 244;
const H = 340;
const TILT_MAX_DEG = 10;

function CardPreview({
	isFoil = false,
	foilType = 'foil' as 'foil' | 'etched',
	isProxy = false,
	label = '',
	overrideOpacity,
}: {
	isFoil?: boolean;
	foilType?: 'foil' | 'etched';
	isProxy?: boolean;
	label?: string;
	overrideOpacity?: number;
}) {
	const wrapperRef = useRef<HTMLDivElement>(null);
	const [isTilting, setIsTilting] = useState(false);

	const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
		const el = wrapperRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const x = (e.clientX - rect.left) / rect.width;
		const y = (e.clientY - rect.top) / rect.height;
		el.style.setProperty('--tilt-x', `${(x - 0.5) * 2 * TILT_MAX_DEG}deg`);
		el.style.setProperty('--tilt-y', `${(0.5 - y) * 2 * TILT_MAX_DEG}deg`);
		el.style.setProperty('--mouse-x', `${x * 100}%`);
		el.style.setProperty('--mouse-y', `${y * 100}%`);
	};

	const handleMouseEnter = () => setIsTilting(true);

	const handleMouseLeave = () => {
		const el = wrapperRef.current;
		if (!el) return;
		setIsTilting(false);
		el.style.setProperty('--tilt-x', '0deg');
		el.style.setProperty('--tilt-y', '0deg');
		el.style.setProperty('--mouse-x', '50%');
		el.style.setProperty('--mouse-y', '50%');
	};

	return (
		<div style={{ textAlign: 'center' }}>
			<div
				ref={wrapperRef}
				className={[styles.imageWrapper, isTilting ? '' : styles.tiltReturning]
					.filter(Boolean)
					.join(' ')}
				style={{ width: W, height: H, display: 'inline-block' }}
				onMouseMove={handleMouseMove}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
			>
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src={CARD_URL}
					alt="Lightning Bolt"
					width={W}
					height={H}
					style={{
						display: 'block',
						width: '100%',
						height: 'auto',
						borderRadius: '4.75% / 3.4%',
						opacity: isProxy ? 0.75 : 1,
						filter: isProxy ? 'brightness(0.85)' : 'none',
					}}
				/>
				{isFoil && (
					<div
						className={foilType === 'etched' ? styles.etchedOverlay : styles.foilOverlay}
						aria-hidden="true"
						style={overrideOpacity !== undefined ? { opacity: overrideOpacity } : undefined}
					/>
				)}
				{isProxy && (
					<div className={styles.proxyOverlay} aria-hidden="true">
						PROXY
					</div>
				)}
			</div>
			{label && (
				<p
					style={{
						marginTop: 12,
						color: 'var(--text-muted, #aaa)',
						fontSize: 12,
						fontFamily: 'monospace',
					}}
				>
					{label}
				</p>
			)}
		</div>
	);
}

function FoilRestTest() {
	return (
		<div
			style={{
				display: 'flex',
				gap: 48,
				padding: 48,
				background: 'var(--background, #1a1a1a)',
				minHeight: '100vh',
				alignItems: 'center',
				justifyContent: 'center',
			}}
		>
			<CardPreview label="Normal" />
			<CardPreview isFoil foilType="foil" label="0.12 (actuel)" overrideOpacity={0.12} />
			<CardPreview isFoil foilType="foil" label="0.20" overrideOpacity={0.2} />
			<CardPreview isFoil foilType="foil" label="0.30" overrideOpacity={0.3} />
			<CardPreview isFoil foilType="foil" label="0.40" overrideOpacity={0.4} />
		</div>
	);
}

function AllVariants() {
	return (
		<div
			style={{
				display: 'flex',
				gap: 48,
				padding: 48,
				background: 'var(--background, #1a1a1a)',
				minHeight: '100vh',
				alignItems: 'center',
				justifyContent: 'center',
			}}
		>
			<CardPreview label="Normal" />
			<CardPreview isFoil foilType="foil" label="Foil — nacré pastel" />
			<CardPreview isFoil foilType="etched" label="Etched — or champagne" />
		</div>
	);
}

const fixture = {
	'Foil repos vs hover': <FoilRestTest />,
	'Foil vs Etched': <AllVariants />,
	Normal: (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				minHeight: '100vh',
				background: 'var(--background, #1a1a1a)',
			}}
		>
			<CardPreview />
		</div>
	),
	Foil: (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				minHeight: '100vh',
				background: 'var(--background, #1a1a1a)',
			}}
		>
			<CardPreview isFoil foilType="foil" />
		</div>
	),
	'Foil Etched': (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				minHeight: '100vh',
				background: 'var(--background, #1a1a1a)',
			}}
		>
			<CardPreview isFoil foilType="etched" />
		</div>
	),
	Proxy: (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				minHeight: '100vh',
				background: 'var(--background, #1a1a1a)',
			}}
		>
			<CardPreview isProxy />
		</div>
	),
};

export default fixture;
