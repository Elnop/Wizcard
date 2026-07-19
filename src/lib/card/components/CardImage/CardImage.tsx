'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { getScryfallCardImageUriBySize } from '@/lib/scryfall/utils/scryfall-query';
import { isScryfallImageUrl, scryfallImageLoader } from '@/lib/scryfall/utils/scryfallImageLoader';
import { useLocalizedImage, useEnglishFallbackImage } from '@/lib/scryfall/hooks/useLocalizedImage';
import { useCustomFallbackPrint } from '@/lib/scryfall/hooks/useCustomFallbackPrint';
import { hasRealScan } from '@/lib/scryfall/types/scryfall';
import type { ScryfallImageStatus } from '@/lib/scryfall/types/scryfall';
import { isCustomCard } from '@/lib/mpc/types';
import type { CustomCard } from '@/lib/mpc/types';
import { useProfileStore } from '@/lib/profile/store/profile-store';
import { getEffectiveIgnoredTags, isIgnored } from '@/lib/mpc/ignored-tags';
import styles from './CardImage.module.css';

type CardImageCard = {
	name: string;
	set?: string;
	collector_number?: string;
	oracle_id?: string;
	language?: string;
	entry?: { language?: string };
	image_status?: ScryfallImageStatus;
	image_uris?: { small?: string; normal?: string; large?: string };
	card_faces?: Array<{
		name?: string;
		image_uris?: { small?: string; normal?: string; large?: string };
	}>;
	object?: string;
	custom?: { image_url: string };
};

export interface CardImageProps {
	card: CardImageCard;
	size?: 'small' | 'normal' | 'large';
	priority?: boolean;
	className?: string;
	onClick?: () => void;
	isFoil?: boolean;
	foilType?: 'foil' | 'etched';
	isProxy?: boolean;
	disableTilt?: boolean;
}

const sizeMap = {
	small: { width: 146, height: 204 },
	normal: { width: 488, height: 680 },
	large: { width: 672, height: 936 },
};

const TILT_MAX_DEG = 10;

// True when the custom image itself (identified by its own URL, not
// whatever `imageUri` currently resolves to) has errored. Comparing by URL
// (rather than a plain boolean) means this stays true only for the custom
// source, so it can't be confused with a later error on the fallback
// official image.
function didCustomImageError(customImageUri: string | null, erroredUri: string | null): boolean {
	return customImageUri !== null && erroredUri === customImageUri;
}

/**
 * Decide whether a custom card must be rendered via the official/localized print
 * instead of its own custom image. Two independent triggers:
 *  - ignored tag: any custom card that reaches CardImage tagged with an ignored
 *    tag falls back. List contexts (search, print lists) filter ignored cards out
 *    upstream, so a card that reaches here is a single-view render (card page,
 *    or a selected entry print in deck/collection/wishlist) — all of which must
 *    hide the ignored image. Resolution keys on the official print when possible;
 *    when it can't resolve (custom cards often have only an oracle_id, no
 *    set/collector), the render falls through to the name placeholder — never the
 *    ignored image, and never a hanging skeleton (see the isLoading guard below).
 *  - the custom image URL failed to load (a broken URL — independent of tags).
 */
function shouldFallbackFromCustomCard(args: {
	isInputCustom: boolean;
	isTagIgnored: boolean;
	customImageUri: string | null;
	erroredUri: string | null;
}): boolean {
	if (!args.isInputCustom) return false;
	return args.isTagIgnored || didCustomImageError(args.customImageUri, args.erroredUri);
}

/** A non-custom card with 2+ faces that carry image_uris renders a flippable front/back. */
function computeIsDoubleFaced(card: CardImageCard, isCustom: boolean): boolean {
	return Boolean(
		!isCustom && card.card_faces && card.card_faces.length > 1 && card.card_faces[0].image_uris
	);
}

/** Pick the image URL for the effective card: custom image, current DFC face, or scryfall image. */
function resolveImageUri(args: {
	card: CardImageCard;
	isCustom: boolean;
	isDoubleFaced: boolean;
	currentFace: number;
	size: 'small' | 'normal' | 'large';
}): string {
	const { card, isCustom, isDoubleFaced, currentFace, size } = args;
	if (isCustom) return (card as unknown as CustomCard).custom.image_url;
	if (isDoubleFaced) return card.card_faces![currentFace].image_uris?.[size] ?? '';
	return getScryfallCardImageUriBySize(
		{ image_uris: card.image_uris, card_faces: card.card_faces },
		size
	);
}

export function CardImage({
	card,
	size = 'normal',
	priority = false,
	className,
	onClick,
	isFoil = false,
	foilType = 'foil',
	isProxy = false,
	disableTilt = false,
}: CardImageProps) {
	const t = useTranslations('card');
	const [currentFace, setCurrentFace] = useState(0);
	// Keyed by the image source (`imageUri`) rather than a plain boolean, so a
	// source change (e.g. custom image fails → falls back to the resolved
	// official/localized `imageUri`) naturally gets a fresh load/error state
	// without any reset step: `error`/`isLoading` below are derived by
	// comparing these to the *current* `imageUri` once it's computed.
	const [loadedUri, setLoadedUri] = useState<string | null>(null);
	const [erroredUri, setErroredUri] = useState<string | null>(null);
	const [isVisible, setIsVisible] = useState(priority);
	const containerRef = useRef<HTMLDivElement>(null);
	const wrapperRef = useRef<HTMLDivElement>(null);
	const rectRef = useRef<DOMRect | null>(null);

	useEffect(() => {
		if (priority) return;
		const el = containerRef.current;
		if (!el) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) setIsVisible(true);
			},
			{ rootMargin: '200px' }
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [priority]);

	const isInputCustom = isCustomCard(card as unknown as CustomCard);
	const customImageUri = isInputCustom ? (card as unknown as CustomCard).custom.image_url : null;
	const profile = useProfileStore((s) => s.profile);
	const ignoredTags = getEffectiveIgnoredTags(profile);
	const shouldFallbackFromCustom = shouldFallbackFromCustomCard({
		isInputCustom,
		isTagIgnored: isInputCustom && isIgnored(card as unknown as CustomCard, ignoredTags),
		customImageUri,
		erroredUri,
	});
	// A normal (non-custom) card, OR a custom we must fall back away from,
	// is eligible for localized/official image resolution.
	const visible = (!isInputCustom || shouldFallbackFromCustom) && (priority || isVisible);

	// A custom card carries only its custom image (and usually just an oracle_id —
	// no set/collector), so the localized/English hooks below can't resolve
	// anything for it directly. When we must fall back from a custom, resolve the
	// oracle's default official print first; that print HAS set/collector/image,
	// so it becomes the base the localized → English chain then runs on.
	const customOracleId = isInputCustom ? card.oracle_id : undefined;
	const { print: fallbackPrint, loading: fallbackPrintLoading } = useCustomFallbackPrint(
		customOracleId,
		visible && shouldFallbackFromCustom
	);

	// The base card the image chain resolves from: for a falling-back custom, the
	// resolved official print (once loaded); otherwise the card as handed in.
	const baseCard =
		shouldFallbackFromCustom && fallbackPrint ? (fallbackPrint as unknown as typeof card) : card;

	const { localized, loading: localizedLoading } = useLocalizedImage(
		baseCard as Parameters<typeof useLocalizedImage>[0],
		visible
	);

	// The print this view was handed has no real scan (a Scryfall placeholder) and
	// no localized print replaced it — fetch the English print's image so the
	// preview is never imageless. Applies to every CardImage preview (search,
	// collection, prints list, …).
	const basePlaceholder =
		(!isInputCustom || shouldFallbackFromCustom) &&
		!localized &&
		!hasRealScan(baseCard.image_status);
	const { localized: englishFallback, loading: fallbackLoading } = useEnglishFallbackImage(
		baseCard as Parameters<typeof useEnglishFallbackImage>[0],
		visible && basePlaceholder
	);

	const resolvedOverride = localized ?? englishFallback;
	const effectiveCard = resolvedOverride ? { ...baseCard, ...resolvedOverride } : baseCard;

	// When falling back from a custom (ignored or failed-to-load), do NOT treat it
	// as custom for image selection — use the resolved official/localized print.
	const isCustom =
		isCustomCard(effectiveCard as unknown as CustomCard) && !shouldFallbackFromCustom;
	const isDoubleFaced = computeIsDoubleFaced(effectiveCard, isCustom);

	const imageUri = resolveImageUri({
		card: effectiveCard,
		isCustom,
		isDoubleFaced,
		currentFace,
		size,
	});

	const { width, height } = sizeMap[size];

	// Derived from the URL-keyed state above: `error`/`isLoading` describe the
	// *current* `imageUri` only. If `imageUri` just switched sources (e.g.
	// custom → official fallback after the custom image's onError), neither
	// `erroredUri` nor `loadedUri` matches it yet, so `error` is false and
	// `isLoading` is true for the new source automatically — no reset step,
	// no effect, no ref-during-render needed.
	const error = erroredUri === imageUri;
	// Only "loading" when there is actually an image URL to wait for. If `imageUri`
	// is empty (no custom image, no resolved official/localized print — e.g. a
	// custom card with no fallback available), there is nothing to load, so we must
	// NOT show a skeleton forever — fall through to the name placeholder instead.
	const isLoading = imageUri !== '' && loadedUri !== imageUri;

	const handleFlip = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (isDoubleFaced) {
			setCurrentFace((prev) => (prev === 0 ? 1 : 0));
		}
	};

	const handleMouseEnter = () => {
		const el = wrapperRef.current;
		if (!el) return;
		rectRef.current = el.getBoundingClientRect();
		el.style.setProperty('--tilt-duration', '0ms');
	};

	const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
		const el = wrapperRef.current;
		const rect = rectRef.current;
		if (!el || !rect) return;
		const x = (e.clientX - rect.left) / rect.width;
		const y = (e.clientY - rect.top) / rect.height;
		const tiltX = (x - 0.5) * 2 * TILT_MAX_DEG;
		const tiltY = (0.5 - y) * 2 * TILT_MAX_DEG;
		el.style.setProperty('--tilt-x', `${tiltX}deg`);
		el.style.setProperty('--tilt-y', `${tiltY}deg`);
		el.style.setProperty('--mouse-x', `${x * 100}%`);
		el.style.setProperty('--mouse-y', `${y * 100}%`);
	};

	const handleMouseLeave = () => {
		const el = wrapperRef.current;
		if (!el) return;
		rectRef.current = null;
		el.style.setProperty('--tilt-duration', '500ms');
		el.style.setProperty('--tilt-x', '0deg');
		el.style.setProperty('--tilt-y', '0deg');
		el.style.setProperty('--mouse-x', '50%');
		el.style.setProperty('--mouse-y', '50%');
	};

	const classNames = [styles.container, onClick ? styles.clickable : '', className ?? '']
		.filter(Boolean)
		.join(' ');

	// The base print is a placeholder and neither a localized print nor the
	// English fallback replaced it — show the name placeholder. While the oracle
	// fallback print or the English fallback is still loading, keep showing the
	// skeleton (not the name) so a real image can still arrive.
	const isPlaceholderImage =
		basePlaceholder && !resolvedOverride && !fallbackLoading && !fallbackPrintLoading;

	function renderCardImage() {
		if (fallbackPrintLoading || localizedLoading || (basePlaceholder && fallbackLoading)) {
			return <div className={styles.localizedPlaceholder} />;
		}
		if (!error && imageUri && !isPlaceholderImage) {
			return (
				<Image
					src={imageUri}
					alt={card.name}
					width={width}
					height={height}
					loader={scryfallImageLoader}
					unoptimized={isScryfallImageUrl(imageUri)}
					priority={priority}
					className={[styles.image, isLoading ? styles.loading : ''].filter(Boolean).join(' ')}
					onLoad={() => setLoadedUri(imageUri)}
					onError={() => setErroredUri(imageUri)}
				/>
			);
		}
		return (
			<div className={styles.placeholder}>
				<span className={styles.placeholderText}>{card.name}</span>
			</div>
		);
	}

	return (
		<div ref={containerRef} className={classNames} onClick={onClick}>
			<div
				ref={wrapperRef}
				className={[styles.imageWrapper, disableTilt ? styles.noTilt : '']
					.filter(Boolean)
					.join(' ')}
				onMouseEnter={disableTilt ? undefined : handleMouseEnter}
				onMouseMove={disableTilt ? undefined : handleMouseMove}
				onMouseLeave={disableTilt ? undefined : handleMouseLeave}
			>
				{renderCardImage()}
				{(isLoading || localizedLoading) && !error && !isPlaceholderImage && (
					<div className={styles.skeleton} />
				)}
				{isFoil && (
					<div
						className={foilType === 'etched' ? styles.etchedOverlay : styles.foilOverlay}
						aria-hidden="true"
					/>
				)}
				{isProxy && <span className={styles.proxyBadge}>proxy</span>}
			</div>
			{isDoubleFaced && (
				<button
					className={styles.flipButton}
					onClick={handleFlip}
					aria-label={t('flipCard')}
					type="button"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
						<path d="M3 3v5h5" />
					</svg>
				</button>
			)}
		</div>
	);
}
