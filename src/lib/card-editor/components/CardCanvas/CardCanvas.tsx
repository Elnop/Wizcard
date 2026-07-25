'use client';

import { forwardRef, useId, useRef, type CSSProperties, type PointerEvent } from 'react';
import { getCardLayout } from '@/lib/card-editor/layout-registry';
import type { MseTextColors } from '@/lib/card-editor/mse-assets';
import {
	expandCardNameShortcut,
	getManaSymbols,
	getRulesFontSize,
	getTitleFontSize,
	wrapCardText,
} from '@/lib/card-editor/text-layout';
import type {
	CardArtworkDraft,
	CardCanvasLabels,
	CardFaceDraft,
	CardFinish,
	CardLayoutId,
	CardRarity,
	CardRect,
	EditableCardField,
} from '@/lib/card-editor/types';
import styles from './CardCanvas.module.css';

interface CardCanvasProps {
	face: CardFaceDraft;
	layoutId: CardLayoutId;
	rarity: CardRarity;
	finish: CardFinish;
	setCode: string;
	collectorNumber: string;
	mseFramePath?: string | null;
	mseTextColors?: MseTextColors | null;
	labels: CardCanvasLabels;
	onFieldChange: (field: EditableCardField, value: string) => void;
	onArtworkChange: (artwork: CardArtworkDraft) => void;
	isInteractive?: boolean;
}

interface FramePalette {
	dark: string;
	mid: string;
	light: string;
	ink: string;
}

const PALETTES: Record<Exclude<CardFaceDraft['frameStyle'], 'auto'>, FramePalette> = {
	light: { dark: '#62553a', mid: '#b49b62', light: '#eee1b9', ink: '#17140d' },
	tide: { dark: '#173b4f', mid: '#34758c', light: '#a8cbd0', ink: '#0b161a' },
	void: { dark: '#242127', mid: '#5d5361', light: '#aaa0a8', ink: '#121014' },
	ember: { dark: '#672a21', mid: '#a9573d', light: '#d99c75', ink: '#1d0c08' },
	grove: { dark: '#244633', mid: '#4e765a', light: '#a4bd8b', ink: '#0d1710' },
	prismatic: { dark: '#5c4723', mid: '#aa8740', light: '#e1c77c', ink: '#1c1508' },
	artifact: { dark: '#38464b', mid: '#78898b', light: '#c4ceca', ink: '#111719' },
};

function resolvePalette(face: CardFaceDraft): FramePalette {
	if (face.frameStyle !== 'auto') return PALETTES[face.frameStyle];
	const symbols = getManaSymbols(face.manaCost).join('');
	const colors = ['W', 'U', 'B', 'R', 'G'].filter((color) => symbols.includes(color));
	if (colors.length > 1) return PALETTES.prismatic;
	const paletteByColor: Record<string, FramePalette> = {
		W: PALETTES.light,
		U: PALETTES.tide,
		B: PALETTES.void,
		R: PALETTES.ember,
		G: PALETTES.grove,
	};
	if (colors[0]) return paletteByColor[colors[0]];
	if (symbols.includes('C')) return PALETTES.artifact;
	if (/\b(land|terrain)\b/i.test(face.typeLine)) return PALETTES.prismatic;
	return PALETTES.light;
}

function rectStyle(rect: CardRect, width: number, height: number): CSSProperties {
	return {
		insetInlineStart: `${(rect.x / width) * 100}%`,
		top: `${(rect.y / height) * 100}%`,
		width: `${(rect.width / width) * 100}%`,
		height: `${(rect.height / height) * 100}%`,
	};
}

function ManaSymbols({
	manaCost,
	x,
	y,
	width,
}: {
	manaCost: string;
	x: number;
	y: number;
	width: number;
}) {
	const symbols = getManaSymbols(manaCost);
	const size = 34;
	const gap = 3;
	const totalWidth = symbols.length * size + Math.max(0, symbols.length - 1) * gap;
	const startX = x + width - totalWidth + size / 2;
	const symbolColors: Record<string, string> = {
		W: '#f2e9c8',
		U: '#7ec8e3',
		B: '#8d8092',
		R: '#e57658',
		G: '#76b58a',
	};
	return (
		<g>
			{symbols.map((symbol, index) => {
				const centerX = startX + index * (size + gap);
				const baseColor = symbolColors[symbol] ?? '#d7d8d2';
				return (
					<g key={`${symbol}-${index}`}>
						<circle cx={centerX - 1.5} cy={y + 29} r={size / 2} fill="#080808" opacity="0.7" />
						<circle
							cx={centerX}
							cy={y + 26}
							r={size / 2}
							fill={baseColor}
							stroke="#171412"
							strokeWidth="2.4"
						/>
						<path
							d={`M ${centerX - 10} ${y + 18} A 14 14 0 0 1 ${centerX + 8} ${y + 14}`}
							fill="none"
							stroke="#fff"
							strokeWidth="2"
							opacity="0.42"
						/>
						<text
							x={centerX}
							y={y + 32}
							textAnchor="middle"
							fontFamily="Arial, sans-serif"
							fontSize={symbol.length > 1 ? 13 : 18}
							fontWeight="800"
							fill="#141414"
						>
							{symbol}
						</text>
					</g>
				);
			})}
		</g>
	);
}

function RulesText({
	face,
	rect,
	placeholder,
	isNarrow,
	textColor,
}: {
	face: CardFaceDraft;
	rect: CardRect;
	placeholder: string;
	isNarrow: boolean;
	textColor: string;
}) {
	const oracle = expandCardNameShortcut(face.oracleText, face.name);
	const content = oracle || placeholder;
	const fontSize = getRulesFontSize(oracle.length + face.flavorText.length, isNarrow);
	const lineHeight = fontSize * 1.28;
	const maxCharacters = Math.max(15, Math.floor((rect.width - 44) / (fontSize * 0.53)));
	const maxLines = Math.max(2, Math.floor((rect.height - 46) / lineHeight));
	const lines = wrapCardText(content, maxCharacters, maxLines);
	const positionedLines = lines.reduce<Array<{ line: (typeof lines)[number]; offset: number }>>(
		(result, line) => {
			const previous = result.at(-1);
			if (!previous) return [{ line, offset: 0 }];
			const paragraphSpacing = previous.line.isParagraphEnd ? 1.28 : 1;
			const offset = previous.offset + paragraphSpacing;
			return [...result, { line, offset }];
		},
		[]
	);
	const flavorOffset = positionedLines.at(-1)?.offset ?? 0;
	return (
		<g opacity={oracle ? 1 : 0.48}>
			{positionedLines.map(({ line, offset }, index) => {
				const y = rect.y + 34 + offset * lineHeight;
				return (
					<text
						key={`${line.text}-${index}`}
						x={rect.x + 24}
						y={y}
						fontFamily="Georgia, serif"
						fontSize={fontSize}
						fill={textColor}
					>
						{line.text}
					</text>
				);
			})}
			{face.flavorText && flavorOffset < maxLines - 1 && (
				<text
					x={rect.x + 24}
					y={rect.y + 40 + (flavorOffset + 1.3) * lineHeight}
					fontFamily="Georgia, serif"
					fontSize={Math.max(17, fontSize - 2)}
					fontStyle="italic"
					fill={textColor}
				>
					{face.flavorText.length > maxCharacters
						? `${face.flavorText.slice(0, maxCharacters - 1)}…`
						: face.flavorText}
				</text>
			)}
		</g>
	);
}

function Artwork({
	artwork,
	rect,
	clipId,
}: {
	artwork: CardArtworkDraft;
	rect: CardRect;
	clipId: string;
}) {
	if (!artwork.dataUrl) {
		return (
			<g clipPath={`url(#${clipId})`}>
				<rect {...rect} fill="#111722" />
				<path
					d={`M ${rect.x} ${rect.y + rect.height * 0.7} L ${rect.x + rect.width * 0.34} ${rect.y + rect.height * 0.38} L ${rect.x + rect.width * 0.55} ${rect.y + rect.height * 0.62} L ${rect.x + rect.width * 0.78} ${rect.y + rect.height * 0.28} L ${rect.x + rect.width} ${rect.y + rect.height * 0.58} V ${rect.y + rect.height} H ${rect.x} Z`}
					fill="#263142"
				/>
				<circle
					cx={rect.x + rect.width * 0.72}
					cy={rect.y + rect.height * 0.25}
					r={rect.width * 0.09}
					fill="#c9a84c"
					opacity="0.54"
				/>
			</g>
		);
	}
	const centerX = rect.x + rect.width / 2;
	const centerY = rect.y + rect.height / 2;
	const translateX = (artwork.offsetX / 100) * rect.width;
	const translateY = (artwork.offsetY / 100) * rect.height;
	return (
		<g clipPath={`url(#${clipId})`}>
			<image
				href={artwork.dataUrl}
				x={rect.x}
				y={rect.y}
				width={rect.width}
				height={rect.height}
				preserveAspectRatio="xMidYMid slice"
				transform={`translate(${centerX + translateX} ${centerY + translateY}) scale(${artwork.zoom}) translate(${-centerX} ${-centerY})`}
			/>
		</g>
	);
}

function CardOrnaments({
	layoutId,
	palette,
	width,
	height,
}: {
	layoutId: CardLayoutId;
	palette: FramePalette;
	width: number;
	height: number;
}) {
	if (layoutId === 'showcase') {
		return (
			<path
				d={`M 18 ${height * 0.28} L ${width * 0.16} 18 H ${width * 0.84} L ${width - 18} ${height * 0.28} L ${width * 0.9} ${height - 20} H ${width * 0.1} Z`}
				fill="none"
				stroke={palette.light}
				strokeWidth="7"
				opacity="0.72"
			/>
		);
	}
	if (layoutId === 'saga') {
		return (
			<path
				d={`M ${width * 0.46} 120 V ${height - 100}`}
				stroke={palette.light}
				strokeWidth="8"
				opacity="0.8"
			/>
		);
	}
	if (layoutId === 'adventure') {
		return (
			<path
				d={`M 55 ${height * 0.63} H 210 V ${height * 0.88} H 55 Z`}
				fill={palette.dark}
				stroke={palette.light}
				strokeWidth="4"
				opacity="0.88"
			/>
		);
	}
	return null;
}

function SetMark({ x, y, rarity }: { x: number; y: number; rarity: CardRarity }) {
	const rarityColors: Record<CardRarity, string> = {
		common: '#342f2c',
		uncommon: '#aeb7bd',
		rare: '#c9a84c',
		mythic: '#d45e30',
	};
	return (
		<g>
			<path
				d={`M ${x} ${y - 17} C ${x + 8} ${y - 9}, ${x + 14} ${y - 4}, ${x + 16} ${y} C ${x + 10} ${y + 5}, ${x + 6} ${y + 10}, ${x} ${y + 17} C ${x - 6} ${y + 10}, ${x - 10} ${y + 5}, ${x - 16} ${y} C ${x - 10} ${y - 5}, ${x - 6} ${y - 10}, ${x} ${y - 17} Z`}
				fill={rarityColors[rarity]}
				stroke="#15120f"
				strokeWidth="2"
			/>
			<circle cx={x} cy={y} r="4" fill="#f7efd9" opacity="0.72" />
		</g>
	);
}

function FrameSurface({
	geometry,
	palette,
	clipId,
}: {
	geometry: ReturnType<typeof getCardLayout>['geometry'];
	palette: FramePalette;
	clipId: string;
}) {
	return (
		<>
			<rect
				x="3"
				y="3"
				width={geometry.width - 6}
				height={geometry.height - 6}
				rx="42"
				fill="#080808"
			/>
			<rect
				x="27"
				y="27"
				width={geometry.width - 54}
				height={geometry.height - 54}
				rx="28"
				fill={`url(#${clipId}-frame)`}
				stroke="#020303"
				strokeWidth="5"
			/>
			<rect
				x="34"
				y="34"
				width={geometry.width - 68}
				height={geometry.height - 68}
				rx="22"
				fill={`url(#${clipId}-grain)`}
				opacity="0.1"
			/>
			<rect
				x="38"
				y="38"
				width={geometry.width - 76}
				height={geometry.height - 76}
				rx="19"
				fill="none"
				stroke={palette.light}
				strokeWidth="3"
				opacity="0.52"
			/>
		</>
	);
}

function CardSvg({
	face,
	layoutId,
	rarity,
	finish,
	setCode,
	collectorNumber,
	mseFramePath,
	mseTextColors,
	labels,
	clipId,
}: Omit<CardCanvasProps, 'onFieldChange' | 'onArtworkChange'> & { clipId: string }) {
	const layout = getCardLayout(layoutId);
	const { geometry } = layout;
	const palette = resolvePalette(face);
	const title = face.name || labels.namePlaceholder;
	const typeLine = face.typeLine || labels.typePlaceholder;
	const isFullArt = layoutId === 'full-art';
	const isNarrowRules = geometry.rules.width < 500;
	const panelOpacity = isFullArt ? 0.88 : 0.98;
	const showStats = geometry.stats.width > 0 && (face.power || face.toughness || face.loyalty);
	const titlePanel = {
		x: geometry.title.x - 5,
		y: geometry.title.y,
		width: geometry.mana.x + geometry.mana.width - geometry.title.x + 5,
		height: geometry.title.height,
	};
	return (
		<>
			<defs>
				<linearGradient id={`${clipId}-frame`} x1="0" y1="0" x2="1" y2="1">
					<stop offset="0" stopColor={palette.dark} />
					<stop offset="0.3" stopColor={palette.mid} />
					<stop offset="0.58" stopColor={palette.dark} />
					<stop offset="0.82" stopColor={palette.mid} />
					<stop offset="1" stopColor={palette.dark} />
				</linearGradient>
				<linearGradient id={`${clipId}-bar`} x1="0" y1="0" x2="1" y2="1">
					<stop offset="0" stopColor={palette.light} />
					<stop offset="0.48" stopColor="#eee3c8" />
					<stop offset="1" stopColor={palette.mid} />
				</linearGradient>
				<linearGradient id={`${clipId}-panel`} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor="#f4efdf" />
					<stop offset="0.52" stopColor="#e7dfca" />
					<stop offset="1" stopColor="#cec4aa" />
				</linearGradient>
				<pattern
					id={`${clipId}-grain`}
					width="16"
					height="16"
					patternUnits="userSpaceOnUse"
					patternTransform="rotate(28)"
				>
					<path d="M 0 1 H 16 M 0 8 H 16" stroke={palette.light} strokeWidth="2" />
					<path d="M 0 4 H 16 M 0 13 H 16" stroke="#050505" strokeWidth="1" />
				</pattern>
				<radialGradient id={`${clipId}-panel-light`} cx="50%" cy="15%" r="85%">
					<stop offset="0" stopColor={palette.light} />
					<stop offset="1" stopColor={palette.mid} />
				</radialGradient>
				<linearGradient id={`${clipId}-foil`} x1="0" y1="0" x2="1" y2="1">
					<stop offset="0" stopColor="#70d5ff" stopOpacity="0" />
					<stop offset="0.3" stopColor="#f3a8ff" stopOpacity="0.28" />
					<stop offset="0.55" stopColor="#fff7a6" stopOpacity="0" />
					<stop offset="0.78" stopColor="#89ffc8" stopOpacity="0.24" />
					<stop offset="1" stopColor="#70d5ff" stopOpacity="0" />
				</linearGradient>
				<clipPath id={clipId}>
					<rect {...geometry.art} rx="3" />
				</clipPath>
			</defs>
			{mseFramePath ? (
				<image
					href={mseFramePath}
					x="0"
					y="0"
					width={geometry.width}
					height={geometry.height}
					preserveAspectRatio="none"
				/>
			) : (
				<FrameSurface geometry={geometry} palette={palette} clipId={clipId} />
			)}
			<Artwork artwork={face.artwork} rect={geometry.art} clipId={clipId} />
			{!mseFramePath && (
				<>
					{!isFullArt && (
						<rect {...geometry.art} rx="3" fill="none" stroke="#090908" strokeWidth="10" />
					)}
					<CardOrnaments
						layoutId={layoutId}
						palette={palette}
						width={geometry.width}
						height={geometry.height}
					/>
					<rect
						{...titlePanel}
						rx="18"
						fill={`url(#${clipId}-bar)`}
						opacity={panelOpacity}
						stroke="#0d0d0c"
						strokeWidth="5"
					/>
					{layoutId !== 'saga' && (
						<rect
							{...geometry.typeLine}
							rx="11"
							fill={`url(#${clipId}-bar)`}
							opacity={panelOpacity}
							stroke="#0d0d0c"
							strokeWidth="5"
						/>
					)}
					<rect
						{...geometry.rules}
						rx="5"
						fill={`url(#${clipId}-panel)`}
						opacity={panelOpacity}
						stroke="#0d0d0c"
						strokeWidth="6"
					/>
					<rect
						x={geometry.rules.x + 8}
						y={geometry.rules.y + 8}
						width={Math.max(0, geometry.rules.width - 16)}
						height={Math.max(0, geometry.rules.height - 16)}
						rx="2"
						fill="none"
						stroke={palette.light}
						strokeWidth="2"
						opacity="0.38"
					/>
				</>
			)}
			<text
				x={geometry.title.x + 18}
				y={geometry.title.y + 39}
				fontFamily="Georgia, 'Times New Roman', serif"
				fontSize={getTitleFontSize(title.length)}
				fontWeight="800"
				fill={mseTextColors?.title ?? palette.ink}
				opacity={face.name ? 1 : 0.46}
			>
				{title}
			</text>
			<ManaSymbols
				manaCost={face.manaCost}
				x={geometry.mana.x}
				y={geometry.mana.y}
				width={geometry.mana.width}
			/>
			<text
				x={geometry.typeLine.x + 16}
				y={geometry.typeLine.y + 36}
				fontFamily="Georgia, 'Times New Roman', serif"
				fontSize="25"
				fontWeight="800"
				fill={mseTextColors?.type ?? palette.ink}
				opacity={face.typeLine ? 1 : 0.46}
			>
				{typeLine}
			</text>
			<SetMark
				x={geometry.typeLine.x + geometry.typeLine.width - 27}
				y={geometry.typeLine.y + geometry.typeLine.height / 2}
				rarity={rarity}
			/>
			<RulesText
				face={face}
				rect={geometry.rules}
				placeholder={labels.rulesPlaceholder}
				isNarrow={isNarrowRules}
				textColor={mseTextColors?.rules ?? '#181512'}
			/>
			{showStats && (
				<g>
					<rect
						{...geometry.stats}
						rx="15"
						fill={`url(#${clipId}-panel-light)`}
						stroke="#0d0d0c"
						strokeWidth="6"
					/>
					<text
						x={geometry.stats.x + geometry.stats.width / 2}
						y={geometry.stats.y + geometry.stats.height * 0.68}
						textAnchor="middle"
						fontFamily="Georgia, 'Times New Roman', serif"
						fontSize="32"
						fontWeight="800"
						fill={palette.ink}
					>
						{face.loyalty || `${face.power || '—'} / ${face.toughness || '—'}`}
					</text>
				</g>
			)}
			<text
				x={geometry.footer.x}
				y={geometry.footer.y + 20}
				fontFamily="Arial, sans-serif"
				fontSize="14"
				fontWeight="700"
				fill={mseTextColors?.footer ?? '#f8f1df'}
			>
				{setCode || 'WIZ'} · {collectorNumber || '001'} · {labels.artistPrefix} {face.artist || '—'}
			</text>
			<text
				x={geometry.footer.x + geometry.footer.width}
				y={geometry.footer.y + 20}
				textAnchor="end"
				fontFamily="Arial, sans-serif"
				fontSize="12"
				fontWeight="700"
				letterSpacing="2"
				fill={face.accentColor}
			>
				{labels.customMark}
			</text>
			{finish !== 'matte' && (
				<rect
					x="27"
					y="27"
					width={geometry.width - 54}
					height={geometry.height - 54}
					rx="27"
					fill={`url(#${clipId}-foil)`}
					opacity={finish === 'foil' ? 0.9 : 0.55}
					pointerEvents="none"
				/>
			)}
		</>
	);
}

function DirectEditingLayer({
	face,
	layoutId,
	labels,
	onFieldChange,
	onArtworkChange,
}: Pick<CardCanvasProps, 'face' | 'layoutId' | 'labels' | 'onFieldChange' | 'onArtworkChange'>) {
	const drag = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
	const { geometry } = getCardLayout(layoutId);
	const isLoyaltyLayout = layoutId === 'planeswalker';
	const baseField = (field: EditableCardField) => (value: string) => onFieldChange(field, value);
	function handleArtPointerDown(event: PointerEvent<HTMLButtonElement>) {
		event.currentTarget.setPointerCapture(event.pointerId);
		drag.current = {
			x: event.clientX,
			y: event.clientY,
			offsetX: face.artwork.offsetX,
			offsetY: face.artwork.offsetY,
		};
	}
	function handleArtPointerMove(event: PointerEvent<HTMLButtonElement>) {
		if (!drag.current) return;
		const nextX = Math.max(
			-50,
			Math.min(
				50,
				drag.current.offsetX +
					((event.clientX - drag.current.x) / event.currentTarget.clientWidth) * 100
			)
		);
		const nextY = Math.max(
			-50,
			Math.min(
				50,
				drag.current.offsetY +
					((event.clientY - drag.current.y) / event.currentTarget.clientHeight) * 100
			)
		);
		onArtworkChange({ ...face.artwork, offsetX: nextX, offsetY: nextY });
	}
	return (
		<div className={styles.editingLayer}>
			<button
				type="button"
				className={styles.artHandle}
				style={rectStyle(geometry.art, geometry.width, geometry.height)}
				aria-label={labels.panArtwork}
				onPointerDown={handleArtPointerDown}
				onPointerMove={handleArtPointerMove}
				onPointerUp={() => {
					drag.current = null;
				}}
			/>
			<input
				className={styles.directField}
				style={rectStyle(geometry.title, geometry.width, geometry.height)}
				value={face.name}
				onChange={(event) => baseField('name')(event.target.value)}
				aria-label={labels.editName}
				maxLength={80}
			/>
			<input
				className={`${styles.directField} ${styles.manaField}`}
				style={rectStyle(geometry.mana, geometry.width, geometry.height)}
				value={face.manaCost}
				onChange={(event) => baseField('manaCost')(event.target.value)}
				aria-label={labels.editManaCost}
				maxLength={80}
			/>
			<input
				className={styles.directField}
				style={rectStyle(geometry.typeLine, geometry.width, geometry.height)}
				value={face.typeLine}
				onChange={(event) => baseField('typeLine')(event.target.value)}
				aria-label={labels.editType}
				maxLength={120}
			/>
			<textarea
				className={styles.directRules}
				style={rectStyle(geometry.rules, geometry.width, geometry.height)}
				value={face.oracleText}
				onChange={(event) => baseField('oracleText')(event.target.value)}
				aria-label={labels.editRules}
				maxLength={1600}
			/>
			{geometry.stats.width > 0 && (
				<>
					<input
						className={styles.statField}
						style={{
							...rectStyle(geometry.stats, geometry.width, geometry.height),
							width: `${(geometry.stats.width / geometry.width) * 48}%`,
						}}
						value={isLoyaltyLayout ? face.loyalty : face.power}
						onChange={(event) =>
							baseField(isLoyaltyLayout ? 'loyalty' : 'power')(event.target.value)
						}
						aria-label={labels.editStats}
						maxLength={8}
					/>
					{!isLoyaltyLayout && (
						<input
							className={styles.statField}
							style={{
								...rectStyle(geometry.stats, geometry.width, geometry.height),
								insetInlineStart: `${((geometry.stats.x + geometry.stats.width * 0.52) / geometry.width) * 100}%`,
								width: `${(geometry.stats.width / geometry.width) * 48}%`,
							}}
							value={face.toughness}
							onChange={(event) => baseField('toughness')(event.target.value)}
							aria-label={labels.editStats}
							maxLength={8}
						/>
					)}
				</>
			)}
		</div>
	);
}

export const CardCanvas = forwardRef<SVGSVGElement, CardCanvasProps>(function CardCanvas(
	{
		face,
		layoutId,
		rarity,
		finish,
		setCode,
		collectorNumber,
		mseFramePath,
		mseTextColors,
		labels,
		onFieldChange,
		onArtworkChange,
		isInteractive = true,
	},
	ref
) {
	const layout = getCardLayout(layoutId);
	const clipId = `card-art-${useId().replaceAll(':', '')}`;
	return (
		<div className={styles.canvas} data-orientation={layout.orientation}>
			<svg
				ref={ref}
				className={styles.svg}
				viewBox={`0 0 ${layout.geometry.width} ${layout.geometry.height}`}
				role="img"
				aria-label={face.name || labels.namePlaceholder}
			>
				<CardSvg
					face={face}
					layoutId={layoutId}
					rarity={rarity}
					finish={finish}
					setCode={setCode}
					collectorNumber={collectorNumber}
					mseFramePath={mseFramePath}
					mseTextColors={mseTextColors}
					labels={labels}
					clipId={clipId}
				/>
			</svg>
			{isInteractive && (
				<DirectEditingLayer
					face={face}
					layoutId={layoutId}
					labels={labels}
					onFieldChange={onFieldChange}
					onArtworkChange={onArtworkChange}
				/>
			)}
		</div>
	);
});
