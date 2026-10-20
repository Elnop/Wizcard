/** Long, locale-aware publication date ("20 octobre 2026" / "October 20, 2026"), in UTC. */
export function formatArticleDate(iso: string, locale: string): string {
	return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
		new Date(iso)
	);
}
