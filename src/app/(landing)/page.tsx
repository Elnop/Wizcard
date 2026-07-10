import type { Metadata } from 'next';
import { Hero } from './components/Hero/Hero';
import { CardShowcase } from './components/CardShowcase/CardShowcase';
import { Features } from './components/Features/Features';
import { CallToAction } from './components/CallToAction/CallToAction';
import styles from './page.module.css';

export const metadata: Metadata = {
	title: { absolute: 'Wizcard — Magic: The Gathering Card Search' },
	description: 'Search every Magic: The Gathering card, build decks, and track your collection.',
	alternates: { canonical: '/' },
};

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
