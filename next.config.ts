import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	reactCompiler: false,
	allowedDevOrigins: ['192.168.1.25'],
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
