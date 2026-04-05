'use client';

import { useState } from 'react';
import { LibraryConfirmModal } from './LibraryConfirmModal';
import { LibraryButton } from '../LibraryButton/LibraryButton';

function ToggleConfirm() {
	const [open, setOpen] = useState(false);
	return (
		<>
			<LibraryButton variant="danger" onClick={() => setOpen(true)}>
				Delete Item
			</LibraryButton>
			{open && (
				<LibraryConfirmModal
					message="Are you sure you want to remove this card from the library?"
					confirmLabel="Remove"
					onConfirm={() => setOpen(false)}
					onClose={() => setOpen(false)}
				/>
			)}
		</>
	);
}

export default { 'Toggle Confirm': ToggleConfirm };
