/**
 * Source unique des données d'identité légale du site. Toute valeur de copie
 * légale (nom, email, Discord, hébergeur, dates) vit ici — les pages du groupe
 * (legal) et le Footer la consomment. Régime actuel : éditeur non professionnel
 * auto-hébergé (transition avant micro-entreprise). Pour régulariser lors de la
 * création de la micro-entreprise, renseigner `business` ci-dessous : la page
 * Mentions légales bascule alors automatiquement en régime professionnel.
 */
export const legalConfig = {
	siteName: 'Wizcard',
	siteUrl: 'https://wizcard.xyz',
	editor: {
		name: 'Elnop',
		publicationDirector: 'Elnop',
		contactEmail: 'contact@wizcard.xyz',
		discordUrl: 'https://discord.gg/VkahQ2KPfA',
	},
	/**
	 * Bloc professionnel — `null` tant que le projet est perso. À la création de
	 * la micro-entreprise, remplacer par un objet :
	 * { legalName: string; siret: string; address: string; vat?: string }
	 * (la page Mentions légales détectera sa présence).
	 */
	business: null as null | {
		legalName: string;
		siret: string;
		address: string;
		vat?: string;
	},
	host: {
		selfHosted: true,
		label: 'Site auto-hébergé par l’éditeur',
		mailProvider: 'OVH SAS, 2 rue Kellermann, 59100 Roubaix, France',
	},
	dataRetentionMonths: 12,
	lastUpdated: '2026-07-10',
} as const;
