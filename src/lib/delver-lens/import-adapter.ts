import type { BinaryFormatDescriptor } from '@/lib/import/utils/types';

export { parseDelverLens } from './parse';

export const delverLensDescriptor: BinaryFormatDescriptor = {
	id: 'delverlens',
	label: 'Delver Lens (.dlens)',
	fileExtensions: ['.dlens'],
};
