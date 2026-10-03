/** Start offsets of every page AFTER the first one, for `total` rows. */
export function remainingPageStarts(total: number, pageSize: number): number[] {
	const starts: number[] = [];
	for (let from = pageSize; from < total; from += pageSize) starts.push(from);
	return starts;
}
