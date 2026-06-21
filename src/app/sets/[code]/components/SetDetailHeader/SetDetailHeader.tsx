import Link from 'next/link';
import { classifySet, type SetGroup } from '@/lib/scryfall/utils/set-classification';
import { CompletionRing } from '@/components/CompletionRing/CompletionRing';
import type { SetCompletion } from '../../utils/setCompletion';
import styles from './SetDetailHeader.module.css';

export interface SetDetailHeaderProps {
	group: SetGroup;
	/** Code of the currently viewed set tab (drives which icon + completion to show). */
	activeCode: string;
	completion: SetCompletion;
	isCompletionLoading?: boolean;
	isPartialCollection?: boolean;
}

function pct(part: number, total: number): number {
	if (total <= 0) return 0;
	return Math.round((part / total) * 100);
}

export function SetDetailHeader({
	group,
	activeCode,
	completion,
	isCompletionLoading,
	isPartialCollection,
}: SetDetailHeaderProps) {
	const root = group.sets[0];
	const active = group.sets.find((s) => s.code === activeCode) ?? root;
	const c = classifySet(root);
	const year = root.released_at?.slice(0, 4) ?? '—';
	const setCount = group.sets.length;

	const { totalPrints, ownedPrints, ownedFoilPrints } = completion;
	const completionPercent = pct(ownedPrints, totalPrints);
	const foilPercent = pct(ownedFoilPrints, totalPrints);
	const statsReady = totalPrints > 0;

	return (
		<div className={styles.container}>
			<div className={styles.iconSection}>
				<CompletionRing
					percent={completionPercent}
					size={132}
					stroke={6}
					variant="gold"
					aria-label={`Complétion de l’extension : ${completionPercent}%`}
				>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src={active.icon_svg_uri} alt="" className={styles.icon} />
				</CompletionRing>
				<span className={styles.completionCaption}>
					{isCompletionLoading && !statsReady ? '…' : `${completionPercent}%`}
					<span className={styles.completionCaptionLabel}>complété</span>
				</span>
			</div>

			<div className={styles.infoSection}>
				<Link href="/sets" className={styles.back}>
					← Extensions
				</Link>

				<header className={styles.header}>
					<h1 className={styles.name}>{root.name}</h1>
					<span className={styles.code}>{root.code.toUpperCase()}</span>
				</header>

				<div className={styles.meta}>
					<span>{year}</span>
					<span aria-hidden="true">·</span>
					<span>{root.card_count} cartes</span>
					{setCount > 1 && (
						<>
							<span aria-hidden="true">·</span>
							<span>
								{setCount} set{setCount > 1 ? 's' : ''}
							</span>
						</>
					)}
				</div>

				<div className={styles.badges}>
					{c.hasPaper && <span className={styles.badge}>Papier</span>}
					{c.hasArena && <span className={styles.badge}>Arena</span>}
					{c.isAlchemy ? (
						<span className={styles.badge}>Alchemy</span>
					) : (
						c.isDigital && <span className={styles.badge}>Numérique</span>
					)}
				</div>

				<div className={styles.statRings}>
					<div className={styles.statRing}>
						<CompletionRing
							percent={completionPercent}
							size={52}
							stroke={4}
							variant="jade"
							aria-label={`Cartes possédées : ${completionPercent}%`}
						>
							<span className={styles.statRingPercent}>
								{statsReady ? `${completionPercent}%` : '—'}
							</span>
						</CompletionRing>
						<div className={styles.statRingMeta}>
							<span className={styles.statRingLabel}>Possédées</span>
							<span className={styles.statRingValue}>
								{ownedPrints} <span className={styles.statRingValueMuted}>/ {totalPrints}</span>
							</span>
						</div>
					</div>

					<div className={styles.statRing}>
						<CompletionRing
							percent={foilPercent}
							size={52}
							stroke={4}
							variant="foil"
							aria-label={`Cartes en foil : ${foilPercent}%`}
						>
							<span className={styles.statRingPercent}>{statsReady ? `${foilPercent}%` : '—'}</span>
						</CompletionRing>
						<div className={styles.statRingMeta}>
							<span className={styles.statRingLabel}>Foil</span>
							<span className={styles.statRingValue}>{ownedFoilPrints} ✦</span>
						</div>
					</div>
				</div>

				{isPartialCollection && statsReady && (
					<p className={styles.partialNote}>
						Collection partiellement chargée — la complétion peut être sous-estimée.
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
		</div>
	);
}
