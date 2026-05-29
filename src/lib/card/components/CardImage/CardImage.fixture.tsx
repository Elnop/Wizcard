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

const FOIL_BLEND_TESTS = [
	{
		label: 'A — color-dodge, couleurs saturées',
		gradient: `radial-gradient(circle at var(--mouse-x, 50%) var(--mouse-y, 50%),
			hsla(280, 80%, 55%, 1) 0%,
			hsla(210, 90%, 50%, 0.8) 20%,
			hsla(160, 80%, 50%, 0.6) 40%,
			hsla(60, 70%, 55%, 0.3) 60%,
			transparent 75%)`,
		blendMode: 'color-dodge',
	},
	{
		label: 'B — hue, couleurs vives',
		gradient: `radial-gradient(circle at var(--mouse-x, 50%) var(--mouse-y, 50%),
			hsla(280, 100%, 60%, 1) 0%,
			hsla(200, 100%, 55%, 0.8) 25%,
			hsla(120, 80%, 50%, 0.5) 50%,
			transparent 70%)`,
		blendMode: 'hue',
	},
	{
		label: 'C — color, irisé',
		gradient: `radial-gradient(circle at var(--mouse-x, 50%) var(--mouse-y, 50%),
			hsla(300, 90%, 65%, 1) 0%,
			hsla(200, 100%, 60%, 0.8) 20%,
			hsla(120, 80%, 55%, 0.5) 40%,
			hsla(40, 90%, 60%, 0.3) 60%,
			transparent 75%)`,
		blendMode: 'color',
	},
	{
		label: 'D — screen, saturé',
		gradient: `radial-gradient(circle at var(--mouse-x, 50%) var(--mouse-y, 50%),
			hsla(270, 70%, 60%, 1) 0%,
			hsla(190, 80%, 55%, 0.8) 25%,
			hsla(140, 70%, 50%, 0.5) 50%,
			transparent 72%)`,
		blendMode: 'screen',
	},
];

function FoilBlendTest() {
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
				flexWrap: 'wrap',
			}}
		>
			{FOIL_BLEND_TESTS.map((v) => (
				<div key={v.label} style={{ textAlign: 'center' }}>
					<FoilBlendPreview gradient={v.gradient} blendMode={v.blendMode} />
					<p
						style={{
							marginTop: 12,
							color: '#aaa',
							fontSize: 11,
							fontFamily: 'monospace',
							maxWidth: W,
						}}
					>
						{v.label}
					</p>
				</div>
			))}
		</div>
	);
}

function FoilBlendPreview({ gradient, blendMode }: { gradient: string; blendMode: string }) {
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

	return (
		<div
			ref={wrapperRef}
			className={[styles.imageWrapper, isTilting ? '' : styles.tiltReturning]
				.filter(Boolean)
				.join(' ')}
			style={{ width: W, height: H, display: 'inline-block' }}
			onMouseMove={handleMouseMove}
			onMouseEnter={() => setIsTilting(true)}
			onMouseLeave={() => {
				setIsTilting(false);
				const el = wrapperRef.current;
				if (!el) return;
				el.style.setProperty('--tilt-x', '0deg');
				el.style.setProperty('--tilt-y', '0deg');
				el.style.setProperty('--mouse-x', '50%');
				el.style.setProperty('--mouse-y', '50%');
			}}
		>
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img
				src={CARD_URL}
				alt="test"
				width={W}
				height={H}
				style={{ display: 'block', width: '100%', height: 'auto', borderRadius: '4.75% / 3.4%' }}
			/>
			<div
				aria-hidden="true"
				style={{
					position: 'absolute',
					inset: 0,
					borderRadius: '4.75% / 3.4%',
					pointerEvents: 'none',
					opacity: 0.5,
					background: gradient,
					backgroundSize: '100% 100%',
					mixBlendMode: blendMode as React.CSSProperties['mixBlendMode'],
					transition: 'opacity 0.3s ease',
				}}
			/>
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
			<CardPreview isFoil foilType="foil" label="actuel" />
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
	'Foil blend modes': <FoilBlendTest />,
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
