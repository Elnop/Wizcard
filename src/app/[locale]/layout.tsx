import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Cinzel } from 'next/font/google';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import type { Locale } from '@/i18n/routing';
import { Providers } from '@/contexts/Providers';
import { Navbar } from '@/components/Navbar/Navbar';
import { Footer } from '@/components/Footer/Footer';
import { LocaleSync } from '@/lib/profile/components/LocaleSync';
import { SITE_URL, SITE_NAME } from '@/lib/seo/site';
import { BRAND_FONT_VARIABLES } from '@/fonts/brand';
import '../globals.css';

const geistSans = Geist({
	variable: '--font-geist-sans',
	subsets: ['latin'],
	display: 'swap',
});

const geistMono = Geist_Mono({
	variable: '--font-geist-mono',
	subsets: ['latin'],
	display: 'swap',
});

const cinzel = Cinzel({
	variable: '--font-cinzel',
	subsets: ['latin'],
	display: 'swap',
});

export function generateStaticParams() {
	return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: 'seo.home' });

	return {
		metadataBase: new URL(SITE_URL),
		title: {
			default: t('title'),
			template: '%s | Wizcard',
		},
		description: t('description'),
		alternates: {
			canonical: `/${locale}`,
			languages: { fr: '/fr', en: '/en', 'x-default': '/fr' },
		},
		openGraph: {
			type: 'website',
			siteName: SITE_NAME,
			locale,
			url: `${SITE_URL}/${locale}`,
			title: t('title'),
			description: t('description'),
		},
		twitter: {
			card: 'summary_large_image',
			title: t('title'),
			description: t('description'),
		},
	};
}

export const viewport: Viewport = {
	width: 'device-width',
	initialScale: 1,
};

export default async function LocaleLayout({
	children,
	params,
}: Readonly<{
	children: React.ReactNode;
	params: Promise<{ locale: string }>;
}>) {
	const { locale } = await params;
	if (!hasLocale(routing.locales, locale)) notFound();

	// Active le rendu statique des RSC qui utilisent les traductions.
	setRequestLocale(locale);

	return (
		<html lang={locale}>
			<body
				className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} ${BRAND_FONT_VARIABLES}`}
			>
				{/* App Router hoists <link> rendered anywhere in the tree into <head>. */}
				<link rel="preconnect" href="https://cards.scryfall.io" />
				<NextIntlClientProvider>
					<Providers>
						<LocaleSync />
						<Navbar />
						{children}
						<Footer />
					</Providers>
				</NextIntlClientProvider>
			</body>
		</html>
	);
}
