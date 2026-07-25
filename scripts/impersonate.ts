// Ouvre une session navigateur sur le compte d'un utilisateur, sans mot de passe.
//   npm run impersonate <nickname|email|uuid> [-- --print] [-- --locale fr]
//
// Génère un magic link via l'API admin (service-role) et l'ouvre dans le
// navigateur par défaut. Sert au debug d'un compte réel : reproduire un bug qui
// ne se manifeste que pour un profil donné (langue non-EN, grosse collection,
// deck privé…) sans demander ses identifiants au propriétaire du compte.
//
// DANGER : la cible suit .env.seed comme les autres scripts (seed, ingest). Tant
// que .env.seed pointe la prod, ce script ouvre une VRAIE session sur le compte
// d'un vrai utilisateur — d'où la confirmation interactive exigée dès que la
// cible n'est pas locale (voir confirmNonLocalTarget).

import { createInterface } from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { resolveSupabaseEnv } from './lib/load-env';
import { createLogger } from './lib/logger';

const log = createLogger('impersonate');

const { supabaseUrl: SUPABASE_URL, supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY } =
	resolveSupabaseEnv(log);

// L'app est toujours préfixée par la locale (routing.localePrefix = 'always'),
// donc le lien doit viser /<locale>/auth/confirm — jamais /auth/confirm.
const LOCALES = ['fr', 'en'] as const;
const DEFAULT_LOCALE = 'en';

let _sb: SupabaseClient | null = null;
function sb() {
	if (!_sb)
		_sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
			auth: { persistSession: false, autoRefreshToken: false },
		});
	return _sb;
}

interface Args {
	identifier: string;
	locale: string;
	printOnly: boolean;
	yes: boolean;
}

function parseArgs(argv: string[]): Args {
	let identifier = '';
	let locale = DEFAULT_LOCALE;
	let printOnly = false;
	let yes = false;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--print') printOnly = true;
		else if (arg === '--yes' || arg === '-y') yes = true;
		else if (arg === '--locale') locale = argv[++i] ?? DEFAULT_LOCALE;
		else if (arg.startsWith('--locale=')) locale = arg.slice('--locale='.length);
		else if (arg.startsWith('-')) throw new Error(`option inconnue: ${arg}`);
		else if (!identifier) identifier = arg;
		else throw new Error(`argument en trop: ${arg}`);
	}

	if (!identifier) {
		throw new Error(
			'usage: npm run impersonate <nickname|email|uuid> [-- --locale fr] [-- --print]'
		);
	}
	if (!LOCALES.includes(locale as (typeof LOCALES)[number])) {
		throw new Error(`locale invalide: ${locale} (attendu: ${LOCALES.join(' | ')})`);
	}
	return { identifier, locale, printOnly, yes };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isLocalTarget(url: string): boolean {
	try {
		const { hostname } = new URL(url);
		return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
	} catch {
		return false;
	}
}

/**
 * L'email vit dans auth.users, hors de PostREST : il faut passer par l'API admin.
 * listUsers est paginé et ne filtre pas côté serveur, d'où le parcours de pages.
 */
async function findUserByEmailOrId(identifier: string): Promise<User | null> {
	if (UUID_RE.test(identifier)) {
		const { data, error } = await sb().auth.admin.getUserById(identifier);
		if (error && error.status !== 404) throw new Error(`getUserById: ${error.message}`);
		return data?.user ?? null;
	}

	const needle = identifier.toLowerCase();
	const perPage = 1000;
	for (let page = 1; ; page++) {
		const { data, error } = await sb().auth.admin.listUsers({ page, perPage });
		if (error) throw new Error(`listUsers: ${error.message}`);
		const match = data.users.find((u) => u.email?.toLowerCase() === needle);
		if (match) return match;
		if (data.users.length < perPage) return null;
	}
}

/**
 * Repli quand PostgREST refuse public.profiles (42501). Le service_role ne reçoit
 * de SELECT sur profiles que par la default ACL du cluster : sur une base où
 * cette ACL a dérivé (cas du Supabase local ici), la lecture échoue alors que la
 * table existe — 20260724120002_restore_table_grants.sql ne grante qu'anon et
 * authenticated. On retombe sur les métadonnées auth, où le trigger de signup
 * copie le nickname (raw_user_meta_data) pour les comptes OAuth.
 */
async function findUserByNicknameViaAuth(nickname: string): Promise<User | null> {
	const needle = nickname.toLowerCase();
	const perPage = 1000;
	for (let page = 1; ; page++) {
		const { data, error } = await sb().auth.admin.listUsers({ page, perPage });
		if (error) throw new Error(`listUsers: ${error.message}`);
		const match = data.users.find((u) => {
			const meta = u.user_metadata ?? {};
			return [meta.nickname, meta.name, meta.full_name, meta.user_name].some(
				(v) => typeof v === 'string' && v.toLowerCase() === needle
			);
		});
		if (match) return match;
		if (data.users.length < perPage) return null;
	}
}

/** Résout nickname → user. Le nickname est unique en casse-insensible (profiles_nickname_lower_key). */
async function findUserByNickname(nickname: string): Promise<User | null> {
	// ilike sans wildcard = égalité casse-insensible, alignée sur l'index unique.
	const { data, error } = await sb()
		.from('profiles')
		.select('id, nickname')
		.ilike('nickname', nickname)
		.limit(2);

	if (error) {
		if (error.code !== '42501') throw new Error(`profiles lookup: ${error.message}`);
		log.warn('service_role sans SELECT sur public.profiles — repli sur les métadonnées auth', {
			hint: 'GRANT SELECT ON public.profiles TO service_role;',
		});
		return findUserByNicknameViaAuth(nickname);
	}

	if (!data || data.length === 0) return null;
	if (data.length > 1) {
		throw new Error(`nickname ambigu: ${nickname} (${data.length} profils) — utilise l'uuid`);
	}

	const { data: userData, error: userError } = await sb().auth.admin.getUserById(data[0].id);
	if (userError) throw new Error(`getUserById: ${userError.message}`);
	return userData?.user ?? null;
}

async function resolveUser(identifier: string): Promise<User> {
	// L'email et l'uuid sont non ambigus ; sinon on tente le nickname d'abord
	// (le cas d'usage principal) puis l'email en repli.
	const user = identifier.includes('@')
		? await findUserByEmailOrId(identifier)
		: ((await findUserByNickname(identifier)) ?? (await findUserByEmailOrId(identifier)));

	if (!user) throw new Error(`aucun utilisateur pour « ${identifier} »`);
	if (!user.email)
		throw new Error(`l'utilisateur ${user.id} n'a pas d'email — magic link impossible`);
	return user;
}

/**
 * generateLink renvoie une URL pointant sur GoTrue (/auth/v1/verify), qui redirige
 * ensuite vers redirectTo. On la court-circuite : le token_hash est réinjecté
 * directement dans la route /[locale]/auth/confirm de l'app, qui appelle
 * verifyOtp et pose les cookies de session. Un aller-retour de moins, et le lien
 * reste valide si l'URL publique de GoTrue diffère de celle vue par le script.
 */
async function buildMagicLink(email: string, locale: string, siteUrl: string): Promise<string> {
	const redirectTo = `${siteUrl}/${locale}/collection`;
	const { data, error } = await sb().auth.admin.generateLink({
		type: 'magiclink',
		email,
		options: { redirectTo },
	});
	if (error) throw new Error(`generateLink: ${error.message}`);

	const tokenHash = data.properties?.hashed_token;
	if (!tokenHash) throw new Error('generateLink n’a pas renvoyé de hashed_token');

	const url = new URL(`${siteUrl}/${locale}/auth/confirm`);
	url.searchParams.set('token_hash', tokenHash);
	url.searchParams.set('type', 'magiclink');
	return url.toString();
}

/** Ouvre l'URL dans le navigateur par défaut, comme `npm run sb:studio`. */
function openInBrowser(url: string): void {
	const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
	const child = spawn(opener, [url], { detached: true, stdio: 'ignore' });
	child.on('error', (err) => {
		log.warn('ouverture du navigateur impossible', { opener, error: err.message });
	});
	child.unref();
}

/**
 * Une cible non locale = un compte réel. On exige une confirmation explicite
 * plutôt que de se fier au contenu de .env.seed, qui est invisible depuis la
 * ligne de commande. Sans TTY (CI/cron) on refuse : --yes doit être délibéré.
 */
async function confirmNonLocalTarget(user: User): Promise<void> {
	log.warn('cible NON LOCALE — ceci ouvre une session sur un compte réel', {
		supabase_url: SUPABASE_URL,
		user_id: user.id,
		email: user.email,
	});

	if (!process.stdin.isTTY) {
		throw new Error('cible non locale sans TTY — relance avec --yes si c’est voulu');
	}

	const rl = createInterface({ input: process.stdin, output: process.stdout });
	try {
		const answer = await rl.question(`Confirmer l'impersonation de ${user.email} ? [y/N] `);
		if (answer.trim().toLowerCase() !== 'y') throw new Error('annulé par l’utilisateur');
	} finally {
		rl.close();
	}
}

async function main() {
	const args = parseArgs(process.argv.slice(2));

	// Le magic link doit viser l'app (Next.js), pas l'API Supabase.
	const rawSiteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
	// Strip des '/' finaux sans regex : `/\/+$/` déclenche sonarjs/super-linear-regex.
	let siteUrl = rawSiteUrl;
	while (siteUrl.endsWith('/')) siteUrl = siteUrl.slice(0, -1);
	const local = isLocalTarget(SUPABASE_URL);

	const user = await resolveUser(args.identifier);
	log.info('utilisateur résolu', {
		user_id: user.id,
		email: user.email,
		target: local ? 'local' : 'REMOTE',
	});

	if (!local && !args.yes) await confirmNonLocalTarget(user);

	const link = await buildMagicLink(user.email!, args.locale, siteUrl);

	// Toujours imprimer le lien : utile en SSH, pour un autre profil de navigateur,
	// ou si xdg-open échoue silencieusement.
	console.log(`\n  ${link}\n`);

	if (!args.printOnly) openInBrowser(link);

	log.info('run complete', {
		outcome: 'success',
		user_id: user.id,
		site_url: siteUrl,
		opened: !args.printOnly,
	});
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		log.fatal('run complete', err, { outcome: 'failure' });
		process.exit(1);
	});
