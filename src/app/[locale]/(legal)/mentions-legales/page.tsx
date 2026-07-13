import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildAlternates } from '@/lib/seo/alternates';
import { legalConfig } from '@/lib/legal/legal-config';

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: 'seo.legalNotice' });
	return {
		title: t('title'),
		description: t('description'),
		alternates: buildAlternates(locale, 'mentions-legales'),
		robots: { index: true, follow: true },
	};
}

export default async function MentionsLegalesPage({
	params,
}: {
	params: Promise<{ locale: Locale }>;
}) {
	const { locale } = await params;
	setRequestLocale(locale);
	const t = await getTranslations('legal');
	const { editor, host, business, siteName, lastUpdated } = legalConfig;

	const email = () => <a href={`mailto:${editor.contactEmail}`}>{editor.contactEmail}</a>;
	const discord = (chunks: React.ReactNode) => (
		<a href={editor.discordUrl} target="_blank" rel="noreferrer noopener">
			{chunks}
		</a>
	);

	return (
		<>
			<h1>{t('legalNotice.title')}</h1>
			<p className="updated">{t('lastUpdated', { date: lastUpdated })}</p>

			<h2>{t('legalNotice.editorHeading')}</h2>
			{business ? (
				<p>
					{t('legalNotice.editorBusiness', {
						legalName: business.legalName,
						siret: business.siret,
					})}
					{business.vat ? (
						<>
							<br />
							{t('legalNotice.editorBusinessVat', { vat: business.vat })}
						</>
					) : null}
					<br />
					{t('legalNotice.editorBusinessDirector', { director: editor.publicationDirector })}
					<br />
					{t.rich('legalNotice.editorBusinessContact', { email })}
				</p>
			) : (
				<p>
					{t.rich('legalNotice.editorPersonal', {
						siteName,
						editorName: editor.name,
						director: editor.publicationDirector,
						email,
						discord,
					})}
				</p>
			)}

			<h2>{t('legalNotice.hostingHeading')}</h2>
			<p>{t('legalNotice.hosting', { hostLabel: host.label, mailProvider: host.mailProvider })}</p>

			<h2>{t('legalNotice.ipHeading')}</h2>
			<p>{t('legalNotice.ip', { siteName })}</p>

			<h2>{t('legalNotice.contactHeading')}</h2>
			<p>{t.rich('legalNotice.contact', { email, discord })}</p>
		</>
	);
}
