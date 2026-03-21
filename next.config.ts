import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	reactCompiler: false,
	images: {
		remotePatterns: [
			{
				protocol: 'https',
				hostname: 'cards.scryfall.io',
			},
		],
	},
};

export default nextConfig;
