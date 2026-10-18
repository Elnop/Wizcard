/**
 * plan.ts — Planificateurs PURS : comparent l'état existant à l'état désiré et
 * retournent uniquement ce qu'il reste à faire. Aucun effet de bord.
 */
import type { EpicSpec, StorySpec } from './epics';
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

/** Epics/enfants à créer ; appariement par titre exact. */
export function planEpics(
	existing: { number: number; title: string; subIssueTitles: string[] }[],
	desired: EpicSpec[]
): { createEpics: EpicSpec[]; createChildren: { epicTitle: string; child: StorySpec }[] } {
	const byTitle = new Map(existing.map((e) => [e.title, e]));
	const createEpics: EpicSpec[] = [];
	const createChildren: { epicTitle: string; child: StorySpec }[] = [];
	for (const d of desired) {
		const cur = byTitle.get(d.title);
		if (!cur) createEpics.push(d);
		const have = new Set(cur?.subIssueTitles ?? []);
		for (const child of d.children) {
			if (!have.has(child.title)) createChildren.push({ epicTitle: d.title, child });
		}
	}
	return { createEpics, createChildren };
}
