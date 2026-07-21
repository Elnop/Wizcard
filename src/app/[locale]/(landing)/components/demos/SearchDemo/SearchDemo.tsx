'use client';

import Image from 'next/image';
import { isScryfallImageUrl, scryfallImageLoader } from '@/lib/scryfall/utils/scryfallImageLoader';
import {
	SEARCH_CARDS,
	SEARCH_DECKS,
	SEARCH_PROFILES,
	type DemoProfileResult,
	type DemoDeckResult,
} from '@/app/[locale]/(landing)/data/demoContent';
import { seg } from '@/app/[locale]/(landing)/utils/seg';
import styles from './SearchDemo.module.css';

export interface SearchDemoLabels {
	cards: string;
	decks: string;
	profiles: string;
	profileType: string;
}

// Beat boundaries on progress (0..1). Each beat: one active tab + its results.
const BEATS = [
	{ start: 0, query: 'Lightning Bolt' },
	{ start: 0.36, query: 'Gruul aggro' },
	{ start: 0.68, query: '@planeswalker' },
] as const;

/** Which beat progress currently sits in → active tab index (0|1|2). */
function activeBeat(progress: number): 0 | 1 | 2 {
	if (progress >= BEATS[2].start) return 2;
	if (progress >= BEATS[1].start) return 1;
	return 0;
}

const COLOR_PIP_HEX: Record<string, string> = {
	W: '#e9e4d0',
	U: '#3b7dd8',
	B: '#31313a',
	R: '#d84a3a',
	G: '#4a9c5d',
};

/** WUBRG dots overlaid on a deck cover, mirroring DeckCard's color pips. */
function ColorPips({ colors }: { colors: string[] }) {
	return (
		<div className={styles.pips}>
			{colors.map((c) => (
				<span key={c} className={styles.pip} style={{ background: COLOR_PIP_HEX[c] ?? '#555' }} />
			))}
		</div>
	);
}

/** Mini DeckCard: cover art-crop + scrim + name + format pill + color pips. */
function MiniDeckCard({ deck }: { deck: DemoDeckResult }) {
	return (
		<div className={styles.deckCard}>
			<Image
				className={styles.deckArt}
				src={deck.artCropSrc}
				alt={deck.name}
				width={244}
				height={170}
				loader={scryfallImageLoader}
				unoptimized={isScryfallImageUrl(deck.artCropSrc)}
				sizes="200px"
			/>
			<div className={styles.deckScrim} />
			<ColorPips colors={deck.colors} />
			<div className={styles.deckMeta}>
				<span className={styles.deckName}>{deck.name}</span>
				<span className={styles.deckFormat}>{deck.format}</span>
			</div>
		</div>
	);
}

/** Phantom silhouette shown when a profile has no avatar (matches ProfileCard). */
function GhostAvatar() {
	return (
		<svg className={styles.ghost} viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<circle cx="12" cy="8" r="4" fill="currentColor" />
			<path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" fill="currentColor" />
		</svg>
	);
}

function DeckGlyph() {
	return (
		<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<rect x="2.5" y="2" width="8" height="11" rx="1" stroke="currentColor" strokeWidth="1.3" />
			<path
				d="M5.5 4.5h4M13 4.5v9a1 1 0 0 1-1 1H6"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
			/>
		</svg>
	);
}

function CardsGlyph() {
	return (
		<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<rect x="2" y="3" width="9" height="10" rx="1" stroke="currentColor" strokeWidth="1.3" />
			<path d="M5 5.5h3M5 8h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
		</svg>
	);
}

/** Mini ProfileCard: 63/88 frame, nickname bar, avatar/ghost art, type line, PT badge. */
function MiniProfileCard({
	profile,
	typeLabel,
}: {
	profile: DemoProfileResult;
	typeLabel: string;
}) {
	return (
		<div className={styles.profileCard}>
			<div className={styles.profileTitleBar}>
				<span className={styles.profileNick}>{profile.nickname}</span>
			</div>
			<div className={styles.profileArt}>
				{profile.avatarSrc ? (
					// eslint-disable-next-line @next/next/no-img-element -- static demo, Supabase host not whitelisted
					<img src={profile.avatarSrc} alt="" className={styles.profileArtImg} />
				) : (
					<GhostAvatar />
				)}
			</div>
			<div className={styles.profileType}>{typeLabel}</div>
			<div className={styles.profileText}>
				<div className={styles.profileBadge}>
					<span className={styles.profileStat}>
						<DeckGlyph />
						{profile.deckCount}
					</span>
					<span className={styles.profileSlash}>/</span>
					<span className={styles.profileStat}>
						<CardsGlyph />
						{profile.cardCount}
					</span>
				</div>
			</div>
		</div>
	);
}

/** Staggered rise-in transform for a result at index `i`, given a 0..1 entry value. */
function riseStyle(entry: number, i: number): React.CSSProperties {
	const local = Math.min(1, Math.max(0, entry * 3 - i));
	return { opacity: local, transform: `translateY(${(1 - local) * 24}px)` };
}

export function SearchDemo({
	progress,
	isStatic,
	labels,
}: {
	progress: number;
	isStatic: boolean;
	labels: SearchDemoLabels;
}) {
	// Static (reduced-motion / mobile) rests on the Cards beat — the most iconic
	// state — with all three tabs visible. isStatic comes from PinnedFeature; it
	// is NOT derived from progress (useScrollProgress clamps to 1 on live scroll).
	const tab = isStatic ? 0 : activeBeat(progress);
	const beat = BEATS[tab];
	const nextStart = tab < 2 ? BEATS[tab + 1].start : 1;

	// Query text for the active beat, typed out over the beat's first 0.1.
	const typed = isStatic ? 1 : seg(progress, beat.start, Math.min(beat.start + 0.1, nextStart));
	const shownQuery = beat.query.slice(0, Math.round(beat.query.length * typed));

	// Results entry value: ramps 0→1 over the middle of the active beat.
	const entry = isStatic ? 1 : seg(progress, beat.start + 0.08, nextStart - 0.02);

	const tabDefs = [labels.cards, labels.decks, labels.profiles];

	return (
		<div className={styles.wrap}>
			<div className={styles.bar}>
				<span className={styles.icon}>{'⌕'}</span>
				<span className={styles.query}>{shownQuery}</span>
				<span className={styles.caret} />
			</div>

			<nav className={styles.tabs} aria-label="Search entities">
				{tabDefs.map((label, i) => (
					<span key={label} className={`${styles.tab} ${i === tab ? styles.tabActive : ''}`}>
						{label}
					</span>
				))}
			</nav>

			<div className={styles.results}>
				{tab === 0 &&
					SEARCH_CARDS.map((card, i) => {
						const local = Math.min(1, Math.max(0, entry * 3 - i));
						const isHero = i === 0;
						return (
							<div
								key={card.name}
								className={styles.cardResult}
								style={{
									opacity: local,
									transform: `translateY(${(1 - local) * 24}px) ${
										isHero ? `scale(${1 + entry * 0.18})` : ''
									}`,
									zIndex: isHero ? 3 : 1,
								}}
							>
								<Image
									src={card.src}
									alt={card.name}
									width={244}
									height={340}
									loader={scryfallImageLoader}
									unoptimized={isScryfallImageUrl(card.src)}
									sizes="200px"
								/>
							</div>
						);
					})}

				{tab === 1 &&
					SEARCH_DECKS.map((deck, i) => (
						<div key={deck.name} className={styles.deckSlot} style={riseStyle(entry, i)}>
							<MiniDeckCard deck={deck} />
						</div>
					))}

				{tab === 2 &&
					SEARCH_PROFILES.map((profile, i) => (
						<div key={profile.nickname} className={styles.profileSlot} style={riseStyle(entry, i)}>
							<MiniProfileCard profile={profile} typeLabel={labels.profileType} />
						</div>
					))}
			</div>
		</div>
	);
}
