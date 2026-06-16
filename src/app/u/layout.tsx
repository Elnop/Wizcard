// Public profile routes (/u/[userId]/...) are intentionally NOT auth-gated:
// anyone may view a user's shared collection and decks. Read access is enforced
// by the public SELECT RLS policies; this layout simply avoids the auth redirect.
export default function PublicProfileLayout({ children }: { children: React.ReactNode }) {
	return <>{children}</>;
}
