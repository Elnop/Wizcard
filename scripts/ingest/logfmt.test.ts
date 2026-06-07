import { toLogfmt } from './logfmt';

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean): void {
	if (cond) {
		console.log(`PASS: ${label}`);
		passed++;
	} else {
		console.error(`FAIL: ${label}`);
		failed++;
	}
}

check(
	'plain values unquoted',
	toLogfmt({ source: 'mpcfill:foo', idx: 3 }) === 'source=mpcfill:foo idx=3'
);

check(
	'value with space is quoted',
	toLogfmt({ reason: 'HTTP 503 timeout' }) === 'reason="HTTP 503 timeout"'
);

check('value with equals is quoted', toLogfmt({ q: 'a=b' }) === 'q="a=b"');

check(
	'booleans render true/false',
	toLogfmt({ fuzzy: true, skip: false }) === 'fuzzy=true skip=false'
);

check('numbers render bare', toLogfmt({ eta_s: 63 }) === 'eta_s=63');

check(
	'inner double-quotes are escaped',
	toLogfmt({ reason: 'said "hi"' }) === 'reason="said \\"hi\\""'
);

check('null and undefined fields are skipped', toLogfmt({ a: 1, b: null, c: undefined }) === 'a=1');

check('empty string is quoted', toLogfmt({ s: '' }) === 's=""');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
