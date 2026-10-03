const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a catalog print id. A single non-uuid in `.in('id', …)` or a uuid[]
 *  argument makes Postgres reject the whole request, so filter before querying. */
export function isUuid(id: string): boolean {
	return UUID_RE.test(id);
}
