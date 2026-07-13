import { createServerClient } from '@supabase/ssr';
import { type NextRequest, type NextResponse } from 'next/server';

/**
 * Rafraîchit la session Supabase et propage les cookies auth sur la réponse
 * FOURNIE (celle produite par le middleware next-intl). On ne recrée PAS de
 * `NextResponse.next()` ici : cela jetterait la redirection / les cookies /
 * le header de locale posés par next-intl. On se contente d'AJOUTER les
 * cookies auth sur la réponse existante.
 */
export async function updateSession(request: NextRequest, response: NextResponse) {
	const supabase = createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
		{
			cookies: {
				getAll() {
					return request.cookies.getAll();
				},
				setAll(cookiesToSet) {
					cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
					cookiesToSet.forEach(({ name, value, options }) =>
						response.cookies.set(name, value, options)
					);
				},
			},
		}
	);

	// Refresh session — do not remove this
	await supabase.auth.getUser();

	return response;
}
