/* eslint-disable sonarjs/no-os-command-from-path -- `git` is resolved from PATH
   like every other dev tool in this repo; the inputs are fixed. */
/**
 * git.ts — Fin wrapper autour du CLI git.
 */
import { spawnSync } from 'node:child_process';

/** Exécute git ; retourne { status, stdout } sans lever sur un code non nul. */
export function gitRaw(args: string[]): { status: number; stdout: string } {
	const r = spawnSync('git', args, { encoding: 'utf8' });
	if (r.error) throw r.error;
	return { status: r.status ?? 1, stdout: r.stdout };
}

export function git(args: string[]): string {
	const r = spawnSync('git', args, { encoding: 'utf8' });
	if (r.error) throw r.error;
	if (r.status !== 0) {
		throw new Error(`git ${args.join(' ')} a échoué (${r.status}) : ${r.stderr.trim()}`);
	}
	return r.stdout;
}
