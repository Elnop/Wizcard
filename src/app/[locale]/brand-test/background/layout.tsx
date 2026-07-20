import type { Metadata } from 'next';

export const metadata: Metadata = {
	title: 'Brand test — Backgrounds',
	robots: { index: false, follow: false },
};

export default function BrandTestBackgroundLayout({ children }: { children: React.ReactNode }) {
	return children;
}
