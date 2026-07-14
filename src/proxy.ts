import createIntlMiddleware from 'next-intl/middleware';
import { type NextRequest } from 'next/server';
import { routing } from '@/i18n/routing';
import { updateSession } from '@/lib/supabase/middleware';

const intlMiddleware = createIntlMiddleware(routing);

/**
 * Middleware composé (Next 16 nomme l'export `proxy`).
 *
 * Ordre CRUCIAL : next-intl d'abord — il possède l'identité de la réponse
 * (redirection 307 sur `/`, préfixe de locale, cookie `NEXT_LOCALE`, header
 * `x-next-intl-locale`). Le refresh de session Supabase vient ENSUITE et ne
 * fait qu'AJOUTER ses cookies auth sur cette même réponse (voir updateSession),
 * de sorte que redirection ET cookies auth cohabitent.
 */
export async function proxy(request: NextRequest) {
	const response = intlMiddleware(request);
	return updateSession(request, response);
}

export const config = {
	// Exclure api, assets Next/statiques, et les fichiers metadata de la racine
	// (sitemap/robots) de la gestion de locale.
	// Les assets servis depuis public/ doivent rester hors du préfixe de locale :
	// sans `wasm`, /sql-wasm.wasm est redirigé vers /fr/sql-wasm.wasm (404) et
	// sql.js ne peut plus charger son binaire (import Delver Lens).
	matcher: [
		'/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|wasm)$).*)',
	],
};
