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
			{
				protocol: 'https',
				hostname: 'drive.usercontent.google.com',
			},
		],
	},
	async headers() {
		const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
		// CSP is Report-Only for now: the browser reports violations without
		// blocking, so we can observe what a strict policy would break before
		// switching to enforcing mode. 'unsafe-inline'/'unsafe-eval' are needed
		// by Next.js's runtime; tighten via nonces once report data is clean.
		const csp = [
			`default-src 'self'`,
			`script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
			`style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
			`font-src 'self' https://fonts.gstatic.com`,
			`img-src 'self' data: blob: https://cards.scryfall.io https://drive.google.com https://drive.usercontent.google.com`,
			`connect-src 'self' ${supabaseUrl} https://api.scryfall.com`,
			`frame-ancestors 'none'`,
			`base-uri 'self'`,
			`form-action 'self'`,
		].join('; ');

		return [
			{
				source: '/:path*',
				headers: [
					{
						key: 'Strict-Transport-Security',
						value: 'max-age=63072000; includeSubDomains; preload',
					},
					{ key: 'X-Frame-Options', value: 'DENY' },
					{ key: 'X-Content-Type-Options', value: 'nosniff' },
					{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
					{
						key: 'Permissions-Policy',
						value: 'camera=(), microphone=(), geolocation=()',
					},
					{ key: 'Content-Security-Policy-Report-Only', value: csp },
				],
			},
		];
	},
};

export default nextConfig;
