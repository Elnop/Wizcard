import type { Metadata } from 'next';
import { SetDetailClient } from './SetDetailClient';

interface SetPageProps {
	params: Promise<{
		code: string;
	}>;
}

export async function generateMetadata({ params }: SetPageProps): Promise<Metadata> {
	const { code } = await params;
	return {
		title: `${decodeURIComponent(code).toUpperCase()} | Extensions`,
	};
}

export default async function SetPage({ params }: SetPageProps) {
	const { code } = await params;
	return <SetDetailClient code={decodeURIComponent(code)} />;
}
