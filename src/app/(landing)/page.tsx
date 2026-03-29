import { Hero } from './components/Hero/Hero';
import { CardShowcase } from './components/CardShowcase/CardShowcase';
import { Features } from './components/Features/Features';
import { CallToAction } from './components/CallToAction/CallToAction';
import styles from './page.module.css';

export default function Home() {
	return (
		<div className={styles.page}>
			<Hero />
			<CardShowcase />
			<Features />
			<CallToAction />
		</div>
	);
}
