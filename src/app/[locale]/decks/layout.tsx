// NOTE: this layout is intentionally NOT auth-gated. `/decks/[id]` is publicly
// viewable (read-only) by non-owners, so the redirect lives on the owner-only
// decks-list page (`/decks`) instead — see decks/page.tsx.
export default function DecksLayout({ children }: { children: React.ReactNode }) {
	return <>{children}</>;
}
