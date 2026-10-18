/**
 * policy.ts — Règles pures des vérifications de PR (`pr-policy`, `deploy-guard`).
 * Aucune I/O : les CLIs (pr-policy-check.ts, deploy-guard-check.ts) lisent
 * l'environnement et appellent ces fonctions.
 */
export type PrContext = {
	headRef: string;
	baseRef: string;
	body: string | null;
	isFork: boolean;
};

export type PolicyResult = { ok: boolean; reasons: string[] };

const DEPLOY_BRANCH = 'deploy';
const BRANCH_PATTERN = /^(feat|fix|chore|docs|refactor|perf)\/\d+-/;
const CLOSING_KEYWORD = /(close[sd]?|fix(e[sd])?|resolve[sd]?) #\d+/i;

export function checkPrPolicy(pr: PrContext): PolicyResult {
	if (pr.baseRef === DEPLOY_BRANCH) return { ok: true, reasons: [] };
	const reasons: string[] = [];
	if (!pr.isFork && !BRANCH_PATTERN.test(pr.headRef)) {
		reasons.push(
			`La branche « ${pr.headRef} » ne respecte pas le motif de nom de branche attendu : type/<numéro-issue>-description (types : feat, fix, chore, docs, refactor, perf).`
		);
	}
	if (!pr.body || !CLOSING_KEYWORD.test(pr.body)) {
		reasons.push(
			'La description de la PR doit contenir un mot-clé de fermeture suivi du numéro de l’issue (ex. « Closes #12 »).'
		);
	}
	return { ok: reasons.length === 0, reasons };
}

export function checkDeployGuard(pr: PrContext): PolicyResult {
	if (pr.baseRef !== DEPLOY_BRANCH) return { ok: true, reasons: [] };
	if (pr.headRef === 'main' && !pr.isFork) return { ok: true, reasons: [] };
	return {
		ok: false,
		reasons: [
			'Seule la branche « main » de ce dépôt peut être fusionnée dans « deploy » (pas de fork, pas d’autre branche).',
		],
	};
}
