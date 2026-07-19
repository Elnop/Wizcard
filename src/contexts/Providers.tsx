'use client';

import { Suspense } from 'react';
import { AuthProvider } from '@/lib/supabase/contexts/AuthContext';
import { ProfileProvider } from '@/lib/profile/context/ProfileContext';
import { CollectionProvider } from '@/lib/collection/context/CollectionContext';
import { WishlistProvider } from '@/lib/wishlist/context/WishlistContext';
import { DeckProvider } from '@/lib/deck/context/DeckContext';
import { ImportProvider } from '@/lib/import/context/ImportContext';
import { AddToDeckModalProvider } from '@/contexts/AddToDeckModalProvider';
import { AddCardModalProvider } from '@/contexts/AddCardModalProvider';
import { CardModalProvider } from '@/contexts/CardModalProvider';
import { SyncQueueRunner } from '@/lib/supabase/components/SyncQueueRunner';
import { AnalyticsProvider } from '@/lib/analytics/context/AnalyticsContext';
import { useAnalyticsAuthSync } from '@/lib/analytics/hooks/useAnalyticsAuthSync';
import { AnalyticsPageView } from '@/lib/analytics/components/AnalyticsPageView';
import { ConsentBanner } from '@/lib/analytics/components/ConsentBanner/ConsentBanner';

// Mounted inside the auth AND profile tree so it can read useAuth() +
// useProfileContext(); emits identify (with person properties) / reset.
function AnalyticsAuthBridge() {
	useAnalyticsAuthSync();
	return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<AnalyticsProvider>
			<AuthProvider>
				<Suspense fallback={null}>
					<AnalyticsPageView />
				</Suspense>
				<SyncQueueRunner>
					<ProfileProvider>
						{/* Inside ProfileProvider so identify() can enrich the person
						    profile with nickname/language/etc. once it hydrates. */}
						<AnalyticsAuthBridge />
						<CollectionProvider>
							<WishlistProvider>
								<DeckProvider>
									<ImportProvider>
										<AddToDeckModalProvider>
											<AddCardModalProvider>
												<CardModalProvider>{children}</CardModalProvider>
											</AddCardModalProvider>
										</AddToDeckModalProvider>
									</ImportProvider>
								</DeckProvider>
							</WishlistProvider>
						</CollectionProvider>
					</ProfileProvider>
				</SyncQueueRunner>
				<ConsentBanner />
			</AuthProvider>
		</AnalyticsProvider>
	);
}
