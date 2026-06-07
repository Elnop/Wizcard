import { createLogger } from './logger';

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

const SRC = 'mpcfill:foo';

// Capture stdout lines.
function capture(fn: () => void): string[] {
	const lines: string[] = [];
	const orig = process.stdout.write.bind(process.stdout);
	(process.stdout.write as unknown) = (chunk: string): boolean => {
		lines.push(String(chunk));
		return true;
	};
	try {
		fn();
	} finally {
		(process.stdout.write as unknown) = orig;
	}
	return lines.join('').split('\n').filter(Boolean);
}

// info level: card.resolved (debug-only) is suppressed, source.done passes.
{
	const log = createLogger('info');
	const out = capture(() => {
		log.event('card.resolved', { source: SRC, card: 'mpc:1', strategy: 'name' });
		log.event('source.done', { source: SRC, new: 5 });
	});
	check('info suppresses card.resolved', !out.some((l) => l.includes('event=card.resolved')));
	check(
		'info emits source.done',
		out.some((l) => l.includes('event=source.done'))
	);
}

// debug level: card.resolved passes.
{
	const log = createLogger('debug');
	const out = capture(() => {
		log.event('card.resolved', { source: SRC, card: 'mpc:1', strategy: 'name' });
	});
	check(
		'debug emits card.resolved',
		out.some((l) => l.includes('event=card.resolved'))
	);
}

// warn level: only warn/error + cycle events (run.*, source.done) pass; plain info events drop.
{
	const log = createLogger('warn');
	const out = capture(() => {
		log.event('source.progress', { source: SRC, done: 10 });
		log.event('source.done', { source: SRC, new: 5 });
		log.warn('card.failed', { card: 'mpc:2', reason: 'boom' });
	});
	check('warn drops source.progress', !out.some((l) => l.includes('event=source.progress')));
	check(
		'warn keeps source.done',
		out.some((l) => l.includes('event=source.done'))
	);
	check(
		'warn keeps warnings',
		out.some((l) => l.includes('level=warn') && l.includes('event=card.failed'))
	);
}

// every line has the three leading fields in order.
{
	const log = createLogger('info');
	const out = capture(() => {
		log.event('run.start', { sources_total: 3 });
	});
	check(
		'line starts with ts= level= event=',
		out.length === 1 && /^ts=\S+ level=info event=run\.start /.test(out[0])
	);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
