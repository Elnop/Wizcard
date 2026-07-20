// Map a scroll-progress value within [a, b] to 0..1, clamped outside the range.
// Shared by every landing demo so a "beat" (e.g. 0.4→0.7) is expressed once.
export function seg(p: number, a: number, b: number): number {
	return Math.min(1, Math.max(0, (p - a) / (b - a)));
}
