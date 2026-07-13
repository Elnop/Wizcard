import { Link } from '@/i18n/navigation';
import { classifySet, type SetGroup } from '@/lib/scryfall/utils/set-classification';
import type { ScryfallSet } from '@/lib/scryfall/types/scryfall';
import { CompletionRing } from '@/components/CompletionRing/CompletionRing';
import type { SetCompletion } from '../../utils/setCompletion';
import styles from './SetDetailHeader.module.css';

export interface SetDetailHeaderProps {
	group: SetGroup;
	/** Code of the currently viewed set tab (drives the "set actuel" section). */
	activeCode: string;
	/** Completion aggregated over the whole group (all sub-sets). */
	groupCompletion: SetCompletion;
	/** Completion of the active set tab only. */
	activeCompletion: SetCompletion;
	isPartialCollection?: boolean;
}

function pct(part: number, total: number): number {
	if (total <= 0) return 0;
	return Math.round((part / total) * 100);
}

/** Paper / Arena / Digital badges for a single set. */
function SetBadges({ set }: { set: ScryfallSet }) {
	const c = classifySet(set);
	return (
		<div className={styles.badges}>
			{c.hasPaper && <span className={styles.badge}>Papier</span>}
			{c.hasArena && <span className={styles.badge}>Arena</span>}
			{c.isAlchemy ? (
				<span className={styles.badge}>Alchemy</span>
			) : (
				c.isDigital && <span className={styles.badge}>Digital</span>
			)}
		</div>
	);
}

/**
 * One 50%-width completion section: a big gold ring (overall completion) with
 * either the set icon or the percentage at its centre, the section's own meta
 * line, and a single Foil mini-ring (the owned% lives in the gold ring).
 */
function CompletionSection({
	scope,
	label,
	iconSrc,
	completion,
	titleNode,
	children,
}: {
	scope: 'group' | 'active';
	label: string;
	iconSrc?: string;
	completion: SetCompletion;
	/** Custom heading node (e.g. the page <h1>); falls back to the plain label. */
	titleNode?: React.ReactNode;
	/** Section-specific meta (badges, date…). */
	children?: React.ReactNode;
}) {
	const { totalPrints, ownedPrints, ownedFoilPrints } = completion;
	const completionPercent = pct(ownedPrints, totalPrints);
	const foilPercent = pct(ownedFoilPrints, totalPrints);
	const statsReady = totalPrints > 0;

	return (
		<section className={styles.section} data-scope={scope}>
			<span className={styles.sectionScope}>{scope === 'group' ? 'Groupe' : 'Set actuel'}</span>
			{titleNode ?? (
				<span className={styles.sectionLabel} title={label}>
					{label}
				</span>
			)}

			<div className={styles.sectionBody}>
				<div className={styles.gaugeMain}>
					<CompletionRing
						percent={completionPercent}
						size={92}
						stroke={6}
						variant="gold"
						aria-label={`${label} — completion: ${completionPercent}%`}
					>
						{iconSrc ? (
							// eslint-disable-next-line @next/next/no-img-element
							<img src={iconSrc} alt="" className={styles.gaugeIcon} />
						) : (
							<span className={styles.gaugePercent}>{`${completionPercent}%`}</span>
						)}
					</CompletionRing>
					<span className={styles.gaugeValue}>
						{statsReady ? `${completionPercent}%` : '—'}{' '}
						<span className={styles.muted}>
							· {ownedPrints}/{totalPrints}
						</span>
					</span>
				</div>

				<div className={styles.sectionInfo}>
					<span className={styles.sectionCount}>
						{totalPrints} <span className={styles.muted}>cartes</span>
					</span>
					{children}
					<div className={styles.foilStat}>
						<CompletionRing
							percent={foilPercent}
							size={46}
							stroke={4}
							variant="foil"
							aria-label={`${label} — foil cards: ${foilPercent}%`}
						>
							<span className={styles.foilStatPercent}>{statsReady ? `${foilPercent}%` : '—'}</span>
						</CompletionRing>
						<div className={styles.foilStatMeta}>
							<span className={styles.foilStatLabel}>Foil</span>
							<span className={styles.foilStatValue}>{ownedFoilPrints} ✦</span>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

export function SetDetailHeader({
	group,
	activeCode,
	groupCompletion,
	activeCompletion,
	isPartialCollection,
}: SetDetailHeaderProps) {
	const root = group.sets[0];
	const active = group.sets.find((s) => s.code === activeCode) ?? root;
	const activeYear = active.released_at?.slice(0, 4) ?? '—';
	const statsReady = groupCompletion.totalPrints > 0;

	return (
		<div className={styles.container}>
			<div className={styles.topBar}>
				<Link href="/sets" className={styles.back}>
					← Extensions
				</Link>
			</div>

			<div className={styles.sections}>
				<CompletionSection
					scope="active"
					label={active.name}
					iconSrc={active.icon_svg_uri}
					completion={activeCompletion}
					titleNode={
						<header className={styles.header}>
							<h1 className={styles.name}>{active.name}</h1>
							<span className={styles.code}>{active.code.toUpperCase()}</span>
						</header>
					}
				>
					<span className={styles.sectionDate}>{activeYear}</span>
					<SetBadges set={active} />
				</CompletionSection>

				<CompletionSection scope="group" label={root.name} completion={groupCompletion} />
			</div>

			{isPartialCollection && statsReady && (
				<p className={styles.partialNote}>
					Collection partially loaded — completion may be underestimated.
				</p>
			)}

			<div className={styles.externalLinks}>
				<a
					href={root.scryfall_uri}
					target="_blank"
					rel="noopener noreferrer"
					className={styles.externalLink}
				>
					Scryfall
				</a>
			</div>
		</div>
	);
}
