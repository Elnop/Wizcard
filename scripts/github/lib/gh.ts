/* eslint-disable sonarjs/no-os-command-from-path -- `gh` is resolved from PATH
   like every other dev tool in this repo (supabase, tsx); the inputs are fixed. */
/**
 * gh.ts — Fin wrapper autour du CLI GitHub (`gh`), déjà authentifié.
 */
import { spawnSync } from 'node:child_process';

export function gh(args: string[], input?: string): string {
	const r = spawnSync('gh', args, { encoding: 'utf8', input });
	if (r.error) throw r.error;
	if (r.status !== 0) {
		throw new Error(`gh ${args.join(' ')} a échoué (${r.status}) : ${r.stderr.trim()}`);
	}
	return r.stdout;
}

export function ghJson<T>(args: string[]): T {
	return JSON.parse(gh(args)) as T;
}

/** Requête/mutation GraphQL ; `variables` est transmis tel quel (typé JSON). */
export function ghGraphql<T>(query: string, vars: Record<string, unknown> = {}): T {
	const out = gh(['api', 'graphql', '--input', '-'], JSON.stringify({ query, variables: vars }));
	const body = JSON.parse(out) as { data: T; errors?: { message: string }[] };
	if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));
	return body.data;
}
