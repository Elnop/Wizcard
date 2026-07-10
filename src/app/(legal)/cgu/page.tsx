import type { Metadata } from 'next';
import { legalConfig } from '@/lib/legal/legal-config';

export const metadata: Metadata = {
	title: 'Conditions générales d’utilisation | Wizcard',
	description: 'Conditions générales d’utilisation du service Wizcard.',
	robots: { index: true, follow: true },
};

export default function CguPage() {
	const { editor, lastUpdated } = legalConfig;
	return (
		<>
			<h1>Conditions générales d’utilisation</h1>
			<p className="updated">Dernière mise à jour : {lastUpdated}</p>

			<h2>1. Objet</h2>
			<p>
				{legalConfig.siteName} est un service gratuit de gestion de collection et de decks pour le
				jeu Magic: The Gathering. L’utilisation du service implique l’acceptation des présentes
				conditions.
			</p>

			<h2>2. Compte</h2>
			<p>
				La création d’un compte requiert une adresse e-mail (connexion par code à usage unique).
				Vous êtes responsable des contenus que vous publiez (pseudonyme, description, avatar, cartes
				personnalisées) et garantissez disposer des droits nécessaires sur les fichiers que vous
				importez.
			</p>

			<h2>3. Propriété intellectuelle</h2>
			<p>
				Magic: The Gathering ainsi que les noms et images de cartes sont la propriété de Wizards of
				the Coast, LLC. {legalConfig.siteName} est un projet indépendant, non officiel, non affilié
				à ni approuvé par Wizards of the Coast.
			</p>

			<h2>4. Contenu utilisateur</h2>
			<p>
				L’éditeur se réserve le droit de retirer tout contenu illicite ou contraire aux présentes
				conditions. Vous conservez la responsabilité des contenus que vous mettez en ligne.
			</p>

			<h2>5. Responsabilité</h2>
			<p>
				Le service est fourni « en l’état », sans garantie de disponibilité continue ni d’absence
				d’erreurs. L’éditeur ne saurait être tenu responsable des dommages résultant de
				l’utilisation ou de l’indisponibilité du service.
			</p>

			<h2>6. Contact et droit applicable</h2>
			<p>
				Pour toute question : <a href={`mailto:${editor.contactEmail}`}>{editor.contactEmail}</a> ou{' '}
				<a href={editor.discordUrl} target="_blank" rel="noreferrer noopener">
					Discord
				</a>
				. Les présentes conditions sont soumises au droit français.
			</p>
		</>
	);
}
