import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Cinzel } from 'next/font/google';
import { Providers } from '@/contexts/Providers';
import { Navbar } from '@/components/Navbar/Navbar';
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

export const metadata: Metadata = {
	title: 'Wizcard - Magic: The Gathering Card Search',
	description:
		'Search through every Magic: The Gathering card ever printed. Filter by color, type, set, and more.',
	keywords: ['magic the gathering', 'mtg', 'card search', 'scryfall', 'trading cards'],
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
				<Providers>
					<Navbar />
					{children}
				</Providers>
			</body>
		</html>
	);
}
