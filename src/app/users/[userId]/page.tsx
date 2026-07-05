'use client';

import { ProfileOverview } from './components/ProfileOverview';
import { useProfileShell } from './ProfileShellContext';

/**
 * Overview tab — the profile's landing page. Unlike the other tabs it has no
 * sub-route: `/users/<nickname>` IS the Overview. Identity, the resolved
 * profile, and the shell's already-loaded summary come from
 * ProfileShellContext, so nothing is refetched beyond the Overview-only reads
 * inside ProfileOverview. Public for everyone — identical for owner and
 * visitor.
 */
export default function UserOverviewPage() {
	const { ownerId, summary, profile } = useProfileShell();
	return <ProfileOverview ownerId={ownerId} profile={profile} summary={summary} />;
}
