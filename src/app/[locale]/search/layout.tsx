import type { Metadata } from 'next';

export const metadata: Metadata = {
	title: 'Card Search',
	description: 'Search every Magic: The Gathering card by name, color, type, and set.',
	robots: { index: true, follow: true },
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
	return children;
}
