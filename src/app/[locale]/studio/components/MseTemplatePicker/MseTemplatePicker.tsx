'use client';

import { Check, MagnifyingGlass, Stack } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cardAssetUrl, type MseTemplate } from '@/lib/card-editor/mse-assets';
import styles from './MseTemplatePicker.module.css';

const PAGE_SIZE = 30;
const PRIMARY_KINDS = ['card', 'token', 'planeswalker', 'double-faced'] as const;
type FilterKind = 'all' | (typeof PRIMARY_KINDS)[number] | 'other';

interface MseTemplatePickerProps {
	templates: MseTemplate[];
	selectedId: string;
	isLoading: boolean;
	hasError: boolean;
	onSelect: (template: MseTemplate) => void;
}

function matchesKind(template: MseTemplate, kind: FilterKind): boolean {
	if (kind === 'all') return true;
	if (kind === 'other')
		return !PRIMARY_KINDS.includes(template.kind as (typeof PRIMARY_KINDS)[number]);
	return template.kind === kind;
}

export function MseTemplatePicker({
	templates,
	selectedId,
	isLoading,
	hasError,
	onSelect,
}: MseTemplatePickerProps) {
	const t = useTranslations('cardEditor.mseLibrary');
	const [query, setQuery] = useState('');
	const [kind, setKind] = useState<FilterKind>('all');
	const [limit, setLimit] = useState(PAGE_SIZE);
	const filtered = useMemo(() => {
		const normalizedQuery = query.trim().toLocaleLowerCase();
		return templates
			.filter((template) => {
				if (!matchesKind(template, kind)) return false;
				if (!normalizedQuery) return true;
				return [template.name, template.shortName, template.id]
					.filter(Boolean)
					.some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
			})
			.toSorted((left, right) => {
				if (left.id === selectedId) return -1;
				if (right.id === selectedId) return 1;
				const leftStarts = left.name.toLocaleLowerCase().startsWith(normalizedQuery);
				const rightStarts = right.name.toLocaleLowerCase().startsWith(normalizedQuery);
				if (leftStarts !== rightStarts) return leftStarts ? -1 : 1;
				return left.name.localeCompare(right.name);
			});
	}, [kind, query, selectedId, templates]);
	const visible = filtered.slice(0, limit);

	if (isLoading) {
		return (
			<div className={styles.loading} role="status">
				<Stack size={22} />
				<span>{t('loading')}</span>
			</div>
		);
	}

	if (hasError) {
		return <p className={styles.error}>{t('error')}</p>;
	}

	return (
		<div className={styles.library}>
			<div className={styles.libraryHeader}>
				<div>
					<strong>{t('title')}</strong>
					<span>{t('count', { count: templates.length })}</span>
				</div>
				<span className={styles.sourceBadge}>MSE</span>
			</div>
			<label className={styles.search}>
				<MagnifyingGlass size={17} aria-hidden />
				<span className={styles.srOnly}>{t('searchLabel')}</span>
				<input
					type="search"
					value={query}
					placeholder={t('searchPlaceholder')}
					onChange={(event) => {
						setQuery(event.target.value);
						setLimit(PAGE_SIZE);
					}}
				/>
			</label>
			<div className={styles.filters} aria-label={t('filtersLabel')}>
				{(['all', ...PRIMARY_KINDS, 'other'] as FilterKind[]).map((filter) => (
					<button
						key={filter}
						type="button"
						aria-pressed={kind === filter}
						onClick={() => {
							setKind(filter);
							setLimit(PAGE_SIZE);
						}}
					>
						{t(`filters.${filter}`)}
					</button>
				))}
			</div>
			<div className={styles.resultLine} aria-live="polite">
				{t('results', { count: filtered.length })}
			</div>
			{visible.length > 0 ? (
				<div className={styles.grid}>
					{visible.map((template) => {
						const isSelected = selectedId === template.id;
						return (
							<button
								key={template.id}
								type="button"
								className={isSelected ? styles.templateSelected : styles.template}
								data-template-id={template.id}
								aria-pressed={isSelected}
								onClick={() => onSelect(template)}
							>
								<span className={styles.preview}>
									{template.samplePath ? (
										// eslint-disable-next-line @next/next/no-img-element -- dynamic local vendor catalogue
										<img
											src={cardAssetUrl(template.samplePath) ?? undefined}
											alt=""
											loading="lazy"
											decoding="async"
										/>
									) : (
										<Stack size={24} />
									)}
									{isSelected && (
										<span className={styles.check}>
											<Check size={14} weight="bold" />
										</span>
									)}
								</span>
								<span className={styles.templateCopy}>
									<strong title={template.name}>{template.name}</strong>
									<small>
										{t(`kinds.${template.kind}`)} ·{' '}
										{template.renderMode === 'frame' ? t('renderReady') : t('previewMode')}
									</small>
								</span>
							</button>
						);
					})}
				</div>
			) : (
				<p className={styles.empty}>{t('empty')}</p>
			)}
			{limit < filtered.length && (
				<button
					type="button"
					className={styles.loadMore}
					onClick={() => setLimit(limit + PAGE_SIZE)}
				>
					{t('loadMore', { count: Math.min(PAGE_SIZE, filtered.length - limit) })}
				</button>
			)}
		</div>
	);
}
