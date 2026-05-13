'use client';

import stylesA from './variants/ManaCurveClassicGold.module.css';
import stylesB from './variants/ManaCurveManaColors.module.css';
import stylesC from './variants/ManaCurveGlowPremium.module.css';
import stylesD from './variants/ManaCurveFantasyArch.module.css';
import stylesE from './variants/ManaCurveMinimalSharp.module.css';
import stylesF from './variants/ManaCurveMixDarkMTG.module.css';

const MOCK_CURVE: Record<number, number> = {
	0: 2,
	1: 8,
	2: 14,
	3: 12,
	4: 7,
	5: 4,
	6: 2,
	7: 1,
};

const LABELS = ['0', '1', '2', '3', '4', '5', '6', '7+'];

const MANA_COLORS: Record<number, string> = {
	0: 'var(--mana-colorless)',
	1: 'var(--mana-white)',
	2: 'var(--mana-blue)',
	3: 'var(--mana-black)',
	4: 'var(--mana-red)',
	5: 'var(--mana-green)',
	6: 'var(--gold)',
	7: 'var(--gold)',
};

function buildEntries(curve: Record<number, number>) {
	const base = Array.from({ length: 7 }, (_, i) => ({ cmc: i, count: curve[i] ?? 0 }));
	const sevenPlus = Array.from({ length: 8 }, (_, i) => i + 7).reduce(
		(sum, i) => sum + (curve[i] ?? 0),
		0
	);
	return [...base, { cmc: 7, count: sevenPlus }];
}

function VariantWrapper({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div style={{ marginBottom: 48 }}>
			<p
				style={{
					fontFamily: 'var(--font-display)',
					color: 'var(--gold)',
					fontSize: 'var(--text-sm)',
					fontWeight: 600,
					letterSpacing: '1px',
					textTransform: 'uppercase',
					marginBottom: 12,
				}}
			>
				{label}
			</p>
			{children}
		</div>
	);
}

// A — Classic Gold
function VariantA() {
	const entries = buildEntries(MOCK_CURVE);
	const maxCount = Math.max(1, ...entries.map((e) => e.count));
	return (
		<div className={stylesA.container}>
			<div className={stylesA.chart}>
				{entries.map((entry, i) => (
					<div key={entry.cmc} className={stylesA.column}>
						<span className={stylesA.count}>{entry.count || ''}</span>
						<div
							className={stylesA.bar}
							style={
								{
									height: `${(entry.count / maxCount) * 100}%`,
									'--bar-height': `${(entry.count / maxCount) * 100}%`,
									'--col-index': i,
								} as React.CSSProperties
							}
						/>
						<span className={stylesA.label}>{LABELS[entry.cmc]}</span>
					</div>
				))}
			</div>
		</div>
	);
}

// B — Mana Colors
function VariantB() {
	const entries = buildEntries(MOCK_CURVE);
	const maxCount = Math.max(1, ...entries.map((e) => e.count));
	return (
		<div className={stylesB.container}>
			<div className={stylesB.chart}>
				{entries.map((entry, i) => {
					const color = MANA_COLORS[entry.cmc] ?? 'var(--gold)';
					return (
						<div key={entry.cmc} className={stylesB.column}>
							<span
								className={stylesB.count}
								style={{ '--bar-color': color } as React.CSSProperties}
							>
								{entry.count || ''}
							</span>
							<div
								className={stylesB.bar}
								style={
									{
										height: `${(entry.count / maxCount) * 100}%`,
										'--bar-height': `${(entry.count / maxCount) * 100}%`,
										'--col-index': i,
										'--bar-color': color,
									} as React.CSSProperties
								}
							/>
							<span className={stylesB.label}>{LABELS[entry.cmc]}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

// C — Glow Premium
function VariantC() {
	const entries = buildEntries(MOCK_CURVE);
	const maxCount = Math.max(1, ...entries.map((e) => e.count));
	const peakCount = maxCount;
	return (
		<div className={stylesC.container}>
			<div className={stylesC.chart}>
				{entries.map((entry, i) => {
					const isPeak = entry.count === peakCount && entry.count > 0;
					return (
						<div key={entry.cmc} className={stylesC.column}>
							<span className={stylesC.count}>{entry.count || ''}</span>
							<div
								className={`${stylesC.bar}${isPeak ? ` ${stylesC.peak}` : ''}`}
								style={
									{
										height: `${(entry.count / maxCount) * 100}%`,
										'--bar-height': `${(entry.count / maxCount) * 100}%`,
										'--col-index': i,
									} as React.CSSProperties
								}
							/>
							<span className={stylesC.label}>{LABELS[entry.cmc]}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

// D — Fantasy Arch
function VariantD() {
	const entries = buildEntries(MOCK_CURVE);
	const maxCount = Math.max(1, ...entries.map((e) => e.count));
	return (
		<div className={stylesD.container} style={{ position: 'relative' }}>
			<svg className={stylesD.svgFilters} xmlns="http://www.w3.org/2000/svg">
				<defs>
					<filter id="grain">
						<feTurbulence
							type="fractalNoise"
							baseFrequency="0.65"
							numOctaves="3"
							stitchTiles="stitch"
						/>
						<feColorMatrix type="saturate" values="0" />
						<feBlend in="SourceGraphic" mode="multiply" />
					</filter>
				</defs>
			</svg>
			<div className={stylesD.chart}>
				{entries.map((entry, i) => (
					<div
						key={entry.cmc}
						className={stylesD.column}
						style={{ '--col-index': i } as React.CSSProperties}
					>
						<span className={stylesD.count}>{entry.count || ''}</span>
						<div className={stylesD.barWrap}>
							<div
								className={stylesD.bar}
								style={{ height: `${(entry.count / maxCount) * 100}%` }}
							/>
						</div>
						<span className={stylesD.label}>{LABELS[entry.cmc]}</span>
					</div>
				))}
			</div>
		</div>
	);
}

// E — Minimal Sharp
function VariantE() {
	const entries = buildEntries(MOCK_CURVE);
	const maxCount = Math.max(1, ...entries.map((e) => e.count));
	return (
		<div className={stylesE.container}>
			<div className={stylesE.chart}>
				{entries.map((entry, i) => (
					<div
						key={entry.cmc}
						className={stylesE.column}
						style={{ '--col-index': i } as React.CSSProperties}
					>
						<span className={stylesE.count}>{entry.count || ''}</span>
						<div className={stylesE.bar} style={{ height: `${(entry.count / maxCount) * 100}%` }} />
						<span className={stylesE.label}>{LABELS[entry.cmc]}</span>
					</div>
				))}
			</div>
		</div>
	);
}

// F — Mix Dark MTG
function VariantF() {
	const entries = buildEntries(MOCK_CURVE);
	const maxCount = Math.max(1, ...entries.map((e) => e.count));
	return (
		<div className={stylesF.container}>
			<div className={stylesF.chart}>
				{entries.map((entry, i) => {
					const color = MANA_COLORS[entry.cmc] ?? 'var(--gold)';
					return (
						<div key={entry.cmc} className={stylesF.column}>
							<span
								className={stylesF.count}
								style={{ '--bar-color': color } as React.CSSProperties}
							>
								{entry.count || ''}
							</span>
							<div
								className={stylesF.bar}
								style={
									{
										height: `${(entry.count / maxCount) * 100}%`,
										'--bar-height': `${(entry.count / maxCount) * 100}%`,
										'--col-index': i,
										'--bar-color': color,
									} as React.CSSProperties
								}
							/>
							<span className={stylesF.label}>{LABELS[entry.cmc]}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function AllVariants() {
	return (
		<div
			style={{
				padding: '32px 24px',
				background: 'var(--background)',
				minHeight: '100vh',
				maxWidth: 480,
			}}
		>
			<VariantWrapper label="A — Classic Gold">
				<VariantA />
			</VariantWrapper>
			<VariantWrapper label="B — Mana Colors">
				<VariantB />
			</VariantWrapper>
			<VariantWrapper label="C — Glow Premium">
				<VariantC />
			</VariantWrapper>
			<VariantWrapper label="D — Fantasy Arch">
				<VariantD />
			</VariantWrapper>
			<VariantWrapper label="E — Minimal Sharp">
				<VariantE />
			</VariantWrapper>
			<VariantWrapper label="F — Mix Dark MTG">
				<VariantF />
			</VariantWrapper>
		</div>
	);
}

const fixture = {
	'All Variants': <AllVariants />,
	'A — Classic Gold': (
		<div style={{ padding: 32, background: 'var(--background)', maxWidth: 400 }}>
			<VariantA />
		</div>
	),
	'B — Mana Colors': (
		<div style={{ padding: 32, background: 'var(--background)', maxWidth: 400 }}>
			<VariantB />
		</div>
	),
	'C — Glow Premium': (
		<div style={{ padding: 32, background: 'var(--background)', maxWidth: 400 }}>
			<VariantC />
		</div>
	),
	'D — Fantasy Arch': (
		<div style={{ padding: 32, background: 'var(--background)', maxWidth: 400 }}>
			<VariantD />
		</div>
	),
	'E — Minimal Sharp': (
		<div style={{ padding: 32, background: 'var(--background)', maxWidth: 400 }}>
			<VariantE />
		</div>
	),
	'F — Mix Dark MTG': (
		<div style={{ padding: 32, background: 'var(--background)', maxWidth: 400 }}>
			<VariantF />
		</div>
	),
};

export default fixture;
