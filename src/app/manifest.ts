import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: 'Wizcard — Magic: The Gathering Card Search',
		short_name: 'Wizcard',
		description: 'Search every Magic: The Gathering card, build decks, and track your collection.',
		start_url: '/',
		display: 'standalone',
		background_color: '#0a0a0a',
		theme_color: '#c9a84c',
		icons: [
			{ src: '/icon', sizes: '512x512', type: 'image/png' },
			{ src: '/apple-icon', sizes: '180x180', type: 'image/png' },
		],
	};
}
