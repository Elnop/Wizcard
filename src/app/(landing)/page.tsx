import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { Hero } from './components/Hero/Hero';
import { Features } from './components/Features/Features';
import { CallToAction } from './components/CallToAction/CallToAction';
import styles from './page.module.css';

// Below-the-fold and pulls in the shared CardList component tree; deferring
// its chunk keeps it off the critical path for the Navbar-logo LCP without
// affecting search/deck, which import CardList directly.
const CardShowcase = dynamic(() =>
	import('./components/CardShowcase/CardShowcase').then((m) => m.CardShowcase)
);

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
