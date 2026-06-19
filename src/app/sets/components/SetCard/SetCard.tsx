import Link from 'next/link';
import { classifySet, type SetGroup } from '@/lib/scryfall/utils/set-classification';
import styles from './SetCard.module.css';

export interface SetCardProps {
	group: SetGroup;
}

export function SetCard({ group }: SetCardProps) {
	const [root, ...derivatives] = group.sets;
	const c = classifySet(root);
	const year = root.released_at?.slice(0, 4) ?? '—';

	return (
		<Link href={`/sets/${group.key}`} className={styles.card}>
			<div className={styles.main}>
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img src={root.icon_svg_uri} alt="" className={styles.icon} />
				<div className={styles.body}>
					<div className={styles.header}>
						<h3 className={styles.name}>{root.name}</h3>
						<span className={styles.code}>{root.code.toUpperCase()}</span>
					</div>
					<div className={styles.meta}>
						<span>{year}</span>
						<span aria-hidden="true">·</span>
						<span>{root.card_count} cartes</span>
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
				</div>
			</div>

			{derivatives.length > 0 && (
				<ul className={styles.derivatives}>
					{derivatives.map((set) => (
						<li key={set.code} className={styles.derivative}>
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img src={set.icon_svg_uri} alt="" className={styles.derivativeIcon} />
							<span className={styles.derivativeCode}>{set.code.toUpperCase()}</span>
							<span className={styles.derivativeName}>{set.name}</span>
						</li>
					))}
				</ul>
			)}
		</Link>
	);
}
