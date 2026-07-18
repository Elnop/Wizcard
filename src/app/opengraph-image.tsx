import { ImageResponse } from 'next/og';
import {
	BRAND_TAGLINE,
	LOGO_BG,
	LOGO_GOLD,
	WHITE_ON_BLACK_FAMILY,
	loadWhiteOnBlack,
} from './_brand/logo-assets';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Wizcard — Magic: The Gathering Card Search';

export default function OpengraphImage() {
	return new ImageResponse(
		<div
			style={{
				width: '100%',
				height: '100%',
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				gap: 24,
				background: LOGO_BG,
				color: LOGO_GOLD,
				fontFamily: WHITE_ON_BLACK_FAMILY,
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
				<span style={{ fontSize: 200, lineHeight: 1 }}>W</span>
				<span style={{ fontSize: 140, lineHeight: 1 }}>Wizcard</span>
			</div>
			<div style={{ fontSize: 34, color: '#e5e5e5', maxWidth: 900, textAlign: 'center' }}>
				{BRAND_TAGLINE}
			</div>
		</div>,
		{ ...size, fonts: [loadWhiteOnBlack()] }
	);
}
