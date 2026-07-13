// Home-grown "email change requested" message sent to the user's CURRENT
// address. Deliberately NOT a login/magiclink email — it explains a change was
// requested and links to the page where the new address is entered.
export function emailChangeRequest(link: string): {
	subject: string;
	html: string;
	text: string;
} {
	const subject = "Demande de changement d'adresse e-mail";
	const text = [
		"Une demande de changement d'adresse e-mail a été faite sur votre compte Wizcard.",
		'',
		'Pour continuer et saisir votre nouvelle adresse, ouvrez ce lien :',
		link,
		'',
		"Ce lien expire dans 30 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail — aucune modification ne sera faite.",
	].join('\n');
	const html = `
		<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1a1a1a;">
			<h2 style="margin: 0 0 12px;">Demande de changement d'adresse e-mail</h2>
			<p>Une demande de changement d'adresse e-mail a été faite sur votre compte Wizcard.</p>
			<p>Pour continuer et saisir votre nouvelle adresse&nbsp;:</p>
			<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#c9a84c;color:#0b0c10;text-decoration:none;border-radius:8px;font-weight:600;">Changer mon adresse e-mail</a></p>
			<p style="color:#666;font-size:14px;">Ce lien expire dans 30 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail — aucune modification ne sera faite.</p>
		</div>
	`.trim();
	return { subject, html, text };
}
