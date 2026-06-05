import type { ReactNode } from 'react';
import type { AnyCard } from '@/lib/card/components/CardList/CardList.types';
import { CustomCardBadge } from '@/lib/card/components/CustomCardBadge/CustomCardBadge';

export function withCustomBadge(card: AnyCard, inner?: ReactNode): ReactNode {
	return (
		<>
			<CustomCardBadge card={card} />
			{inner}
		</>
	);
}
