'use client';

import { useRef, type ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { useScrollProgress } from '@/app/[locale]/(landing)/hooks/useScrollProgress';
import { useReducedMotion } from '@/app/[locale]/(landing)/hooks/useReducedMotion';
import { useIsMobile } from '@/app/[locale]/(landing)/hooks/useIsMobile';
import styles from './PinnedFeature.module.css';

interface PinnedFeatureProps {
	index: number;
	label: string;
	title: string;
	description: string;
	href?: string;
	linkLabel?: string;
	badge?: string;
	side: 'left' | 'right';
	renderDemo: (progress: number, isStatic: boolean) => ReactNode;
}

export function PinnedFeature({
	index,
	label,
	title,
	description,
	href,
	linkLabel,
	badge,
	side,
	renderDemo,
}: PinnedFeatureProps) {
	const sectionRef = useRef<HTMLElement>(null);
	const reduced = useReducedMotion();
	const mobile = useIsMobile();
	// La 1re section suit le hero : sans amorce, elle reste figée à l'état 0 le
	// temps qu'elle monte à l'écran, et l'animation semble « sautée » au premier
	// coup de molette. Les suivantes sont précédées d'une section épinglée, donc
	// elles entrent déjà en position — pas besoin d'amorce.
	const leadIn = index === 1 ? 600 : 0;
	const scrolled = useScrollProgress(sectionRef, leadIn);
	const isStatic = reduced || mobile;
	const progress = isStatic ? 1 : scrolled;

	return (
		<section
			ref={sectionRef}
			className={`${styles.section} ${isStatic ? styles.static : ''} ${
				side === 'right' ? styles.reversed : ''
			}`}
		>
			<div className={styles.sticky}>
				<div className={styles.text}>
					<p className={styles.label}>
						<span className={styles.index}>{String(index).padStart(2, '0')}</span>
						{label}
						{badge ? <span className={styles.badge}>{badge}</span> : null}
					</p>
					<h2 className={styles.title}>{title}</h2>
					<p className={styles.description}>{description}</p>
					{href && linkLabel ? (
						<Link href={href} className={styles.link}>
							{linkLabel}
						</Link>
					) : null}
				</div>
				<div className={styles.demo}>{renderDemo(progress, isStatic)}</div>
			</div>
		</section>
	);
}
