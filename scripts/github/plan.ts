/**
 * plan.ts — Planificateurs PURS : comparent l'état existant à l'état désiré et
 * retournent uniquement ce qu'il reste à faire. Aucun effet de bord.
 */
import type { FieldSpec, LabelSpec, ViewSpec } from './project-config';

const normColor = (c: string) => c.replace(/^#/, '').toLowerCase();

export function planLabels(
	existing: LabelSpec[],
	desired: LabelSpec[]
): { create: LabelSpec[]; update: LabelSpec[] } {
	const byName = new Map(existing.map((l) => [l.name.toLowerCase(), l]));
	const create: LabelSpec[] = [];
	const update: LabelSpec[] = [];
	for (const d of desired) {
		const cur = byName.get(d.name.toLowerCase());
		if (!cur) create.push(d);
		else if (
			normColor(cur.color) !== normColor(d.color) ||
			(cur.description ?? '') !== d.description
		)
			update.push(d);
	}
	return { create, update };
}

/** `null` si déjà convergé ; sinon la liste complète ordonnée (ids conservés). */
export function planStatusOptions(
	existing: { id: string; name: string }[],
	desired: string[]
): { id?: string; name: string }[] | null {
	const same =
		existing.length === desired.length && existing.every((o, i) => o.name === desired[i]);
	if (same) return null;
	const idByName = new Map(existing.map((o) => [o.name, o.id]));
	return desired.map((name) => {
		const id = idByName.get(name);
		return id ? { id, name } : { name };
	});
}

export function planFields(existingNames: string[], desired: FieldSpec[]): FieldSpec[] {
	const have = new Set(existingNames);
	return desired.filter((f) => !have.has(f.name));
}

export function planViews(existingNames: string[], desired: ViewSpec[]): ViewSpec[] {
	const have = new Set(existingNames);
	return desired.filter((v) => !have.has(v.name));
}
