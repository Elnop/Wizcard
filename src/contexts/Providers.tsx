'use client';

import { AuthProvider } from '@/lib/supabase/contexts/AuthContext';
import { CollectionProvider } from '@/lib/collection/context/CollectionContext';
import { WishlistProvider } from '@/lib/wishlist/context/WishlistContext';
import { DeckProvider } from '@/lib/deck/context/DeckContext';
import { ImportProvider } from '@/lib/import/context/ImportContext';
import { SyncQueueRunner } from '@/lib/supabase/components/SyncQueueRunner';

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<AuthProvider>
			<SyncQueueRunner>
				<CollectionProvider>
					<WishlistProvider>
						<DeckProvider>
							<ImportProvider>{children}</ImportProvider>
						</DeckProvider>
					</WishlistProvider>
				</CollectionProvider>
			</SyncQueueRunner>
		</AuthProvider>
	);
}
