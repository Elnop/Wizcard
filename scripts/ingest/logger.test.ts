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
		log.event('run.progress', { cards_done: 10, cards_total: 100 });
		log.event('source.done', { source: SRC, new: 5 });
		log.warn('card.failed', { card: 'mpc:2', reason: 'boom' });
	});
	check('warn drops run.progress', !out.some((l) => l.includes('event=run.progress')));
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

// waiting sources are ordered by skip ratio ascending: most new work on top,
// most-already-skipped sinking to the bottom.
{
	const log = createLogger('info');
	const HIGH = 'mpcfill:high';
	const LOW = 'mpcfill:low';
	const MID = 'mpcfill:mid';
	// taskStart(id, label, of, alreadyDone, alreadySkipped, alreadyStale).
	// HIGH: 90 skipped / 100 total = 0.9 skip ratio (should sink).
	// LOW:  10 skipped / 100 total = 0.1 skip ratio (should rise).
	// MID:  50 skipped / 100 total = 0.5.
	log.progress.taskStart(HIGH, HIGH, 10, 0, 90, 0);
	log.progress.taskStart(LOW, LOW, 90, 0, 10, 0);
	log.progress.taskStart(MID, MID, 50, 0, 50, 0);
	const order = log.getHudState().tasks.map((t) => t.id);
	check('least-skipped source on top', order[0] === LOW);
	check('most-skipped source at bottom', order[order.length - 1] === HIGH);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
