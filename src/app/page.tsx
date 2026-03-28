import { Hero } from '@/components/landing/Hero/Hero';
import { CardShowcase } from '@/components/landing/CardShowcase/CardShowcase';
import { Features } from '@/components/landing/Features/Features';
import { CallToAction } from '@/components/landing/CallToAction/CallToAction';
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
