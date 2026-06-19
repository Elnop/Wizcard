import Link from 'next/link';
import { classifySet, type SetGroup } from '@/lib/scryfall/utils/set-classification';
import styles from './SetDetailHeader.module.css';

export interface SetDetailHeaderProps {
	group: SetGroup;
}

export function SetDetailHeader({ group }: SetDetailHeaderProps) {
	const root = group.sets[0];
	const c = classifySet(root);
	const year = root.released_at?.slice(0, 4) ?? '—';
	const setCount = group.sets.length;

	return (
		<div className={styles.container}>
			<div className={styles.iconSection}>
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img src={root.icon_svg_uri} alt="" className={styles.icon} />
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
