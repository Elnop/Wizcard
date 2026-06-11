'use client';

import { useState } from 'react';
import { MPC_TAG_GROUPS } from '@/lib/mpc/mpc-tag-taxonomy';
import type { MpcTagNode } from '@/lib/mpc/mpc-tag-taxonomy';
import styles from './MpcTagsFilter.module.css';

interface MpcTagsFilterProps {
	value: string[];
	onChange: (value: string[]) => void;
}

function getLeaves(node: MpcTagNode): string[] {
	if (!node.children || node.children.length === 0) return [node.label];
	return node.children.flatMap(getLeaves);
}

function getSelectionState(node: MpcTagNode, selected: string[]): 'none' | 'partial' | 'all' {
	const leaves = getLeaves(node);
	const count = leaves.filter((l) => selected.includes(l)).length;
	if (count === 0) return 'none';
	if (count === leaves.length) return 'all';
	return 'partial';
}

function toggleNode(
	node: MpcTagNode,
	selected: string[],
	state: 'none' | 'partial' | 'all'
): string[] {
	const leaves = getLeaves(node);
	if (state === 'all') return selected.filter((t) => !leaves.includes(t));
	const toAdd = leaves.filter((l) => !selected.includes(l));
	return [...selected, ...toAdd];
}

const SHOWCASE_LABEL = 'Showcase';

function TagNodeRow({
	node,
	selected,
	onChange,
	collapsedNodes,
	onToggleCollapse,
}: {
	node: MpcTagNode;
	selected: string[];
	onChange: (value: string[]) => void;
	collapsedNodes: Set<string>;
	onToggleCollapse: (label: string) => void;
}) {
	const isLeaf = !node.children || node.children.length === 0;
	const state = getSelectionState(node, selected);
	const isActive = state === 'all';
	const isPartial = state === 'partial';
	const isCollapsed = collapsedNodes.has(node.label);

	const handleClick = () => {
		onChange(toggleNode(node, selected, state));
	};

	if (isLeaf) {
		return (
			<button
				type="button"
				aria-pressed={isActive}
				onClick={handleClick}
				className={`${styles.leafTag} ${isActive ? styles.leafTagActive : ''}`}
			>
				{node.label}
			</button>
		);
	}

	let branchBtnClass = styles.branchBtn;
	if (isActive) branchBtnClass += ` ${styles.branchBtnActive}`;
	else if (isPartial) branchBtnClass += ` ${styles.branchBtnPartial}`;

	let branchPrefix = '';
	if (isActive) branchPrefix = '✓ ';
	else if (isPartial) branchPrefix = '– ';

	return (
		<div>
			<div className={styles.branchRow}>
				<button
					type="button"
					aria-pressed={isActive || (isPartial ? ('mixed' as const) : false)}
					onClick={handleClick}
					className={branchBtnClass}
				>
					{branchPrefix}
					{node.label}
				</button>
				<button
					type="button"
					onClick={() => onToggleCollapse(node.label)}
					aria-label={isCollapsed ? 'Expand' : 'Collapse'}
					className={styles.collapseBtn}
				>
					{isCollapsed ? '▶' : '▼'}
				</button>
			</div>
			{!isCollapsed && (
				<div className={styles.children}>
					{node.children!.map((child) => (
						<TagNodeRow
							key={child.label}
							node={child}
							selected={selected}
							onChange={onChange}
							collapsedNodes={collapsedNodes}
							onToggleCollapse={onToggleCollapse}
						/>
					))}
				</div>
			)}
		</div>
	);
}

export function MpcTagsFilter({ value, onChange }: MpcTagsFilterProps) {
	const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set([SHOWCASE_LABEL]));

	const handleToggleCollapse = (label: string) => {
		setCollapsedNodes((prev) => {
			const next = new Set(prev);
			if (next.has(label)) next.delete(label);
			else next.add(label);
			return next;
		});
	};

	return (
		<div className={styles.root}>
			<div className={styles.header}>Tags MPC</div>
			{MPC_TAG_GROUPS.map((group) => (
				<div key={group.label} className={styles.group}>
					<div className={styles.groupLabel}>{group.label}</div>
					<div className={styles.tagRow}>
						{group.tags.map((node) => (
							<TagNodeRow
								key={node.label}
								node={node}
								selected={value}
								onChange={onChange}
								collapsedNodes={collapsedNodes}
								onToggleCollapse={handleToggleCollapse}
							/>
						))}
					</div>
				</div>
			))}
		</div>
	);
}
