'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { useCollection } from '@/hooks/useCollection';
import { useMoxfieldImport } from '@/hooks/useMoxfieldImport';
import { serializeToMoxfieldCSV, downloadCSV } from '@/lib/moxfield/serialize';
import { CollectionGrid } from '@/components/collection/CollectionGrid';
import { ImportSummaryModal } from '@/components/collection/ImportSummaryModal';
import { Button } from '@/components/ui/Button';
import styles from './page.module.css';

export default function CollectionPage() {
	const { entries, isLoaded, decrementCard, getStats, importCards } = useCollection();
	const { status, result, importFile, reset } = useMoxfieldImport(importCards);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const stats = getStats();

	function handleExport() {
		downloadCSV(serializeToMoxfieldCSV(entries), 'my-collection.csv');
	}

	function handleImportClick() {
		fileInputRef.current?.click();
	}

	function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (!file) return;
		void importFile(file);
		// Reset input so the same file can be re-imported if needed
		e.target.value = '';
	}

	if (!isLoaded) {
		return (
			<div className={styles.page}>
				<header className={styles.header}>
					<Link href="/" className={styles.logo}>
						MTG Snap
					</Link>
					<nav className={styles.nav}>
						<Link href="/search" className={styles.navLink}>
							Search
						</Link>
					</nav>
				</header>
			</div>
		);
	}

	const isBusy = status === 'parsing' || status === 'fetching' || status === 'merging';

	return (
		<div className={styles.page}>
			<header className={styles.header}>
				<Link href="/" className={styles.logo}>
					MTG Snap
				</Link>
				<nav className={styles.nav}>
					<Link href="/search" className={styles.navLink}>
						Search
					</Link>
				</nav>
			</header>

			<main className={styles.main}>
				<div className={styles.titleSection}>
					<div className={styles.titleLeft}>
						<h1 className={styles.title}>My Collection</h1>
						{entries.length > 0 && (
							<p className={styles.statsLine}>
								{stats.totalCards} card{stats.totalCards !== 1 ? 's' : ''} &middot;{' '}
								{stats.uniqueCards} unique &middot; {stats.setCount} set
								{stats.setCount !== 1 ? 's' : ''}
							</p>
						)}
					</div>
					<div className={styles.actions}>
						{entries.length > 0 && (
							<Button variant="secondary" onClick={handleExport} disabled={isBusy}>
								Export CSV
							</Button>
						)}
						<Button variant="primary" onClick={handleImportClick} disabled={isBusy}>
							{isBusy ? 'Importing…' : 'Import CSV'}
						</Button>
					</div>
				</div>

				<input
					ref={fileInputRef}
					type="file"
					accept=".csv"
					className={styles.fileInput}
					onChange={handleFileChange}
				/>

				{entries.length === 0 ? (
					<div className={styles.emptyState}>
						<h2>Your collection is empty</h2>
						<p>Search for cards or import a Moxfield CSV to get started.</p>
						<Link href="/search">
							<Button variant="primary">Search for cards</Button>
						</Link>
					</div>
				) : (
					<CollectionGrid entries={entries} onDecrement={decrementCard} />
				)}
			</main>

			<ImportSummaryModal status={status} result={result} onClose={reset} />
		</div>
	);
}
