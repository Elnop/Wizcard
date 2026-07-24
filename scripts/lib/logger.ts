// Structured logging for the seed scripts, which run unattended on a server.
//
// Emits ndjson (one JSON object per line) — the format Loki/Datadog/Vector/Elastic
// ingest natively, so fields are queryable without regex parsing. When stdout is a TTY
// (a human running the command) it falls back to an aligned, readable line instead.
// Override with LOG_FORMAT=json|pretty.
//
// Stream discipline matters for cron: everything below ERROR goes to stdout, so a
// successful run writes nothing to stderr and does not trigger a cron alert mail.
// Only ERROR (and the fatal stack) goes to stderr.

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function resolveFormat(): 'json' | 'pretty' {
	const explicit = process.env.LOG_FORMAT;
	if (explicit === 'json' || explicit === 'pretty') return explicit;
	return process.stdout.isTTY ? 'pretty' : 'json';
}

function resolveMinLevel(): Level {
	const raw = process.env.LOG_LEVEL as Level | undefined;
	return raw && raw in LEVEL_ORDER ? raw : 'info';
}

const FORMAT = resolveFormat();
const MIN_LEVEL = resolveMinLevel();

const PRETTY_TAG: Record<Level, string> = {
	debug: 'DEBUG',
	info: 'INFO ',
	warn: 'WARN ',
	error: 'ERROR',
};

/** Extra structured fields attached to an event. Values stay JSON-scalar. */
export type Fields = Record<string, string | number | boolean | null | undefined>;

function formatPretty(level: Level, script: string, msg: string, fields: Fields): string {
	const ts = new Date().toISOString();
	const rest = Object.entries(fields)
		.filter(([, v]) => v !== undefined)
		.map(([k, v]) => `${k}=${v}`)
		.join(' ');
	return `${ts} ${PRETTY_TAG[level]} ${script.padEnd(12)} ${msg}${rest ? ' ' + rest : ''}`;
}

function formatJson(level: Level, script: string, msg: string, fields: Fields): string {
	const payload: Record<string, unknown> = {
		ts: new Date().toISOString(),
		level,
		script,
		msg,
	};
	for (const [k, v] of Object.entries(fields)) {
		if (v !== undefined) payload[k] = v;
	}
	return JSON.stringify(payload);
}

export interface Logger {
	debug(msg: string, fields?: Fields): void;
	info(msg: string, fields?: Fields): void;
	warn(msg: string, fields?: Fields): void;
	error(msg: string, fields?: Fields): void;
	/** Logs an error with its stack (stack goes to stderr, unformatted). */
	fatal(msg: string, err: unknown, fields?: Fields): void;
}

export function createLogger(script: string): Logger {
	function emit(level: Level, msg: string, fields: Fields = {}) {
		if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;
		const line =
			FORMAT === 'json'
				? formatJson(level, script, msg, fields)
				: formatPretty(level, script, msg, fields);
		// Only errors go to stderr; a clean run leaves stderr empty (see header).
		if (level === 'error') process.stderr.write(line + '\n');
		else process.stdout.write(line + '\n');
	}

	return {
		debug: (msg, fields) => emit('debug', msg, fields),
		info: (msg, fields) => emit('info', msg, fields),
		warn: (msg, fields) => emit('warn', msg, fields),
		error: (msg, fields) => emit('error', msg, fields),
		fatal: (msg, err, fields) => {
			const message = err instanceof Error ? err.message : String(err);
			emit('error', msg, { ...fields, error: message });
			if (err instanceof Error && err.stack) process.stderr.write(err.stack + '\n');
		},
	};
}
