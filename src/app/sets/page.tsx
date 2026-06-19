import type { Metadata } from 'next';
import { SetsPageClient } from './SetsPageClient';

export const metadata: Metadata = {
	title: 'Extensions',
};

export default function SetsPage() {
	return <SetsPageClient />;
}
