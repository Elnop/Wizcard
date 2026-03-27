'use client';

import { useRef, useCallback } from 'react';
import type { ImportFormatId, ImportFormatDescriptor } from '@/lib/import/utils/types';
import type { InputMode } from './types';
import { Button } from '@/components/ui/Button/Button';
import styles from './ImportModal.module.css';

interface ImportFileInputProps {
	formatRegistry: ImportFormatDescriptor[];
	forcedFormat: ImportFormatId | 'auto';
	onForcedFormatChange: (f: ImportFormatId | 'auto') => void;
	inputMode: InputMode;
	onInputModeChange: (m: InputMode) => void;
	pastedText: string;
	onPastedTextChange: (t: string) => void;
	isDragging: boolean;
	onDragOver: (e: React.DragEvent) => void;
	onDragLeave: (e: React.DragEvent) => void;
	onDrop: (e: React.DragEvent) => void;
	onFileSelect: (file: File, forcedFormat?: ImportFormatId) => void;
	onTextSubmit: () => void;
	onCancel: () => void;
}

export function ImportFileInput({
	formatRegistry,
	forcedFormat,
	onForcedFormatChange,
	inputMode,
	onInputModeChange,
	pastedText,
	onPastedTextChange,
	isDragging,
	onDragOver,
	onDragLeave,
	onDrop,
	onFileSelect,
	onTextSubmit,
	onCancel,
}: ImportFileInputProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file) onFileSelect(file, forcedFormat !== 'auto' ? forcedFormat : undefined);
			e.target.value = '';
		},
		[onFileSelect, forcedFormat]
	);

	return (
		<>
			<div className={styles.formatRow}>
				<label className={styles.formatLabel} htmlFor="format-select">
					Format :
				</label>
				<select
					id="format-select"
					className={styles.formatSelect}
					value={forcedFormat}
					onChange={(e) => onForcedFormatChange(e.target.value as ImportFormatId | 'auto')}
				>
					<option value="auto">Auto-détection</option>
					{formatRegistry.map((f) => (
						<option key={f.id} value={f.id}>
							{f.label}
						</option>
					))}
				</select>
			</div>

			<div className={styles.tabs}>
				<button
					className={`${styles.tab} ${inputMode === 'file' ? styles.tabActive : ''}`}
					onClick={() => onInputModeChange('file')}
				>
					Fichier
				</button>
				<button
					className={`${styles.tab} ${inputMode === 'text' ? styles.tabActive : ''}`}
					onClick={() => onInputModeChange('text')}
				>
					Coller du texte
				</button>
			</div>

			{inputMode === 'file' ? (
				<>
					<div
						className={`${styles.dropZone} ${isDragging ? styles.dropZoneDragging : ''}`}
						onDragOver={onDragOver}
						onDragLeave={onDragLeave}
						onDrop={onDrop}
						onClick={() => fileInputRef.current?.click()}
					>
						<span className={styles.dropText}>
							Glissez un fichier ici ou cliquez pour parcourir
						</span>
						<span className={styles.dropHint}>.csv, .txt</span>
					</div>
					<input
						ref={fileInputRef}
						type="file"
						accept=".csv,.txt"
						className={styles.hiddenInput}
						onChange={handleFileChange}
					/>
				</>
			) : (
				<textarea
					className={styles.textarea}
					placeholder={'4 Lightning Bolt (M11) 149\n2 Counterspell (MH2) 267\n...'}
					value={pastedText}
					onChange={(e) => onPastedTextChange(e.target.value)}
					rows={8}
				/>
			)}

			<div className={styles.actions}>
				{inputMode === 'text' && (
					<Button variant="primary" onClick={onTextSubmit} disabled={!pastedText.trim()}>
						Analyser
					</Button>
				)}
				<Button variant="ghost" onClick={onCancel}>
					Annuler
				</Button>
			</div>
		</>
	);
}
