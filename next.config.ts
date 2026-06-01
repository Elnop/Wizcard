import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';

const pageExtensions = isDev
	? ['tsx', 'ts', 'jsx', 'js', 'cosmos.tsx', 'cosmos.ts']
	: ['tsx', 'ts', 'jsx', 'js'];

const nextConfig: NextConfig = {
	pageExtensions,
	reactCompiler: false,
	// eslint-disable-next-line sonarjs/no-hardcoded-ip -- local dev network IP for Next.js hot-reload access
	allowedDevOrigins: ['192.168.1.25'],
	images: {
		remotePatterns: [
			{
				protocol: 'https',
				hostname: 'cards.scryfall.io',
			},
			{
				protocol: 'https',
				hostname: 'drive.google.com',
			},
		],
	},
};

export default nextConfig;
