const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2400;

export type ImagePreparationError = 'unsupported' | 'tooLarge' | 'unreadable';

export interface PreparedArtwork {
	dataUrl: string;
	fileName: string;
	mimeType: string;
	/**
	 * Dimensions de l'image PRODUITE (après la réduction à `MAX_IMAGE_EDGE`), pas
	 * du fichier d'origine : c'est celle-ci qui est peinte, donc elle seule décrit
	 * le débordement hors de la boîte d'art. Le ratio est le même, mais le calcul
	 * de `artPanBounds` reste ainsi exact quelle que soit l'échelle.
	 */
	width: number;
	height: number;
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

/**
 * Décode une image, la réduit à `MAX_IMAGE_EDGE` et la ré-encode.
 *
 * Étape commune au téléversement et à l'import depuis une carte existante :
 * les deux doivent produire un `CardArtworkDraft` IDENTIQUE, sans quoi l'art
 * importé se comporterait différemment au déplacement (`artPanBounds`), à la
 * sauvegarde et à l'export. C'est pour ça qu'elle est factorisée plutôt que
 * recopiée.
 */
async function rasterizeArtwork(
	sourceDataUrl: string,
	fileName: string,
	sourceMimeType: string
): Promise<PreparedArtwork> {
	const image = await loadImage(sourceDataUrl);
	const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
	canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
	const context = canvas.getContext('2d');
	if (!context) throw new Error('unreadable');
	context.drawImage(image, 0, 0, canvas.width, canvas.height);
	const outputType = sourceMimeType === 'image/png' ? 'image/png' : 'image/webp';
	return {
		dataUrl: canvas.toDataURL(outputType, 0.92),
		fileName,
		mimeType: outputType,
		width: canvas.width,
		height: canvas.height,
	};
}

export async function prepareArtwork(file: File): Promise<PreparedArtwork> {
	if (!file.type.startsWith('image/')) throw new Error('unsupported');
	if (file.size > MAX_UPLOAD_BYTES) throw new Error('tooLarge');

	try {
		const source = await readFileAsDataUrl(file);
		return await rasterizeArtwork(source, file.name, file.type);
	} catch (error) {
		if (error instanceof Error && ['unsupported', 'tooLarge'].includes(error.message)) throw error;
		throw new Error('unreadable');
	}
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(new Error('unreadable'));
		reader.readAsDataURL(blob);
	});
}

/**
 * Récupère l'illustration d'une carte du catalogue, prête à poser dans un
 * brouillon.
 *
 * Passe par `/api/scryfall/art/...` et NON par cards.scryfall.io directement :
 * l'export PNG doit pouvoir relire cette image pour l'inliner, ce que le CORS
 * de Scryfall interdit (cf. le commentaire de la route).
 *
 * L'image est ensuite rasterisée par le même chemin qu'un téléversement, donc
 * le brouillon ne garde aucune trace de sa provenance — rien en aval n'a de cas
 * particulier à connaître.
 */
export async function importArtwork(cardId: string, faceIndex: 0 | 1): Promise<PreparedArtwork> {
	const response = await fetch(`/api/scryfall/art/${cardId}/${faceIndex}`);
	if (!response.ok) throw new Error('unreadable');
	const blob = await response.blob();
	const dataUrl = await blobToDataUrl(blob);
	return rasterizeArtwork(dataUrl, `${cardId}-art`, blob.type);
}

/**
 * Mesure une illustration déjà présente dans un brouillon.
 *
 * Les brouillons enregistrés avant que `prepareArtwork` ne conserve les
 * dimensions n'en portent pas, et sans elles le déplacement est figé (cf.
 * `UNKNOWN_PAN_LIMIT`). Plutôt que de deviner un ratio, on relit l'image : elle
 * est dans le brouillon, sa taille est un FAIT, pas une hypothèse.
 *
 * `null` si l'image ne se décode pas — le déplacement reste alors figé, ce qui
 * est le comportement sûr.
 */
export async function measureArtwork(
	dataUrl: string
): Promise<{ width: number; height: number } | null> {
	try {
		const image = await loadImage(dataUrl);
		if (!image.naturalWidth || !image.naturalHeight) return null;
		return { width: image.naturalWidth, height: image.naturalHeight };
	} catch {
		return null;
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
