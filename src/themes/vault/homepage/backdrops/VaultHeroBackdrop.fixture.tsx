'use client';

import Link from 'next/link';
import { VaultButton } from '../../components/VaultButton/VaultButton';
import { ConstellationBackdrop } from './ConstellationBackdrop';
import { VaultDoorBackdrop } from './VaultDoorBackdrop';
import { MandalaBackdrop } from './MandalaBackdrop';
import { CardFanBackdrop } from './CardFanBackdrop';
import { ManaPentagonBackdrop } from './ManaPentagonBackdrop';
import { SunburstBackdrop } from './SunburstBackdrop';
import styles from './VaultHeroBackdrop.fixture.module.css';

function HeroShell({ children, label }: { children: React.ReactNode; label: string }) {
	return (
		<section className={styles.hero}>
			<div className={styles.background}>
				<div className={styles.gradient} />
				<div className={styles.decoLines} />
				<div className={styles.shimmer} />
			</div>

			{/* Art Deco corner frames */}
			<div className={styles.frameTL} />
			<div className={styles.frameTR} />
			<div className={styles.frameBL} />
			<div className={styles.frameBR} />

			<div className={styles.content}>
				{/* Backdrop slot */}
				{children}

				<div className={styles.textBlock}>
					<div className={styles.badge}>{label}</div>
					<div className={styles.diamondOrnament} />
					<h1 className={styles.title}>WIZCARD</h1>
					<div className={styles.titleRule} />
					<p className={styles.tagline}>The Collector&apos;s Vault</p>
					<p className={styles.description}>
						Every Magic: The Gathering card ever printed. Catalogued, curated, and at your command.
					</p>
					<div className={styles.cta}>
						<Link href="/search">
							<VaultButton size="lg">Enter the Vault</VaultButton>
						</Link>
						<Link href="/collection">
							<VaultButton variant="ghost" size="lg">
								My Collection
							</VaultButton>
						</Link>
					</div>
				</div>
			</div>
		</section>
	);
}

const fixtures = {
	'1 — Constellation': (
		<HeroShell label="Constellation">
			<ConstellationBackdrop />
		</HeroShell>
	),
	'2 — Vault Door': (
		<HeroShell label="Vault Door">
			<VaultDoorBackdrop />
		</HeroShell>
	),
	'3 — Art Deco Mandala': (
		<HeroShell label="Art Deco Mandala">
			<MandalaBackdrop />
		</HeroShell>
	),
	'4 — Card Fan': (
		<HeroShell label="Card Fan">
			<CardFanBackdrop />
		</HeroShell>
	),
	'5 — Mana Pentagon': (
		<HeroShell label="Mana Pentagon">
			<ManaPentagonBackdrop />
		</HeroShell>
	),
	'6 — Sunburst': (
		<HeroShell label="Sunburst">
			<SunburstBackdrop />
		</HeroShell>
	),
};

export default fixtures;
