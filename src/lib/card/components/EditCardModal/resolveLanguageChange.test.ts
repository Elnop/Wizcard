import { resolveLanguageChange } from './resolveLanguageChange';

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

const print = { set: 'neo', collector_number: '123' };

const a = resolveLanguageChange('French', print);
check(
	'French + valid print => fetch neo/123/fr',
	a.kind === 'fetch' && a.set === 'neo' && a.collectorNumber === '123' && a.langCode === 'fr'
);

check('undefined language => skip', resolveLanguageChange(undefined, print).kind === 'skip');

check(
	'missing set => skip',
	resolveLanguageChange('French', { collector_number: '123' }).kind === 'skip'
);

check(
	'missing collector_number => skip',
	resolveLanguageChange('French', { set: 'neo' }).kind === 'skip'
);

const en = resolveLanguageChange('English', print);
check('English => fetch with en code', en.kind === 'fetch' && en.langCode === 'en');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
