'use client';

import { TagInput } from '@/lib/mpc/components/TagInput/TagInput';
import styles from './MpcTagsFilter.module.css';

export interface MpcTagsFilterValue {
	mustHave: string[];
	mustNotHave: string[];
}

interface MpcTagsFilterProps {
	value: MpcTagsFilterValue;
	onChange: (value: MpcTagsFilterValue) => void;
}

export function MpcTagsFilter({ value, onChange }: MpcTagsFilterProps) {
	const { mustHave, mustNotHave } = value;

	return (
		<div className={styles.root}>
			<div className={styles.header}>Tags MPC</div>
			<div className={styles.section}>
				<div className={`${styles.sectionLabel} ${styles.sectionLabelInclude}`}>
					Must have at least one of
				</div>
				<TagInput
					variant="include"
					selected={mustHave}
					otherSelected={mustNotHave}
					removeLabel="Remove"
					placeholder="Search a tag…"
					onAdd={(tag) => onChange({ mustHave: [...mustHave, tag], mustNotHave })}
					onRemove={(tag) => onChange({ mustHave: mustHave.filter((t) => t !== tag), mustNotHave })}
				/>
			</div>
			<div className={styles.section}>
				<div className={`${styles.sectionLabel} ${styles.sectionLabelExclude}`}>
					Ne doit pas avoir
				</div>
				<TagInput
					variant="exclude"
					selected={mustNotHave}
					otherSelected={mustHave}
					removeLabel="Remove"
					placeholder="Search a tag…"
					onAdd={(tag) => onChange({ mustHave, mustNotHave: [...mustNotHave, tag] })}
					onRemove={(tag) =>
						onChange({ mustHave, mustNotHave: mustNotHave.filter((t) => t !== tag) })
					}
				/>
			</div>
		</div>
	);
}
