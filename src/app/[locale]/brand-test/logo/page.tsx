import type { Metadata } from 'next';
import { BRAND_FONTS } from '@/fonts/brand';
import styles from './page.module.css';

export const metadata: Metadata = {
	title: 'Brand test — Logo fonts',
	robots: { index: false, follow: false },
};

export default function BrandTestLogoPage() {
	return (
		<div className={styles.page}>
			<p className={styles.intro}>Chaque font en situation : navbar, hero, et icône (favicon).</p>

			{BRAND_FONTS.map((font) => (
				<section key={font.id} className={styles.row}>
					<span className={styles.label}>{font.label}</span>

					{/* Maquette navbar */}
					<div className={styles.navbar}>
						<span className={styles.navbarLogo} style={{ fontFamily: font.cssVar }}>
							Wizcard
						</span>
						<span className={styles.navbarLinks}>
							<span>Recherche</span>
							<span>Sets</span>
							<span>Decks</span>
						</span>
					</div>

					{/* Maquette hero + icône favicon */}
					<div className={styles.showcase}>
						<span className={styles.heroTitle} style={{ fontFamily: font.cssVar }}>
							Wizcard
						</span>
						<span className={styles.favicon} style={{ fontFamily: font.cssVar }}>
							W
						</span>
					</div>
				</section>
			))}
		</div>
	);
}
