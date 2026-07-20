'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { PinnedFeature } from './PinnedFeature/PinnedFeature';
import { SearchDemo } from './demos/SearchDemo/SearchDemo';

const CollectionDemo = dynamic(() =>
	import('./demos/CollectionDemo/CollectionDemo').then((m) => m.CollectionDemo)
);
const DeckDemo = dynamic(() => import('./demos/DeckDemo/DeckDemo').then((m) => m.DeckDemo));
const ImportDemo = dynamic(() => import('./demos/ImportDemo/ImportDemo').then((m) => m.ImportDemo));
const PdfDemo = dynamic(() => import('./demos/PdfDemo/PdfDemo').then((m) => m.PdfDemo));
const EditorDemo = dynamic(() => import('./demos/EditorDemo/EditorDemo').then((m) => m.EditorDemo));

export function FeatureSections() {
	const t = useTranslations('landing');
	const discover = t('discover');

	return (
		<>
			<PinnedFeature
				index={1}
				side="left"
				label={t('features.search.label')}
				title={t('features.search.title')}
				description={t('features.search.description')}
				href="/search"
				linkLabel={discover}
				renderDemo={(p) => <SearchDemo progress={p} />}
			/>
			<PinnedFeature
				index={2}
				side="right"
				label={t('features.collection.label')}
				title={t('features.collection.title')}
				description={t('features.collection.description')}
				href="/collection"
				linkLabel={discover}
				renderDemo={(p) => <CollectionDemo progress={p} />}
			/>
			<PinnedFeature
				index={3}
				side="left"
				label={t('features.deck.label')}
				title={t('features.deck.title')}
				description={t('features.deck.description')}
				href="/decks"
				linkLabel={discover}
				renderDemo={(p) => <DeckDemo progress={p} />}
			/>
			<PinnedFeature
				index={4}
				side="right"
				label={t('features.import.label')}
				title={t('features.import.title')}
				description={t('features.import.description')}
				href="/collection"
				linkLabel={discover}
				renderDemo={(p) => (
					<ImportDemo
						progress={p}
						recognizedLabel={(count) => t('demo.import.recognized', { count })}
					/>
				)}
			/>
			<PinnedFeature
				index={5}
				side="left"
				label={t('features.pdf.label')}
				title={t('features.pdf.title')}
				description={t('features.pdf.description')}
				href="/decks"
				linkLabel={discover}
				renderDemo={(p) => <PdfDemo progress={p} readyLabel={t('demo.pdf.ready')} />}
			/>
			<PinnedFeature
				index={6}
				side="right"
				label={t('features.editor.label')}
				title={t('features.editor.title')}
				description={t('features.editor.description')}
				badge={t('badge.soon')}
				renderDemo={(p) => <EditorDemo progress={p} stampLabel={t('badge.soon')} />}
			/>
		</>
	);
}
