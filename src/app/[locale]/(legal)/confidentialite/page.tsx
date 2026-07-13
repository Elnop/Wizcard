import type { Metadata } from 'next';
import { legalConfig } from '@/lib/legal/legal-config';

export const metadata: Metadata = {
	title: 'Politique de confidentialité | Wizcard',
	description: 'Politique de confidentialité et protection des données personnelles de Wizcard.',
	robots: { index: true, follow: true },
};

export default function ConfidentialitePage() {
	const { editor, host, dataRetentionMonths, lastUpdated } = legalConfig;
	const contact = <a href={`mailto:${editor.contactEmail}`}>{editor.contactEmail}</a>;
	return (
		<>
			<h1>Politique de confidentialité</h1>
			<p className="updated">Dernière mise à jour : {lastUpdated}</p>

			<p>
				La présente politique décrit comment {legalConfig.siteName} traite vos données personnelles,
				conformément au Règlement général sur la protection des données (RGPD).
			</p>

			<h2>1. Responsable de traitement</h2>
			<p>
				Le responsable de traitement est {editor.name}. Pour toute demande relative à vos données :{' '}
				{contact}.
			</p>

			<h2>2. Données collectées</h2>
			<ul>
				<li>Adresse e-mail (nécessaire à la création du compte et à la connexion) ;</li>
				<li>
					Informations de profil optionnelles que vous fournissez (pseudonyme, description, avatar)
					;
				</li>
				<li>Données techniques (journaux de connexion du serveur, adresse IP).</li>
			</ul>

			<h2>3. Finalités</h2>
			<p>
				Création et gestion de votre compte, authentification, affichage de votre profil public,
				fonctionnement du service (collections et decks) et sécurité du site.
			</p>

			<h2>4. Bases légales</h2>
			<p>
				L’exécution du service que vous demandez (gestion du compte et des données de profil) et
				notre intérêt légitime à assurer la sécurité du site et à conserver des journaux techniques.
			</p>

			<h2>5. Destinataires et hébergement</h2>
			<p>
				Vos données sont hébergées par l’éditeur ({host.label}). L’envoi des e-mails de connexion
				fait appel à {host.mailProvider}, agissant comme sous-traitant. Vos données ne sont ni
				vendues ni partagées à des fins commerciales.{' '}
				<strong>Aucun transfert hors de l’Union européenne n’est réalisé.</strong>
			</p>

			<h2>6. Durée de conservation</h2>
			<p>
				Les données de votre compte sont conservées tant que le compte existe ; vous pouvez le
				supprimer à tout moment. Les journaux techniques sont conservés {dataRetentionMonths} mois.
			</p>

			<h2>7. Vos droits</h2>
			<p>
				Vous disposez des droits d’accès, de rectification, d’effacement, de portabilité, de
				limitation et d’opposition sur vos données. Pour les exercer, contactez {contact}.
			</p>

			<h2>8. Cookies</h2>
			<p>
				{legalConfig.siteName} n’utilise que des cookies strictement nécessaires au fonctionnement
				du service (authentification et maintien de votre session). Ces cookies sont exemptés de
				consentement ; aucun cookie de mesure d’audience ni de suivi publicitaire n’est déposé.
				Aucune bannière de consentement n’est donc requise.
			</p>

			<h2>9. Réclamation</h2>
			<p>
				Pour toute question ou réclamation concernant vos données, nous vous invitons à nous
				contacter en priorité, par e-mail à {contact} ou sur notre{' '}
				<a href={editor.discordUrl} target="_blank" rel="noreferrer noopener">
					serveur Discord
				</a>
				: nous nous efforçons de résoudre chaque demande rapidement et directement. Si une
				difficulté persistait, vous conservez le droit d’introduire une réclamation auprès de la
				Commission nationale de l’informatique et des libertés (CNIL),{' '}
				<a href="https://www.cnil.fr" target="_blank" rel="noreferrer noopener">
					www.cnil.fr
				</a>
				.
			</p>
		</>
	);
}
