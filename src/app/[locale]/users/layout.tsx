// Public sharing routes (/users/[userId]/...) are intentionally NOT auth-gated:
// anyone may view a user's shared collection and decks. Read access is enforced
// by the public SELECT RLS policies; this layout simply avoids the auth redirect.
// The view inside each page adapts to ownership (editable for the owner).
export default function UsersLayout({ children }: { children: React.ReactNode }) {
	return <>{children}</>;
}
