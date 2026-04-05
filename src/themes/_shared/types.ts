export type { ButtonProps } from '@/components/Button/Button';
export type { SpinnerProps } from '@/components/Spinner/Spinner';
export type { SearchBarProps } from '@/lib/search/components/SearchBar/SearchBar';
export type { RarityFilterProps } from '@/lib/search/components/filters/RarityFilter/RarityFilter';

export interface ModalProps {
	children: React.ReactNode;
	onClose?: () => void;
	className?: string;
	zIndex?: number;
}

export interface ConfirmModalProps {
	message: React.ReactNode;
	confirmLabel?: string;
	onConfirm: () => void;
	onClose: () => void;
}

export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';

export interface ColorFilterProps {
	selected: ManaColor[];
	onChange: (colors: ManaColor[]) => void;
	colorMatch?: 'exact' | 'include' | 'atMost';
	onColorMatchChange?: (match: 'exact' | 'include' | 'atMost') => void;
}

export interface CardFrameProps {
	src: string;
	alt: string;
	width?: number;
	height?: number;
	className?: string;
	onClick?: () => void;
}

export interface CardGridProps {
	children: React.ReactNode;
	columns?: number;
	className?: string;
}
