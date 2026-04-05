import '@/themes/library/tokens.css';
import { LibraryHero } from '@/themes/library/homepage/LibraryHero';
import { LibraryFeatures } from '@/themes/library/homepage/LibraryFeatures';
import { LibraryCTA } from '@/themes/library/homepage/LibraryCTA';
import { LibraryShowcase } from '@/themes/library/homepage/LibraryShowcase';
import { CosmosLink } from '@/themes/_shared/CosmosLink';
import styles from './page.module.css';

export default function LibraryHomepage() {
	return (
		<div data-theme="library" className={styles.page}>
			<LibraryHero />
			<LibraryShowcase />
			<LibraryFeatures />
			<LibraryCTA />
			<CosmosLink theme="Library" />
		</div>
	);
}
