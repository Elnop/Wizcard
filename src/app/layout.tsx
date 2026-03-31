import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
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

export const metadata: Metadata = {
	title: 'Wizcard - Magic: The Gathering Card Search',
	description:
		'Search through every Magic: The Gathering card ever printed. Filter by color, type, set, and more.',
	keywords: ['magic the gathering', 'mtg', 'card search', 'scryfall', 'trading cards'],
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body className={`${geistSans.variable} ${geistMono.variable}`}>
				<Providers>
					<Navbar />
					{children}
				</Providers>
			</body>
		</html>
	);
}
