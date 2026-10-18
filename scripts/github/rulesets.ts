/**
 * rulesets.ts — Logique pure de convergence des rulesets.
 */

/** Rulesets à créer (absents) et à mettre à jour (PUT idempotent), par nom. */
export function planRulesets(
	existing: { id: number; name: string }[],
	desired: string[]
): { create: string[]; update: { id: number; name: string }[] } {
	const byName = new Map(existing.map((r) => [r.name, r]));
	return {
		create: desired.filter((n) => !byName.has(n)),
		update: desired.flatMap((n) => {
			const r = byName.get(n);
			return r ? [r] : [];
		}),
	};
}

/** La protection classique ne part que si `main` ET `deploy` sont actifs. */
export function canRemoveClassicProtection(
	rulesets: { name: string; enforcement: string }[]
): boolean {
	return ['main', 'deploy'].every((n) =>
		rulesets.some((r) => r.name === n && r.enforcement === 'active')
	);
}
