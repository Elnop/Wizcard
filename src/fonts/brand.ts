import localFont from 'next/font/local';

const augusta = localFont({
	src: './brand/augusta.ttf',
	variable: '--font-brand-augusta',
	display: 'swap',
});
const beech = localFont({
	src: './brand/beech.ttf',
	variable: '--font-brand-beech',
	display: 'swap',
});
const besideHorizon = localFont({
	src: './brand/beside-horizon.otf',
	variable: '--font-brand-beside-horizon',
	display: 'swap',
});
const godofwar = localFont({
	src: './brand/godofwar.ttf',
	variable: '--font-brand-godofwar',
	display: 'swap',
});
const oneSlice = localFont({
	src: './brand/one-slice.otf',
	variable: '--font-brand-one-slice',
	display: 'swap',
});
const romanAntique = localFont({
	src: './brand/roman-antique.ttf',
	variable: '--font-brand-roman-antique',
	display: 'swap',
});
const seagramTfb = localFont({
	src: './brand/seagram-tfb.ttf',
	variable: '--font-brand-seagram-tfb',
	display: 'swap',
});
const sherwood = localFont({
	src: './brand/sherwood.ttf',
	variable: '--font-brand-sherwood',
	display: 'swap',
});
const strangerThrough = localFont({
	src: './brand/stranger-through.otf',
	variable: '--font-brand-stranger-through',
	display: 'swap',
});
const vampireWars = localFont({
	src: './brand/vampire-wars.ttf',
	variable: '--font-brand-vampire-wars',
	display: 'swap',
});
const vengeanceAtSea = localFont({
	src: './brand/vengeance-at-sea.otf',
	variable: '--font-brand-vengeance-at-sea',
	display: 'swap',
});
const whiteOnBlack = localFont({
	src: './brand/white-on-black.ttf',
	variable: '--font-brand-white-on-black',
	display: 'swap',
});

export type BrandFont = {
	/** Identifiant stable, kebab-case. Persisté en sessionStorage. */
	id: string;
	/** Nom lisible pour la page brand-test. */
	label: string;
	/** Valeur font-family à appliquer inline, ex. 'var(--font-brand-augusta)'. */
	cssVar: string;
};

/** Chaque font locale, avec la className variable produite par next/font/local. */
const FONT_DEFS = [
	{ id: 'augusta', label: 'Augusta', font: augusta },
	{ id: 'beech', label: 'Beech', font: beech },
	{ id: 'beside-horizon', label: 'Beside Horizon', font: besideHorizon },
	{ id: 'godofwar', label: 'God of War', font: godofwar },
	{ id: 'one-slice', label: 'One Slice', font: oneSlice },
	{ id: 'roman-antique', label: 'Roman Antique', font: romanAntique },
	{ id: 'seagram-tfb', label: 'Seagram tfb', font: seagramTfb },
	{ id: 'sherwood', label: 'Sherwood', font: sherwood },
	{ id: 'stranger-through', label: 'Stranger Through', font: strangerThrough },
	{ id: 'vampire-wars', label: 'Vampire Wars', font: vampireWars },
	{ id: 'vengeance-at-sea', label: 'Vengeance at Sea', font: vengeanceAtSea },
	{ id: 'white-on-black', label: 'White on Black', font: whiteOnBlack },
] as const;

export const BRAND_FONTS: BrandFont[] = FONT_DEFS.map(({ id, label }) => ({
	id,
	label,
	cssVar: `var(--font-brand-${id})`,
}));

/** À concaténer dans le className du <body> pour exposer toutes les variables CSS. */
export const BRAND_FONT_VARIABLES: string = FONT_DEFS.map(({ font }) => font.variable).join(' ');

export function getBrandFontById(id: string): BrandFont | undefined {
	return BRAND_FONTS.find((f) => f.id === id);
}
