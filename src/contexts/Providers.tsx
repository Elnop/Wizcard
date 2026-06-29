'use client';

import { AuthProvider } from '@/lib/supabase/contexts/AuthContext';
import { CollectionProvider } from '@/lib/collection/context/CollectionContext';
import { WishlistProvider } from '@/lib/wishlist/context/WishlistContext';
import { DeckProvider } from '@/lib/deck/context/DeckContext';
import { ImportProvider } from '@/lib/import/context/ImportContext';
import { AddToDeckModalProvider } from '@/contexts/AddToDeckModalProvider';
import { AddCardModalProvider } from '@/contexts/AddCardModalProvider';
import { SyncQueueRunner } from '@/lib/supabase/components/SyncQueueRunner';

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<AuthProvider>
			<SyncQueueRunner>
				<CollectionProvider>
					<WishlistProvider>
						<DeckProvider>
							<ImportProvider>
								<AddToDeckModalProvider>
									<AddCardModalProvider>{children}</AddCardModalProvider>
								</AddToDeckModalProvider>
							</ImportProvider>
						</DeckProvider>
					</WishlistProvider>
				</CollectionProvider>
			</SyncQueueRunner>
		</AuthProvider>
	);
}
