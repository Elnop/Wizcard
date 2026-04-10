'use client';

import { AuthProvider } from '@/lib/supabase/contexts/AuthContext';
import { CollectionProvider } from '@/lib/collection/context/CollectionContext';
import { DeckProvider } from '@/lib/deck/context/DeckContext';
import { ImportProvider } from '@/lib/import/contexts/ImportContext';
import { SyncQueueRunner } from '@/lib/supabase/components/SyncQueueRunner';

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<AuthProvider>
			<SyncQueueRunner>
				<CollectionProvider>
					<DeckProvider>
						<ImportProvider>{children}</ImportProvider>
					</DeckProvider>
				</CollectionProvider>
			</SyncQueueRunner>
		</AuthProvider>
	);
}
