import { ImageResponse } from 'next/og';
import { LOGO_BG, LOGO_GOLD, WHITE_ON_BLACK_FAMILY, loadWhiteOnBlack } from './_brand/logo-assets';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
	return new ImageResponse(
		<div
			style={{
				width: '100%',
				height: '100%',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				background: LOGO_BG,
				color: LOGO_GOLD,
				fontFamily: WHITE_ON_BLACK_FAMILY,
				fontSize: 120,
			}}
		>
			W
		</div>,
		{ ...size, fonts: [loadWhiteOnBlack()] }
	);
}
