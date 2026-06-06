'use client';

import { useState } from 'react';
import { MPC_TAG_GROUPS } from '@/lib/mpc/mpc-tag-taxonomy';
import type { MpcTagNode } from '@/lib/mpc/mpc-tag-taxonomy';

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

const COLOR_ACCENT = 'var(--color-accent, #6366f1)';
const COLOR_BORDER = '1px solid var(--color-border, #e5e7eb)';
const COLOR_TEXT_MUTED = 'var(--color-text-muted, #6b7280)';

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
				style={{
					fontSize: 11,
					padding: '2px 8px',
					borderRadius: 999,
					border: COLOR_BORDER,
					background: isActive ? COLOR_ACCENT : 'var(--color-surface-2, #f3f4f6)',
					color: isActive ? '#fff' : 'var(--color-text, #111827)',
					cursor: 'pointer',
				}}
			>
				{node.label}
			</button>
		);
	}

	let branchBg: string;
	if (isActive) branchBg = COLOR_ACCENT;
	else if (isPartial) branchBg = 'var(--color-accent-muted, #e0e7ff)';
	else branchBg = 'transparent';

	let branchColor: string;
	if (isActive) branchColor = '#fff';
	else if (isPartial) branchColor = COLOR_ACCENT;
	else branchColor = COLOR_TEXT_MUTED;

	let branchPrefix: string;
	if (isActive) branchPrefix = '✓ ';
	else if (isPartial) branchPrefix = '– ';
	else branchPrefix = '';

	return (
		<div>
			<div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
				<button
					type="button"
					aria-pressed={isActive || (isPartial ? ('mixed' as const) : false)}
					onClick={handleClick}
					style={{
						fontSize: 11,
						fontWeight: 600,
						padding: '2px 6px',
						borderRadius: 4,
						border: COLOR_BORDER,
						background: branchBg,
						color: branchColor,
						cursor: 'pointer',
					}}
				>
					{branchPrefix}
					{node.label}
				</button>
				<button
					type="button"
					onClick={() => onToggleCollapse(node.label)}
					aria-label={isCollapsed ? 'Expand' : 'Collapse'}
					style={{
						fontSize: 10,
						padding: '1px 4px',
						border: 'none',
						background: 'transparent',
						color: COLOR_TEXT_MUTED,
						cursor: 'pointer',
					}}
				>
					{isCollapsed ? '▶' : '▼'}
				</button>
			</div>
			{!isCollapsed && (
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
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
		<div>
			<div
				style={{
					fontSize: 12,
					fontWeight: 600,
					marginBottom: 8,
					color: COLOR_TEXT_MUTED,
				}}
			>
				Tags MPC
			</div>
			{MPC_TAG_GROUPS.map((group) => (
				<div key={group.label} style={{ marginBottom: 10 }}>
					<div
						style={{
							fontSize: 10,
							fontWeight: 700,
							textTransform: 'uppercase',
							letterSpacing: '0.05em',
							color: COLOR_TEXT_MUTED,
							marginBottom: 6,
						}}
					>
						{group.label}
					</div>
					<div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
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
