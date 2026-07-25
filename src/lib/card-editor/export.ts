function loadSerializedSvg(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error('Unable to render SVG'));
		image.src = url;
	});
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(new Error('Unable to inline frame asset'));
		reader.readAsDataURL(blob);
	});
}

async function inlineSvgImages(svg: SVGSVGElement): Promise<void> {
	await Promise.all(
		[...svg.querySelectorAll('image')].map(async (image) => {
			const href = image.getAttribute('href');
			if (!href || href.startsWith('data:') || href.startsWith('blob:')) return;
			const response = await fetch(href, { cache: 'force-cache' });
			if (!response.ok) throw new Error(`Unable to load frame asset (${response.status})`);
			image.setAttribute('href', await blobToDataUrl(await response.blob()));
		})
	);
}

export async function renderCardPng(svg: SVGSVGElement, scale = 3): Promise<Blob> {
	await document.fonts.ready;
	const viewBox = svg.viewBox.baseVal;
	const clone = svg.cloneNode(true) as SVGSVGElement;
	await inlineSvgImages(clone);
	clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
	clone.setAttribute('width', String(viewBox.width));
	clone.setAttribute('height', String(viewBox.height));
	const markup = new XMLSerializer().serializeToString(clone);
	const svgBlob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
	const svgUrl = URL.createObjectURL(svgBlob);

	try {
		const image = await loadSerializedSvg(svgUrl);
		const canvas = document.createElement('canvas');
		canvas.width = Math.round(viewBox.width * scale);
		canvas.height = Math.round(viewBox.height * scale);
		const context = canvas.getContext('2d');
		if (!context) throw new Error('Canvas is not available');
		context.imageSmoothingEnabled = true;
		context.imageSmoothingQuality = 'high';
		context.drawImage(image, 0, 0, canvas.width, canvas.height);
		return await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(
				(blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))),
				'image/png',
				1
			);
		});
	} finally {
		URL.revokeObjectURL(svgUrl);
	}
}

export function downloadBlob(blob: Blob, fileName: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = fileName;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildCardFileName(name: string, faceIndex: number): string {
	const base = name
		.trim()
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
	return `${base || 'wizcard-custom'}${faceIndex === 1 ? '-back' : ''}.png`;
}
