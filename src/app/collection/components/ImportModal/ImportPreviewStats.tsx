'use client';

import type { ImportFormatId } from '@/lib/import/types';
import { isBinaryFormat } from '@/lib/import/types';
import type { ImportPreview } from '@/lib/import/hooks/useImport';
import { formatFileSize } from '@/lib/import/utils/format';
import styles from './ImportModal.module.css';

interface ImportPreviewStatsProps {
	preview: ImportPreview;
	formatRegistry: Array<{ id: ImportFormatId; label: string }>;
	errorsExpanded: boolean;
	onErrorsToggle: () => void;
	onChangeFile: () => void;
	onChangeFormat: (formatId: ImportFormatId) => void;
}

export function ImportPreviewStats({
	preview,
	formatRegistry,
	errorsExpanded,
	onErrorsToggle,
	onChangeFile,
	onChangeFormat,
}: ImportPreviewStatsProps) {
	const errorCount = preview.parsed.parseErrors.length;
	const manyErrors = errorCount > 5;

	return (
		<>
			<div className={styles.fileInfo} onClick={onChangeFile}>
				<span className={styles.fileName}>{preview.fileName}</span>
				<span className={styles.fileSize}>{formatFileSize(preview.fileSize)}</span>
				<span className={styles.fileInfoOverlay}>Changer de fichier</span>
			</div>

			<div className={styles.formatRow}>
				<span className={styles.formatLabel}>Format :</span>
				<select
					className={styles.formatSelect}
					value={preview.detectedFormat}
					onChange={(e) => onChangeFormat(e.target.value as ImportFormatId)}
					disabled={isBinaryFormat(preview.detectedFormat)}
				>
					{formatRegistry.map((f) => (
						<option key={f.id} value={f.id}>
							{f.label}
						</option>
					))}
				</select>
			</div>

			<div className={styles.previewStats}>
				<span className={styles.previewStat}>
					<span className={styles.previewStatValue}>
						{preview.parsed.rows.reduce((sum, r) => sum + r.quantity, 0)}
					</span>{' '}
					cartes détectées
				</span>
				{errorCount > 0 && (
					<span className={styles.previewStat}>
						<span className={styles.previewStatWarn}>{errorCount}</span> erreurs d&apos;analyse
					</span>
				)}
			</div>

			{errorCount > 0 && (
				<div className={styles.errors}>
					<button className={styles.errorToggle} onClick={onErrorsToggle}>
						{errorCount} erreur{errorCount !== 1 ? 's' : ''}
						{manyErrors ? (errorsExpanded ? ' ▲' : ' ▼') : ''}
					</button>
					{(!manyErrors || errorsExpanded) && (
						<ul className={styles.errorList}>
							{preview.parsed.parseErrors.map((e, i) => (
								<li key={i}>{e}</li>
							))}
						</ul>
					)}
				</div>
			)}
		</>
	);
}
