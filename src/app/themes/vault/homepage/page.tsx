import '@/themes/vault/tokens.css';
import { VaultHero } from '@/themes/vault/homepage/VaultHero';
import { VaultFeatures } from '@/themes/vault/homepage/VaultFeatures';
import { VaultCTA } from '@/themes/vault/homepage/VaultCTA';
import { VaultShowcase } from '@/themes/vault/homepage/VaultShowcase';
import { CosmosLink } from '@/themes/_shared/CosmosLink';
import styles from './page.module.css';

export default function VaultHomepage() {
	return (
		<div data-theme="vault" className={styles.page}>
			<VaultHero />
			<VaultShowcase />
			<VaultFeatures />
			<VaultCTA />
			<CosmosLink theme="Vault" />
		</div>
	);
}
