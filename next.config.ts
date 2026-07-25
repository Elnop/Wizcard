import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// next.config.ts est évalué AVANT que Next ne charge .env* : sans cet appel,
// process.env.NEXT_PUBLIC_SUPABASE_URL est vide ici (et uniquement ici — le
// runtime, lui, la voit bien). supabaseImagePatterns() ci-dessous en dépend.
loadEnvConfig(process.cwd());

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const isDev = process.env.NODE_ENV === 'development';

const pageExtensions = isDev
	? ['tsx', 'ts', 'jsx', 'js', 'cosmos.tsx', 'cosmos.ts']
	: ['tsx', 'ts', 'jsx', 'js'];

/**
 * Hôte Supabase autorisé pour next/image.
 *
 * Les images servies par Storage (rendus de cartes custom du studio, cartes MPC
 * ingérées, avatars, frames de templates) passent par l'optimiseur next/image.
 * Sans entrée dans remotePatterns, celui-ci répond 400 « "url" parameter is not
 * allowed » et AUCUNE de ces images ne s'affiche — alors que l'objet lui-même
 * est bien servi en 200 par Storage.
 *
 * L'hôte est dérivé de NEXT_PUBLIC_SUPABASE_URL plutôt que codé en dur : il
 * diffère entre le stack local (127.0.0.1:54321, http) et la prod self-hostée
 * (https). Retourne [] si la variable est absente ou malformée, pour ne pas
 * casser le build.
 *
 * NB dev local : même avec le pattern autorisé, Next 16 refuse d'optimiser une
 * image dont l'hôte résout vers une IP privée (« resolved to private ip », garde
 * anti-SSRF). Les rendus de cartes custom ne s'affichent donc pas via
 * next/image sur le stack local — l'objet reste servi normalement en direct par
 * Storage, et la prod (hôte public) n'est pas concernée.
 */
function supabaseImagePatterns(): {
	protocol: 'http' | 'https';
	hostname: string;
	port?: string;
}[] {
	const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
	if (!raw) return [];
	try {
		const url = new URL(raw);
		const protocol = url.protocol === 'http:' ? 'http' : 'https';
		return [{ protocol, hostname: url.hostname, ...(url.port ? { port: url.port } : {}) }];
	} catch {
		return [];
	}
}

const nextConfig: NextConfig = {
	pageExtensions,
	reactCompiler: false,
	// eslint-disable-next-line sonarjs/no-hardcoded-ip -- local dev network IP for Next.js hot-reload access
	allowedDevOrigins: ['192.168.1.25'],
	skipTrailingSlashRedirect: true,
	async rewrites() {
		return [
			{
				source: '/tamiyo/static/:path*',
				destination: 'https://eu-assets.i.posthog.com/static/:path*',
			},
			{ source: '/tamiyo/:path*', destination: 'https://eu.i.posthog.com/:path*' },
		];
	},
	images: {
		remotePatterns: [
			{
				protocol: 'https',
				hostname: 'cards.scryfall.io',
			},
			{
				protocol: 'https',
				hostname: 'svgs.scryfall.io',
			},
			{
				protocol: 'https',
				hostname: 'drive.google.com',
			},
			{
				protocol: 'https',
				hostname: 'drive.usercontent.google.com',
			},
			...supabaseImagePatterns(),
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
			// supabaseUrl couvre Storage : rendus de cartes custom, avatars, frames de
			// templates. Sans lui, le passage de cette CSP en mode bloquant ferait
			// disparaître toutes ces images (elle est Report-Only pour l'instant).
			`img-src 'self' data: blob: ${supabaseUrl} https://cards.scryfall.io https://svgs.scryfall.io https://drive.google.com https://drive.usercontent.google.com`,
			`connect-src 'self' ${supabaseUrl} https://api.scryfall.com`,
			`worker-src 'self' blob:`,
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

export default withNextIntl(nextConfig);
