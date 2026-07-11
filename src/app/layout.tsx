import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Cinzel } from 'next/font/google';
import { Providers } from '@/contexts/Providers';
import { Navbar } from '@/components/Navbar/Navbar';
import { Footer } from '@/components/Footer/Footer';
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from '@/lib/seo/site';
import './globals.css';

const geistSans = Geist({
	variable: '--font-geist-sans',
	subsets: ['latin'],
});

const geistMono = Geist_Mono({
	variable: '--font-geist-mono',
	subsets: ['latin'],
});

const cinzel = Cinzel({
	variable: '--font-cinzel',
	subsets: ['latin'],
	display: 'swap',
});

const SITE_TITLE = 'Wizcard — Magic: The Gathering Card Search';

export const metadata: Metadata = {
	metadataBase: new URL(SITE_URL),
	title: {
		default: SITE_TITLE,
		template: '%s | Wizcard',
	},
	description: SITE_DESCRIPTION,
	alternates: { canonical: '/' },
	openGraph: {
		type: 'website',
		siteName: SITE_NAME,
		url: SITE_URL,
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
	},
	twitter: {
		card: 'summary_large_image',
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
	},
};

export const viewport: Viewport = {
	width: 'device-width',
	initialScale: 1,
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable}`}>
				{/* App Router hoists <link> rendered anywhere in the tree into <head>. */}
				<link rel="preconnect" href="https://cards.scryfall.io" />
				<Providers>
					<Navbar />
					{children}
					<Footer />
				</Providers>
			</body>
		</html>
	);
}
