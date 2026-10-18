import type { CardCondition, CardEntry } from '@/types/cards';
import type { MtgLanguage } from '@/lib/mtg/languages';
import { removeDeckZoneTags } from '@/types/decks';

/** A field the bulk-edit modal can offer; each list picks its own subset. */
export type BulkField =
	| 'condition'
	| 'language'
	| 'finish'
	| 'proxy'
	| 'forTrade'
	| 'alter'
	| 'tagsAdd'
	| 'tagsRemove'
	| 'purchasePrice';

/** Tri-state select value: '' = leave untouched, 'true'/'false' = override. */
export type TriState = '' | 'true' | 'false';

/** Raw state of the bulk-edit form ('' / empty = leave unchanged). */
export type BulkEditForm = {
	condition: CardCondition | '';
	language: MtgLanguage | '';
	foil: TriState;
	foilType: 'foil' | 'etched';
	proxy: TriState;
	forTrade: TriState;
	alter: TriState;
	addTags: string[];
	removeTags: string[];
	purchasePrice: string;
};

export const EMPTY_BULK_EDIT_FORM: BulkEditForm = {
	condition: '',
	language: '',
	foil: '',
	foilType: 'foil',
	proxy: '',
	forTrade: '',
	alter: '',
	addTags: [],
	removeTags: [],
	purchasePrice: '',
};

/** What to do to every selected copy. Fields absent from `set` are left as-is. */
export type BulkEdit = {
	set: Partial<
		Pick<
			CardEntry,
			| 'condition'
			| 'language'
			| 'isFoil'
			| 'foilType'
			| 'proxy'
			| 'forTrade'
			| 'alter'
			| 'purchasePrice'
		>
	>;
	addTags: string[];
	removeTags: string[];
};

function triToBool(value: TriState): boolean | undefined {
	if (value === '') return undefined;
	return value === 'true';
}

export function buildBulkEdit(form: BulkEditForm): BulkEdit {
	const set: BulkEdit['set'] = {};
	if (form.condition) set.condition = form.condition;
	if (form.language) set.language = form.language;
	const foil = triToBool(form.foil);
	if (foil !== undefined) {
		set.isFoil = foil;
		set.foilType = foil ? form.foilType : undefined;
	}
	const proxy = triToBool(form.proxy);
	if (proxy !== undefined) set.proxy = proxy;
	const forTrade = triToBool(form.forTrade);
	if (forTrade !== undefined) set.forTrade = forTrade;
	const alter = triToBool(form.alter);
	if (alter !== undefined) set.alter = alter;
	const price = form.purchasePrice.trim();
	if (price) set.purchasePrice = price;
	return { set, addTags: [...form.addTags], removeTags: [...form.removeTags] };
}

export function isEmptyBulkEdit(edit: BulkEdit): boolean {
	return (
		Object.keys(edit.set).length === 0 && edit.addTags.length === 0 && edit.removeTags.length === 0
	);
}

/**
 * `(tags − remove) ∪ add`, existing order kept, new tags appended, no
 * duplicates. A deck zone tag (`deck:<zone>`) is never removed.
 */
export function mergeTags(tags: string[] | undefined, add: string[], remove: string[]): string[] {
	const current = tags ?? [];
	const isPlainTag = (t: string) => removeDeckZoneTags([t]).length > 0;
	const zoneTags = new Set(current.filter((t) => !isPlainTag(t)));
	const removeSet = new Set(remove.filter((t) => !zoneTags.has(t)));
	const out: string[] = [];
	for (const t of current) if (!removeSet.has(t) && !out.includes(t)) out.push(t);
	for (const t of add) if (isPlainTag(t) && !out.includes(t)) out.push(t);
	return out;
}

/** The new entry of one copy after the bulk edit. Never mutates `entry`. */
export function applyBulkEdit(entry: CardEntry, edit: BulkEdit): CardEntry {
	const next: CardEntry = { ...entry, ...edit.set };
	if (next.isFoil === false) next.foilType = undefined;
	if (next.isFoil === true && !next.foilType) next.foilType = 'foil';
	if (edit.addTags.length > 0 || edit.removeTags.length > 0) {
		next.tags = mergeTags(entry.tags, edit.addTags, edit.removeTags);
	}
	return next;
}
