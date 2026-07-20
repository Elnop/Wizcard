'use client';

import { seg } from '@/app/[locale]/(landing)/utils/seg';
import styles from './EditorDemo.module.css';

export function EditorDemo({ progress, stampLabel }: { progress: number; stampLabel: string }) {
	const frame = seg(progress, 0, 0.4);
	const ghost = seg(progress, 0.4, 0.8);
	const stamp = seg(progress, 0.8, 1);

	return (
		<div className={styles.wrap}>
			<div className={styles.card} style={{ borderColor: `rgba(201,168,76,${0.2 + frame * 0.6})` }}>
				<div className={styles.title} style={{ opacity: ghost }} />
				<div className={styles.art} style={{ opacity: ghost }} />
				<div className={styles.textLines} style={{ opacity: ghost }}>
					<span />
					<span />
					<span />
				</div>
				<span
					className={styles.stamp}
					style={{ opacity: stamp, transform: `scale(${1.4 - stamp * 0.4}) rotate(-12deg)` }}
				>
					{stampLabel}
				</span>
			</div>
		</div>
	);
}
