/**
 * release.ts — Logique pure de la PR de release (main → deploy) : migrations
 * en attente, PRs livrées, corps de PR en français, décision create/update.
 */
const MIGRATION_RE = /^supabase\/migrations\/[^/]+\.sql$/;
const SQUASH_PR_RE = /\(#(\d+)\)\s*$/;

export type ShippedPr = { number: number; title: string; closes: number[]; labels: string[] };

/** Garde les fichiers `supabase/migrations/*.sql` d'un `git diff --name-only`, triés. */
export function parsePendingMigrations(diffNameOnly: string): string[] {
	return diffNameOnly
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => MIGRATION_RE.test(l))
		.sort();
}

/** Numéros de PR extraits des sujets squash `... (#N)` ; uniques, croissants. */
export function extractPrNumbers(commitSubjects: string[]): number[] {
	const nums = new Set<number>();
	for (const s of commitSubjects) {
		const m = SQUASH_PR_RE.exec(s.trim());
		if (m) nums.add(Number(m[1]));
	}
	return [...nums].sort((a, b) => a - b);
}

function prLine(pr: ShippedPr): string {
	const refs = pr.closes.map((n) => '#' + n).join(', ');
	const closes = pr.closes.length ? ` (ferme ${refs})` : '';
	const mig = pr.labels.includes('needs-migration') ? ' ⚠️ migration' : '';
	return `- #${pr.number} ${pr.title}${closes}${mig}`;
}

export function renderReleaseBody(input: {
	prs: ShippedPr[];
	migrations: string[];
	otherCommits?: string[];
}): string {
	const lines = [
		...input.prs.map(prLine),
		...(input.otherCommits ?? []).map((s) => `- ${s} (commit direct)`),
	];
	const contenu = lines.length ? lines.join('\n') : 'Aucune PR.';
	const migrations = input.migrations.length
		? input.migrations.map((m) => `- \`${m}\``).join('\n')
		: 'Aucune migration.';
	return [
		'## Contenu',
		'',
		contenu,
		'',
		'## Migrations à appliquer AVANT le merge',
		'',
		migrations,
		'',
		'## Procédure',
		'',
		'- [ ] Appliquer les migrations listées (script idempotent + transactionnel)',
		'- [ ] Les insérer dans `supabase_migrations.schema_migrations`',
		'- [ ] Lancer `npm run sb:verify:prod`',
		'- [ ] Merger cette PR (Coolify déploie automatiquement)',
		'',
	].join('\n');
}

export function planReleasePr(input: { openReleasePr: number | null; aheadCommits: number }): {
	action: 'create' | 'update' | 'none';
	number?: number;
} {
	if (input.aheadCommits === 0) return { action: 'none' };
	if (input.openReleasePr === null) return { action: 'create' };
	return { action: 'update', number: input.openReleasePr };
}

/** Message d'erreur (français) si le secret du bot est absent, sinon null. */
export function releaseTokenError(token: string | undefined): string | null {
	if (token && token.trim()) return null;
	return (
		'Le secret WIZCARD_BOT_TOKEN est vide ou absent : la PR de release doit être créée avec le PAT du propriétaire ' +
		'(scopes repo + project) pour que ses checks se lancent. Définissez-le avec : gh secret set WIZCARD_BOT_TOKEN'
	);
}

/** Numéro de la PR de release ouverte : seules les PRs du même dépôt comptent (pas un fork). */
export function pickReleasePr(
	prs: { number: number; isCrossRepository: boolean }[]
): number | null {
	return prs.find((p) => !p.isCrossRepository)?.number ?? null;
}

/**
 * Sujets de commits sans PR exploitable (commits directs sur main) : sans
 * `(#N)`, ou, si `resolvedPrs` est fourni, dont le `(#N)` n'est pas une PR
 * résolue (issue, revert…).
 */
export function directCommitSubjects(
	subjects: string[],
	resolvedPrs?: ReadonlySet<number>
): string[] {
	return subjects.filter((s) => {
		const m = SQUASH_PR_RE.exec(s.trim());
		return !m || (resolvedPrs !== undefined && !resolvedPrs.has(Number(m[1])));
	});
}
