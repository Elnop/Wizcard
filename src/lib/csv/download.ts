/** Triggers a browser download of CSV text as a file. No-op outside the browser. */
export function downloadCSV(csvText: string, filename: string): void {
	if (typeof document === 'undefined') return;

	const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.style.display = 'none';
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}
