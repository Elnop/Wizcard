import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { LoginForm } from './LoginForm';
import styles from './page.module.css';

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: 'seo.login' });
	return { title: t('title') };
}

export default async function LoginPage({ params }: { params: Promise<{ locale: Locale }> }) {
	const { locale } = await params;
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: 'auth.login' });
	return (
		<div className={styles.page}>
			<div className={styles.card}>
				<h1 className={styles.title}>{t('title')}</h1>
				<LoginForm />
			</div>
		</div>
	);
}
