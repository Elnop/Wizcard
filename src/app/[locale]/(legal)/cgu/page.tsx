import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { legalConfig } from '@/lib/legal/legal-config';

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: 'seo.cgu' });
	return {
		title: t('title'),
		description: t('description'),
		robots: { index: true, follow: true },
	};
}

export default async function CguPage({ params }: { params: Promise<{ locale: Locale }> }) {
	const { locale } = await params;
	setRequestLocale(locale);
	const t = await getTranslations('legal');
	const { editor, siteName, lastUpdated } = legalConfig;

	const email = () => <a href={`mailto:${editor.contactEmail}`}>{editor.contactEmail}</a>;
	const discord = (chunks: React.ReactNode) => (
		<a href={editor.discordUrl} target="_blank" rel="noreferrer noopener">
			{chunks}
		</a>
	);

	return (
		<>
			<h1>{t('cgu.title')}</h1>
			<p className="updated">{t('lastUpdated', { date: lastUpdated })}</p>

			<h2>{t('cgu.objectHeading')}</h2>
			<p>{t('cgu.object', { siteName })}</p>

			<h2>{t('cgu.accountHeading')}</h2>
			<p>{t('cgu.account')}</p>

			<h2>{t('cgu.ipHeading')}</h2>
			<p>{t('cgu.ip', { siteName })}</p>

			<h2>{t('cgu.userContentHeading')}</h2>
			<p>{t('cgu.userContent')}</p>

			<h2>{t('cgu.liabilityHeading')}</h2>
			<p>{t('cgu.liability')}</p>

			<h2>{t('cgu.contactHeading')}</h2>
			<p>{t.rich('cgu.contact', { email, discord })}</p>
		</>
	);
}
