// Convert a commander card name into the slug EDHREC uses in its URLs.
// Mirrors EDHREC's own `format_card_name`: lowercase, spaces → dashes, and
// apostrophes / commas removed. Example: "Miirym, Sentinel Wyrm" →
// "miirym-sentinel-wyrm".
export function toEdhrecSlug(name: string): string {
	return name.toLowerCase().replace(/'/g, '').replace(/,/g, '').trim().replace(/\s+/g, '-');
}
