import '@/themes/forge/tokens.css';
import { ForgeHero } from '@/themes/forge/homepage/ForgeHero';
import { ForgeFeatures } from '@/themes/forge/homepage/ForgeFeatures';
import { ForgeCTA } from '@/themes/forge/homepage/ForgeCTA';
import { ForgeShowcase } from '@/themes/forge/homepage/ForgeShowcase';
import { CosmosLink } from '@/themes/_shared/CosmosLink';
import styles from './page.module.css';

export default function ForgeHomepage() {
	return (
		<div data-theme="forge" className={styles.page}>
			<ForgeHero />
			<ForgeShowcase />
			<ForgeFeatures />
			<ForgeCTA />
			<CosmosLink theme="Forge" />
		</div>
	);
}
