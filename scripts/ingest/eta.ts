// Pure sliding-window ETA estimator over a known total. Records (timestamp,
// cumulativeDone) samples, prunes samples older than the window, and estimates
// remaining seconds from the recent throughput. The clock is injectable so the
// logic is testable without real time. No I/O.

type Clock = () => number;

interface Sample {
	t: number;
	done: number;
}

export interface EtaEstimator {
	record(cumulativeDone: number): void;
	etaSeconds(): number | null;
}

const MIN_SAMPLE_SPAN_MS = 5_000;

export function createEtaEstimator(
	total: number,
	windowMs: number,
	clock: Clock = () => Date.now()
): EtaEstimator {
	const samples: Sample[] = [];

	function prune(now: number): void {
		const cutoff = now - windowMs;
		// Drop all samples strictly older than the cutoff so only samples within
		// the window (t >= cutoff) are retained.
		let firstToKeep = 0;
		while (firstToKeep < samples.length && samples[firstToKeep].t < cutoff) {
			firstToKeep++;
		}
		if (firstToKeep > 0) samples.splice(0, firstToKeep);
	}

	return {
		record(cumulativeDone: number): void {
			const now = clock();
			samples.push({ t: now, done: cumulativeDone });
			prune(now);
		},
		etaSeconds(): number | null {
			if (samples.length < 2) return null;
			const first = samples[0];
			const last = samples[samples.length - 1];
			const dtMs = last.t - first.t;
			if (dtMs < MIN_SAMPLE_SPAN_MS) return null;
			const remaining = total - last.done;
			if (remaining <= 0) return 0;
			const rate = (last.done - first.done) / (dtMs / 1000); // cards/s
			if (rate <= 0) return null;
			return Math.ceil(remaining / rate);
		},
	};
}
