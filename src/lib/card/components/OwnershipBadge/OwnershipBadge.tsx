import type { ReactNode } from 'react';
import type { BadgeState } from '@/app/[locale]/decks/[id]/components/DeckCardOverlay/useCollectionBadge';
import styles from './OwnershipBadge.module.css';

const BADGE_CLASS_MAP: Record<string, string> = {
	owned: styles.ownershipBadgeGreen,
	partial: styles.ownershipBadgeOrange,
	locked: styles.ownershipBadgeLocked,
	wishlist: styles.ownershipBadgeWishlist,
};

const BADGE_TEXT_STATIC: Record<string, string> = { owned: '✓', wishlist: '🛒' };

function getBadgeText(badgeState: BadgeState, ownedCount: number, neededCount: number): string {
	if (badgeState === 'partial') return `${ownedCount}/${neededCount}`;
	if (badgeState === 'locked') return `0/${neededCount}`;
	return BADGE_TEXT_STATIC[badgeState] ?? '';
}

type OwnershipBadgeProps = {
	badgeState: BadgeState;
	ownedCount?: number;
	neededCount?: number;
	onClick?: () => void;
	className?: string;
	children?: ReactNode;
};

export function OwnershipBadge({
	badgeState,
	ownedCount = 0,
	neededCount = 0,
	onClick,
	className,
	children,
}: OwnershipBadgeProps) {
	const badgeClass = BADGE_CLASS_MAP[badgeState] ?? styles.ownershipBadgeGrey;
	const text = getBadgeText(badgeState, ownedCount, neededCount);
	return (
		<span
			className={[styles.ownershipBadge, badgeClass, className].filter(Boolean).join(' ')}
			onClick={
				onClick
					? (e) => {
							e.stopPropagation();
							onClick();
						}
					: undefined
			}
			style={onClick ? { cursor: 'pointer' } : undefined}
		>
			{text}
			{children}
		</span>
	);
}
