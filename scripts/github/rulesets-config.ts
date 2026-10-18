/**
 * rulesets-config.ts — Payloads REST des rulesets `main` et `deploy` et
 * réglages de merge du dépôt. Valeurs imposées par docs/workflow/*.
 */

const ADMIN_ROLE_ID = 5; // rôle de dépôt « Admin »

const NO_APPROVAL_PR = (mergeMethod: 'squash' | 'merge') => ({
	type: 'pull_request',
	parameters: {
		required_approving_review_count: 0,
		dismiss_stale_reviews_on_push: false,
		require_code_owner_review: false,
		require_last_push_approval: false,
		required_review_thread_resolution: false,
		allowed_merge_methods: [mergeMethod],
	},
});

/**
 * `strict` à false : après chaque release (merge commit), `deploy` possède un
 * commit que `main` n'a pas ; « à jour avec la base » bloquerait toute release.
 */
const CHECKS = (contexts: string[]) => ({
	type: 'required_status_checks',
	parameters: {
		strict_required_status_checks_policy: false,
		required_status_checks: contexts.map((context) => ({ context })),
	},
});

function branchRuleset(
	name: 'main' | 'deploy',
	mergeMethod: 'squash' | 'merge',
	contexts: string[],
	bypass: object[]
) {
	return {
		name,
		target: 'branch',
		enforcement: 'active',
		conditions: { ref_name: { include: [`refs/heads/${name}`], exclude: [] } },
		bypass_actors: bypass,
		rules: [
			NO_APPROVAL_PR(mergeMethod),
			CHECKS(contexts),
			{ type: 'non_fast_forward' },
			{ type: 'deletion' },
		],
	};
}

export const RULESETS: { name: 'main' | 'deploy'; payload: object }[] = [
	{
		name: 'main',
		payload: branchRuleset(
			'main',
			'squash',
			['check-build', 'pr-policy'],
			[{ actor_id: ADMIN_ROLE_ID, actor_type: 'RepositoryRole', bypass_mode: 'always' }]
		),
	},
	{ name: 'deploy', payload: branchRuleset('deploy', 'merge', ['deploy-guard'], []) },
];

export const REPO_SETTINGS = {
	allow_squash_merge: true,
	allow_merge_commit: true,
	allow_rebase_merge: false,
	delete_branch_on_merge: true,
};
