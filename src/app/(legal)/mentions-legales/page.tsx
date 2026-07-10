import type { Metadata } from 'next';
import { legalConfig } from '@/lib/legal/legal-config';

export const metadata: Metadata = {
	title: 'Mentions légales | Wizcard',
	description: 'Mentions légales du site Wizcard.',
	robots: { index: true, follow: true },
};

export default function MentionsLegalesPage() {
	const { editor, host, business, lastUpdated } = legalConfig;
	return (
		<>
			<h1>Mentions légales</h1>
			<p className="updated">Dernière mise à jour : {lastUpdated}</p>

			<h2>Éditeur du site</h2>
			{business ? (
				<p>
					{business.legalName} — SIRET {business.siret}
					<br />
					{business.address}
					{business.vat ? (
						<>
							<br />
							TVA intracommunautaire : {business.vat}
						</>
					) : null}
					<br />
					Directeur de la publication : {editor.publicationDirector}
					<br />
					Contact : <a href={`mailto:${editor.contactEmail}`}>{editor.contactEmail}</a>
				</p>
			) : (
				<p>
					Le site {legalConfig.siteName} est édité par {editor.name}.
					<br />
					Directeur de la publication : {editor.publicationDirector}.
					<br />
					Contact : <a href={`mailto:${editor.contactEmail}`}>{editor.contactEmail}</a> — Discord :{' '}
					<a href={editor.discordUrl} target="_blank" rel="noreferrer noopener">
						serveur communautaire
					</a>
					.
				</p>
			)}

			<h2>Hébergement</h2>
			<p>
				{host.label}. Le service de messagerie transactionnelle (envoi des e-mails de connexion) est
				assuré par {host.mailProvider}.
			</p>

			<h2>Propriété intellectuelle</h2>
			<p>
				Magic: The Gathering ainsi que les noms et images de cartes sont la propriété de Wizards of
				the Coast, LLC. {legalConfig.siteName} est un projet indépendant, non officiel, qui n’est ni
				affilié à, ni approuvé ou sponsorisé par Wizards of the Coast. Les autres contenus du site
				(code, interface) demeurent la propriété de l’éditeur.
			</p>

			<h2>Contact</h2>
			<p>
				Pour toute question relative au site, vous pouvez écrire à{' '}
				<a href={`mailto:${editor.contactEmail}`}>{editor.contactEmail}</a> ou nous rejoindre sur{' '}
				<a href={editor.discordUrl} target="_blank" rel="noreferrer noopener">
					Discord
				</a>
				.
			</p>
		</>
	);
}
