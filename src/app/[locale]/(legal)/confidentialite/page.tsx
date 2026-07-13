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
	const t = await getTranslations({ locale, namespace: 'seo.privacy' });
	return {
		title: t('title'),
		description: t('description'),
		robots: { index: true, follow: true },
	};
}

export default async function ConfidentialitePage({
	params,
}: {
	params: Promise<{ locale: Locale }>;
}) {
	const { locale } = await params;
	setRequestLocale(locale);
	const t = await getTranslations('legal');
	const { editor, host, siteName, dataRetentionMonths, lastUpdated } = legalConfig;

	const email = () => <a href={`mailto:${editor.contactEmail}`}>{editor.contactEmail}</a>;
	const discord = (chunks: React.ReactNode) => (
		<a href={editor.discordUrl} target="_blank" rel="noreferrer noopener">
			{chunks}
		</a>
	);
	const strong = (chunks: React.ReactNode) => <strong>{chunks}</strong>;
	const cnil = (chunks: React.ReactNode) => (
		<a href="https://www.cnil.fr" target="_blank" rel="noreferrer noopener">
			{chunks}
		</a>
	);

	return (
		<>
			<h1>{t('privacy.title')}</h1>
			<p className="updated">{t('lastUpdated', { date: lastUpdated })}</p>

			<p>{t('privacy.intro', { siteName })}</p>

			<h2>{t('privacy.controllerHeading')}</h2>
			<p>{t.rich('privacy.controller', { editorName: editor.name, email })}</p>

			<h2>{t('privacy.dataHeading')}</h2>
			<ul>
				<li>{t('privacy.dataEmail')}</li>
				<li>{t('privacy.dataProfile')}</li>
				<li>{t('privacy.dataTechnical')}</li>
			</ul>

			<h2>{t('privacy.purposesHeading')}</h2>
			<p>{t('privacy.purposes')}</p>

			<h2>{t('privacy.legalBasisHeading')}</h2>
			<p>{t('privacy.legalBasis')}</p>

			<h2>{t('privacy.recipientsHeading')}</h2>
			<p>
				{t.rich('privacy.recipients', {
					hostLabel: host.label,
					mailProvider: host.mailProvider,
					strong,
				})}
			</p>

			<h2>{t('privacy.retentionHeading')}</h2>
			<p>{t('privacy.retention', { months: dataRetentionMonths })}</p>

			<h2>{t('privacy.rightsHeading')}</h2>
			<p>{t.rich('privacy.rights', { email })}</p>

			<h2>{t('privacy.cookiesHeading')}</h2>
			<p>{t('privacy.cookies', { siteName })}</p>

			<h2>{t('privacy.complaintHeading')}</h2>
			<p>{t.rich('privacy.complaint', { email, discord, cnil })}</p>
		</>
	);
}
