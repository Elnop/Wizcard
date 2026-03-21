'use client';

import { useState } from 'react';
import type { ImportResult } from '@/lib/import/types';
import type { ImportStatus } from '@/lib/import/hooks/useImport';
import styles from './ImportSummaryModal.module.css';

interface Props {
	status: ImportStatus;
	result: ImportResult | null;
	onClose: () => void;
}

export function ImportSummaryModal({ status, result, onClose }: Props) {
	const [errorsExpanded, setErrorsExpanded] = useState(false);

	if (status !== 'done' && status !== 'error') return null;
	if (!result) return null;

	const hasErrors = result.errors.length > 0;
	const manyErrors = result.errors.length > 5;

	return (
		<div className={styles.overlay} onClick={onClose}>
			<div className={styles.modal} onClick={(e) => e.stopPropagation()}>
				<h2 className={styles.title}>{status === 'error' ? 'Import Failed' : 'Import Complete'}</h2>

				<div className={styles.stats}>
					<div className={styles.stat}>
						<span className={styles.statValue}>{result.imported}</span>
						<span className={styles.statLabel}>cards imported</span>
					</div>
					{result.notFound > 0 && (
						<div className={styles.stat}>
							<span className={`${styles.statValue} ${styles.warn}`}>{result.notFound}</span>
							<span className={styles.statLabel}>not found</span>
						</div>
					)}
				</div>

				{hasErrors && (
					<div className={styles.errors}>
						<button className={styles.errorToggle} onClick={() => setErrorsExpanded((v) => !v)}>
							{result.errors.length} parse error{result.errors.length !== 1 ? 's' : ''}
							{manyErrors ? (errorsExpanded ? ' ▲' : ' ▼') : ''}
						</button>
						{(!manyErrors || errorsExpanded) && (
							<ul className={styles.errorList}>
								{result.errors.map((e, i) => (
									<li key={i}>{e}</li>
								))}
							</ul>
						)}
					</div>
				)}

				<button className={styles.closeBtn} onClick={onClose}>
					Close
				</button>
			</div>
		</div>
	);
}
