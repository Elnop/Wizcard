const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2400;

export type ImagePreparationError = 'unsupported' | 'tooLarge' | 'unreadable';

export interface PreparedArtwork {
	dataUrl: string;
	fileName: string;
	mimeType: string;
}

function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(new Error('unreadable'));
		reader.readAsDataURL(file);
	});
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error('unreadable'));
		image.src = dataUrl;
	});
}

export async function prepareArtwork(file: File): Promise<PreparedArtwork> {
	if (!file.type.startsWith('image/')) throw new Error('unsupported');
	if (file.size > MAX_UPLOAD_BYTES) throw new Error('tooLarge');

	try {
		const source = await readFileAsDataUrl(file);
		const image = await loadImage(source);
		const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
		canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
		const context = canvas.getContext('2d');
		if (!context) throw new Error('unreadable');
		context.drawImage(image, 0, 0, canvas.width, canvas.height);
		const outputType = file.type === 'image/png' ? 'image/png' : 'image/webp';
		return {
			dataUrl: canvas.toDataURL(outputType, 0.92),
			fileName: file.name,
			mimeType: outputType,
		};
	} catch (error) {
		if (error instanceof Error && ['unsupported', 'tooLarge'].includes(error.message)) throw error;
		throw new Error('unreadable');
	}
}

export function dataUrlToBlob(dataUrl: string): Blob {
	const [header, encoded] = dataUrl.split(',');
	const mimeType = header.match(/data:([^;]+)/)?.[1] ?? 'application/octet-stream';
	const bytes = atob(encoded);
	const array = new Uint8Array(bytes.length);
	for (let index = 0; index < bytes.length; index += 1) array[index] = bytes.charCodeAt(index);
	return new Blob([array], { type: mimeType });
}
