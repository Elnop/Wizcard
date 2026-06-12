// Launches and manages the Ink HUD on stdout (alternate screen).
// Logfmt output is redirected to ingest.log (or a custom path) while the HUD
// is active. On exit the terminal is restored and the log file is closed.

import { createWriteStream, type WriteStream } from 'node:fs';
import React from 'react';
import { render } from 'ink';
import { Hud } from './hud';
import type { Logger } from './logger';

interface HudRunner {
	logStream: WriteStream;
	stop(): void;
}

let runner: HudRunner | null = null;

export function openLogStream(logPath: string): WriteStream {
	return createWriteStream(logPath, { flags: 'a', encoding: 'utf-8' });
}

export function startHud(logger: Logger, logPath = 'ingest.log'): void {
	if (!process.stdout.isTTY) return; // non-TTY: no HUD

	const logStream = openLogStream(logPath);
	logger.setLogStream(logStream);

	const { unmount } = render(
		React.createElement(Hud, {
			getState: () => logger.getHudState(),
			subscribe: (cb) => logger.subscribe(cb),
		}),
		{
			// stdout is the default — HUD owns the terminal
			stdin: process.stdin,
			patchConsole: false,
			exitOnCtrlC: false,
			alternateScreen: true,
		}
	);

	// Safety net for the React performance-track leak. react-reconciler's DEV build
	// (NODE_ENV !== 'production') calls performance.measure() on every commit
	// ("Components ⚛", "Changed Props", …); Node never evicts those entries, so a
	// long-running HUD accumulates hundreds of thousands of PerformanceMeasure
	// objects until OOM (~40 min). `npm run ingest` sets NODE_ENV=production (loads
	// the prod reconciler, no measures), but if this is launched some other way we
	// still periodically flush the buffer so the entries can't pile up.
	const perfFlush = setInterval(() => {
		performance.clearMeasures();
		performance.clearMarks();
	}, 10_000);
	perfFlush.unref();

	function cleanup(): void {
		if (runner) {
			clearInterval(perfFlush);
			unmount();
			// Restore logfmt to stdout before closing the file
			logger.setLogStream(process.stdout);
			runner.logStream.end();
			runner = null;
		}
	}

	process.once('exit', cleanup);
	process.once('SIGINT', () => {
		cleanup();
		process.exit(130);
	});
	process.once('SIGTERM', () => {
		cleanup();
		process.exit(143);
	});

	runner = { logStream, stop: cleanup };
}

export function stopHud(): void {
	runner?.stop();
}

export function getLogStream(): WriteStream | undefined {
	return runner?.logStream;
}
