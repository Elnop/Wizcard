export const SITE_URL = 'https://wizcard.xyz';
export const SITE_NAME = 'Wizcard';
export const SITE_DESCRIPTION =
	'Search every Magic: The Gathering card, build decks, and track your collection.';

/**
 * Gabarit de titre d'onglet, marque en tête : « Wizcard - deck Slivoid ».
 *
 * Next.js n'applique `title.template` qu'au segment enfant *immédiat*. Un layout
 * intermédiaire qui pose un `title` chaîne nue efface donc le template pour tout
 * ce qui est en dessous. Les layouts concernés (`decks`, `search`) doivent le
 * redéclarer via `titleTemplateWithDefault()`.
 */
export const TITLE_TEMPLATE = `${SITE_NAME} - %s`;

/**
 * Titre de segment qui conserve le template racine pour les routes enfants.
 *
 * `default` reste le titre nu : le template du layout *parent* s'applique
 * par-dessus et ajoute déjà « Wizcard - ». Le préfixer ici le doublerait.
 */
export function titleTemplateWithDefault(pageTitle: string) {
	return { default: pageTitle, template: TITLE_TEMPLATE };
}
