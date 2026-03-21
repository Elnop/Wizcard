'use client';

import { AuthProvider } from '@/lib/supabase/contexts/AuthContext';
import { CollectionProvider } from '@/lib/supabase/contexts/CollectionContext';
import { ImportProvider } from '@/lib/import/contexts/ImportContext';
import { SyncQueueRunner } from '@/lib/supabase/components/SyncQueueRunner';

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<AuthProvider>
			<SyncQueueRunner>
				<CollectionProvider>
					<ImportProvider>{children}</ImportProvider>
				</CollectionProvider>
			</SyncQueueRunner>
		</AuthProvider>
	);
}
